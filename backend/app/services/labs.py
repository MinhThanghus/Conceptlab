"""Lab domain service: permissions, serialization, versions, publishing and sharing.

Permission policy (enforced here, for every entry point):

* Owner (or an admin) may read/write a lab and its sources/assets/results.
* Anyone may read a *published* lab through its share code — but only the published
  snapshot (``published_spec_json``) and the sources/assets captured in it.
* Drafts, analysis, unapproved quiz questions, unconfirmed AI video markers and
  unapproved AI widgets never leave through public/share routes.
"""

from __future__ import annotations

import copy
import secrets
from datetime import timedelta
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import storage
from ..config import get_settings
from ..db import utcnow
from ..errors import AppError
from ..models import Asset, Lab, LabVersion, Source, User
from ..schemas.analysis import LabAnalysis
from ..schemas.api import (
    AssetOut,
    LabCreate,
    LabOut,
    LabSummary,
    LabUpdate,
    OwnerOut,
    SharedLabOut,
    SourceOut,
    SourceUrls,
)
from ..schemas.spec import LabSpec, empty_spec
from ..security import Actor

SHARE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O/1/I/L confusion for classrooms
AUTOSNAPSHOT_MINUTES = 10


# ----------------------------------------------------------------------------- access
def get_lab_for_owner(db: Session, lab_id: str, actor: Actor) -> Lab:
    """Return a lab the actor owns (admins may access any). Hidden as 404 otherwise."""
    if actor.user is None:
        raise AppError("unauthorized", 401, "Please sign in")
    lab = db.get(Lab, lab_id) if lab_id and lab_id.isalnum() else None
    if lab is None or (lab.owner_id != actor.user.id and actor.user.role != "admin"):
        raise AppError("not_found", 404, "Lab not found")
    return lab


def get_published_lab(db: Session, code: str) -> Lab:
    code = (code or "").strip().upper()
    if not (4 <= len(code) <= 8) or any(ch not in SHARE_ALPHABET for ch in code):
        raise AppError("not_found", 404, "Lab not found")
    lab = db.scalar(select(Lab).where(Lab.share_code == code, Lab.status == "published"))
    if lab is None or not lab.published_spec_json:
        raise AppError("not_found", 404, "Lab not found")
    return lab


def get_source_for_owner(db: Session, source_id: str, actor: Actor) -> Source:
    src = db.get(Source, source_id) if source_id and source_id.isalnum() else None
    if src is None:
        raise AppError("not_found", 404, "Source not found")
    try:
        get_lab_for_owner(db, src.lab_id, actor)
    except AppError as exc:  # someone else's source answers exactly like an unknown id
        if exc.status == 404:
            raise AppError("not_found", 404, "Source not found") from None
        raise
    return src


def get_shared_source(db: Session, code: str, source_id: str) -> tuple[Lab, Source]:
    lab = get_published_lab(db, code)
    if source_id not in (lab.published_spec_json or {}).get("source_ids", []):
        raise AppError("not_found", 404, "Source not found")
    src = db.get(Source, source_id)
    if src is None or src.lab_id != lab.id:
        raise AppError("not_found", 404, "Source not found")
    return lab, src


def get_shared_asset(db: Session, code: str, asset_id: str) -> tuple[Lab, Asset]:
    lab = get_published_lab(db, code)
    if asset_id not in (lab.published_spec_json or {}).get("asset_ids", []):
        raise AppError("not_found", 404, "Asset not found")
    asset = db.get(Asset, asset_id)
    if asset is None or asset.lab_id != lab.id:
        raise AppError("not_found", 404, "Asset not found")
    return lab, asset


# ----------------------------------------------------------------------------- serialization
def source_urls(src: Source, share_code: str | None = None) -> SourceUrls:
    base = f"/api/share/{share_code}/sources/{src.id}" if share_code else f"/api/sources/{src.id}"
    urls = SourceUrls()
    if src.kind in ("pdf", "image", "video") and src.storage_key and src.status == "ready":
        urls.file = f"{base}/file"
    if src.kind == "video" and (src.meta_json or {}).get("poster_key"):
        urls.poster = f"{base}/poster"
    if src.kind == "pdf" and src.status == "ready":
        urls.page = f"{base}/pages/{{n}}.png"
    return urls


def source_out(src: Source, share_code: str | None = None) -> SourceOut:
    meta = src.meta_json or {}
    return SourceOut(
        id=src.id,
        kind=src.kind,
        title=src.title,
        filename=src.filename,
        mime=src.mime,
        size_bytes=src.size_bytes or 0,
        status=src.status,
        error_code=src.error_code,
        page_count=src.page_count,
        width=src.width,
        height=src.height,
        duration_ms=src.duration_ms,
        fps=src.fps,
        contains_people=bool(src.contains_people),
        consent_confirmed=bool(src.consent_confirmed),
        data=src.data_json,
        text=src.text_content,
        toc=meta.get("toc") or [],
        urls=source_urls(src, share_code),
        created_at=src.created_at,
    )


def asset_url(asset: Asset, share_code: str | None = None) -> str:
    if share_code:
        return f"/api/share/{share_code}/assets/{asset.id}/file"
    return f"/api/assets/{asset.id}/file"


def asset_out(asset: Asset, share_code: str | None = None) -> AssetOut:
    return AssetOut(
        id=asset.id,
        kind=asset.kind,
        mime=asset.mime,
        width=asset.width,
        height=asset.height,
        ai_generated=bool(asset.ai_generated),
        source_id=asset.source_id,
        url=asset_url(asset, share_code),
        meta=asset.meta_json or {},
    )


def _cover_url(db: Session, lab: Lab, share_code: str | None = None) -> str | None:
    if not lab.cover_asset_id:
        return None
    asset = db.get(Asset, lab.cover_asset_id)
    if asset is None or asset.lab_id != lab.id:
        return None
    if share_code and asset.id not in (lab.published_spec_json or {}).get("asset_ids", []):
        return None
    return asset_url(asset, share_code)


def _owner(db: Session, lab: Lab) -> OwnerOut:
    user = db.get(User, lab.owner_id)
    return OwnerOut(id=lab.owner_id, name=user.name if user else "—")


def lab_summary(db: Session, lab: Lab, *, public: bool = False) -> LabSummary:
    spec = (lab.published_spec_json or {}).get("spec", {}) if public else (lab.spec_json or {})
    share = lab.share_code if public else None
    return LabSummary(
        id=lab.id,
        space=lab.space,
        title=lab.title,
        subject=lab.subject,
        grade=lab.grade,
        topic=lab.topic,
        language=lab.language,
        status=lab.status,
        visibility=lab.visibility,
        share_code=lab.share_code if (public or lab.status == "published") else None,
        is_demo=bool(lab.is_demo),
        cover_url=_cover_url(db, lab, share),
        block_count=len(spec.get("blocks") or []),
        source_count=len((lab.published_spec_json or {}).get("source_ids", [])) if public else len(lab.sources),
        owner=_owner(db, lab),
        created_at=lab.created_at,
        updated_at=lab.updated_at,
        published_at=lab.published_at,
    )


def lab_out(db: Session, lab: Lab) -> LabOut:
    summary = lab_summary(db, lab)
    return LabOut(
        **summary.model_dump(),
        goal=lab.goal,
        level=lab.level,
        ai_mode=lab.ai_mode,
        allow_tutor=bool(lab.allow_tutor),
        version=lab.version,
        published_version=lab.published_version,
        has_unpublished_changes=bool(lab.status == "published" and lab.published_version != lab.version),
        spec=lab.spec_json or empty_spec(),
        analysis=lab.analysis_json or {},
        sources=[source_out(s) for s in lab.sources],
        assets=[asset_out(a) for a in lab.assets],
    )


def shared_lab_out(db: Session, lab: Lab) -> SharedLabOut:
    snap = lab.published_spec_json or {}
    source_ids = snap.get("source_ids", [])
    asset_ids = set(snap.get("asset_ids", []))
    sources = [s for s in lab.sources if s.id in source_ids]
    return SharedLabOut(
        id=lab.id,
        share_code=lab.share_code,
        space=lab.space,
        title=snap.get("title", lab.title),
        subject=lab.subject,
        grade=lab.grade,
        topic=lab.topic,
        language=lab.language,
        level=lab.level,
        allow_tutor=bool(lab.allow_tutor),
        owner=_owner(db, lab),
        published_at=lab.published_at,
        cover_url=_cover_url(db, lab, lab.share_code),
        is_demo=bool(lab.is_demo),
        spec=snap.get("spec", {}),
        sources=[source_out(s, lab.share_code) for s in sources],
        assets=[asset_out(a, lab.share_code) for a in lab.assets if a.id in asset_ids],
    )


# ----------------------------------------------------------------------------- mutations
def create_lab(db: Session, actor: Actor, body: LabCreate) -> Lab:
    lab = Lab(
        owner_id=actor.user.id,
        space=body.space,
        title=body.title,
        subject=body.subject,
        grade=body.grade,
        topic=body.topic,
        language=body.language,
        goal=body.goal,
        level=body.level,
        ai_mode=body.ai_mode or get_settings().default_ai_mode,
        spec_json=empty_spec(),
        analysis_json=LabAnalysis().model_dump(mode="json"),
    )
    db.add(lab)
    db.commit()
    db.refresh(lab)
    return lab


def validate_spec(data: dict[str, Any]) -> dict[str, Any]:
    try:
        return LabSpec.model_validate(data).model_dump(mode="json")
    except ValidationError as exc:
        fields = {".".join(str(p) for p in e["loc"]): e["msg"] for e in exc.errors()[:20]}
        raise AppError("invalid_spec", 422, "The lab content is not valid", fields=fields) from exc


def validate_analysis(data: dict[str, Any]) -> dict[str, Any]:
    try:
        return LabAnalysis.model_validate(data).model_dump(mode="json")
    except ValidationError as exc:
        fields = {".".join(str(p) for p in e["loc"]): e["msg"] for e in exc.errors()[:20]}
        raise AppError("invalid_analysis", 422, "The analysis content is not valid", fields=fields) from exc


def bump_version(db: Session, lab: Lab, expected_version: int, values: dict[str, Any]) -> Lab:
    """Conditional update (optimistic concurrency): fails with 409 if someone saved first."""
    values = {**values, "version": expected_version + 1, "updated_at": utcnow()}
    result = db.execute(
        update(Lab).where(Lab.id == lab.id, Lab.version == expected_version).values(**values)
    )
    if result.rowcount != 1:
        db.rollback()
        raise AppError(
            "version_conflict",
            409,
            "This lab was changed elsewhere. Reload to get the latest version.",
            extra={"current_version": db.scalar(select(Lab.version).where(Lab.id == lab.id))},
        )
    db.commit()
    db.refresh(lab)
    return lab


def maybe_snapshot(db: Session, lab: Lab, actor: Actor | None, note: str | None = None, force: bool = False) -> None:
    last = db.scalar(
        select(LabVersion).where(LabVersion.lab_id == lab.id).order_by(LabVersion.version.desc()).limit(1)
    )
    if not force and not note and last is not None:
        created = last.created_at if last.created_at.tzinfo else last.created_at.replace(tzinfo=utcnow().tzinfo)
        if utcnow() - created < timedelta(minutes=AUTOSNAPSHOT_MINUTES):
            return
    if last is not None and last.version == lab.version:
        if note:
            last.note = note[:200]
            db.commit()
        return
    db.add(
        LabVersion(
            lab_id=lab.id,
            version=lab.version,
            spec_json=copy.deepcopy(lab.spec_json or {}),
            analysis_json=copy.deepcopy(lab.analysis_json or {}),
            note=(note or "")[:200] or None,
            created_by=actor.user_id if actor else None,
        )
    )
    db.commit()


def apply_update(db: Session, lab: Lab, body: LabUpdate, actor: Actor) -> Lab:
    data = body.model_dump(exclude_unset=True)
    expected = data.pop("version")
    note = data.pop("note", None)
    values: dict[str, Any] = {}
    for field in ("title", "subject", "grade", "topic", "language", "goal", "level", "ai_mode", "allow_tutor", "visibility"):
        if field in data and (data[field] is not None or field == "topic"):
            values[field] = data[field]
    if data.get("spec") is not None:
        values["spec_json"] = validate_spec(data["spec"])
    if data.get("analysis") is not None:
        values["analysis_json"] = validate_analysis(data["analysis"])
    if not values and not note:
        return lab
    lab = bump_version(db, lab, expected, values)
    maybe_snapshot(db, lab, actor, note=note, force=bool(note))
    return lab


def next_share_code(db: Session, length: int = 6) -> str:
    for _ in range(50):
        code = "".join(secrets.choice(SHARE_ALPHABET) for _ in range(length))
        if db.scalar(select(func.count()).select_from(Lab).where(Lab.share_code == code)) == 0:
            return code
    raise AppError("share_code_exhausted", 500, "Could not allocate a share code")


def public_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """Copy of a spec that is safe to show learners (spec §8.3, §8.5, §9.5)."""
    from .widgets import shareable_widget  # local import: widgets → analysis → labs

    out = copy.deepcopy(spec or {})
    blocks = []
    for block in out.get("blocks") or []:
        kind = block.get("type")
        if kind == "quiz":
            block["questions"] = [q for q in block.get("questions") or [] if q.get("approved")]
            if not block["questions"]:
                continue
        elif kind == "widget":
            if not shareable_widget(block):  # approved, validated and passing the server's checks
                continue
        elif kind == "video":
            block["markers"] = [m for m in block.get("markers") or [] if m.get("confirmed") or not m.get("ai_suggested")]
        blocks.append(block)
    out["blocks"] = blocks
    return out


def referenced_ids(spec: dict[str, Any]) -> tuple[set[str], set[str]]:
    """Collect source and asset ids referenced anywhere in a spec."""
    sources: set[str] = set()
    assets: set[str] = set()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if key == "source_id" and isinstance(value, str):
                    sources.add(value)
                elif key in ("asset_id", "object_asset_id") and isinstance(value, str):
                    assets.add(value)
                else:
                    walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(spec)
    return sources, assets


def consent_problems(lab: Lab) -> list[Source]:
    return [s for s in lab.sources if s.contains_people and not s.consent_confirmed]


def publish(db: Session, lab: Lab, actor: Actor, visibility: str, allow_tutor: bool) -> Lab:
    spec = public_spec(lab.spec_json or {})
    if not spec.get("blocks"):
        raise AppError("nothing_to_publish", 422, "Add at least one reviewed interactive block before publishing")
    problems = consent_problems(lab)
    if problems:
        raise AppError(
            "consent_required",
            422,
            "Confirm consent for media that shows students before sharing",
            extra={"source_ids": [s.id for s in problems]},
        )
    ref_sources, ref_assets = referenced_ids(spec)
    lab_source_ids = {s.id for s in lab.sources if s.status == "ready"}
    # Learners can open every ready source of the lab (spec §11: "mở lại phần tài liệu").
    source_ids = sorted(lab_source_ids | (ref_sources & lab_source_ids))
    lab_asset_ids = {a.id for a in lab.assets}
    asset_ids = sorted((ref_assets & lab_asset_ids) | ({lab.cover_asset_id} & lab_asset_ids))
    now = utcnow()
    lab.published_spec_json = {"spec": spec, "title": lab.title, "source_ids": source_ids, "asset_ids": asset_ids}
    lab.published_version = lab.version
    lab.published_at = now
    lab.first_published_at = lab.first_published_at or now
    lab.status = "published"
    lab.visibility = visibility
    lab.allow_tutor = allow_tutor
    if not lab.share_code:
        lab.share_code = next_share_code(db)
    db.commit()
    db.refresh(lab)
    maybe_snapshot(db, lab, actor, note="Published", force=True)
    return lab


def unpublish(db: Session, lab: Lab) -> Lab:
    lab.status = "draft"
    lab.published_spec_json = None
    lab.published_version = None
    lab.published_at = None
    db.commit()
    db.refresh(lab)
    return lab


def delete_lab(db: Session, lab: Lab) -> None:
    lab_id = lab.id
    db.delete(lab)
    db.commit()
    storage.delete_lab_files(lab_id)


def duplicate_lab(db: Session, lab: Lab, actor: Actor, from_published: bool = False) -> Lab:
    """Copy a lab (with sources and assets) as a new private draft owned by ``actor``.

    ``from_published=True`` (cloning someone else's shared lab) copies only the published
    snapshot and its sources/assets — never the author's drafts or AI analysis, and never media
    showing students (with the frames and cut-outs taken from it): consent covers the author's
    class, and a copy in another account would escape the author's control (spec §16). The
    copy's blocks keep their structure with those references emptied.
    """
    snap = lab.published_spec_json or {}
    if from_published and not snap:
        raise AppError("not_found", 404, "Lab not found")
    allowed_sources = set(snap.get("source_ids", [])) if from_published else None
    allowed_assets = set(snap.get("asset_ids", [])) if from_published else None
    dropped: set[str] = set()
    if from_published:
        people = {s.id for s in lab.sources if s.contains_people}
        dropped = people | {a.id for a in lab.assets if a.source_id in people}
        allowed_sources -= dropped
        allowed_assets -= dropped
    clone = Lab(
        owner_id=actor.user.id,
        space=lab.space,
        title=(lab.title + (" (bản sao)" if lab.language == "vi" else " (copy)"))[:160],
        subject=lab.subject,
        grade=lab.grade,
        topic=lab.topic,
        language=lab.language,
        goal=lab.goal,
        level=lab.level,
        ai_mode=lab.ai_mode,
        allow_tutor=lab.allow_tutor,
        spec_json={},
        analysis_json={},
    )
    db.add(clone)
    db.flush()
    id_map: dict[str, str] = {}
    copied_keys: list[str] = []
    try:
        for src in lab.sources:
            if allowed_sources is not None and src.id not in allowed_sources:
                continue
            new_src = Source(
                lab_id=clone.id,
                kind=src.kind,
                title=src.title,
                filename=src.filename,
                mime=src.mime,
                size_bytes=src.size_bytes,
                status=src.status,
                error_code=src.error_code,
                page_count=src.page_count,
                width=src.width,
                height=src.height,
                duration_ms=src.duration_ms,
                fps=src.fps,
                text_content=src.text_content,
                data_json=copy.deepcopy(src.data_json),
                contains_people=src.contains_people,
                consent_confirmed=False,  # consent is per lab/class; must be re-confirmed
                position=src.position,
                meta_json={},
            )
            if src.storage_key and storage.exists(src.storage_key):
                ext = src.storage_key.rsplit(".", 1)[-1]
                new_src.storage_key = storage.save_bytes(clone.id, storage.read_bytes(src.storage_key), ext)
                copied_keys.append(new_src.storage_key)
            meta = copy.deepcopy(src.meta_json or {})
            for key_name in [k for k in meta if k.endswith("_key")]:
                old_key = meta[key_name]
                if isinstance(old_key, str) and storage.exists(old_key):
                    ext = old_key.rsplit(".", 1)[-1]
                    meta[key_name] = storage.save_bytes(clone.id, storage.read_bytes(old_key), ext)
                    copied_keys.append(meta[key_name])
                else:
                    meta.pop(key_name, None)
            new_src.meta_json = meta
            db.add(new_src)
            db.flush()
            id_map[src.id] = new_src.id
        for asset in lab.assets:
            if allowed_assets is not None and asset.id not in allowed_assets:
                continue
            if not storage.exists(asset.storage_key):
                continue
            ext = asset.storage_key.rsplit(".", 1)[-1]
            new_asset = Asset(
                lab_id=clone.id,
                source_id=id_map.get(asset.source_id) if asset.source_id else None,
                kind=asset.kind,
                storage_key=storage.save_bytes(clone.id, storage.read_bytes(asset.storage_key), ext),
                mime=asset.mime,
                width=asset.width,
                height=asset.height,
                ai_generated=asset.ai_generated,
                meta_json=copy.deepcopy(asset.meta_json or {}),
            )
            copied_keys.append(new_asset.storage_key)
            db.add(new_asset)
            db.flush()
            id_map[asset.id] = new_asset.id
        if from_published:
            clone.spec_json = _remap_ids(_drop_refs(snap.get("spec") or {}, dropped), id_map)
            clone.analysis_json = LabAnalysis().model_dump(mode="json")
        else:
            clone.spec_json = _remap_ids(lab.spec_json or {}, id_map)
            clone.analysis_json = _remap_ids(lab.analysis_json or {}, id_map)
        if lab.cover_asset_id:
            clone.cover_asset_id = id_map.get(lab.cover_asset_id)
        db.commit()
    except Exception:
        db.rollback()
        for key in copied_keys:
            storage.delete_key(key)
        raise
    db.refresh(clone)
    return clone


REF_KEYS = ("source_id", "asset_id", "object_asset_id")


def _drop_refs(node: Any, ids: set[str]) -> Any:
    """Copy of ``node`` where references to ``ids`` are emptied (keys set to None, list items removed)."""
    if not ids:
        return node
    if isinstance(node, dict):
        return {k: (None if k in REF_KEYS and isinstance(v, str) and v in ids else _drop_refs(v, ids)) for k, v in node.items()}
    if isinstance(node, list):
        return [_drop_refs(item, ids) for item in node if not (isinstance(item, str) and item in ids)]
    return node


def _remap_ids(node: Any, id_map: dict[str, str]) -> Any:
    if isinstance(node, dict):
        return {
            k: (id_map.get(v, v) if k in ("source_id", "asset_id", "object_asset_id") and isinstance(v, str) else _remap_ids(v, id_map))
            for k, v in node.items()
        }
    if isinstance(node, list):
        return [_remap_ids(item, id_map) for item in node]
    if isinstance(node, str) and node in id_map:
        return id_map[node]
    return node
