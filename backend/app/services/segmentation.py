"""SAM 3.1 segmentation (spec §6.1) and AI diagram hotspots (spec §5.2).

* ``segment``: image source, PDF page (rendered at scale 1.5) or image asset, with a noun
  phrase (non-English phrases are first turned into a short English noun phrase by Muse),
  points or a box. Points/box are pixel coordinates of the media *as served to the browser*
  (image file, page PNG at scale 1.5, asset file) — or fractions 0..1. They are rescaled to
  the image SAM receives. Results are returned exactly as SAM gives them, in the pixel space
  of that image (``width``/``height`` of the response); masks are decoded in the browser.
* ``segment_frame``: the same on a video frame captured in the browser (multipart upload).
* ``diagram``: Muse proposes labeled parts with simple/detailed descriptions, approximate
  boxes and relations; each box is refined with a SAM box prompt (kept only when SAM agrees
  with the proposal). ``mask_path`` stays empty — the browser converts the returned masks.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

import anyio
from fastapi import UploadFile
from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import get_ai, part_image, part_text
from ..ai.outputs import DiagramOutput, PhraseOutput, VisualPhrasesOutput, clip
from ..ai.sam import SamObject, box_prompt, clean_phrase, point_prompt
from ..config import get_settings
from ..errors import AppError
from ..models import Lab
from ..schemas.api import DiagramIn, DiagramOut, PointIn, SamMask, SamObjectOut, SegmentIn, SegmentOut
from ..schemas.spec import Hotspot, ImageRef, Relation, SourceRef
from ..security import Actor
from . import media
from .analysis import SourceInfo, call_ctx, choose_mode, effort, load_sources, norm_box, snapshot_source

log = logging.getLogger("conceptlab.segmentation")

PDF_SCALE = 1.5
SAM_CONCURRENCY = 4
MIN_IOU = 0.15
MAX_PARTS = 12


@dataclass
class SamImage:
    data: bytes
    mime: str
    width: int
    height: int
    ref_width: int  # pixel space of the media the browser shows (for incoming coordinates)
    ref_height: int
    image: ImageRef


# ============================================================================ phrases
# Vietnamese words that learners often type WITHOUT diacritics on phones ("qua bong do" for
# "quả bóng đỏ"). Such text is ASCII but not English, so it is translated too. Words that are
# also common English words (day, long, mat, bang, but, may, do, to …) are left out.
_VI_ASCII_WORDS = frozenset(
    "qua bong lac mau xanh vang trang den cai chiec nguoi ghe cay hoa phoi gan dau chan mui mieng nuoc binh coc "
    "thuoc sach xe tron vuong dai ngan nang nhe nho luoi san vot cau khoi hop banh vien cuc thanh soi ong kinh "
    "hinh tam giay ke gia ngon tay chim ca meo cho tim la da co tuong cua vo".split()
)
_PHRASE_CACHE: dict[str, str] = {}
_PHRASE_CACHE_SIZE = 256


def needs_translation(phrase: str) -> bool:
    if not phrase.isascii():
        return True
    return any(word in _VI_ASCII_WORDS for word in phrase.lower().split())


async def english_phrase(phrase: str | None, lab: Lab, actor: Actor | None) -> str:
    """Short English noun phrase for SAM. Vietnamese (with or without diacritics) is translated by Muse."""
    cleaned = clean_phrase(phrase or "")
    if not cleaned:
        return ""
    if not needs_translation(cleaned):
        return cleaned
    key = cleaned.lower()
    if key in _PHRASE_CACHE:
        return _PHRASE_CACHE[key]
    mode, _ = choose_mode(lab) if lab is not None else ("contributor", [])
    result = await get_ai().chat_json(
        messages=[{"role": "user", "content": prompts.PHRASE_TASK.format(phrase=cleaned)}],
        ctx=call_ctx("sam-phrase", actor, lab),
        model_cls=PhraseOutput,
        name="sam_phrase",
        mode=mode,
        effort=effort(False),
    )
    translated = clean_phrase(result.data.phrase)
    translated = translated if translated and translated.isascii() else ""
    if translated:
        if len(_PHRASE_CACHE) >= _PHRASE_CACHE_SIZE:
            _PHRASE_CACHE.pop(next(iter(_PHRASE_CACHE)))
        _PHRASE_CACHE[key] = translated
    return translated


# ============================================================================ media
def load_sam_image(lab: Lab, info: SourceInfo | None, asset_id: str | None, page: int | None) -> SamImage:
    """Blocking: decode/render the image SAM will see."""
    if info is not None:
        if info.status != "ready" or not info.storage_key:
            raise AppError("source_not_ready", 409, "The source is still being processed")
        if info.kind == "image":
            data, mime, width, height = media.image_for_ai(info.storage_key)
            return SamImage(data, mime, width, height, info.width or width, info.height or height, ImageRef(source_id=info.id))
        if info.kind == "pdf":
            page = page or 1
            if info.page_count and not 1 <= page <= info.page_count:
                raise AppError("not_found", 404, "Page not found")
            data, width, height = media.render_pdf_page(info.storage_key, page, PDF_SCALE)
            return SamImage(data, "image/png", width, height, width, height, ImageRef(source_id=info.id, page=page))
        raise AppError("unsupported_file", 422, "Segmentation needs an image, a PDF page or an image asset")
    asset = next((a for a in lab.assets if a.id == asset_id), None)
    if asset is None:
        raise AppError("not_found", 404, "Asset not found")
    if not storage.exists(asset.storage_key):
        raise AppError("not_found", 404, "File not found")
    data, mime, width, height = media.normalize_image_bytes(storage.read_bytes(asset.storage_key), media.AI_IMAGE_SIDE)
    return SamImage(data, mime, width, height, asset.width or width, asset.height or height, ImageRef(asset_id=asset.id))


def _scale(values: list[float], img: SamImage) -> list[float]:
    """Incoming coordinates (served-media pixels, or fractions 0..1) → SAM image pixels, as x/y pairs."""
    normalized = all(0 <= v <= 1 for v in values)
    out = []
    for i, v in enumerate(values):
        if i % 2 == 0:
            out.append(v * img.width if normalized else v * img.width / max(1, img.ref_width))
        else:
            out.append(v * img.height if normalized else v * img.height / max(1, img.ref_height))
    return out


def point_prompt_for(points: list[PointIn], img: SamImage) -> str:
    flat = [c for p in points for c in (p.x, p.y)]
    scaled = _scale(flat, img)
    pts = [{"x": scaled[2 * i], "y": scaled[2 * i + 1], "negative": p.negative} for i, p in enumerate(points)]
    return point_prompt(pts, img.width, img.height)


def box_prompt_for(box: list[float], img: SamImage) -> str:
    return box_prompt(_scale(list(box), img), img.width, img.height)


def sam_object_out(obj: SamObject) -> SamObjectOut:
    mask = None
    if obj.mask:
        mask = SamMask(
            encoding=obj.mask.get("encoding", "lossless"),
            payload=obj.mask.get("payload", ""),
            width=int(obj.mask.get("width") or 0),
            height=int(obj.mask.get("height") or 0),
        )
    return SamObjectOut(id=str(obj.id), box=list(obj.box), mask=mask, confidence=obj.confidence)


def normalized_box(box: list[int], width: int, height: int) -> list[float]:
    x1, y1, x2, y2 = box
    vals = [x1 / width, y1 / height, (x2 + 1) / width, (y2 + 1) / height]
    return [round(max(0.0, min(1.0, v)), 4) for v in vals]


def iou(a: list[float], b: list[float]) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    area = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / area if area > 0 else 0.0


# ============================================================================ segment endpoints
async def run_sam(img: SamImage, prompt: str, lab: Lab, actor: Actor | None, feature: str, phrase_used: str | None) -> SegmentOut:
    result = await get_ai().segment(media=img.data, mime=img.mime, prompt=prompt, ctx=call_ctx(feature, actor, lab))
    return SegmentOut(
        width=result.width or img.width,
        height=result.height or img.height,
        phrase_used=phrase_used,
        objects=[sam_object_out(o) for o in result.objects],
    )


def lab_shows_people(lab: Lab) -> bool:
    return any(s.contains_people for s in lab.sources)


def media_shows_people(lab: Lab, info: SourceInfo | None, asset_id: str | None) -> bool:
    """Privacy rule (spec §16) for the picture sent to Muse: the source's own flag; for an asset,
    the flag of the source it was cut from. Media that cannot be attributed (a frame captured in
    the browser, an asset whose source is gone) counts as showing people when any source of the
    lab does."""
    if info is not None:
        return bool(info.contains_people)
    asset = next((a for a in lab.assets if a.id == asset_id), None)
    if asset is not None and asset.source_id:
        src = next((s for s in lab.sources if s.id == asset.source_id), None)
        if src is not None:
            return bool(src.contains_people)
    return lab_shows_people(lab)


async def visual_phrases(
    img: SamImage, phrase: str, literal: str, lab: Lab, actor: Actor | None, people: bool = False
) -> list[str]:
    """Ask Muse, looking at the picture, for concrete noun phrases SAM is likely to match.
    A picture that may show students is never sent in Contributor mode (spec §16)."""
    mode, _ = choose_mode(lab, people=people) if lab is not None else ("standard", [])
    result = await get_ai().chat_json(
        messages=[
            {
                "role": "user",
                "content": [
                    part_text(prompts.VISUAL_PHRASES_TASK.format(phrase=phrase, literal=literal)),
                    part_image(img.data, img.mime),
                ],
            }
        ],
        ctx=call_ctx("sam-phrase-visual", actor, lab),
        model_cls=VisualPhrasesOutput,
        name="sam_visual_phrases",
        mode=mode,
        effort=effort(False),
    )
    seen, out = {literal.lower()}, []
    for candidate in result.data.phrases:
        cleaned = clean_phrase(candidate)
        if cleaned and cleaned.isascii() and cleaned.lower() not in seen:
            seen.add(cleaned.lower())
            out.append(cleaned)
    return out[:3]


async def segment_by_phrase(
    img: SamImage, phrase: str | None, lab: Lab, actor: Actor | None, feature: str, people: bool = False
) -> SegmentOut:
    """Noun-phrase segmentation with a visual fallback.

    A literal translation can miss ("quả nặng màu đỏ" → "red weight"), because SAM matches
    concrete visual nouns. When nothing matches, Muse looks at the picture and proposes up to
    three concrete phrases ("red ball", …) that are tried in order. ``phrase_used`` tells the
    learner which wording found the object.
    """
    literal = await english_phrase(phrase, lab, actor)
    if not literal:
        raise AppError("validation_error", 422, "Describe the object with a few words", fields={"phrase": "invalid"})
    first = await run_sam(img, literal, lab, actor, feature, literal)
    if first.objects:
        return first
    try:
        alternatives = await visual_phrases(img, clean_phrase(phrase or ""), literal, lab, actor, people=people)
    except Exception:  # the fallback is best-effort: an honest empty result beats an error
        log.warning("visual phrase fallback failed", exc_info=True)
        return first
    for alternative in alternatives:
        found = await run_sam(img, alternative, lab, actor, feature, alternative)
        if found.objects:
            return found
    return first


async def segment(db: Session, lab: Lab, actor: Actor, body: SegmentIn) -> SegmentOut:
    if not body.source_id and not body.asset_id:
        raise AppError("validation_error", 422, "Choose an image", fields={"source_id": "required"})
    if body.box is None and not body.points and not (body.phrase and body.phrase.strip()):
        raise AppError("validation_error", 422, "Describe the object, tap it, or draw a box", fields={"phrase": "required"})
    info = snapshot_source(load_sources(db, lab, [body.source_id])[0]) if body.source_id else None
    people = media_shows_people(lab, info, body.asset_id)
    img = await anyio.to_thread.run_sync(lambda: load_sam_image(lab, info, body.asset_id, body.page))
    db.commit()
    if body.box is not None:
        return await run_sam(img, box_prompt_for(body.box, img), lab, actor, "segment", None)
    if body.points:
        return await run_sam(img, point_prompt_for(body.points, img), lab, actor, "segment", None)
    return await segment_by_phrase(img, body.phrase, lab, actor, "segment", people=people)


async def read_upload(upload: UploadFile, max_bytes: int) -> bytes:
    chunks, size = [], 0
    while True:
        chunk = await upload.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            raise AppError("file_too_large", 413, "File is larger than allowed", extra={"max_mb": max_bytes // (1024 * 1024)})
        chunks.append(chunk)
    if size == 0:
        raise AppError("empty_file", 400, "The uploaded file is empty")
    return b"".join(chunks)


def parse_points(raw: str | None) -> list[PointIn] | None:
    if not raw or not raw.strip():
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            data = [data]
        if not isinstance(data, list) or not 1 <= len(data) <= 10:
            raise ValueError("points")
        return [PointIn.model_validate(p) for p in data]
    except (ValueError, TypeError) as exc:
        raise AppError("validation_error", 422, "Invalid points", fields={"points": "invalid"}) from exc


async def segment_frame(
    db: Session, lab: Lab, actor: Actor, file: UploadFile, phrase: str | None, points_raw: str | None
) -> SegmentOut:
    points = parse_points(points_raw)
    if not points and not (phrase and phrase.strip()):
        raise AppError("validation_error", 422, "Describe the object or tap it", fields={"phrase": "required"})
    raw = await read_upload(file, get_settings().max_upload_mb_image * 1024 * 1024)
    if storage.sniff_kind(raw[:64]) not in ("jpeg", "png", "webp"):
        raise AppError("unsupported_file", 415, "Upload a PNG, JPEG or WebP frame")

    def decode() -> SamImage:
        ref_w, ref_h = media.image_size(raw)
        data, mime, width, height = media.normalize_image_bytes(raw, media.AI_IMAGE_SIDE)
        return SamImage(data, mime, width, height, ref_w, ref_h, ImageRef())

    img = await anyio.to_thread.run_sync(decode)
    people = lab_shows_people(lab)  # a frame of this lab's practice video may show its students
    db.commit()
    if points:
        return await run_sam(img, point_prompt_for(points, img), lab, actor, "segment-frame", None)
    return await segment_by_phrase(img, phrase, lab, actor, "segment-frame", people=people)


# ============================================================================ diagram
async def propose_diagram(lab: Lab, actor: Actor | None, info: SourceInfo, page: int | None, refine: bool = True) -> DiagramOut:
    img = await anyio.to_thread.run_sync(lambda: load_sam_image(lab, info, None, page))
    mode, warnings = choose_mode(lab, people=info.contains_people)
    where = f"page {img.image.page} of the PDF “{info.title}”" if img.image.page else f"the image “{info.title}”"
    content = [
        part_text(prompts.lesson_context(lab) + f"\n\nFIGURE: {where}, {img.width}×{img.height} px."),
        part_image(img.data, img.mime),
        part_text(prompts.DIAGRAM_TASK),
    ]
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab)}, {"role": "user", "content": content}],
        ctx=call_ctx("diagram", actor, lab),
        model_cls=DiagramOutput,
        name="diagram",
        mode=mode,
        effort=effort(True),
    )
    out: DiagramOutput = result.data
    parts = []
    key_to_id: dict[str, str] = {}
    for part in out.parts:
        box = norm_box(part.box, img.width, img.height)
        key = str(part.key).strip()
        if box is None or not str(part.label).strip() or not key or key in key_to_id or len(parts) >= MAX_PARTS:
            continue
        hid = f"h{len(parts) + 1}"
        key_to_id[key] = hid
        parts.append((hid, part, box))

    masks: dict[str, SamObjectOut] = {}
    refined: dict[str, list[float]] = {}
    if refine and parts:
        semaphore = asyncio.Semaphore(SAM_CONCURRENCY)

        async def refine_one(hid: str, box: list[float]) -> None:
            px = [box[0] * img.width, box[1] * img.height, box[2] * img.width - 1, box[3] * img.height - 1]
            async with semaphore:
                try:
                    res = await get_ai().segment(
                        media=img.data, mime=img.mime, prompt=box_prompt(px, img.width, img.height), ctx=call_ctx("diagram-sam", actor, lab)
                    )
                except AppError:
                    return
            width, height = res.width or img.width, res.height or img.height
            best, best_iou = None, 0.0
            for obj in res.objects:
                candidate = normalized_box(obj.box, width, height)
                score = iou(candidate, box)
                if score > best_iou:
                    best, best_iou = obj, score
            if best is not None and best_iou >= MIN_IOU:
                refined[hid] = normalized_box(best.box, width, height)
                masks[hid] = sam_object_out(best)

        await asyncio.gather(*(refine_one(hid, box) for hid, _part, box in parts))

    hotspots = []
    for hid, part, box in parts:
        bbox = refined.get(hid, box)
        ref = SourceRef(source_id=info.id, page=img.image.page, bbox=bbox, quote=None, located="approximate")
        hotspots.append(
            Hotspot(
                id=hid,
                label=clip(part.label, 200),
                description_simple=clip(part.description_simple, 2000),
                description_detailed=clip(part.description_detailed, 12000),
                bbox=bbox,
                mask_path=None,
                source_refs=[ref],
            )
        )
    relations = []
    for rel in out.relations:
        src, dst = key_to_id.get(str(rel.source_key).strip()), key_to_id.get(str(rel.target_key).strip())
        if src and dst and src != dst and len(relations) < 60:
            relations.append(
                Relation(id=f"rel{len(relations) + 1}", source=src, target=dst, label=clip(rel.label, 200), description=clip(rel.description, 2000))
            )
    notes = "\n".join([*warnings, clip(out.notes, 1500)]).strip()
    return DiagramOut(
        image=img.image,
        hotspots=hotspots,
        relations=relations,
        notes=notes,
        image_width=img.width,
        image_height=img.height,
        masks=masks,
    )


async def diagram(db: Session, lab: Lab, actor: Actor, body: DiagramIn) -> DiagramOut:
    src = load_sources(db, lab, [body.source_id])[0]
    if src.kind not in ("image", "pdf"):
        raise AppError("unsupported_file", 422, "A diagram needs an image or a PDF page")
    info = snapshot_source(src)
    db.commit()
    return await propose_diagram(lab, actor, info, body.page if src.kind == "pdf" else None, refine=body.refine_with_sam)
