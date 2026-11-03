"""ORM models. Schema changes go through Alembic migrations in ``backend/alembic``."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow

ROLES = ("teacher", "student", "researcher", "admin")
SPACES = ("school2lab", "paper2explorer")
LAB_STATUSES = ("draft", "published", "archived")
VISIBILITIES = ("link", "public")
AI_MODES = ("contributor", "standard")
SOURCE_KINDS = ("pdf", "image", "video", "data", "note")
SOURCE_STATUSES = ("ready", "processing", "failed")
ASSET_KINDS = ("cutout", "cover", "frame", "generated", "page")


def new_id() -> str:
    return uuid.uuid4().hex


def _in(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="ck_users_role"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="student")
    locale: Mapped[str] = mapped_column(String(5), default="vi")
    school: Mapped[str | None] = mapped_column(String(160), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow
    )
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)

    labs: Mapped[list[Lab]] = relationship(back_populates="owner", passive_deletes=True)


class UserSession(Base):
    """Server-side session. ``id`` is the SHA-256 of the cookie token (never the token)."""

    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    csrf_token: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    user_agent: Mapped[str | None] = mapped_column(String(200), nullable=True)

    user: Mapped[User] = relationship()


class Lab(Base):
    __tablename__ = "labs"
    __table_args__ = (
        CheckConstraint(_in("space", SPACES), name="ck_labs_space"),
        CheckConstraint(_in("status", LAB_STATUSES), name="ck_labs_status"),
        CheckConstraint(_in("visibility", VISIBILITIES), name="ck_labs_visibility"),
        CheckConstraint(_in("ai_mode", AI_MODES), name="ck_labs_ai_mode"),
        CheckConstraint("version >= 1", name="ck_labs_version"),
        Index("ix_labs_owner_updated", "owner_id", "updated_at"),
        Index("ix_labs_status_visibility", "status", "visibility"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id", ondelete="CASCADE"))
    space: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(160))
    subject: Mapped[str] = mapped_column(String(30))
    grade: Mapped[str] = mapped_column(String(12))
    topic: Mapped[str | None] = mapped_column(String(200), nullable=True)
    language: Mapped[str] = mapped_column(String(5), default="vi")
    goal: Mapped[str] = mapped_column(String(30), default="understand_process")
    level: Mapped[str] = mapped_column(String(10), default="simple")
    ai_mode: Mapped[str] = mapped_column(String(12), default="contributor")
    status: Mapped[str] = mapped_column(String(12), default="draft")
    visibility: Mapped[str] = mapped_column(String(12), default="link")
    share_code: Mapped[str | None] = mapped_column(String(8), unique=True, nullable=True)
    allow_tutor: Mapped[bool] = mapped_column(Boolean, default=True)
    spec_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    published_spec_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    published_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    first_published_at: Mapped[datetime | None] = mapped_column(
        UTCDateTime(), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1)
    cover_asset_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow
    )

    owner: Mapped[User] = relationship(back_populates="labs")
    sources: Mapped[list[Source]] = relationship(
        back_populates="lab",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Source.position",
    )
    assets: Mapped[list[Asset]] = relationship(
        back_populates="lab", cascade="all, delete-orphan", passive_deletes=True
    )


class Source(Base):
    __tablename__ = "sources"
    __table_args__ = (
        CheckConstraint(_in("kind", SOURCE_KINDS), name="ck_sources_kind"),
        CheckConstraint(_in("status", SOURCE_STATUSES), name="ck_sources_status"),
        Index("ix_sources_lab_position", "lab_id", "position"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(String(32), ForeignKey("labs.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))
    title: Mapped[str] = mapped_column(String(200))
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default="ready")
    error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fps: Mapped[float | None] = mapped_column(Float, nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_json: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    contains_people: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    lab: Mapped[Lab] = relationship(back_populates="sources")


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (CheckConstraint(_in("kind", ASSET_KINDS), name="ck_assets_kind"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("labs.id", ondelete="CASCADE"), index=True
    )
    source_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("sources.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(20))
    storage_key: Mapped[str] = mapped_column(String(255))
    mime: Mapped[str] = mapped_column(String(100))
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    lab: Mapped[Lab] = relationship(back_populates="assets")


class LabVersion(Base):
    __tablename__ = "lab_versions"
    __table_args__ = (UniqueConstraint("lab_id", "version", name="uq_lab_versions_lab_version"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("labs.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    spec_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    analysis_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_by: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_chat_role"),
        CheckConstraint("channel IN ('studio', 'share')", name="ck_chat_channel"),
        Index("ix_chat_lab_user", "lab_id", "user_id", "created_at"),
        Index("ix_chat_lab_viewer", "lab_id", "viewer_key", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(String(32), ForeignKey("labs.id", ondelete="CASCADE"))
    user_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    viewer_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    channel: Mapped[str] = mapped_column(String(10), default="studio")
    role: Mapped[str] = mapped_column(String(10))
    content: Mapped[str] = mapped_column(Text)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    citations_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    __table_args__ = (
        CheckConstraint("phase IN ('practice', 'pre', 'post')", name="ck_quiz_phase"),
        CheckConstraint("score >= 0 AND total >= 0 AND score <= total", name="ck_quiz_score"),
        Index("ix_quiz_lab_created", "lab_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(String(32), ForeignKey("labs.id", ondelete="CASCADE"))
    block_id: Mapped[str] = mapped_column(String(40))
    user_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    viewer_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    phase: Mapped[str] = mapped_column(String(10), default="practice")
    answers_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    score: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_feedback_rating"),
        Index("ix_feedback_lab_created", "lab_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    lab_id: Mapped[str] = mapped_column(String(32), ForeignKey("labs.id", ondelete="CASCADE"))
    user_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    viewer_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AICall(Base):
    """Metadata of every Meta Model API call (no prompt or response content)."""

    __tablename__ = "ai_calls"
    __table_args__ = (
        Index("ix_ai_calls_created", "created_at"),
        Index("ix_ai_calls_feature", "feature", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    lab_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("labs.id", ondelete="SET NULL"), nullable=True
    )
    feature: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(12))
    error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_created", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    actor_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
