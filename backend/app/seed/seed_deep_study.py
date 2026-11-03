"""Add this reviewed paper batch without modifying any existing lab.

Run from backend: .venv/Scripts/python -m app.seed.seed_deep_study
"""
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from sqlalchemy import select

from ..db import SessionLocal, engine
from ..models import Lab
from .demo import _seed_one, _system_user
from .research_deep_study import DEEP_STUDY_DEMOS


def main():
    # Preserve a recoverable snapshot before the first write to a local database.
    if engine.url.get_backend_name() == 'sqlite' and engine.url.database != ':memory:':
        database = Path(engine.url.database)
        if database.exists():
            backup_dir = Path(__file__).resolve().parents[3] / '.build-check'
            backup_dir.mkdir(exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
            destination = backup_dir / f'before-paper-study-batch-{stamp}.db'
            with sqlite3.connect(database) as src, sqlite3.connect(destination) as dst:
                src.backup(dst)
            print(f'Backup: {destination.name}')
    with SessionLocal() as db:
        user = _system_user(db)
        for demo in DEEP_STUDY_DEMOS:
            if db.scalar(select(Lab.id).where(Lab.share_code == demo.code)):
                print(f'Existing lab kept: {demo.code}')
                continue
            _seed_one(db, user, demo)
            print(f'Added reviewed lesson: {demo.code}')


if __name__ == '__main__':
    main()
