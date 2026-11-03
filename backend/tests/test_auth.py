from __future__ import annotations

from tests.conftest import make_admin, register


def test_me_anonymous(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["user"] is None and body["csrf_token"] is None
    assert "configured" in body["ai"]


def test_register_login_logout_flow(client):
    user = register(client)
    assert user["role"] == "teacher" and "password_hash" not in user
    assert client.get("/api/auth/me").json()["user"]["email"] == "teacher@example.com"
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").json()["user"] is None
    r = client.post("/api/auth/login", json={"email": "TEACHER@example.com", "password": "correct-horse-battery"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["name"] == "Cô Lan"


def test_register_cannot_create_admin(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "x@example.com", "password": "correct-horse-battery", "name": "X", "role": "admin"},
    )
    assert r.status_code == 422


def test_register_rejects_extra_fields_and_bad_email(client):
    r = client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": "correct-horse-battery", "name": "X"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    r = client.post(
        "/api/auth/register",
        json={"email": "a@example.com", "password": "correct-horse-battery", "name": "X", "is_active": False},
    )
    assert r.status_code == 422


def test_duplicate_email(client, make_client):
    register(client)
    other = make_client()
    r = other.post(
        "/api/auth/register",
        json={"email": "teacher@example.com", "password": "correct-horse-battery", "name": "B", "role": "student"},
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "email_taken"


def test_wrong_password_generic_error(client):
    register(client)
    client.post("/api/auth/logout")
    r = client.post("/api/auth/login", json={"email": "teacher@example.com", "password": "nope-nope-nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"
    r = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_credentials"


def test_login_rate_limited(client):
    register(client)
    client.post("/api/auth/logout")
    codes = [
        client.post("/api/auth/login", json={"email": "teacher@example.com", "password": "bad-password"}).status_code
        for _ in range(12)
    ]
    assert 429 in codes


def test_csrf_required_for_mutations_with_session(client):
    register(client)
    token = client.csrf
    client.csrf = None  # stop auto-sending the header
    r = client.patch("/api/auth/me", json={"name": "Hacker"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    r = client.patch("/api/auth/me", json={"name": "Cô Lan 2"}, headers={"X-CSRF-Token": token})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Cô Lan 2"


def test_foreign_origin_rejected(client):
    r = client.post(
        "/api/auth/login",
        json={"email": "a@example.com", "password": "x"},
        headers={"Origin": "https://evil.example"},
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_origin"


def test_opaque_origin_rejected_on_login_and_authenticated_mutation(client):
    login = client.post(
        "/api/auth/login",
        json={"email": "a@example.com", "password": "x"},
        headers={"Origin": "null"},
    )
    assert login.status_code == 403 and login.json()["error"]["code"] == "csrf_origin"
    register(client)
    update = client.patch("/api/auth/me", json={"name": "Unexpected"}, headers={"Origin": "null"})
    assert update.status_code == 403 and update.json()["error"]["code"] == "csrf_origin"


def test_password_change_rotates_sessions(make_client):
    a = make_client()
    register(a)
    b = make_client()
    b.post("/api/auth/login", json={"email": "teacher@example.com", "password": "correct-horse-battery"})
    assert b.get("/api/auth/me").json()["user"] is not None
    r = a.post("/api/auth/password", json={"current_password": "correct-horse-battery", "new_password": "new-password-123"})
    assert r.status_code == 200
    assert b.get("/api/auth/me").json()["user"] is None  # other session revoked
    assert a.get("/api/auth/me").json()["user"] is not None


def test_delete_account_removes_labs(client):
    register(client)
    lab = client.post(
        "/api/labs",
        json={"space": "school2lab", "title": "T", "subject": "math", "grade": "8"},
    ).json()
    r = client.request("DELETE", "/api/auth/me", json={"password": "correct-horse-battery"})
    assert r.status_code == 204
    assert client.get("/api/auth/me").json()["user"] is None
    from app.db import SessionLocal
    from app.models import Lab

    db = SessionLocal()
    try:
        assert db.get(Lab, lab["id"]) is None
    finally:
        db.close()


def test_last_admin_cannot_delete_self(client):
    register(client, "boss@example.com")
    make_admin("boss@example.com")
    r = client.request("DELETE", "/api/auth/me", json={"password": "correct-horse-battery"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_admin"
