"""Test setup: isolated SQLite DB + storage dir per session, real app, real DB.

Offline tests never call Meta; AI services are exercised with a fake transport at the
HTTP boundary (see ``fake_ai``). Live tests (marker ``live``) call the real API and run
only with ``RUN_LIVE_AI=1``.
"""

from __future__ import annotations

import os
import shutil
import tempfile

TMP = tempfile.mkdtemp(prefix="conceptlab-test-")
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{TMP.replace(os.sep, '/')}/test.db"
os.environ["STORAGE_DIR"] = os.path.join(TMP, "storage")
os.environ["FRONTEND_DIST"] = os.path.join(TMP, "no-dist")
os.environ["PUBLIC_BASE_URL"] = "http://testserver"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.security import rate_limiter  # noqa: E402

LIVE = os.environ.get("RUN_LIVE_AI") == "1"


def pytest_collection_modifyitems(config, items):
    if LIVE:
        return
    skip = pytest.mark.skip(reason="live AI test: set RUN_LIVE_AI=1")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def app():
    Base.metadata.create_all(engine)
    application = create_app()
    yield application
    engine.dispose()
    shutil.rmtree(TMP, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_db(app):
    yield
    rate_limiter.reset()
    db = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()


class ApiClient(TestClient):
    """TestClient that remembers the CSRF token and sends it on unsafe requests."""

    csrf: str | None = None

    def request(self, method, url, *args, **kwargs):  # type: ignore[override]
        if method.upper() in {"POST", "PUT", "PATCH", "DELETE"} and self.csrf:
            headers = dict(kwargs.pop("headers", None) or {})
            headers.setdefault("X-CSRF-Token", self.csrf)
            kwargs["headers"] = headers
        response = super().request(method, url, *args, **kwargs)
        if url.startswith("/api/auth/") and response.headers.get("content-type", "").startswith("application/json"):
            try:
                body = response.json()
                if isinstance(body, dict) and "csrf_token" in body:
                    self.csrf = body["csrf_token"]
            except ValueError:
                pass
        return response


@pytest.fixture
def make_client(app):
    clients: list[ApiClient] = []

    def _make() -> ApiClient:
        client = ApiClient(app, base_url="http://testserver")
        client.__enter__()
        clients.append(client)
        return client

    yield _make
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client) -> ApiClient:
    return make_client()


def register(client: ApiClient, email: str = "teacher@example.com", role: str = "teacher", name: str = "Cô Lan") -> dict:
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": "correct-horse-battery", "name": name, "role": role, "locale": "vi"},
    )
    assert response.status_code == 201, response.text
    return response.json()["user"]


@pytest.fixture
def teacher(make_client):
    c = make_client()
    user = register(c, "teacher@example.com", "teacher", "Cô Lan")
    return c, user


@pytest.fixture
def other_user(make_client):
    c = make_client()
    user = register(c, "student@example.com", "student", "Minh")
    return c, user


def make_admin(email: str) -> None:
    from sqlalchemy import select

    from app.models import User

    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email))
        user.role = "admin"
        db.commit()
    finally:
        db.close()


def create_lab(client: ApiClient, **overrides) -> dict:
    body = {
        "space": "school2lab",
        "title": "Con lắc đơn",
        "subject": "physics",
        "grade": "10",
        "language": "vi",
        "goal": "view_graph",
        "level": "simple",
    }
    body.update(overrides)
    response = client.post("/api/labs", json=body)
    assert response.status_code == 201, response.text
    return response.json()
