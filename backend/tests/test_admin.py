"""Administration: permissions, real statistics, users (last-admin guard, deactivation),
lab moderation, AI call log and feedback."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select

from app.db import SessionLocal, utcnow
from app.models import AICall, AuditEvent, Feedback, Lab, QuizAttempt, User
from tests.conftest import create_lab, make_admin, register

STEPS = {"id": "b1", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Quan sát", "body": "…"}]}


def admin_client(make_client, email="admin@example.com", name="Quản trị"):
    c = make_client()
    user = register(c, email, "teacher", name)
    make_admin(email)
    return c, user


def publish(c, lab_id, visibility="public"):
    version = c.get(f"/api/labs/{lab_id}").json()["version"]
    assert c.patch(f"/api/labs/{lab_id}", json={"version": version, "spec": {"blocks": [STEPS]}}).status_code == 200
    r = c.post(f"/api/labs/{lab_id}/publish", json={"visibility": visibility, "allow_tutor": True})
    assert r.status_code == 200, r.text
    return r.json()["share_code"]


ENDPOINTS = [
    ("get", "/api/admin/stats"),
    ("get", "/api/admin/users"),
    ("get", "/api/admin/labs"),
    ("get", "/api/admin/ai-calls"),
    ("get", "/api/admin/feedback"),
]


def test_non_admin_forbidden_and_guest_unauthorized(teacher, client):
    c, user = teacher
    for method, url in ENDPOINTS:
        assert getattr(c, method)(url).status_code == 403, url
        assert getattr(client, method)(url).status_code == 401, url
    assert c.patch(f"/api/admin/users/{user['id']}", json={"role": "admin"}).status_code == 403
    lab = create_lab(c)
    assert c.post(f"/api/admin/labs/{lab['id']}/unpublish").status_code == 403
    assert c.get("/api/auth/me").json()["user"]["role"] == "teacher"


def test_stats_from_real_rows(teacher, other_user, make_client):
    admin, _ = admin_client(make_client)
    c, teacher_user = teacher
    o, _ = other_user
    physics = create_lab(c)
    paper = create_lab(c, space="paper2explorer", subject="computer_science", grade="university", title="Attention")
    create_lab(o, subject="math", title="Hàm số")
    code = publish(c, physics["id"])
    c.post(f"/api/labs/{physics['id']}/sources/note", json={"title": "Ghi chú", "text": "Đo chiều dài dây"})

    db = SessionLocal()
    try:
        now = utcnow()
        lab = db.get(Lab, physics["id"])
        lab.created_at = now - timedelta(minutes=50)
        lab.first_published_at = now - timedelta(minutes=20)  # 30 minutes of preparation
        lab.analysis_json = {
            "status": "done",
            "result": {
                "objects": [{"id": "o1", "name": "quả nặng", "confirmed": True}],
                "formulas": [{"id": "f1", "confirmed": True}, {"id": "f2", "confirmed": False}],
                "variables": [{"symbol": "L", "confirmed": True}],
                "steps": [],
                "relations": [{"id": "r1", "source": "a", "target": "b", "confirmed": False}],
            },
        }
        demo = Lab(owner_id=teacher_user["id"], space="school2lab", title="Demo", subject="pe", grade="7", is_demo=True,
                   created_at=now - timedelta(days=3), first_published_at=now, spec_json={},
                   analysis_json={"result": {"objects": [{"id": "x", "confirmed": False}] * 5}})
        db.add(demo)
        db.add_all(
            [
                AICall(feature="analyze", model="muse-spark-1.3-contributor", status="ok", latency_ms=1200, input_tokens=1000, output_tokens=300),
                AICall(feature="analyze", model="muse-spark-1.3-contributor", status="error", error_code="ai_timeout", latency_ms=3000),
                AICall(feature="segment", model="sam-3.1", status="ok", latency_ms=800, input_tokens=None, output_tokens=None),
                AICall(feature="tutor", model="muse-spark-1.3-contributor", status="ok", latency_ms=500, input_tokens=200, output_tokens=100,
                       created_at=now - timedelta(days=10)),
                Feedback(lab_id=physics["id"], rating=5, comment="Hay"),
                Feedback(lab_id=physics["id"], rating=3),
                QuizAttempt(lab_id=physics["id"], block_id="q", phase="pre", score=1, total=4),
                QuizAttempt(lab_id=physics["id"], block_id="q", phase="pre", score=2, total=4),
                QuizAttempt(lab_id=physics["id"], block_id="q", phase="post", score=3, total=4),
                QuizAttempt(lab_id=physics["id"], block_id="q", phase="practice", score=0, total=0),
            ]
        )
        db.commit()
    finally:
        db.close()

    r = admin.get("/api/admin/stats")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["users_by_role"] == {"teacher": 1, "student": 1, "researcher": 0, "admin": 1}
    assert s["labs_by_status"] == {"draft": 3, "published": 1, "archived": 0}
    assert s["labs_by_space"] == {"school2lab": 3, "paper2explorer": 1}
    assert s["labs_by_subject"]["physics"] == 1 and s["labs_by_subject"]["math"] == 1 and s["labs_by_subject"]["pe"] == 1
    assert s["labs_by_subject"]["computer_science"] == 1 and s["labs_by_subject"]["biology"] == 0
    assert s["ai_calls_total"] == 4 and s["ai_calls_last_7d"] == 3
    assert s["ai_success_rate"] == 0.75
    analyze = next(f for f in s["ai_by_feature"] if f["feature"] == "analyze")
    assert analyze == {"feature": "analyze", "calls": 2, "errors": 1, "avg_latency_ms": 2100, "input_tokens": 1000, "output_tokens": 300}
    assert s["ai_by_feature"][0]["feature"] == "analyze"  # most used first
    models = {m["model"]: m for m in s["ai_by_model"]}
    assert models["muse-spark-1.3-contributor"]["calls"] == 3 and models["sam-3.1"]["errors"] == 0
    assert s["review_confirmed_ratio"] == 0.6  # 3 of 5 items; demo labs are excluded
    assert s["avg_prep_minutes"] == 30.0  # demo lab excluded
    assert s["feedback_count"] == 2 and s["feedback_avg"] == 4.0
    assert s["quiz_pre_avg_pct"] == 37.5 and s["quiz_post_avg_pct"] == 75.0
    assert s["storage_bytes"] >= 0 and s["generated_at"]
    assert code


def test_stats_empty_platform(make_client):
    admin, _ = admin_client(make_client)
    s = admin.get("/api/admin/stats").json()
    assert s["ai_calls_total"] == 0 and s["ai_success_rate"] is None
    assert s["review_confirmed_ratio"] is None and s["avg_prep_minutes"] is None
    assert s["feedback_avg"] is None and s["quiz_pre_avg_pct"] is None and s["ai_by_feature"] == []


def test_users_list_search_and_filters(teacher, other_user, make_client):
    admin, _ = admin_client(make_client)
    c, _ = teacher
    create_lab(c)
    create_lab(c)
    body = admin.get("/api/admin/users").json()
    assert body["total"] == 3 and body["page_size"] == 25
    lan = next(u for u in body["items"] if u["email"] == "teacher@example.com")
    assert lan["lab_count"] == 2 and lan["is_active"] is True and "password_hash" not in lan
    assert lan["last_login_at"] is not None
    assert [u["email"] for u in admin.get("/api/admin/users", params={"q": "co lan"}).json()["items"]] == ["teacher@example.com"]
    assert [u["email"] for u in admin.get("/api/admin/users", params={"q": "STUDENT@"}).json()["items"]] == ["student@example.com"]
    assert [u["role"] for u in admin.get("/api/admin/users?role=admin").json()["items"]] == ["admin"]
    paged = admin.get("/api/admin/users?page=2&page_size=2").json()
    assert paged["total"] == 3 and len(paged["items"]) == 1
    assert admin.get("/api/admin/users?role=superuser").status_code == 422


def test_role_change_is_audited(other_user, make_client):
    admin, admin_user = admin_client(make_client)
    o, student = other_user
    r = admin.patch(f"/api/admin/users/{student['id']}", json={"role": "teacher"})
    assert r.status_code == 200 and r.json()["role"] == "teacher"
    assert o.get("/api/auth/me").json()["user"]["role"] == "teacher"
    db = SessionLocal()
    try:
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "user_updated"))
        assert event.actor_id == admin_user["id"] and event.target_id == student["id"]
        assert event.meta_json == {"changes": {"role": {"from": "student", "to": "teacher"}}}
    finally:
        db.close()
    unchanged = admin.patch(f"/api/admin/users/{student['id']}", json={"role": "teacher"})
    assert unchanged.status_code == 200
    assert admin.patch(f"/api/admin/users/{student['id']}", json={"email": "x@example.com"}).status_code == 422
    assert admin.patch(f"/api/admin/users/{student['id']}", json={"role": "owner"}).status_code == 422
    assert admin.patch("/api/admin/users/doesnotexist", json={"role": "teacher"}).status_code == 404


def test_last_admin_and_self_guards(make_client):
    admin, admin_user = admin_client(make_client)
    r = admin.patch(f"/api/admin/users/{admin_user['id']}", json={"role": "teacher"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_admin"
    r = admin.patch(f"/api/admin/users/{admin_user['id']}", json={"is_active": False})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_admin"
    second, second_user = admin_client(make_client, "admin2@example.com", "Phó quản trị")
    r = admin.patch(f"/api/admin/users/{admin_user['id']}", json={"role": "teacher"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "cannot_change_self"
    # another admin may demote me; then I am no longer an admin
    assert second.patch(f"/api/admin/users/{admin_user['id']}", json={"role": "teacher"}).status_code == 200
    assert admin.get("/api/admin/stats").status_code == 403
    r = second.patch(f"/api/admin/users/{second_user['id']}", json={"is_active": False})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_admin"
    assert admin.patch(f"/api/admin/users/{admin_user['id']}", json={"is_active": True}).status_code == 403


def test_deactivation_revokes_sessions(teacher, make_client):
    admin, _ = admin_client(make_client)
    c, user = teacher
    lab = create_lab(c)
    assert c.get("/api/labs").status_code == 200
    r = admin.patch(f"/api/admin/users/{user['id']}", json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False and r.json()["lab_count"] == 1
    assert c.get("/api/auth/me").json()["user"] is None
    assert c.get("/api/labs").status_code == 401
    r = c.post("/api/auth/login", json={"email": "teacher@example.com", "password": "correct-horse-battery"})
    assert r.status_code == 401
    db = SessionLocal()
    try:
        assert db.scalar(select(AuditEvent).where(AuditEvent.target_id == user["id"])).meta_json["changes"]["is_active"] == {"from": True, "to": False}
    finally:
        db.close()
    assert admin.patch(f"/api/admin/users/{user['id']}", json={"is_active": True}).status_code == 200
    r = c.post("/api/auth/login", json={"email": "teacher@example.com", "password": "correct-horse-battery"})
    assert r.status_code == 200
    assert c.get(f"/api/labs/{lab['id']}").status_code == 200


def test_admin_labs_and_unpublish(teacher, other_user, make_client, client):
    admin, admin_user = admin_client(make_client)
    c, _ = teacher
    o, _ = other_user
    mine = create_lab(c, title="Con lắc đơn")
    theirs = create_lab(o, title="Hàm số bậc hai", subject="math")
    code = publish(c, mine["id"])
    body = admin.get("/api/admin/labs").json()
    assert body["total"] == 2 and {i["id"] for i in body["items"]} == {mine["id"], theirs["id"]}
    assert [i["id"] for i in admin.get("/api/admin/labs?status=published").json()["items"]] == [mine["id"]]
    assert [i["id"] for i in admin.get("/api/admin/labs", params={"q": "ham so"}).json()["items"]] == [theirs["id"]]
    assert [i["id"] for i in admin.get("/api/admin/labs", params={"q": "minh"}).json()["items"]] == [theirs["id"]]  # owner name
    assert admin.get("/api/admin/labs?status=deleted").status_code == 422

    assert client.get(f"/api/share/{code}").status_code == 200
    r = admin.post(f"/api/admin/labs/{mine['id']}/unpublish")
    assert r.status_code == 200 and r.json()["status"] == "draft" and r.json()["id"] == mine["id"]
    assert client.get(f"/api/share/{code}").status_code == 404
    assert client.get("/api/public/labs").json()["total"] == 0
    db = SessionLocal()
    try:
        event = db.scalar(select(AuditEvent).where(AuditEvent.action == "lab_unpublished"))
        assert event.actor_id == admin_user["id"] and event.target_id == mine["id"] and event.meta_json["share_code"] == code
    finally:
        db.close()
    assert admin.post(f"/api/admin/labs/{mine['id']}/unpublish").status_code == 200  # idempotent
    assert admin.post("/api/admin/labs/nope/unpublish").status_code == 404


def test_ai_calls_and_feedback_lists(teacher, make_client):
    admin, _ = admin_client(make_client)
    c, _ = teacher
    lab = create_lab(c, title="Con lắc đơn")
    db = SessionLocal()
    try:
        now = utcnow()
        for i in range(5):
            db.add(AICall(feature="analyze" if i % 2 else "tutor", model="muse-spark-1.3", status="ok" if i < 4 else "error",
                          error_code=None if i < 4 else "ai_unreachable", latency_ms=100 * i, lab_id=lab["id"],
                          created_at=now - timedelta(minutes=i)))
        db.add(Feedback(lab_id=lab["id"], rating=4, comment="Hữu ích", created_at=now - timedelta(minutes=1)))
        db.add(Feedback(lab_id=lab["id"], rating=2, created_at=now))
        db.commit()
    finally:
        db.close()
    calls = admin.get("/api/admin/ai-calls").json()
    assert calls["total"] == 5 and calls["items"][0]["latency_ms"] == 0  # newest first
    assert set(calls["items"][0]) >= {"id", "feature", "model", "status", "error_code", "latency_ms", "created_at", "lab_id"}
    assert admin.get("/api/admin/ai-calls?feature=analyze").json()["total"] == 2
    errors = admin.get("/api/admin/ai-calls?status=error").json()
    assert errors["total"] == 1 and errors["items"][0]["error_code"] == "ai_unreachable"
    assert len(admin.get("/api/admin/ai-calls?page=2&page_size=2").json()["items"]) == 2
    assert admin.get("/api/admin/ai-calls?status=maybe").status_code == 422
    feedback = admin.get("/api/admin/feedback").json()
    assert feedback["total"] == 2
    assert feedback["items"][0] == {**feedback["items"][0], "lab_id": lab["id"], "lab_title": "Con lắc đơn", "rating": 2, "comment": None}
    assert feedback["items"][1]["comment"] == "Hữu ích"


def test_system_accounts_hidden(make_client):
    admin, _ = admin_client(make_client)
    db = SessionLocal()
    try:
        system = User(email="demo@conceptlab.local", name="ConceptLab Demo", role="teacher", is_system=True)
        db.add(system)
        db.commit()
        system_id = system.id
    finally:
        db.close()
    assert "demo@conceptlab.local" not in admin.get("/api/admin/users").text
    assert admin.get("/api/admin/stats").json()["users_by_role"]["teacher"] == 0
    assert admin.patch(f"/api/admin/users/{system_id}", json={"is_active": False}).status_code == 404
