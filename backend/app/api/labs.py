"""Lab CRUD, versions, validation and publishing (owner/admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..errors import AppError
from ..models import Lab, LabVersion, User
from ..schemas.api import (
    LabCreate,
    LabList,
    LabOut,
    LabUpdate,
    PublishIn,
    PublishOut,
    ValidationReport,
    VersionOut,
)
from ..security import Actor, rate_limiter, require_user
from ..services import labs as svc
from ..services.validation import validate_lab

router = APIRouter(prefix="/api/labs", tags=["labs"])


@router.get("", response_model=LabList)
def list_labs(
    status: str | None = Query(default=None, pattern="^(draft|published|archived)$"),
    space: str | None = Query(default=None, pattern="^(school2lab|paper2explorer)$"),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=24, ge=1, le=100),
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> LabList:
    query = select(Lab).where(Lab.owner_id == actor.user.id)
    if status:
        query = query.where(Lab.status == status)
    if space:
        query = query.where(Lab.space == space)
    if q:
        like = f"%{q.strip()}%"
        query = query.where(or_(Lab.title.ilike(like), Lab.topic.ilike(like)))
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(Lab.updated_at.desc(), Lab.id.desc()).offset((page - 1) * page_size).limit(page_size))
    return LabList(items=[svc.lab_summary(db, lab) for lab in rows], total=total or 0, page=page, page_size=page_size)


@router.post("", response_model=LabOut, status_code=201)
def create_lab(body: LabCreate, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    count = db.scalar(select(func.count()).select_from(Lab).where(Lab.owner_id == actor.user.id))
    if count >= 500:
        raise AppError("quota_exceeded", 409, "You have reached the maximum number of labs")
    lab = svc.create_lab(db, actor, body)
    return svc.lab_out(db, lab)


@router.get("/{lab_id}", response_model=LabOut)
def get_lab(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    return svc.lab_out(db, svc.get_lab_for_owner(db, lab_id, actor))


@router.patch("/{lab_id}", response_model=LabOut)
def update_lab(lab_id: str, body: LabUpdate, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    lab = svc.apply_update(db, lab, body, actor)
    return svc.lab_out(db, lab)


@router.delete("/{lab_id}", status_code=204)
def delete_lab(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> Response:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    svc.delete_lab(db, lab)
    return Response(status_code=204)


@router.post("/{lab_id}/duplicate", response_model=LabOut, status_code=201)
def duplicate_lab(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    return svc.lab_out(db, svc.duplicate_lab(db, lab, actor))


@router.get("/{lab_id}/versions", response_model=list[VersionOut])
def list_versions(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> list[VersionOut]:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    rows = db.execute(
        select(LabVersion, User.name)
        .outerjoin(User, User.id == LabVersion.created_by)
        .where(LabVersion.lab_id == lab.id)
        .order_by(LabVersion.version.desc())
        .limit(100)
    ).all()
    return [VersionOut(version=v.version, note=v.note, created_at=v.created_at, created_by_name=name) for v, name in rows]


@router.post("/{lab_id}/versions/{version}/restore", response_model=LabOut)
def restore_version(
    lab_id: str, version: int, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> LabOut:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    snap = db.scalar(select(LabVersion).where(LabVersion.lab_id == lab.id, LabVersion.version == version))
    if snap is None:
        raise AppError("not_found", 404, "Version not found")
    lab = svc.bump_version(
        db, lab, lab.version, {"spec_json": snap.spec_json or {}, "analysis_json": snap.analysis_json or {}}
    )
    svc.maybe_snapshot(db, lab, actor, note=f"Restored from v{version}", force=True)
    return svc.lab_out(db, lab)


# Validation samples every graph/simulation of the lab (seconds of CPU for a lab with dozens of
# large formulas): a per-user budget keeps one account from occupying the worker threads.
VALIDATIONS_PER_15MIN = 60


@router.post("/{lab_id}/validate", response_model=ValidationReport)
def validate(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> ValidationReport:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    rate_limiter.hit("validate", actor.rate_key, VALIDATIONS_PER_15MIN, 900)
    return validate_lab(db, lab)


@router.post("/{lab_id}/publish", response_model=PublishOut)
def publish(lab_id: str, body: PublishIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> PublishOut:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    rate_limiter.hit("validate", actor.rate_key, VALIDATIONS_PER_15MIN, 900)
    report = validate_lab(db, lab)
    if not report.ok:
        raise AppError(
            "validation_failed",
            422,
            "Fix the failed checks before publishing",
            extra={"report": report.model_dump(mode="json")},
        )
    lab = svc.publish(db, lab, actor, body.visibility, body.allow_tutor)
    base = get_settings().public_base_url.rstrip("/")
    return PublishOut(share_code=lab.share_code, share_url=f"{base}/s/{lab.share_code}", lab=svc.lab_out(db, lab), report=report)


@router.post("/{lab_id}/unpublish", response_model=LabOut)
def unpublish(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    lab = svc.get_lab_for_owner(db, lab_id, actor)
    return svc.lab_out(db, svc.unpublish(db, lab))
