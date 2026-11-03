"""Operator commands.

    python -m app.cli init-db                      # apply migrations (alembic upgrade head)
    python -m app.cli create-admin --email a@b.c --name "Admin"
        password: prompted (hidden), or ADMIN_PASSWORD env var for automation
    python -m app.cli seed-demo                    # demo labs (pendulum, volleyball, attention ...)
    python -m app.cli seed-demo --refresh [CODES]  # update demo labs in place, keeping learner data

There is no default admin account and no public way to become admin.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

from sqlalchemy import func, select

from .config import BACKEND_DIR, get_settings
from .db import SessionLocal
from .models import AuditEvent, User
from .security import hash_password


def init_db(database_url: str | None = None) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    if database_url:
        cfg.attributes["database_url"] = database_url
    url = database_url or get_settings().database_url
    if url.startswith("sqlite:///"):
        Path(url.split("///", 1)[1]).parent.mkdir(parents=True, exist_ok=True)
    command.upgrade(cfg, "head")


def create_admin(email: str, name: str, allow_additional: bool) -> int:
    email = email.strip().lower()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password (min 12 chars): ")
    if len(password) < 12:
        print("Password must be at least 12 characters.", file=sys.stderr)
        return 2
    db = SessionLocal()
    try:
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == "admin"))
        if admins and not allow_additional:
            print("An administrator already exists. Use --allow-additional to add another.", file=sys.stderr)
            return 3
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(email=email, name=name, role="admin", password_hash=hash_password(password), locale="vi")
            db.add(user)
        else:
            user.role = "admin"
            user.password_hash = hash_password(password)
            user.is_active = True
        db.flush()
        db.add(AuditEvent(actor_id=None, action="admin_bootstrap", target_type="user", target_id=user.id))
        db.commit()
        print(f"Administrator ready: {email}")
        return 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("init-db", help="apply database migrations")
    sub.add_parser("localize-demo", help="correct known legacy demo strings without rebuilding labs")
    p_admin = sub.add_parser("create-admin", help="create or promote an administrator")
    p_admin.add_argument("--email", required=True)
    p_admin.add_argument("--name", default="Administrator")
    p_admin.add_argument("--allow-additional", action="store_true")
    p_seed = sub.add_parser("seed-demo", help="create the published demo labs (idempotent)")
    mode = p_seed.add_mutually_exclusive_group()
    mode.add_argument(
        "--force",
        action="store_true",
        help="delete and recreate the demo labs (also deletes learners' quiz attempts, chat and feedback on them)",
    )
    mode.add_argument(
        "--refresh",
        nargs="*",
        metavar="CODE",
        help="update the demo labs in place from seed assets and content (keeps ids, share codes and learner data); "
        "optionally only the given share codes",
    )
    args = parser.parse_args(argv)

    if args.cmd == "init-db":
        init_db()
        print("Database is up to date.")
        return 0
    if args.cmd == "localize-demo":
        from .seed.localize_existing import localize_existing

        db = SessionLocal()
        try:
            labs, sources = localize_existing(db)
            print(f"Corrected known strings in {labs} demo lab(s) and {sources} source title(s).")
            return 0
        finally:
            db.close()
    if args.cmd == "create-admin":
        return create_admin(args.email, args.name, args.allow_additional)
    if args.cmd == "seed-demo":
        from .seed.demo import refresh_demo, seed_demo

        if args.refresh is not None:
            return refresh_demo(args.refresh or None)
        if args.force:
            print("Recreating the demo labs: their learners' quiz attempts, chat and feedback are deleted too.")
        return seed_demo(force=args.force)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
