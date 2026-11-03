"""Authentication, sessions, CSRF protection, permissions and rate limiting.

* Passwords: argon2id via ``argon2-cffi`` (never hand-rolled).
* Sessions: random 256-bit token in an HttpOnly cookie; only its SHA-256 is stored.
* CSRF: per-session token returned by ``/api/auth/me`` and required in the
  ``X-CSRF-Token`` header on every unsafe request that carries a session cookie
  (enforced globally by :class:`CSRFMiddleware`), plus an Origin allow-list check.
* Rate limits: in-process sliding windows (single-instance deployment; see README).
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import threading
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import get_settings
from .db import SessionLocal, get_db, utcnow
from .errors import AppError, error_body
from .models import User, UserSession

SESSION_COOKIE = "cl_session"
VIEWER_COOKIE = "cl_viewer"
CSRF_HEADER = "x-csrf-token"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/register"}

_hasher = PasswordHasher()


# --------------------------------------------------------------------------- passwords
def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


# --------------------------------------------------------------------------- sessions
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def create_session(db: Session, user: User, request: Request, response: Response) -> UserSession:
    settings = get_settings()
    token = secrets.token_urlsafe(32)
    row = UserSession(
        id=_hash_token(token),
        user_id=user.id,
        csrf_token=secrets.token_urlsafe(32),
        expires_at=utcnow() + timedelta(hours=settings.session_ttl_hours),
        user_agent=(request.headers.get("user-agent") or "")[:200],
    )
    db.add(row)
    user.last_login_at = utcnow()
    db.commit()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return row


def destroy_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = db.get(UserSession, _hash_token(token))
        if row:
            db.delete(row)
            db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


def revoke_user_sessions(db: Session, user_id: str) -> None:
    for row in db.scalars(select(UserSession).where(UserSession.user_id == user_id)):
        db.delete(row)


def lookup_session(db: Session, token: str | None) -> UserSession | None:
    if not token:
        return None
    row = db.get(UserSession, _hash_token(token))
    if row is None:
        return None
    if _aware(row.expires_at) <= utcnow():
        db.delete(row)
        db.commit()
        return None
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        return None
    if (utcnow() - _aware(row.last_seen_at)) > timedelta(minutes=10):
        row.last_seen_at = utcnow()
        db.commit()
    return row


@dataclass
class Actor:
    """The verified caller. ``user`` is None for anonymous visitors."""

    user: User | None
    session: UserSession | None
    viewer_key: str | None
    ip: str

    @property
    def is_admin(self) -> bool:
        return bool(self.user and self.user.role == "admin")

    @property
    def user_id(self) -> str | None:
        return self.user.id if self.user else None

    @property
    def rate_key(self) -> str:
        if self.user:
            return f"u:{self.user.id}"
        return f"v:{self.viewer_key or '-'}|ip:{self.ip}"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def get_actor(request: Request, db: Session = Depends(get_db)) -> Actor:
    row = lookup_session(db, request.cookies.get(SESSION_COOKIE))
    user = db.get(User, row.user_id) if row else None
    viewer = request.cookies.get(VIEWER_COOKIE)
    if viewer and (len(viewer) > 64 or not viewer.replace("-", "").replace("_", "").isalnum()):
        viewer = None
    return Actor(user=user, session=row, viewer_key=viewer, ip=client_ip(request))


def require_user(actor: Actor = Depends(get_actor)) -> Actor:
    if actor.user is None:
        raise AppError("unauthorized", 401, "Please sign in")
    return actor


def require_roles(*roles: str):
    def _dep(actor: Actor = Depends(require_user)) -> Actor:
        if actor.user.role not in roles and actor.user.role != "admin":
            raise AppError("forbidden", 403, "Your role cannot perform this action")
        return actor

    return _dep


def require_admin(actor: Actor = Depends(require_user)) -> Actor:
    if actor.user.role != "admin":
        raise AppError("forbidden", 403, "Administrator permission required")
    return actor


def ensure_viewer_cookie(request: Request, response: Response) -> str:
    """Anonymous, non-identifying key used only to group a visitor's quiz/chat and rate limit."""
    key = request.cookies.get(VIEWER_COOKIE)
    if key and len(key) <= 64 and key.replace("-", "").replace("_", "").isalnum():
        return key
    key = secrets.token_urlsafe(18)
    response.set_cookie(
        VIEWER_COOKIE,
        key,
        max_age=180 * 24 * 3600,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        path="/",
    )
    return key


# --------------------------------------------------------------------------- CSRF middleware
def _origin_allowed(origin: str, host: str | None) -> bool:
    settings = get_settings()
    allowed = {o.rstrip("/") for o in settings.allowed_origins}
    allowed.add(settings.public_base_url.rstrip("/"))
    if host:
        allowed.add(f"http://{host}")
        allowed.add(f"https://{host}")
    return origin.rstrip("/") in allowed


class CSRFMiddleware:
    """Global guard for unsafe ``/api`` requests (pure ASGI so streaming is unaffected)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        if not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        origin = headers.get("origin")
        # Opaque origins (for example sandboxed documents) serialize as "null".
        # They cannot be attributed to an allowed site and must not bypass the
        # check, including on login/register which do not have a CSRF token yet.
        if origin and not _origin_allowed(origin, headers.get("host")):
            await _reject(send, "csrf_origin", "Request origin is not allowed")
            return
        if path in CSRF_EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        token = _cookie(headers.get("cookie", ""), SESSION_COOKIE)
        if token:
            db = SessionLocal()
            try:
                row = lookup_session(db, token)
                expected = row.csrf_token if row else None
            finally:
                db.close()
            if expected is not None:
                sent = headers.get(CSRF_HEADER, "")
                if not sent or not secrets.compare_digest(sent, expected):
                    await _reject(send, "csrf_failed", "Missing or invalid CSRF token")
                    return
        await self.app(scope, receive, send)


# --------------------------------------------------------------------------- request body limits
MB = 1024 * 1024
FORM_OVERHEAD = MB  # multipart boundaries and the small text fields next to the file
JSON_BODY_LIMIT = 8 * MB  # the largest real lab spec is ~40 KB; the schema allows a few MB
PUBLIC_BODY_LIMIT = 256 * 1024  # share and auth routes: quiz answers, feedback, tutor questions
_SOURCE_UPLOAD = re.compile(r"^/api/labs/[^/]+/sources$")
_ASSET_UPLOAD = re.compile(r"^/api/labs/[^/]+/assets$")
_FRAME_UPLOAD = re.compile(r"^/api/labs/[^/]+/ai/segment-frame$")


def body_limit(path: str) -> tuple[int, bool]:
    """(maximum request body in bytes, is a file upload) for an unsafe ``/api`` request."""
    settings = get_settings()
    if _SOURCE_UPLOAD.match(path):
        largest = max(settings.max_upload_mb_pdf, settings.max_upload_mb_image, settings.max_upload_mb_video)
        return largest * MB + FORM_OVERHEAD, True
    if _ASSET_UPLOAD.match(path):
        from .services.sources import MAX_ASSET_BYTES  # local import: services import this module

        return MAX_ASSET_BYTES + FORM_OVERHEAD, True
    if _FRAME_UPLOAD.match(path):
        return settings.max_upload_mb_image * MB + FORM_OVERHEAD, True
    if path == "/api/ai/transcribe":
        return settings.max_upload_mb_audio * MB + FORM_OVERHEAD, True
    if path.startswith(("/api/share/", "/api/auth/")):
        return PUBLIC_BODY_LIMIT, False
    return JSON_BODY_LIMIT, False


def body_too_large(limit: int, upload: bool) -> AppError:
    if upload:
        max_mb = max(1, (limit - FORM_OVERHEAD) // MB)
        return AppError("file_too_large", 413, "File is larger than allowed", extra={"max_mb": max_mb})
    return AppError("payload_too_large", 413, "The request is too large")


class BodySizeLimitMiddleware:
    """Refuse oversized request bodies before they are buffered (pure ASGI; streaming unaffected).

    FastAPI reads a JSON body fully into memory and spools multipart bodies to disk *before*
    the endpoint (and its permission checks) runs — so without this, one anonymous request
    could make the server hold hundreds of megabytes. A declared ``Content-Length`` above the
    route's limit is refused at once; chunked bodies are counted while they are read.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        if scope["type"] != "http" or scope["method"] not in UNSAFE_METHODS or not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return
        limit, upload = body_limit(path)
        declared = next((v for k, v in scope["headers"] if k.lower() == b"content-length"), b"")
        if declared.isdigit() and int(declared) > limit:
            err = body_too_large(limit, upload)
            await _json_error(send, err.status, err.code, err.message, err.extra)
            return
        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # Re-raised by FastAPI's body parsing and answered by the app's error handler.
                    raise StarletteHTTPException(413, "The request is too large")
            return message

        await self.app(scope, limited_receive, send)


def _cookie(header: str, name: str) -> str | None:
    for part in header.split(";"):
        key, _, value = part.strip().partition("=")
        if key == name:
            return value
    return None


async def _reject(send: Send, code: str, message: str) -> None:
    await _json_error(send, 403, code, message)


async def _json_error(send: Send, status: int, code: str, message: str, extra: dict | None = None) -> None:
    body = json.dumps(error_body(code, message, extra=extra)).encode()
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})


# --------------------------------------------------------------------------- rate limiting
Bucket = tuple[str, str, int, int]  # (bucket, key, limit, window_seconds)


class RateLimiter:
    # Keys are often visitor-chosen (the viewer cookie): entries are only created when a request
    # is counted, and idle ones are swept, so memory stays bounded by the per-IP ceilings.
    SWEEP_EVERY = 2000

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._windows: dict[str, int] = {}
        self._lock = threading.Lock()
        self._since_sweep = 0

    def _full(self, now: float, bucket: str, key: str, limit: int, window_seconds: int) -> int | None:
        """Seconds until a slot frees up when the bucket is full, else None (caller holds the lock)."""
        hits = self._hits.get(f"{bucket}:{key}")
        if not hits:
            return None if limit > 0 else window_seconds
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return int(window_seconds - (now - hits[0])) + 1 if hits else window_seconds
        return None

    def _sweep(self, now: float) -> None:
        self._since_sweep = 0
        stale = [n for n, hits in self._hits.items() if not hits or now - hits[-1] > self._windows.get(n, 3600)]
        for name in stale:
            self._hits.pop(name, None)
            self._windows.pop(name, None)

    def size(self) -> int:
        with self._lock:
            return len(self._hits)

    @staticmethod
    def _limited(retry: int) -> AppError:
        return AppError("rate_limited", 429, "Too many requests, please wait", extra={"retry_after": retry})

    def hit(self, bucket: str, key: str, limit: int, window_seconds: int) -> None:
        self.hit_all([(bucket, key, limit, window_seconds)])

    def hit_all(self, buckets: list[Bucket]) -> None:
        """Count one request in every bucket, or in none of them when any bucket is full."""
        now = time.monotonic()
        with self._lock:
            waits = [w for b in buckets if (w := self._full(now, *b)) is not None]
            if waits:
                raise self._limited(max(waits))
            for bucket, key, _limit, window in buckets:
                name = f"{bucket}:{key}"
                self._hits.setdefault(name, deque()).append(now)
                self._windows[name] = max(window, self._windows.get(name, 0))
            self._since_sweep += 1
            if self._since_sweep >= self.SWEEP_EVERY:
                self._sweep(now)

    def refund(self, buckets: list[Bucket]) -> None:
        """Forget one counted request per bucket (e.g. a sign-in that turned out to be right).
        Counting first and refunding later keeps the budget exact under parallel requests."""
        with self._lock:
            for bucket, key, _limit, _window in buckets:
                hits = self._hits.get(f"{bucket}:{key}")
                if hits:
                    hits.pop()

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._windows.clear()
            self._since_sweep = 0


rate_limiter = RateLimiter()


def ai_rate_limit(actor: Actor) -> None:
    settings = get_settings()
    if actor.user:
        rate_limiter.hit("ai", actor.rate_key, settings.user_ai_requests_per_hour, 3600)
        return
    # The anonymous key includes the viewer cookie, which the visitor controls: rotating it
    # would give a fresh budget every request. A per-IP ceiling bounds the total cost.
    rate_limiter.hit_all(
        [
            ("ai", actor.rate_key, settings.anon_ai_requests_per_hour, 3600),
            ("ai-ip", actor.ip, settings.anon_ai_requests_per_ip_hour, 3600),
        ]
    )
