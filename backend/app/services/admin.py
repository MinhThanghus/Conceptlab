"""Administration: platform statistics, user management, lab moderation, AI call log
and learner feedback (docs/API.md §Admin). Every figure is computed from real rows.

Pilot metrics (spec §17) exclude seeded demo labs and system accounts so they describe
what real teachers did: ``review_confirmed_ratio`` (share of AI-extracted items an author
confirmed) and ``avg_prep_minutes`` (lab created → first published).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, get_args

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .. import storage
from ..db import utcnow
from ..errors import AppError
from ..models import (
    LAB_STATUSES,
    ROLES,
    SPACES,
    AICall,
    AuditEvent,
    Feedback,
    Lab,
    QuizAttempt,
    User,
)
from ..schemas.api import (
    AdminFeedbackList,
    AdminFeedbackOut,
    AdminStatsOut,
    AdminUserList,
    AdminUserOut,
    AdminUserUpdate,
    AICallList,
    AICallOut,
    LabList,
    LabSummary,
    Subject,
)
from ..security import Actor, revoke_user_sessions
from . import labs as labs_svc
from .share import matches

REVIEW_KEYS = ("objects", "formulas", "variables", "steps", "relations")


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _counts(db: Session, column, keys: tuple[str, ...], *where) -> dict[str, int]:
    out = {key: 0 for key in keys}
    for key, count in db.execute(select(column, func.count()).where(*where).group_by(column)):
        out[str(key)] = int(count)
    return out


def _ai_groups(db: Session, column, name: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            column,
            func.count(),
            func.sum(case((AICall.status != "ok", 1), else_=0)),
            func.avg(AICall.latency_ms),
            func.sum(func.coalesce(AICall.input_tokens, 0)),
            func.sum(func.coalesce(AICall.output_tokens, 0)),
        )
        .group_by(column)
        .order_by(func.count().desc(), column)
    )
    return [
        {
            name: key,
            "calls": int(calls),
            "errors": int(errors or 0),
            "avg_latency_ms": int(round(latency or 0)),
            "input_tokens": int(tokens_in or 0),
            "output_tokens": int(tokens_out or 0),
        }
        for key, calls, errors, latency, tokens_in, tokens_out in rows
    ]


def review_confirmed_ratio(db: Session) -> float | None:
    total = confirmed = 0
    rows = db.scalars(select(Lab.analysis_json).where(Lab.is_demo.is_(False)).execution_options(yield_per=200))
    for analysis in rows:
        result = (analysis or {}).get("result") if isinstance(analysis, dict) else None
        if not isinstance(result, dict):
            continue
        for key in REVIEW_KEYS:
            for item in result.get(key) or []:
                if isinstance(item, dict):
                    total += 1
                    confirmed += 1 if item.get("confirmed") else 0
    return round(confirmed / total, 4) if total else None


def avg_prep_minutes(db: Session) -> float | None:
    minutes: list[float] = []
    rows = db.execute(
        select(Lab.created_at, Lab.first_published_at).where(Lab.first_published_at.is_not(None), Lab.is_demo.is_(False))
    )
    for created, published in rows:
        created, published = _aware(created), _aware(published)
        if created and published and published >= created:
            minutes.append((published - created).total_seconds() / 60.0)
    return round(sum(minutes) / len(minutes), 1) if minutes else None


def _quiz_avg(db: Session, phase: str) -> float | None:
    value = db.scalar(
        select(func.avg(QuizAttempt.score * 100.0 / QuizAttempt.total)).where(QuizAttempt.phase == phase, QuizAttempt.total > 0)
    )
    return round(float(value), 1) if value is not None else None


def stats(db: Session) -> AdminStatsOut:
    now = utcnow()
    ai_total = db.scalar(select(func.count()).select_from(AICall)) or 0
    ai_ok = db.scalar(select(func.count()).select_from(AICall).where(AICall.status == "ok")) or 0
    ai_week = db.scalar(select(func.count()).select_from(AICall).where(AICall.created_at >= now - timedelta(days=7))) or 0
    feedback_count, feedback_avg = db.execute(select(func.count(Feedback.id), func.avg(Feedback.rating))).one()
    return AdminStatsOut(
        generated_at=now,
        users_by_role=_counts(db, User.role, ROLES, User.is_system.is_(False)),
        labs_by_status=_counts(db, Lab.status, LAB_STATUSES),
        labs_by_space=_counts(db, Lab.space, SPACES),
        labs_by_subject=_counts(db, Lab.subject, get_args(Subject)),
        ai_calls_total=ai_total,
        ai_calls_last_7d=ai_week,
        ai_success_rate=round(ai_ok / ai_total, 4) if ai_total else None,
        ai_by_feature=_ai_groups(db, AICall.feature, "feature"),
        ai_by_model=_ai_groups(db, AICall.model, "model"),
        review_confirmed_ratio=review_confirmed_ratio(db),
        avg_prep_minutes=avg_prep_minutes(db),
        feedback_avg=round(float(feedback_avg), 2) if feedback_avg is not None else None,
        feedback_count=int(feedback_count or 0),
        quiz_pre_avg_pct=_quiz_avg(db, "pre"),
        quiz_post_avg_pct=_quiz_avg(db, "post"),
        storage_bytes=storage.disk_usage_bytes(),
    )


# ============================================================================ users
def _lab_counts(db: Session, user_ids: list[str]) -> dict[str, int]:
    if not user_ids:
        return {}
    rows = db.execute(select(Lab.owner_id, func.count()).where(Lab.owner_id.in_(user_ids)).group_by(Lab.owner_id))
    return {owner: int(count) for owner, count in rows}


def user_out(user: User, lab_count: int = 0) -> AdminUserOut:
    out = AdminUserOut.model_validate(user)
    out.lab_count = lab_count
    return out


def list_users(db: Session, *, q: str | None, role: str | None, page: int, page_size: int) -> AdminUserList:
    query = select(User).where(User.is_system.is_(False))
    if role:
        query = query.where(User.role == role)
    order = (User.created_at.desc(), User.id.desc())
    offset = (page - 1) * page_size
    if q and q.strip():
        rows = db.execute(query.with_only_columns(User.id, User.email, User.name).order_by(*order)).all()
        ids = [r.id for r in rows if matches(q, r.email, r.name)]
        total, page_ids = len(ids), ids[offset : offset + page_size]
    else:
        total = db.scalar(select(func.count()).select_from(query.with_only_columns(User.id).subquery())) or 0
        page_ids = list(db.scalars(query.with_only_columns(User.id).order_by(*order).offset(offset).limit(page_size)))
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(page_ids)))} if page_ids else {}
    counts = _lab_counts(db, page_ids)
    items = [user_out(users[i], counts.get(i, 0)) for i in page_ids if i in users]
    return AdminUserList(items=items, total=total, page=page, page_size=page_size)


def _active_admins(db: Session, exclude: str | None = None) -> int:
    query = select(func.count()).select_from(User).where(
        User.role == "admin", User.is_active.is_(True), User.is_system.is_(False)
    )
    if exclude:
        query = query.where(User.id != exclude)
    return db.scalar(query) or 0


def update_user(db: Session, actor: Actor, user_id: str, body: AdminUserUpdate) -> AdminUserOut:
    target = db.get(User, user_id) if user_id and user_id.isalnum() else None
    if target is None or target.is_system:
        raise AppError("not_found", 404, "User not found")
    data = body.model_dump(exclude_unset=True)
    new_role = data.get("role") if data.get("role") is not None else target.role
    new_active = data.get("is_active") if data.get("is_active") is not None else target.is_active
    changes: dict[str, dict[str, Any]] = {}
    if new_role != target.role:
        changes["role"] = {"from": target.role, "to": new_role}
    if new_active != target.is_active:
        changes["is_active"] = {"from": target.is_active, "to": new_active}
    if not changes:
        return user_out(target, _lab_counts(db, [target.id]).get(target.id, 0))
    removes_admin = target.role == "admin" and target.is_active and (new_role != "admin" or not new_active)
    if removes_admin and _active_admins(db, exclude=target.id) == 0:
        raise AppError("last_admin", 409, "At least one active administrator must remain.")
    if target.id == actor.user.id:
        raise AppError(
            "cannot_change_self",
            403,
            "You cannot change your own role or deactivate your own account. Ask another administrator.",
        )
    target.role = new_role
    target.is_active = new_active
    db.flush()
    if _active_admins(db) == 0:  # e.g. two admins demoting each other at the same moment
        db.rollback()
        raise AppError("last_admin", 409, "At least one active administrator must remain.")
    if not new_active:
        revoke_user_sessions(db, target.id)  # signed out everywhere, immediately
    db.add(
        AuditEvent(
            actor_id=actor.user.id,
            action="user_updated",
            target_type="user",
            target_id=target.id,
            meta_json={"changes": changes},
        )
    )
    db.commit()
    db.refresh(target)
    return user_out(target, _lab_counts(db, [target.id]).get(target.id, 0))


# ============================================================================ labs
def list_labs(
    db: Session, *, status: str | None, space: str | None, q: str | None, page: int, page_size: int
) -> LabList:
    query = select(Lab).join(User, User.id == Lab.owner_id)
    if status:
        query = query.where(Lab.status == status)
    if space:
        query = query.where(Lab.space == space)
    order = (Lab.updated_at.desc(), Lab.id.desc())
    offset = (page - 1) * page_size
    if q and q.strip():
        rows = db.execute(query.with_only_columns(Lab.id, Lab.title, Lab.topic, User.name, User.email).order_by(*order)).all()
        ids = [r.id for r in rows if matches(q, r.title, r.topic, r.name, r.email)]
        total, page_ids = len(ids), ids[offset : offset + page_size]
    else:
        total = db.scalar(select(func.count()).select_from(query.with_only_columns(Lab.id).subquery())) or 0
        page_ids = list(db.scalars(query.with_only_columns(Lab.id).order_by(*order).offset(offset).limit(page_size)))
    labs = {lab.id: lab for lab in db.scalars(select(Lab).where(Lab.id.in_(page_ids)))} if page_ids else {}
    items = [labs_svc.lab_summary(db, labs[i]) for i in page_ids if i in labs]
    return LabList(items=items, total=total, page=page, page_size=page_size)


def unpublish_lab(db: Session, actor: Actor, lab_id: str) -> LabSummary:
    lab = db.get(Lab, lab_id) if lab_id and lab_id.isalnum() else None
    if lab is None:
        raise AppError("not_found", 404, "Lab not found")
    if lab.status == "published":
        share_code = lab.share_code
        lab = labs_svc.unpublish(db, lab)
        db.add(
            AuditEvent(
                actor_id=actor.user.id,
                action="lab_unpublished",
                target_type="lab",
                target_id=lab.id,
                meta_json={"title": lab.title, "owner_id": lab.owner_id, "share_code": share_code, "by": "admin"},
            )
        )
        db.commit()
    return labs_svc.lab_summary(db, lab)


# ============================================================================ AI calls & feedback
def list_ai_calls(db: Session, *, feature: str | None, status: str | None, page: int, page_size: int) -> AICallList:
    query = select(AICall)
    if feature:
        query = query.where(AICall.feature == feature)
    if status:
        query = query.where(AICall.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(AICall.created_at.desc(), AICall.id.desc()).offset((page - 1) * page_size).limit(page_size))
    return AICallList(
        items=[AICallOut.model_validate(row, from_attributes=True) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


def list_feedback(db: Session, *, page: int, page_size: int) -> AdminFeedbackList:
    total = db.scalar(select(func.count()).select_from(Feedback)) or 0
    rows = db.execute(
        select(Feedback, Lab.title)
        .join(Lab, Lab.id == Feedback.lab_id)
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [
        AdminFeedbackOut(
            id=f.id, lab_id=f.lab_id, lab_title=title, rating=f.rating, comment=f.comment, created_at=f.created_at
        )
        for f, title in rows
    ]
    return AdminFeedbackList(items=items, total=total, page=page, page_size=page_size)

