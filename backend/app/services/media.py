"""Media processing shared by uploads (backend-core) and AI features (backend-AI).

* PDFs (PyMuPDF): info/outline, page render (disk-cached), page words, quote location,
  page-subset extraction for AI calls.
* Images (Pillow): EXIF orientation, metadata (GPS!) stripped, downscaled, re-encoded.
* Video/audio (ffmpeg bundled by ``imageio-ffmpeg``): probe, H.264 web copy, small AI proxy,
  poster frame, WAV PCM16 24 kHz mono conversion for Muse Voice Transcribe.

All paths come from storage keys; nothing here trusts client file names.
"""

from __future__ import annotations

import io
import logging
import math
import re
import subprocess
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import imageio_ffmpeg
import pymupdf
from PIL import Image, ImageOps

from .. import storage
from ..config import get_settings
from ..errors import AppError

log = logging.getLogger("conceptlab.media")

MAX_IMAGE_SIDE = 2400
AI_IMAGE_SIDE = 1600
PDF_RENDER_SCALES = (0.5, 3.0)
# Page renders are cached on disk per scale: only these zoom levels exist, so a visitor cannot
# fill the disk (or keep the CPU busy) by asking for 2.51, 2.52, … The frontend uses 0.5–2.5.
PDF_SCALE_STEPS = (0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0)
# A page whose declared size is huge (a 200-inch poster) is rendered smaller rather than
# allocating gigabytes: at most ~16 megapixels per render (an A4 page at 3× is 4.5 MP).
MAX_RENDER_PIXELS = 16_000_000
# Decompression bombs: a tiny PNG/WebP/GIF can declare 15 000 × 15 000 pixels. JPEGs are
# decoded at a reduced scale (DCT scaling) so camera photos of any size stay cheap; other
# formats must be at most this large (an A3 scan at 600 dpi is ~50 MP).
MAX_DECODE_PIXELS = 50_000_000
# Muse Voice Transcribe accepts at most 10 minutes. The slack covers ffmpeg's WAV header chunks.
MAX_AUDIO_SECONDS = 600
WAV_HEADER_SLACK = 4096


def ffmpeg_exe() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def _run(args: list[str], timeout: int, input_bytes: bytes | None = None) -> bytes:
    # The input may only come from the local file or stdin: a crafted upload (an HLS playlist,
    # a concat list, a QuickTime reference) can never make ffmpeg fetch URLs or other files.
    whitelist = "pipe" if input_bytes is not None else "file"
    try:
        proc = subprocess.run(
            [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-nostdin", "-protocol_whitelist", whitelist, *args],
            input=input_bytes,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise AppError("processing_failed", 422, "Media processing took too long") from exc
    if proc.returncode != 0:
        log.warning("ffmpeg failed: %s", proc.stderr[-800:].decode("utf-8", "replace"))
        raise AppError("processing_failed", 422, "The media file could not be processed")
    return proc.stdout


# ============================================================================ images
@dataclass
class ImageInfo:
    key: str
    width: int
    height: int
    mime: str


def guard_decode(img: Image.Image, max_side: int | None = None) -> None:
    """Call before ``load()``: refuse decompression bombs, decode big JPEGs at a reduced scale.

    ``max_side`` (the size the caller will downscale to anyway) lets JPEG decoding skip the
    detail that would be thrown away; other formats are checked against ``MAX_DECODE_PIXELS``.
    """
    width, height = img.size
    if img.format == "JPEG":
        if max_side:
            img.draft(img.mode if img.mode in ("L", "RGB") else None, (max_side, max_side))
        return
    if width * height > MAX_DECODE_PIXELS:
        raise AppError(
            "invalid_file",
            422,
            f"The image is too large to process ({width}×{height} pixels). Use a smaller picture.",
            extra={"max_megapixels": MAX_DECODE_PIXELS // 1_000_000},
        )


def normalize_image_bytes(data: bytes, max_side: int = MAX_IMAGE_SIDE) -> tuple[bytes, str, int, int]:
    """Decode, apply EXIF orientation, drop all metadata, downscale, re-encode.

    Returns (bytes, mime, width, height). Transparent images stay PNG, others JPEG.
    """
    try:
        with Image.open(io.BytesIO(data)) as img:
            guard_decode(img, max_side)
            img.load()
            img = ImageOps.exif_transpose(img)
            has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
            img = img.convert("RGBA" if has_alpha else "RGB")
            img.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            if has_alpha:
                img.save(out, format="PNG", optimize=True)
                mime = "image/png"
            else:
                img.save(out, format="JPEG", quality=88, optimize=True, progressive=True)
                mime = "image/jpeg"
            return out.getvalue(), mime, img.width, img.height
    except AppError:
        raise
    except Exception as exc:
        raise AppError("invalid_file", 422, "The image could not be read") from exc


def store_image(lab_id: str, data: bytes, max_side: int = MAX_IMAGE_SIDE) -> ImageInfo:
    clean, mime, width, height = normalize_image_bytes(data, max_side)
    key = storage.save_bytes(lab_id, clean, "png" if mime == "image/png" else "jpg")
    return ImageInfo(key=key, width=width, height=height, mime=mime)


def image_for_ai(key: str, max_side: int = AI_IMAGE_SIDE) -> tuple[bytes, str, int, int]:
    """Smaller JPEG/PNG copy for model calls (keeps bandwidth and tokens low)."""
    return normalize_image_bytes(storage.read_bytes(key), max_side)


EXIF_ORIENTATION = 0x0112


def image_size(data: bytes) -> tuple[int, int]:
    """Displayed size (EXIF orientation applied) read from the header only — no pixel decoding."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
            orientation = img.getexif().get(EXIF_ORIENTATION, 1)
    except Exception as exc:
        raise AppError("invalid_file", 422, "The image could not be read") from exc
    return (height, width) if orientation in (5, 6, 7, 8) else (width, height)


# ============================================================================ PDFs
def _open_pdf(key: str) -> pymupdf.Document:
    try:
        return pymupdf.open(storage.path_for(key))
    except Exception as exc:
        raise AppError("invalid_file", 422, "The PDF could not be read") from exc


@contextmanager
def _pdf(key: str) -> Iterator[pymupdf.Document]:
    """Open a stored PDF; damaged structures found while reading pages (a broken page tree,
    bad objects) become ``invalid_file`` instead of an unhandled 500."""
    doc = _open_pdf(key)
    try:
        yield doc
    except AppError:
        raise
    except Exception as exc:
        raise AppError("invalid_file", 422, "The PDF could not be read") from exc
    finally:
        doc.close()


def pdf_info(key: str) -> dict[str, Any]:
    """{page_count, toc:[{level,title,page}], has_text, encrypted}."""
    with _pdf(key) as doc:
        if doc.needs_pass:
            raise AppError("invalid_file", 422, "Password-protected PDFs are not supported")
        if doc.page_count < 1:
            raise AppError("invalid_file", 422, "The PDF has no pages")
        toc = [{"level": int(lvl), "title": str(title)[:200], "page": int(page)} for lvl, title, page, *_ in doc.get_toc(simple=True)[:200]]
        has_text = any(doc[i].get_text("text").strip() for i in range(min(doc.page_count, 5)))
        return {"page_count": doc.page_count, "toc": toc, "has_text": has_text}


def _check_page(doc: pymupdf.Document, page: int) -> pymupdf.Page:
    if not (1 <= page <= doc.page_count):
        raise AppError("not_found", 404, "Page not found")
    return doc[page - 1]


def render_scale(scale: float) -> float:
    """Nearest supported zoom level (see ``PDF_SCALE_STEPS``)."""
    value = float(scale) if math.isfinite(float(scale)) else 1.5
    value = max(PDF_RENDER_SCALES[0], min(PDF_RENDER_SCALES[1], value))
    return min(PDF_SCALE_STEPS, key=lambda step: (abs(step - value), step))


def _bounded_scale(page: pymupdf.Page, scale: float) -> float:
    width, height = page.rect.width * scale, page.rect.height * scale
    if width * height > MAX_RENDER_PIXELS:
        scale *= math.sqrt(MAX_RENDER_PIXELS / (width * height))
    return scale


def render_pdf_page(key: str, page: int, scale: float = 1.5) -> tuple[bytes, int, int]:
    """PNG of one page (cached next to the PDF). Returns (png, width, height)."""
    scale = render_scale(scale)
    cache_key = f"{key.rsplit('.', 1)[0]}.p{page}.s{int(scale * 100)}.png"
    if storage.exists(cache_key):
        data = storage.read_bytes(cache_key)
        width, height = image_size(data)
        return data, width, height
    with _pdf(key) as doc:
        pg = _check_page(doc, page)
        bounded = _bounded_scale(pg, scale)
        pix = pg.get_pixmap(matrix=pymupdf.Matrix(bounded, bounded), alpha=False)
        data = pix.tobytes("png")
        width, height = pix.width, pix.height
    target = storage.path_for(cache_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return data, width, height


def pdf_page_text(key: str, page: int) -> dict[str, Any]:
    """Words with normalized boxes: {page, width, height, words:[[x0,y0,x1,y1,text]], text}."""
    with _pdf(key) as doc:
        pg = _check_page(doc, page)
        w, h = pg.rect.width, pg.rect.height
        words = [
            [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4), text]
            for x0, y0, x1, y1, text, *_ in pg.get_text("words")
        ]
        return {"page": page, "width": w, "height": h, "words": words, "text": pg.get_text("text")}


def pdf_text_pages(key: str, pages: list[int] | None = None, max_chars: int = 60000) -> list[dict[str, Any]]:
    """Plain text per page ({page, text}) for prompts/citation grounding."""
    with _pdf(key) as doc:
        selected = pages or list(range(1, doc.page_count + 1))
        out, total = [], 0
        for page in selected:
            if not (1 <= page <= doc.page_count):
                continue
            text = doc[page - 1].get_text("text")
            if total + len(text) > max_chars:
                text = text[: max(0, max_chars - total)]
            out.append({"page": page, "text": text})
            total += len(text)
            if total >= max_chars:
                break
        return out


def pdf_subset(key: str, pages: list[int] | None, max_pages: int = 30) -> tuple[bytes, list[int]]:
    """A new PDF holding only ``pages`` (1-based, in order). Returns (bytes, page_map) where
    page_map[i] is the original page number of page i+1 in the subset."""
    with _pdf(key) as doc:
        selected = [p for p in (pages or range(1, doc.page_count + 1)) if 1 <= p <= doc.page_count]
        selected = list(dict.fromkeys(selected))[:max_pages]
        if not selected:
            raise AppError("validation_error", 422, "No valid pages selected", fields={"pages": "empty"})
        if len(selected) == doc.page_count and selected == list(range(1, doc.page_count + 1)):
            return storage.read_bytes(key), selected
        out = pymupdf.open()
        for p in selected:
            out.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
        data = out.tobytes(garbage=3, deflate=True)
        out.close()
        return data, selected


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "")
    text = text.replace("­", "").replace("ﬁ", "fi").replace("ﬂ", "fl")
    return re.sub(r"\s+", " ", text).strip()


def locate_quote(key: str, quote: str, page_hint: int | None = None) -> dict[str, Any] | None:
    """Find a verbatim quote in the PDF text layer.

    Tries the hinted page first, then every page; falls back to the longest leading
    fragment (≥ 4 words). Returns page, rects, bbox, matched_quote and located.
    A leading fragment is approximate; only a full-quote match is exact.
    """
    quote = _norm(quote)
    if len(quote) < 3:
        return None
    with _pdf(key) as doc:
        order = list(range(1, doc.page_count + 1))
        if page_hint and 1 <= page_hint <= doc.page_count:
            order.remove(page_hint)
            order.insert(0, page_hint)
        words = quote.split(" ")
        candidates = [quote]
        for n in (12, 8, 5, 4):
            if len(words) > n:
                candidates.append(" ".join(words[:n]))
        for candidate in candidates:
            for page in order:
                pg = doc[page - 1]
                rects = pg.search_for(candidate)
                if rects:
                    w, h = pg.rect.width, pg.rect.height
                    norm = [[round(r.x0 / w, 4), round(r.y0 / h, 4), round(r.x1 / w, 4), round(r.y1 / h, 4)] for r in rects[:12]]
                    bbox = [min(r[0] for r in norm), min(r[1] for r in norm), max(r[2] for r in norm), max(r[3] for r in norm)]
                    return {"page": page, "rects": norm, "bbox": bbox,
                            "matched_quote": candidate,
                            "located": "exact" if candidate == quote else "approximate"}
        return None


# ============================================================================ video & audio
def probe_video(path: str) -> dict[str, Any]:
    """{duration_ms, fps, width, height, codec} using the bundled ffmpeg reader."""
    try:
        reader = imageio_ffmpeg.read_frames(path)
        meta = reader.__next__()
        reader.close()
    except Exception as exc:
        raise AppError("invalid_file", 422, "The video could not be read") from exc
    width, height = (meta.get("size") or (0, 0))[:2]
    return {
        "duration_ms": int(float(meta.get("duration") or 0) * 1000),
        "fps": float(meta.get("fps") or 0) or None,
        "width": int(width or 0) or None,
        "height": int(height or 0) or None,
        "codec": str(meta.get("codec") or ""),
    }


def transcode_video(src_key: str, lab_id: str, max_seconds: int | None = None) -> dict[str, Any]:
    """Make the browser copy (H.264/AAC MP4 ≤720p, faststart), the AI proxy (≤480p, 12 fps,
    no audio, ≤ max_seconds) and a poster JPEG. Returns keys + probe info."""
    max_seconds = max_seconds or get_settings().max_video_seconds
    src = str(storage.path_for(src_key))
    info = probe_video(src)
    web_key = storage.new_key(lab_id, "mp4")
    ai_key = storage.new_key(lab_id, "mp4")
    poster_key = storage.new_key(lab_id, "jpg")
    for key in (web_key, ai_key, poster_key):
        storage.path_for(key).parent.mkdir(parents=True, exist_ok=True)
    scale_web = "scale=-2:'min(720,ih)'"
    _run(
        ["-y", "-i", src, "-t", str(max_seconds), "-vf", scale_web, "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", "-ac", "1", str(storage.path_for(web_key))],
        timeout=900,
    )
    _run(
        ["-y", "-i", src, "-t", str(min(max_seconds, 120)), "-vf", "scale=-2:'min(480,ih)',fps=12", "-c:v", "libx264", "-preset", "veryfast",
         "-crf", "30", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", str(storage.path_for(ai_key))],
        timeout=900,
    )
    seek = "1" if info["duration_ms"] and info["duration_ms"] > 1500 else "0"
    _run(["-y", "-ss", seek, "-i", src, "-frames:v", "1", "-vf", scale_web, "-q:v", "4", str(storage.path_for(poster_key))], timeout=120)
    web_info = probe_video(str(storage.path_for(web_key)))
    return {"web_key": web_key, "ai_key": ai_key, "poster_key": poster_key, **web_info}


def to_wav_pcm16(data: bytes, sample_rate: int = 24000, max_seconds: int = MAX_AUDIO_SECONDS) -> bytes:
    """Convert any audio container to RIFF/WAVE mono PCM16 (Muse Voice Transcribe format).

    Decoding stops one second past ``max_seconds``: a small compressed upload cannot expand into
    gigabytes of PCM in memory, and a recording longer than the limit is refused."""
    if is_supported_wav(data):
        return data
    wav = _run(
        ["-i", "pipe:0", "-t", str(max_seconds + 1), "-ac", "1", "-ar", str(sample_rate), "-c:a", "pcm_s16le", "-f", "wav", "pipe:1"],
        timeout=120,
        input_bytes=data,
    )
    if len(wav) > WAV_HEADER_SLACK + max_seconds * sample_rate * 2:
        raise AppError("file_too_large", 413, "The recording is too long", extra={"max_seconds": max_seconds})
    return wav


def is_supported_wav(data: bytes) -> bool:
    """RIFF/WAVE, PCM (format 1), mono, 16-bit, 16 or 24 kHz."""
    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return False
    pos = 12
    while pos + 8 <= len(data):
        chunk_id = data[pos : pos + 4]
        size = int.from_bytes(data[pos + 4 : pos + 8], "little")
        if chunk_id == b"fmt ":
            body = data[pos + 8 : pos + 8 + size]
            if len(body) < 16:
                return False
            fmt = int.from_bytes(body[0:2], "little")
            channels = int.from_bytes(body[2:4], "little")
            rate = int.from_bytes(body[4:8], "little")
            bits = int.from_bytes(body[14:16], "little")
            return fmt == 1 and channels == 1 and bits == 16 and rate in (16000, 24000)
        pos += 8 + size + (size & 1)
    return False


def frame_at(key: str, seconds: float) -> bytes:
    """JPEG of the video frame at ``seconds`` (used for SAM on a paused frame server-side)."""
    return _run(["-ss", f"{max(0.0, seconds):.3f}", "-i", str(storage.path_for(key)), "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "pipe:1"], timeout=60)
