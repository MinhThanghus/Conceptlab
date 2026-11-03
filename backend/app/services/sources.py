"""Sources (PDF, photos, practice videos, measured data, notes) and lab assets.

Upload pipeline (spec §4.1, §6, §8.3, §16; docs/API.md §Sources):

1. The API layer checks permission and the per-lab source limit *before* reading the body.
2. The file is streamed to private storage (``storage.save_upload``) with the largest
   per-kind limit, then its real type is sniffed from the bytes — the client's MIME type
   and file extension are never trusted.
3. Per-kind limits (``MAX_UPLOAD_MB_PDF/IMAGE/VIDEO``) and processing:

   * PDF → page count and outline (``meta_json["toc"]``); password-protected files are
     rejected (``invalid_file``).
   * JPEG/PNG/WebP/GIF → EXIF orientation applied, **all metadata (GPS!) removed**,
     downscaled to ≤ 2400 px and re-encoded; only the clean copy is kept.
   * HEIC → ``unsupported_file`` (415) with ``hint: "heic"`` (ask for JPEG).
   * MP4/MOV/WebM → stored with status ``processing``; :func:`process_video` (a FastAPI
     background task with its own DB session) checks the duration, makes the web copy
     (H.264 ≤ 720p), the AI proxy (≤ 480p) and a poster, then marks it ``ready`` — or
     ``failed`` with ``video_too_long`` / ``processing_failed`` (the original is deleted).

Measured data (``kind="data"``; values are provenance "user") and notes need no file.
Assets are small images made in the browser: SAM cut-outs (transparency kept), captured
video frames and PDF page snapshots.
"""

from __future__ import annotations

import io
import json
import logging
import math
import unicodedata
from pathlib import Path
from typing import Any

from fastapi import UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import storage
from ..config import get_settings
from ..db import SessionLocal
from ..errors import AppError
from ..models import Asset, Lab, Source
from ..schemas.api import DataSourceIn, DataValue, LocateOut, NoteSourceIn, PageTextOut, SourceUpdate
from ..security import Actor
from . import media
from .labs import get_lab_for_owner

log = logging.getLogger("conceptlab.sources")

MB = 1024 * 1024
IMAGE_TYPES = {"jpeg", "png", "webp", "gif"}
VIDEO_MIME = {"mp4": "video/mp4", "mov": "video/quicktime", "webm": "video/webm"}
ASSET_KINDS_UPLOADABLE = ("cutout", "frame", "page")
ASSET_TYPES = {"jpeg", "png", "webp"}
MAX_ASSET_BYTES = 10 * MB
MAX_ASSETS_PER_LAB = 300
MAX_ASSET_META_BYTES = 20_000
FILE_MAX_AGE = 86400  # immutable content behind a stable URL: cache it (slow networks)

DEFAULT_TITLES = {
    "vi": {"pdf": "Tài liệu PDF", "image": "Ảnh", "video": "Video"},
    "en": {"pdf": "PDF document", "image": "Photo", "video": "Video"},
}


# ============================================================================ helpers
def clean_filename(name: str | None, limit: int = 200) -> str:
    """Display-safe file name: no folders, no control characters, NFC (Vietnamese from macOS)."""
    text = unicodedata.normalize("NFC", name or "")
    text = text.replace("\\", "/").rsplit("/", 1)[-1]
    text = "".join(ch for ch in text if ch.isprintable())
    return " ".join(text.split())[:limit]


def ascii_filename(name: str | None) -> str | None:
    """Header-safe download name: "Bài 12 – Con lắc.pdf" → "Bai 12 Con lac.pdf".

    ``Content-Disposition`` values must be latin-1; Vietnamese letters would break the
    response, so diacritics are folded (đ → d) and anything else non-ASCII is dropped.
    """
    if not name:
        return None
    text = unicodedata.normalize("NFKD", name.replace("đ", "d").replace("Đ", "D"))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.encode("ascii", "ignore").decode("ascii")
    return " ".join(text.split()) or None


def clean_text(value: str | None, limit: int) -> str:
    text = unicodedata.normalize("NFC", value or "")
    text = "".join(ch for ch in text if ch.isprintable() or ch in "\n\t")
    return text.strip()[:limit]


def max_upload_bytes() -> int:
    s = get_settings()
    return max(s.max_upload_mb_pdf, s.max_upload_mb_image, s.max_upload_mb_video) * MB


def _limit_for(kind: str) -> int:
    s = get_settings()
    if kind == "pdf":
        return s.max_upload_mb_pdf
    if kind in VIDEO_MIME:
        return s.max_upload_mb_video
    return s.max_upload_mb_image


def ensure_capacity(db: Session, lab: Lab) -> None:
    limit = get_settings().max_sources_per_lab
    count = db.scalar(select(func.count()).select_from(Source).where(Source.lab_id == lab.id)) or 0
    if count >= limit:
        raise AppError(
            "too_many_sources",
            409,
            f"A lab can have at most {limit} sources. Remove one before adding another.",
            extra={"max": limit},
        )


def _next_position(db: Session, lab: Lab) -> int:
    current = db.scalar(select(func.max(Source.position)).where(Source.lab_id == lab.id))
    return 0 if current is None else int(current) + 1


def _rename(key: str, lab_id: str, ext: str) -> str:
    """Give a sniffed upload its real extension (render caches and copies rely on it)."""
    new = storage.new_key(lab_id, ext)
    storage.path_for(key).replace(storage.path_for(new))
    return new


def _unsupported(detected: str | None) -> AppError:
    if detected == "heic":
        return AppError(
            "unsupported_file",
            415,
            "HEIC photos are not supported. Choose JPEG on the phone (iPhone: Settings › Camera › Formats › "
            "Most Compatible) or share the photo as JPEG.",
            extra={"hint": "heic", "detected": "heic"},
        )
    return AppError(
        "unsupported_file",
        415,
        "Upload a PDF, a photo (JPEG, PNG, WebP) or a video (MP4, MOV, WebM).",
        extra={"hint": "types", "detected": detected},
    )


# ============================================================================ create sources
def finish_upload(
    db: Session,
    lab: Lab,
    temp_key: str,
    size: int,
    *,
    filename: str | None,
    title: str | None,
    contains_people: bool,
    consent_confirmed: bool,
) -> Source:
    """Sniff, check and process a streamed upload (sync: runs in a worker thread)."""
    try:
        detected = storage.sniff_kind(storage.head_bytes(temp_key, 64))
        if detected not in IMAGE_TYPES and detected not in VIDEO_MIME and detected != "pdf":
            raise _unsupported(detected)
        limit_mb = _limit_for(detected)
        if size > limit_mb * MB:
            raise AppError(
                "file_too_large",
                413,
                f"This file is larger than {limit_mb} MB.",
                extra={"max_mb": limit_mb, "kind": "pdf" if detected == "pdf" else ("video" if detected in VIDEO_MIME else "image")},
            )
        ensure_capacity(db, lab)  # again: another upload may have finished meanwhile
    except Exception:
        storage.delete_key(temp_key)
        raise

    original = clean_filename(filename, 255) or None
    kind = "pdf" if detected == "pdf" else ("video" if detected in VIDEO_MIME else "image")
    lang = lab.language if lab.language in DEFAULT_TITLES else "vi"
    src = Source(
        lab_id=lab.id,
        kind=kind,
        title=clean_text(title, 200) or clean_filename(filename) or DEFAULT_TITLES[lang][kind],
        filename=original,
        contains_people=bool(contains_people),
        consent_confirmed=bool(consent_confirmed),
        position=_next_position(db, lab),
        meta_json={"original_type": detected},
    )
    created: list[str] = []
    try:
        if kind == "pdf":
            key = _rename(temp_key, lab.id, "pdf")
            created.append(key)
            info = media.pdf_info(key)
            src.storage_key = key
            src.mime = "application/pdf"
            src.size_bytes = size
            src.page_count = info["page_count"]
            src.meta_json = {**src.meta_json, "toc": info["toc"], "has_text": bool(info.get("has_text"))}
            src.status = "ready"
        elif kind == "image":
            data = storage.read_bytes(temp_key)
            storage.delete_key(temp_key)  # never keep the original (EXIF/GPS)
            image = media.store_image(lab.id, data)
            created.append(image.key)
            src.storage_key = image.key
            src.mime = image.mime
            src.width, src.height = image.width, image.height
            src.size_bytes = storage.path_for(image.key).stat().st_size
            src.status = "ready"
        else:
            key = _rename(temp_key, lab.id, detected)
            created.append(key)
            src.storage_key = key
            src.mime = VIDEO_MIME[detected]
            src.size_bytes = size
            src.status = "processing"
        db.add(src)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_key(temp_key)
        for key in created:
            storage.delete_key(key)
        raise
    db.refresh(src)
    return src


def process_video(source_id: str) -> None:
    """Background job: duration check, web copy, AI proxy and poster (own DB session)."""
    settings = get_settings()
    db = SessionLocal()
    try:
        src = db.get(Source, source_id)
        if src is None or src.kind != "video" or src.status != "processing" or not src.storage_key:
            return
        key, lab_id = src.storage_key, src.lab_id
        try:
            probe = media.probe_video(str(storage.path_for(key)))
            limit_ms = settings.max_video_seconds * 1000
            if probe.get("duration_ms") and probe["duration_ms"] > limit_ms:
                _video_failed(db, source_id, "video_too_long", {"max_seconds": settings.max_video_seconds, "duration_ms": probe["duration_ms"]})
                return
            result = media.transcode_video(key, lab_id)
        except Exception:
            log.warning("video processing failed for source %s", source_id, exc_info=True)
            db.rollback()
            _video_failed(db, source_id, "processing_failed", {})
            return
        db.expire_all()
        src = db.get(Source, source_id)
        derived = [result["web_key"], result["ai_key"], result["poster_key"]]
        if src is None:  # deleted while processing
            for derived_key in derived:
                storage.delete_key(derived_key)
            return
        meta = dict(src.meta_json or {})
        meta.update(
            web_key=result["web_key"],
            ai_key=result["ai_key"],
            poster_key=result["poster_key"],
            original_duration_ms=probe.get("duration_ms"),
            original_codec=probe.get("codec") or None,
        )
        src.meta_json = meta
        src.width = result.get("width") or probe.get("width")
        src.height = result.get("height") or probe.get("height")
        src.duration_ms = result.get("duration_ms") or probe.get("duration_ms")
        src.fps = result.get("fps") or probe.get("fps")
        src.status = "ready"
        src.error_code = None
        db.commit()
    finally:
        db.close()


def _video_failed(db: Session, source_id: str, code: str, info: dict[str, Any]) -> None:
    db.expire_all()
    src = db.get(Source, source_id)
    if src is None:
        return
    original = src.storage_key
    src.status = "failed"
    src.error_code = code
    src.storage_key = None  # the unusable original (possibly showing students) is removed
    src.meta_json = {**(src.meta_json or {}), **{k: v for k, v in info.items() if v is not None}}
    db.commit()
    storage.delete_key(original)


def _check_data_values(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clean: list[dict[str, Any]] = []
    fields: dict[str, str] = {}
    seen: set[str] = set()
    for i, raw in enumerate(values):
        try:
            item = DataValue.model_validate(raw)
        except Exception:
            fields[f"values.{i}"] = "invalid"
            continue
        if not math.isfinite(item.value):
            fields[f"values.{i}.value"] = "must be a finite number"
        if item.symbol in seen:
            fields[f"values.{i}.symbol"] = "duplicate"
        seen.add(item.symbol)
        clean.append({"symbol": item.symbol, "name": item.name, "value": item.value, "unit": item.unit})
    if not clean and not fields:
        fields["values"] = "add at least one value"
    if fields:
        raise AppError("validation_error", 422, "Some values are invalid", fields=fields)
    return clean


def create_data_source(db: Session, lab: Lab, body: DataSourceIn) -> Source:
    ensure_capacity(db, lab)
    values = _check_data_values([v.model_dump() for v in body.values])
    src = Source(
        lab_id=lab.id,
        kind="data",
        title=clean_text(body.title, 200) or "Data",
        status="ready",
        data_json=values,
        text_content=clean_text(body.note, 2000) or None,
        position=_next_position(db, lab),
        meta_json={"provenance": "user"},
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


def create_note_source(db: Session, lab: Lab, body: NoteSourceIn) -> Source:
    ensure_capacity(db, lab)
    text = clean_text(body.text, 8000)
    if not text:
        raise AppError("validation_error", 422, "The note is empty", fields={"text": "required"})
    src = Source(
        lab_id=lab.id,
        kind="note",
        title=clean_text(body.title, 200) or "Note",
        status="ready",
        text_content=text,
        position=_next_position(db, lab),
        meta_json={},
    )
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


# ============================================================================ update / delete
def update_source(db: Session, src: Source, body: SourceUpdate) -> Source:
    data = body.model_dump(exclude_unset=True)
    fields: dict[str, str] = {}
    if "title" in data and data["title"] is not None:
        title = clean_text(data["title"], 200)
        if not title:
            fields["title"] = "required"
        else:
            src.title = title
    if data.get("contains_people") is not None:
        src.contains_people = bool(data["contains_people"])
    if data.get("consent_confirmed") is not None:
        src.consent_confirmed = bool(data["consent_confirmed"])
    if "data" in data and data["data"] is not None:
        if src.kind != "data":
            fields["data"] = "only data sources have values"
        else:
            try:
                src.data_json = _check_data_values(data["data"])
            except AppError as exc:
                fields.update(exc.fields or {"data": "invalid"})
    if "text" in data and data["text"] is not None:
        if src.kind == "note":
            text = clean_text(data["text"], 8000)
            if not text:
                fields["text"] = "required"
            else:
                src.text_content = text
        elif src.kind == "data":
            src.text_content = clean_text(data["text"], 2000) or None
        else:
            fields["text"] = "only notes and data sources have text"
    if fields:
        db.rollback()
        raise AppError("validation_error", 422, "Some fields are invalid", fields=fields)
    db.commit()
    db.refresh(src)
    return src


def _derived_keys(src: Source) -> list[str]:
    keys = [src.storage_key] if src.storage_key else []
    for name, value in (src.meta_json or {}).items():
        if name.endswith("_key") and isinstance(value, str):
            keys.append(value)
    return keys


def delete_page_cache(pdf_key: str) -> int:
    """Remove cached page renders ``<stem>.p<n>.s<scale>.png`` of a PDF."""
    stem = pdf_key.rsplit(".", 1)[0]
    try:
        folder = storage.path_for(stem).parent
    except AppError:
        return 0
    prefix = Path(stem).name + ".p"
    removed = 0
    if folder.is_dir():
        for path in folder.iterdir():
            if path.name.startswith(prefix) and path.name.endswith(".png"):
                path.unlink(missing_ok=True)
                removed += 1
    return removed


def delete_source(db: Session, src: Source) -> None:
    keys = _derived_keys(src)
    pdf_key = src.storage_key if src.kind == "pdf" else None
    db.delete(src)
    db.commit()
    for key in keys:
        storage.delete_key(key)
    if pdf_key:
        delete_page_cache(pdf_key)


# ============================================================================ file access
def _no_file() -> AppError:
    return AppError("not_found", 404, "This source has no file")


def file_target(src: Source) -> tuple[str, str]:
    """(storage key, mime) of what ``/file`` serves: the original PDF/image or the web MP4."""
    if src.kind in ("pdf", "image"):
        if src.status != "ready" or not storage.exists(src.storage_key):
            raise _no_file()
        return src.storage_key, src.mime or ("application/pdf" if src.kind == "pdf" else "image/jpeg")
    if src.kind == "video":
        if src.status == "processing":
            raise AppError("source_not_ready", 409, "The video is still being prepared. Try again in a moment.", extra={"status": "processing"})
        web = (src.meta_json or {}).get("web_key")
        if src.status != "ready" or not web or not storage.exists(web):
            raise _no_file()
        return web, "video/mp4"
    raise _no_file()


def file_response(src: Source, with_filename: bool = True) -> Response:
    key, mime = file_target(src)
    name = ascii_filename(src.filename) if with_filename else None
    if name and src.kind == "video" and not name.lower().endswith(".mp4"):
        name = name.rsplit(".", 1)[0] + ".mp4"  # the web copy is always MP4
    return storage.file_response(key, mime, filename=name, max_age=FILE_MAX_AGE)


def poster_response(src: Source) -> Response:
    if src.kind == "video" and src.status == "processing":
        raise AppError("source_not_ready", 409, "The video is still being prepared. Try again in a moment.", extra={"status": "processing"})
    key = (src.meta_json or {}).get("poster_key") if src.kind == "video" else None
    if not key or not storage.exists(key):
        raise AppError("not_found", 404, "This source has no poster")
    return storage.file_response(key, "image/jpeg", max_age=FILE_MAX_AGE)


def _pdf_key(src: Source) -> str:
    if src.kind != "pdf" or src.status != "ready" or not storage.exists(src.storage_key):
        raise AppError("not_found", 404, "Pages are only available for PDF sources")
    return src.storage_key


def page_response(src: Source, page: int, scale: float) -> Response:
    png, _width, _height = media.render_pdf_page(_pdf_key(src), page, scale)
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": f"private, max-age={FILE_MAX_AGE}",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


def page_text(src: Source, page: int) -> PageTextOut:
    return PageTextOut(**media.pdf_page_text(_pdf_key(src), page))


def locate(src: Source, quote: str, page: int | None) -> LocateOut:
    """PDF quote search; prefix-only matches are approximate, never verbatim evidence."""
    if src.kind != "pdf" or src.status != "ready":
        return LocateOut(located="none")
    found = media.locate_quote(_pdf_key(src), quote, page)
    if not found:
        return LocateOut(located="none")
    return LocateOut(located=found["located"], page=found["page"], rects=found["rects"], bbox=found["bbox"])


def shareable(src: Source) -> bool:
    """Media showing students is only served to learners while consent is confirmed (§16)."""
    return not (src.contains_people and not src.consent_confirmed)


# ============================================================================ assets
def parse_asset_meta(raw: str | None) -> dict[str, Any]:
    if raw is None or not raw.strip():
        return {}
    if len(raw.encode("utf-8")) > MAX_ASSET_META_BYTES:
        raise AppError("validation_error", 422, "Asset details are too large", fields={"meta": "too large"})

    def _reject(constant: str) -> Any:
        raise ValueError(constant)

    try:
        value = json.loads(raw, parse_constant=_reject)
    except ValueError as exc:
        raise AppError("validation_error", 422, "Asset details must be JSON", fields={"meta": "invalid JSON"}) from exc
    if not isinstance(value, dict):
        raise AppError("validation_error", 422, "Asset details must be a JSON object", fields={"meta": "must be an object"})
    return value


def _flatten_alpha(data: bytes) -> bytes:
    """Frames and page snapshots never need transparency: paint it on white (→ small JPEG)."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            media.guard_decode(img)  # no decompression bombs
            img.load()
            has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
            if not has_alpha:
                return data
            rgba = ImageOps.exif_transpose(img).convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.getchannel("A"))
            out = io.BytesIO()
            flat.save(out, format="PNG")
            return out.getvalue()
    except AppError:
        raise
    except Exception as exc:
        raise AppError("invalid_file", 422, "The image could not be read") from exc


async def read_asset_upload(upload: UploadFile) -> bytes:
    data = await upload.read(MAX_ASSET_BYTES + 1)
    if len(data) > MAX_ASSET_BYTES:
        raise AppError("file_too_large", 413, "Images for a lab must be 10 MB or smaller.", extra={"max_mb": MAX_ASSET_BYTES // MB})
    if not data:
        raise AppError("empty_file", 400, "The uploaded file is empty")
    return data


def create_asset(
    db: Session,
    lab: Lab,
    data: bytes,
    *,
    kind: str,
    source_id: str | None,
    meta: dict[str, Any],
) -> Asset:
    if kind not in ASSET_KINDS_UPLOADABLE:
        raise AppError("validation_error", 422, "Unknown asset kind", fields={"kind": "must be cutout, frame or page"})
    detected = storage.sniff_kind(data[:64])
    if detected not in ASSET_TYPES:
        raise AppError(
            "unsupported_file",
            415,
            "Upload a PNG, JPEG or WebP image.",
            extra={"hint": "heic" if detected == "heic" else "images", "detected": detected},
        )
    if source_id:
        src = db.get(Source, source_id) if source_id.isalnum() else None
        if src is None or src.lab_id != lab.id:
            raise AppError("validation_error", 422, "The source is not part of this lab", fields={"source_id": "not found"})
    count = db.scalar(select(func.count()).select_from(Asset).where(Asset.lab_id == lab.id)) or 0
    if count >= MAX_ASSETS_PER_LAB:
        raise AppError("too_many_assets", 409, "This lab has too many images. Delete unused ones first.", extra={"max": MAX_ASSETS_PER_LAB})
    if kind != "cutout":
        data = _flatten_alpha(data)
    clean, mime, width, height = media.normalize_image_bytes(data, media.MAX_IMAGE_SIDE)
    key = storage.save_bytes(lab.id, clean, "png" if mime == "image/png" else "jpg")
    asset = Asset(
        lab_id=lab.id,
        source_id=source_id or None,
        kind=kind,
        storage_key=key,
        mime=mime,
        width=width,
        height=height,
        ai_generated=False,
        meta_json=meta,
    )
    try:
        db.add(asset)
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_key(key)
        raise
    db.refresh(asset)
    return asset


def get_asset_for_owner(db: Session, asset_id: str, actor: Actor) -> Asset:
    asset = db.get(Asset, asset_id) if asset_id and asset_id.isalnum() else None
    if asset is None:
        raise AppError("not_found", 404, "Asset not found")
    try:
        get_lab_for_owner(db, asset.lab_id, actor)  # owner or admin
    except AppError as exc:  # someone else's asset answers exactly like an unknown id
        if exc.status == 404:
            raise AppError("not_found", 404, "Asset not found") from None
        raise
    return asset


def asset_response(asset: Asset) -> Response:
    if not storage.exists(asset.storage_key):
        raise AppError("not_found", 404, "Asset not found")
    return storage.file_response(asset.storage_key, asset.mime, max_age=FILE_MAX_AGE)


def delete_asset(db: Session, asset: Asset) -> None:
    lab = db.get(Lab, asset.lab_id)
    if lab is not None and lab.cover_asset_id == asset.id:
        lab.cover_asset_id = None
    key = asset.storage_key
    db.delete(asset)
    db.commit()
    storage.delete_key(key)
