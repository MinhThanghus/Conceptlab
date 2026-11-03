"""Accounts: register, login/logout, profile, password change and self-service deletion."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import storage
from ..config import get_settings
from ..db import get_db
from ..errors import AppError
from ..models import AuditEvent, Lab, QuizAttempt, User
from ..schemas.api import (
    AIStatusOut,
    DeleteAccountIn,
    LoginIn,
    MeOut,
    PasswordChange,
    ProfileUpdate,
    RegisterIn,
    UserOut,
)
from ..security import (
    SESSION_COOKIE,
    Actor,
    client_ip,
    create_session,
    destroy_session,
    get_actor,
    hash_password,
    needs_rehash,
    rate_limiter,
    require_user,
    revoke_user_sessions,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Equalise timing of unknown-email logins with real password checks.
_DUMMY_HASH = hash_password("conceptlab-timing-equaliser")


def ai_status() -> AIStatusOut:
    s = get_settings()
    return AIStatusOut(
        configured=s.ai_configured,
        default_mode=s.default_ai_mode,
        image_enabled=s.enable_image_generation,
        deep_enabled=s.enable_deep_analysis,
        models={
            "contributor": s.muse_model_contributor,
            "standard": s.muse_model_standard,
            "deep": s.muse_model_deep,
            "segmentation": s.sam_model,
            "image": s.image_model,
            "speech": s.asr_model,
        },
    )


def me_payload(user: User | None, csrf: str | None) -> MeOut:
    return MeOut(user=UserOut.model_validate(user) if user else None, csrf_token=csrf, ai=ai_status())


@router.get("/me", response_model=MeOut)
def me(actor: Actor = Depends(get_actor)) -> MeOut:
    return me_payload(actor.user, actor.session.csrf_token if actor.session else None)


@router.post("/register", response_model=MeOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)) -> MeOut:
    rate_limiter.hit("register", client_ip(request), get_settings().registrations_per_hour, 3600)
    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=body.role,  # public sign-up can never create an admin (schema allow-list)
        locale=body.locale,
        school=body.school,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError("email_taken", 409, "An account with this email already exists", fields={"email": "taken"})
    session = create_session(db, user, request, response)
    return me_payload(user, session.csrf_token)


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)) -> MeOut:
    settings = get_settings()
    # Every attempt is counted up front (exact even for parallel guesses) and successful ones are
    # refunded: a teacher signing in on every computer of a classroom, or a class behind one school
    # IP, is never locked out. Once a budget is spent even the right password has to wait.
    budgets = [
        ("login-ip", client_ip(request), settings.login_attempts_per_15min * 3, 900),
        ("login-account", body.email, settings.login_attempts_per_15min, 900),
    ]
    rate_limiter.hit_all(budgets)
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None:
        verify_password(_DUMMY_HASH, body.password)
        raise AppError("invalid_credentials", 401, "Email or password is incorrect")
    if not verify_password(user.password_hash, body.password) or not user.is_active:
        raise AppError("invalid_credentials", 401, "Email or password is incorrect")
    rate_limiter.refund(budgets)
    if user.password_hash and needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)
    # Rotate: any session cookie the browser already had is dropped first.
    destroy_session(db, request, response)
    session = create_session(db, user, request, response)
    return me_payload(user, session.csrf_token)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Session = Depends(get_db)) -> Response:
    response = Response(status_code=204)
    destroy_session(db, request, response)
    return response


@router.patch("/me", response_model=MeOut)
def update_profile(body: ProfileUpdate, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> MeOut:
    user = db.get(User, actor.user.id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "locale", "school"):
        if field in data and data[field] is not None:
            setattr(user, field, data[field])
    db.commit()
    return me_payload(user, actor.session.csrf_token)


@router.post("/password", response_model=MeOut)
def change_password(
    body: PasswordChange,
    request: Request,
    response: Response,
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> MeOut:
    rate_limiter.hit("password", actor.user.id, 10, 900)
    user = db.get(User, actor.user.id)
    if not verify_password(user.password_hash, body.current_password):
        raise AppError("invalid_credentials", 400, "Current password is incorrect", fields={"current_password": "wrong"})
    user.password_hash = hash_password(body.new_password)
    revoke_user_sessions(db, user.id)
    db.add(AuditEvent(actor_id=user.id, action="password_changed", target_type="user", target_id=user.id))
    db.commit()
    session = create_session(db, user, request, response)
    return me_payload(user, session.csrf_token)


@router.delete("/me", status_code=204)
def delete_account(
    body: DeleteAccountIn,
    request: Request,
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete the account and every lab, source file and asset it owns (spec §10.5, §16)."""
    # Same budget as password changes: a stolen session must not become a password-guessing oracle.
    rate_limiter.hit("password", actor.user.id, 10, 900)
    user = db.get(User, actor.user.id)
    if not verify_password(user.password_hash, body.password):
        raise AppError("invalid_credentials", 400, "Password is incorrect", fields={"password": "wrong"})
    if user.role == "admin":
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True)))
        if admins <= 1:
            raise AppError("last_admin", 409, "The last administrator cannot delete their account")
    lab_ids = list(db.scalars(select(Lab.id).where(Lab.owner_id == user.id)))
    # Quiz attempts in other teachers' labs stay in their aggregates, without the name typed in.
    db.execute(update(QuizAttempt).where(QuizAttempt.user_id == user.id).values(display_name=None))
    db.add(AuditEvent(actor_id=None, action="account_deleted", target_type="user", target_id=user.id))
    revoke_user_sessions(db, user.id)
    db.delete(user)
    db.commit()
    for lab_id in lab_ids:
        storage.delete_lab_files(lab_id)
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
