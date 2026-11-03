from __future__ import annotations

from tests.conftest import create_lab, make_admin, register

STEPS_BLOCK = {
    "id": "b1",
    "type": "steps",
    "title": "Các bước",
    "steps": [{"id": "s1", "title": "Kéo lệch", "body": "Kéo vật lệch góc nhỏ"}],
}


def test_create_list_get_update(teacher):
    c, _ = teacher
    lab = create_lab(c)
    assert lab["status"] == "draft" and lab["version"] == 1 and lab["ai_mode"] == "contributor"
    listing = c.get("/api/labs").json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == lab["id"]
    r = c.patch(
        f"/api/labs/{lab['id']}",
        json={"version": 1, "title": "Con lắc — bài 12", "spec": {"blocks": [STEPS_BLOCK]}},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["version"] == 2 and body["spec"]["blocks"][0]["steps"][0]["title"] == "Kéo lệch"


def test_version_conflict(teacher):
    c, _ = teacher
    lab = create_lab(c)
    assert c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "title": "A"}).status_code == 200
    r = c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "title": "B"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "version_conflict"


def test_invalid_spec_rejected_and_not_saved(teacher):
    c, _ = teacher
    lab = create_lab(c)
    r = c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "spec": {"blocks": [{"id": "x", "type": "nope"}]}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_spec"
    assert c.get(f"/api/labs/{lab['id']}").json()["version"] == 1


def test_other_user_cannot_read_or_modify(teacher, other_user):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    assert o.get(f"/api/labs/{lab['id']}").status_code == 404
    assert o.patch(f"/api/labs/{lab['id']}", json={"version": 1, "title": "pwned"}).status_code == 404
    assert o.delete(f"/api/labs/{lab['id']}").status_code == 404
    assert o.get("/api/labs").json()["total"] == 0
    assert c.get(f"/api/labs/{lab['id']}").json()["title"] == "Con lắc đơn"


def test_guest_cannot_use_lab_api(client, teacher):
    c, _ = teacher
    lab = create_lab(c)
    assert client.get("/api/labs").status_code == 401
    assert client.get(f"/api/labs/{lab['id']}").status_code == 401
    body = {"space": "school2lab", "title": "x", "subject": "math", "grade": "6"}
    assert client.post("/api/labs", json=body).status_code == 401


def test_owner_field_cannot_be_injected(teacher, other_user):
    c, _ = teacher
    _, other = other_user
    r = c.post(
        "/api/labs",
        json={"space": "school2lab", "title": "x", "subject": "math", "grade": "6", "owner_id": other["id"]},
    )
    assert r.status_code == 422
    lab = create_lab(c)
    r = c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "status": "published"})
    assert r.status_code == 422


def test_admin_can_access_any_lab(teacher, make_client):
    c, _ = teacher
    lab = create_lab(c)
    admin = make_client()
    register(admin, "admin@example.com", "teacher", "Admin")
    make_admin("admin@example.com")
    assert admin.get(f"/api/labs/{lab['id']}").status_code == 200


def test_publish_requires_blocks_and_snapshot_hides_drafts(teacher):
    c, _ = teacher
    lab = create_lab(c)
    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": True})
    assert r.status_code == 422
    quiz = {
        "id": "q",
        "type": "quiz",
        "questions": [
            {"id": "q1", "prompt": "Đúng?", "kind": "truefalse", "options": ["Đúng", "Sai"], "answer_index": 0, "approved": True},
            {"id": "q2", "prompt": "Nháp", "kind": "truefalse", "options": ["Đúng", "Sai"], "answer_index": 1, "approved": False},
        ],
    }
    c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "spec": {"blocks": [STEPS_BLOCK, quiz]}})
    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "public", "allow_tutor": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["share_code"]) == 6 and body["share_url"].endswith(body["share_code"])
    lab_after = c.get(f"/api/labs/{lab['id']}").json()
    assert lab_after["status"] == "published" and not lab_after["has_unpublished_changes"]
    from app.db import SessionLocal
    from app.models import Lab

    db = SessionLocal()
    try:
        snap = db.get(Lab, lab["id"]).published_spec_json["spec"]
    finally:
        db.close()
    questions = [b for b in snap["blocks"] if b["type"] == "quiz"][0]["questions"]
    assert [q["id"] for q in questions] == ["q1"]
    # editing after publish marks unpublished changes but does not alter the snapshot
    c.patch(f"/api/labs/{lab['id']}", json={"version": lab_after["version"], "title": "Đổi tên"})
    assert c.get(f"/api/labs/{lab['id']}").json()["has_unpublished_changes"] is True
    assert c.post(f"/api/labs/{lab['id']}/unpublish").json()["status"] == "draft"


def test_versions_and_restore(teacher):
    c, _ = teacher
    lab = create_lab(c)
    c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "spec": {"blocks": [STEPS_BLOCK]}, "note": "Bản 1"})
    c.patch(f"/api/labs/{lab['id']}", json={"version": 2, "spec": {"blocks": []}, "note": "Bản 2"})
    versions = c.get(f"/api/labs/{lab['id']}/versions").json()
    assert [v["note"] for v in versions][:2] == ["Bản 2", "Bản 1"]
    restored = c.post(f"/api/labs/{lab['id']}/versions/2/restore").json()
    assert restored["spec"]["blocks"][0]["id"] == "b1" and restored["version"] == 4


def test_duplicate_and_delete(teacher):
    c, _ = teacher
    lab = create_lab(c)
    c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "spec": {"blocks": [STEPS_BLOCK]}})
    copy = c.post(f"/api/labs/{lab['id']}/duplicate").json()
    assert copy["id"] != lab["id"] and copy["spec"]["blocks"][0]["id"] == "b1" and copy["status"] == "draft"
    assert c.delete(f"/api/labs/{lab['id']}").status_code == 204
    assert c.get(f"/api/labs/{lab['id']}").status_code == 404


def test_migrations_build_schema_on_empty_db(tmp_path):
    from sqlalchemy import create_engine, inspect

    from app.cli import init_db

    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    init_db(url)
    tables = set(inspect(create_engine(url)).get_table_names())
    assert {"users", "labs", "sources", "assets", "lab_versions", "chat_messages", "quiz_attempts", "feedback", "ai_calls"} <= tables
