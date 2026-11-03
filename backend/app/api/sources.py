"""Sources (PDF, images, videos, measured data, notes) and lab assets.

Owner routes (owner or admin; others get 404, guests 401) and the share-scoped,
read-only twins used by learners (only published labs, only ids in the snapshot).
Contract: docs/API.md §Sources & assets. Business rules: ``services/sources.py``.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from starlette.datastructures import FormData
from starlette.datastructures import UploadFile as StarletteUploadFile
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import storage
from ..db import get_db
from ..errors import AppError
from ..schemas.api import (
    AssetOut,
    DataSourceIn,
    LocateIn,
    LocateOut,
    NoteSourceIn,
    PageTextOut,
    SourceOut,
    SourceUpdate,
)
from ..security import Actor, get_actor, rate_limiter, require_user
from ..services import labs as labs_svc
from ..services import sources as svc
from ..services import share as share_svc

router = APIRouter(tags=["sources"])

FORM_OVERHEAD = 1024 * 1024  # multipart boundaries and the small text fields
UPLOADS_PER_HOUR = 200

PageNumber = Path(ge=1, le=10000)
Scale = Query(default=1.5, ge=0.5, le=3.0)


def _multipart_doc(properties: dict, required: list[str]) -> dict:
    """OpenAPI description of a multipart body parsed by hand (after permission checks)."""
    return {
        "requestBody": {
            "required": True,
            "content": {"multipart/form-data": {"schema": {"type": "object", "properties": properties, "required": required}}},
        }
    }


SOURCE_UPLOAD_DOC = _multipart_doc(
    {
        "file": {"type": "string", "format": "binary", "description": "PDF, JPEG/PNG/WebP/GIF photo or MP4/MOV/WebM video"},
        "title": {"type": "string", "maxLength": 200},
        "contains_people": {"type": "boolean", "default": False},
        "consent_confirmed": {"type": "boolean", "default": False},
    },
    ["file"],
)
ASSET_UPLOAD_DOC = _multipart_doc(
    {
        "file": {"type": "string", "format": "binary", "description": "PNG/JPEG/WebP ≤ 10 MB"},
        "kind": {"type": "string", "enum": ["cutout", "frame", "page"]},
        "source_id": {"type": "string"},
        "meta": {"type": "string", "description": "JSON object as a string"},
    },
    ["file", "kind"],
)


# ============================================================================ multipart helpers
async def _read_form(request: Request, max_bytes: int) -> FormData:
    """Parse a multipart form after permission checks, refusing oversized bodies early."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > max_bytes + FORM_OVERHEAD:
        raise AppError(
            "file_too_large", 413, "File is larger than allowed", extra={"max_mb": max_bytes // svc.MB}
        )
    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
        raise AppError("validation_error", 422, "Send the file as multipart/form-data", fields={"file": "required"})
    try:
        return await request.form(max_files=1, max_fields=12)
    except StarletteHTTPException as exc:
        if exc.status_code == 413:  # a chunked body past the route limit (BodySizeLimitMiddleware)
            raise AppError("file_too_large", 413, "File is larger than allowed", extra={"max_mb": max_bytes // svc.MB}) from exc
        raise AppError("validation_error", 422, "The upload could not be read", fields={"file": "invalid"}) from exc


def _form_file(form: FormData) -> StarletteUploadFile:
    upload = form.get("file")
    if not isinstance(upload, StarletteUploadFile):
        raise AppError("validation_error", 422, "Choose a file to upload", fields={"file": "required"})
    return upload


def _form_text(form: FormData, name: str, max_length: int) -> str | None:
    value = form.get(name)
    if value is None:
        return None
    if not isinstance(value, str):
        raise AppError("validation_error", 422, "Some fields are invalid", fields={name: "must be text"})
    if len(value) > max_length:
        raise AppError("validation_error", 422, "Some fields are invalid", fields={name: f"at most {max_length} characters"})
    return value


def _form_bool(form: FormData, name: str) -> bool:
    raw = form.get(name)
    if raw is None:
        return False
    if not isinstance(raw, str):
        raise AppError("validation_error", 422, "Some fields are invalid", fields={name: "must be true or false"})
    value = raw.strip().lower()
    if value in ("1", "true", "on", "yes"):
        return True
    if value in ("", "0", "false", "off", "no"):
        return False
    raise AppError("validation_error", 422, "Some fields are invalid", fields={name: "must be true or false"})


# ============================================================================ create sources
@router.post("/api/labs/{lab_id}/sources", response_model=SourceOut, status_code=201, openapi_extra=SOURCE_UPLOAD_DOC)
async def upload_source(
    lab_id: str,
    request: Request,
    background: BackgroundTasks,
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> SourceOut:
    """multipart: ``file``, ``title?``, ``contains_people`` (bool), ``consent_confirmed`` (bool)."""
    lab = labs_svc.get_lab_for_owner(db, lab_id, actor)
    svc.ensure_capacity(db, lab)
    rate_limiter.hit("upload", actor.rate_key, UPLOADS_PER_HOUR, 3600)
    limit = svc.max_upload_bytes()
    form = await _read_form(request, limit)
    try:
        upload = _form_file(form)
        title = _form_text(form, "title", 200)
        contains_people = _form_bool(form, "contains_people")
        consent_confirmed = _form_bool(form, "consent_confirmed")
        temp_key, size = await storage.save_upload(lab.id, upload, "bin", limit)
        src = await run_in_threadpool(
            svc.finish_upload,
            db,
            lab,
            temp_key,
            size,
            filename=upload.filename,
            title=title,
            contains_people=contains_people,
            consent_confirmed=consent_confirmed,
        )
    finally:
        await form.close()
    if src.kind == "video" and src.status == "processing":
        background.add_task(svc.process_video, src.id)
    return labs_svc.source_out(src)


@router.post("/api/labs/{lab_id}/sources/data", response_model=SourceOut, status_code=201)
def create_data_source(
    lab_id: str, body: DataSourceIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> SourceOut:
    lab = labs_svc.get_lab_for_owner(db, lab_id, actor)
    return labs_svc.source_out(svc.create_data_source(db, lab, body))


@router.post("/api/labs/{lab_id}/sources/note", response_model=SourceOut, status_code=201)
def create_note_source(
    lab_id: str, body: NoteSourceIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> SourceOut:
    lab = labs_svc.get_lab_for_owner(db, lab_id, actor)
    return labs_svc.source_out(svc.create_note_source(db, lab, body))


# ============================================================================ one source (owner)
@router.get("/api/sources/{source_id}", response_model=SourceOut)
def get_source(source_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> SourceOut:
    return labs_svc.source_out(labs_svc.get_source_for_owner(db, source_id, actor))


@router.patch("/api/sources/{source_id}", response_model=SourceOut)
def update_source(
    source_id: str, body: SourceUpdate, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> SourceOut:
    src = labs_svc.get_source_for_owner(db, source_id, actor)
    return labs_svc.source_out(svc.update_source(db, src, body))


@router.delete("/api/sources/{source_id}", status_code=204)
def delete_source(source_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    src = labs_svc.get_source_for_owner(db, source_id, actor)
    svc.delete_source(db, src)
    return Response(status_code=204)


@router.get("/api/sources/{source_id}/file")
def source_file(source_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    """Original PDF/image, or the web MP4 of a video (Range requests supported)."""
    return svc.file_response(labs_svc.get_source_for_owner(db, source_id, actor))


@router.get("/api/sources/{source_id}/poster")
def source_poster(source_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    return svc.poster_response(labs_svc.get_source_for_owner(db, source_id, actor))


@router.get("/api/sources/{source_id}/pages/{page}.png")
def source_page(
    source_id: str,
    page: int = PageNumber,
    scale: float = Scale,
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> Response:
    return svc.page_response(labs_svc.get_source_for_owner(db, source_id, actor), page, scale)


@router.get("/api/sources/{source_id}/text", response_model=PageTextOut)
def source_text(
    source_id: str,
    page: int = Query(ge=1, le=10000),
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> PageTextOut:
    return svc.page_text(labs_svc.get_source_for_owner(db, source_id, actor), page)


@router.post("/api/sources/{source_id}/locate", response_model=LocateOut)
def source_locate(
    source_id: str, body: LocateIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> LocateOut:
    return svc.locate(labs_svc.get_source_for_owner(db, source_id, actor), body.quote, body.page)


# ============================================================================ assets (owner)
@router.post("/api/labs/{lab_id}/assets", response_model=AssetOut, status_code=201, openapi_extra=ASSET_UPLOAD_DOC)
async def upload_asset(
    lab_id: str,
    request: Request,
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> AssetOut:
    """multipart: ``file`` (PNG/JPEG/WebP ≤ 10 MB), ``kind`` (cutout|frame|page),
    ``source_id?``, ``meta?`` (JSON object as a string)."""
    lab = labs_svc.get_lab_for_owner(db, lab_id, actor)
    rate_limiter.hit("upload", actor.rate_key, UPLOADS_PER_HOUR, 3600)
    form = await _read_form(request, svc.MAX_ASSET_BYTES)
    try:
        upload = _form_file(form)
        kind = (_form_text(form, "kind", 20) or "").strip()
        source_id = (_form_text(form, "source_id", 40) or "").strip() or None
        meta = svc.parse_asset_meta(_form_text(form, "meta", svc.MAX_ASSET_META_BYTES))
        data = await svc.read_asset_upload(upload)
    finally:
        await form.close()
    asset = await run_in_threadpool(svc.create_asset, db, lab, data, kind=kind, source_id=source_id, meta=meta)
    return labs_svc.asset_out(asset)


@router.get("/api/assets/{asset_id}/file")
def asset_file(asset_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    return svc.asset_response(svc.get_asset_for_owner(db, asset_id, actor))


@router.delete("/api/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    svc.delete_asset(db, svc.get_asset_for_owner(db, asset_id, actor))
    return Response(status_code=204)


# ============================================================================ share-scoped (learners)
def _shared_source(db: Session, code: str, source_id: str, actor: Actor):
    _lab, src = share_svc.shared_source(db, code, source_id, actor)
    if not svc.shareable(src):
        raise AppError("not_found", 404, "Source not found")
    return src


@router.get("/api/share/{code}/sources/{source_id}/file")
def shared_source_file(
    code: str, source_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> Response:
    return svc.file_response(_shared_source(db, code, source_id, actor), with_filename=False)


@router.get("/api/share/{code}/sources/{source_id}/poster")
def shared_source_poster(
    code: str, source_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> Response:
    return svc.poster_response(_shared_source(db, code, source_id, actor))


@router.get("/api/share/{code}/sources/{source_id}/pages/{page}.png")
def shared_source_page(
    code: str,
    source_id: str,
    page: int = PageNumber,
    scale: float = Scale,
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> Response:
    return svc.page_response(_shared_source(db, code, source_id, actor), page, scale)


@router.get("/api/share/{code}/sources/{source_id}/text", response_model=PageTextOut)
def shared_source_text(
    code: str,
    source_id: str,
    page: int = Query(ge=1, le=10000),
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> PageTextOut:
    return svc.page_text(_shared_source(db, code, source_id, actor), page)


@router.get("/api/share/{code}/assets/{asset_id}/file")
def shared_asset_file(
    code: str, asset_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> Response:
    _lab, asset = share_svc.shared_asset(db, code, asset_id, actor)
    return svc.asset_response(asset)
