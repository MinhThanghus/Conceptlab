"""Administration: stats, users, labs moderation, AI call log, feedback (admins only).

Contract: docs/API.md §Admin. Every route requires an administrator (403 otherwise,
401 for guests). Role changes, deactivations and moderation are written to the audit log.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas.api import (
    AdminFeedbackList,
    AdminStatsOut,
    AdminUserList,
    AdminUserOut,
    AdminUserUpdate,
    AICallList,
    LabList,
    LabStatus,
    LabSummary,
    Role,
    Space,
)
from ..security import Actor, require_admin
from ..services import admin as svc

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
def stats(_admin: Actor = Depends(require_admin), db: Session = Depends(get_db)) -> AdminStatsOut:
    return svc.stats(db)


@router.get("/users", response_model=AdminUserList)
def list_users(
    q: str | None = Query(default=None, max_length=100),
    role: Role | None = Query(default=None),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=25, ge=1, le=100),
    _admin: Actor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminUserList:
    return svc.list_users(db, q=q, role=role, page=page, page_size=page_size)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: str, body: AdminUserUpdate, admin: Actor = Depends(require_admin), db: Session = Depends(get_db)
) -> AdminUserOut:
    return svc.update_user(db, admin, user_id, body)


@router.get("/labs", response_model=LabList)
def list_labs(
    status: LabStatus | None = Query(default=None),
    space: Space | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=25, ge=1, le=100),
    _admin: Actor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LabList:
    return svc.list_labs(db, status=status, space=space, q=q, page=page, page_size=page_size)


@router.post("/labs/{lab_id}/unpublish", response_model=LabSummary)
def unpublish_lab(lab_id: str, admin: Actor = Depends(require_admin), db: Session = Depends(get_db)) -> LabSummary:
    return svc.unpublish_lab(db, admin, lab_id)


@router.get("/ai-calls", response_model=AICallList)
def list_ai_calls(
    feature: str | None = Query(default=None, max_length=40),
    status: str | None = Query(default=None, pattern="^(ok|error)$"),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=50, ge=1, le=100),
    _admin: Actor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AICallList:
    return svc.list_ai_calls(db, feature=feature, status=status, page=page, page_size=page_size)


@router.get("/feedback", response_model=AdminFeedbackList)
def list_feedback(
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=25, ge=1, le=100),
    _admin: Actor = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminFeedbackList:
    return svc.list_feedback(db, page=page, page_size=page_size)
