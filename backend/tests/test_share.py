"""Sharing: public gallery, shared snapshot, server-side quiz scoring, feedback, cloning,
teacher results (aggregates only)."""

from __future__ import annotations

import json
from datetime import timedelta

import pytest

from app.db import SessionLocal, utcnow
from app.models import ChatMessage, Lab, QuizAttempt, User
from app.services import share as share_svc
from tests.conftest import create_lab, register

STEPS = {"id": "b1", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Quan sát", "body": "…"}]}
QUIZ = {
    "id": "qz",
    "type": "quiz",
    "title": "Kiểm tra nhanh",
    "questions": [
        {"id": "q1", "kind": "mcq", "prompt": "Chu kỳ phụ thuộc vào?", "options": ["Chiều dài dây", "Khối lượng", "Màu quả nặng"], "answer_index": 0, "explanation": "T = 2π√(L/g)", "approved": True},
        {"id": "q2", "kind": "truefalse", "prompt": "Khối lượng làm chu kỳ tăng.", "options": ["Đúng", "Sai"], "answer_index": 1, "approved": True},
        {"id": "q3", "kind": "order", "prompt": "Sắp xếp các bước", "options": ["Thả", "Kéo lệch", "Đo thời gian"], "answer_order": [1, 0, 2], "approved": True},
        {"id": "q4", "kind": "numeric", "prompt": "T khi L = 1 m (s)?", "answer_value": 2.01, "unit": "s", "approved": True},
        {"id": "q5", "kind": "numeric", "prompt": "Vận tốc ở biên (m/s)?", "answer_value": 0, "approved": True},
        {"id": "q6", "kind": "mcq", "prompt": "Câu nháp chưa duyệt", "options": ["A", "B"], "answer_index": 1, "explanation": "bí mật", "approved": False},
    ],
}


def publish(c, lab_id, blocks, visibility="link"):
    version = c.get(f"/api/labs/{lab_id}").json()["version"]
    r = c.patch(f"/api/labs/{lab_id}", json={"version": version, "spec": {"blocks": blocks}})
    assert r.status_code == 200, r.text
    r = c.post(f"/api/labs/{lab_id}/publish", json={"visibility": visibility, "allow_tutor": True})
    assert r.status_code == 200, r.text
    return r.json()["share_code"]


def set_lab(lab_id, **values):
    db = SessionLocal()
    try:
        lab = db.get(Lab, lab_id)
        for key, value in values.items():
            setattr(lab, key, value)
        db.commit()
    finally:
        db.close()


SOLVED_Q3 = ["Kéo lệch", "Thả", "Đo thời gian"]
ANSWER_KEYS = {"answer_index", "answer_order", "answer_value", "tolerance", "explanation", "option_feedback"}


def shown_options(client, code, qid="q3"):
    """The options of a question in the order learners are shown them."""
    quiz = next(b for b in client.get(f"/api/share/{code}").json()["spec"]["blocks"] if b["type"] == "quiz")
    return next(q for q in quiz["questions"] if q["id"] == qid)["options"]


def solved_q3(client, code):
    """Learners answer an order question with indices into the options as shown."""
    options = shown_options(client, code)
    return [options.index(item) for item in SOLVED_Q3]


def all_right(client, code):
    return [
        {"question_id": "q1", "answer": 0},
        {"question_id": "q2", "answer": 1},
        {"question_id": "q3", "answer": solved_q3(client, code)},
        {"question_id": "q4", "answer": 2.0},
        {"question_id": "q5", "answer": 0},
    ]


# ============================================================================ gallery
def test_gallery_lists_only_public_published(teacher, client):
    c, _ = teacher
    physics = create_lab(c, title="Con lắc đơn", topic="Dao động")
    math_lab = create_lab(c, title="Đồ thị hàm bậc hai", subject="math", grade="9")
    paper = create_lab(c, space="paper2explorer", title="Attention", subject="computer_science", grade="university")
    link_only = create_lab(c, title="Bài riêng của lớp")
    create_lab(c, title="Bản nháp")
    publish(c, physics["id"], [STEPS], "public")
    publish(c, math_lab["id"], [STEPS], "public")
    publish(c, paper["id"], [STEPS], "public")
    publish(c, link_only["id"], [STEPS], "link")
    now = utcnow()
    for offset, lab in enumerate([physics, math_lab, paper]):
        set_lab(lab["id"], published_at=now - timedelta(minutes=10 - offset))

    body = client.get("/api/public/labs").json()
    assert body["total"] == 3 and body["page"] == 1 and body["page_size"] == 24
    assert [i["id"] for i in body["items"]] == [paper["id"], math_lab["id"], physics["id"]]  # newest first
    item = body["items"][0]
    assert item["status"] == "published" and item["visibility"] == "public" and item["share_code"]
    assert item["block_count"] == 1 and "spec" not in item and "analysis" not in item

    assert [i["id"] for i in client.get("/api/public/labs?subject=math").json()["items"]] == [math_lab["id"]]
    assert [i["id"] for i in client.get("/api/public/labs?space=paper2explorer").json()["items"]] == [paper["id"]]
    assert [i["id"] for i in client.get("/api/public/labs?grade=10").json()["items"]] == [physics["id"]]
    # accent- and case-insensitive search (learners often type without diacritics)
    for q in ("con lac", "CON LẮC", "dao dong", "đơn"):
        assert [i["id"] for i in client.get("/api/public/labs", params={"q": q}).json()["items"]] == [physics["id"]], q
    assert client.get("/api/public/labs", params={"q": "riêng"}).json()["total"] == 0
    page2 = client.get("/api/public/labs?page=2&page_size=2").json()
    assert page2["total"] == 3 and [i["id"] for i in page2["items"]] == [physics["id"]]
    assert client.get("/api/public/labs?subject=astrology").status_code == 422
    assert client.get("/api/public/labs?page_size=500").status_code == 422

    # unpublished or suspended authors disappear from the gallery
    c.post(f"/api/labs/{paper['id']}/unpublish")
    assert client.get("/api/public/labs").json()["total"] == 2
    db = SessionLocal()
    try:
        db.get(User, physics["owner"]["id"]).is_active = False
        db.commit()
    finally:
        db.close()
    assert client.get("/api/public/labs").json()["total"] == 0


def test_featured_demo_labs(teacher, client):
    c, _ = teacher
    demo = create_lab(c, title="Demo con lắc")
    demo_link = create_lab(c, title="Demo riêng")
    plain = create_lab(c, title="Bài thường")
    for lab, vis in ((demo, "public"), (demo_link, "link"), (plain, "public")):
        publish(c, lab["id"], [STEPS], vis)
    set_lab(demo["id"], is_demo=True)
    set_lab(demo_link["id"], is_demo=True)
    featured = client.get("/api/public/featured").json()
    assert [f["id"] for f in featured] == [demo["id"]] and featured[0]["is_demo"] is True


# ============================================================================ shared lab
def test_shared_lab_shows_snapshot_only(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    lab_now = c.get(f"/api/labs/{lab['id']}").json()
    draft_block = {"id": "draft", "type": "text", "title": "Nháp", "body": "chưa công bố"}
    c.patch(f"/api/labs/{lab['id']}", json={"version": lab_now["version"], "title": "Tên mới", "spec": {"blocks": [STEPS, QUIZ, draft_block]}})

    r = client.get(f"/api/share/{code}")
    assert r.status_code == 200
    assert "cl_viewer" in r.headers.get("set-cookie", "")
    body = r.json()
    assert body["title"] == "Con lắc đơn" and body["share_code"] == code
    assert [b["id"] for b in body["spec"]["blocks"]] == ["b1", "qz"]
    quiz = body["spec"]["blocks"][1]
    assert [q["id"] for q in quiz["questions"]] == ["q1", "q2", "q3", "q4", "q5"]  # q6 is not approved
    assert "analysis" not in body and "bí mật" not in r.text and "chưa công bố" not in r.text
    # answers, explanations and option feedback are withheld until the attempt is marked
    assert all(not set(q) & ANSWER_KEYS and q["approved"] is True for q in quiz["questions"])
    assert "T = 2π√(L/g)" not in r.text
    q3 = quiz["questions"][2]["options"]
    assert sorted(q3) == sorted(SOLVED_Q3) and q3 != SOLVED_Q3  # never shown solved
    assert quiz["questions"][3]["unit"] == "s"  # what the learner needs to answer stays
    same_language = client.get(f"/api/share/{code}?lang=vi").json()
    assert same_language["spec"] == body["spec"]  # the lab's own language: the same learner copy
    assert client.get(f"/api/share/{code.lower()}").status_code == 200  # codes are case-insensitive
    assert client.get("/api/share/ZZZZZZ").status_code == 404
    assert client.get("/api/share/not-a-code!").status_code == 404
    c.post(f"/api/labs/{lab['id']}/unpublish")
    assert client.get(f"/api/share/{code}").status_code == 404


def test_unknown_codes_are_rate_limited_per_ip(teacher, client, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS])
    monkeypatch.setattr(share_svc, "SHARE_MISSES_PER_HOUR", 3)
    assert [client.get(f"/api/share/{guess}").status_code for guess in ("AAAAAA", "BBBBBB", "CCCCCC")] == [404] * 3
    r = client.get("/api/share/DDDDDD")
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited"
    assert client.get(f"/api/share/{code}").status_code == 200  # real codes keep working


# ============================================================================ quiz scoring
def test_quiz_scored_on_server(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    shown = solved_q3(client, code)
    answers = [
        {"question_id": "q1", "answer": 0},  # right
        {"question_id": "q2", "answer": 0},  # wrong
        {"question_id": "q3", "answer": shown},  # right, in the order the options were shown
        {"question_id": "q4", "answer": "2,03"},  # right: Vietnamese decimal comma, within 2 %
        {"question_id": "q5", "answer": 0.0},  # right (exact zero)
        {"question_id": "q6", "answer": 1},  # unapproved: ignored, never revealed
    ]
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "phase": "pre", "display_name": "  Minh   Anh ", "answers": answers})
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["score"] == 4 and out["total"] == 5
    results = {res["question_id"]: res for res in out["results"]}
    assert list(results) == ["q1", "q2", "q3", "q4", "q5"]
    assert results["q2"] == {"question_id": "q2", "correct": False, "correct_answer": 1, "explanation": "",
                             "option_feedback": [], "tolerance": None}
    assert results["q1"]["explanation"] == "T = 2π√(L/g)" and results["q3"]["correct_answer"] == shown  # shown order
    assert results["q4"]["correct"] is True and results["q4"]["correct_answer"] == 2.01 and results["q4"]["tolerance"] == 0.02
    assert results["q5"]["tolerance"] == 0.0  # an exact zero
    assert "q6" not in r.text and "bí mật" not in r.text

    db = SessionLocal()
    try:
        row = db.get(QuizAttempt, out["id"])
        assert row.score == 4 and row.total == 5 and row.phase == "pre"
        assert row.user_id is None and row.viewer_key and row.display_name == "Minh Anh"
        assert row.answers_json[2] == {"question_id": "q3", "answer": [1, 0, 2], "correct": True}  # stored in snapshot order
        assert row.answers_json[3] == {"question_id": "q4", "answer": 2.03, "correct": True}
    finally:
        db.close()

    # the stored (solved) order sent as indices into the shown options is not a free right answer
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": [{"question_id": "q3", "answer": [1, 0, 2]}]})
    assert r.json()["results"][0]["correct"] is ([1, 0, 2] == shown)
    for broken in ([0, 1, 9], [0, 0, 1], "abc", None):
        r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": [{"question_id": "q3", "answer": broken}]})
        assert r.status_code == 201 and r.json()["results"][0]["correct"] is False
        assert r.json()["results"][0]["correct_answer"] == shown


@pytest.mark.parametrize(
    ("answer", "correct"),
    [(2.01, True), (2.05, True), (1.97, True), (2.06, False), ("2.0", True), ("1.234,5", False), ("abc", False), (None, False), (True, False), (float("nan"), False)],
)
def test_numeric_tolerance(teacher, client, answer, correct):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    payload = json.dumps({"block_id": "qz", "answers": [{"question_id": "q4", "answer": answer}]}, allow_nan=True)
    r = client.post(f"/api/share/{code}/quiz-attempts", content=payload, headers={"content-type": "application/json"})
    assert r.status_code == 201, r.text
    assert r.json()["results"][0]["correct"] is correct and r.json()["total"] == 1


def test_client_cannot_claim_a_score_or_answer_hidden_questions(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    ALL_RIGHT = all_right(client, code)
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "score": 5, "total": 5, "answers": ALL_RIGHT})
    assert r.status_code == 422
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": [{"question_id": "q1", "answer": 0, "correct": True}]})
    assert r.status_code == 422
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": [{"question_id": "q6", "answer": 1}]})
    assert r.status_code == 422 and r.json()["error"]["fields"] == {"answers": "no matching questions"}
    assert client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "b1", "answers": ALL_RIGHT}).status_code == 404
    assert client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "nope", "answers": ALL_RIGHT}).status_code == 404
    assert client.post("/api/share/ZZZZZZ/quiz-attempts", json={"block_id": "qz", "answers": ALL_RIGHT}).status_code == 404
    r = client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": ALL_RIGHT + [{"question_id": "q1", "answer": 2}]})
    assert r.json()["score"] == 5 and r.json()["total"] == 5  # a repeated id counts once (first answer)
    db = SessionLocal()
    try:
        assert db.query(QuizAttempt).count() == 1
    finally:
        db.close()


def test_signed_in_attempt_and_rate_limit(teacher, other_user, client):
    c, _ = teacher
    o, student = other_user
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    ALL_RIGHT = all_right(client, code)
    r = o.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "phase": "post", "answers": ALL_RIGHT})
    assert r.status_code == 201
    db = SessionLocal()
    try:
        row = db.get(QuizAttempt, r.json()["id"])
        assert row.user_id == student["id"] and row.viewer_key is None
    finally:
        db.close()
    client.get(f"/api/share/{code}")
    codes = [
        client.post(f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "answers": ALL_RIGHT[:1]}).status_code
        for _ in range(61)
    ]
    assert codes[:60] == [201] * 60 and codes[60] == 429


# ============================================================================ feedback
def test_feedback(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS])
    client.get(f"/api/share/{code}")  # learners open the lab first (gets the viewer cookie)
    r = client.post(f"/api/share/{code}/feedback", json={"rating": 5, "comment": "  Dễ hiểu, cảm ơn cô!  "})
    assert r.status_code == 201
    assert r.json()["rating"] == 5 and r.json()["comment"] == "Dễ hiểu, cảm ơn cô!" and r.json()["id"]
    assert client.post(f"/api/share/{code}/feedback", json={"rating": 6}).status_code == 422
    assert client.post(f"/api/share/{code}/feedback", json={"rating": 3, "user_id": "x"}).status_code == 422
    assert client.post("/api/share/ZZZZZZ/feedback", json={"rating": 3}).status_code == 404
    codes = [client.post(f"/api/share/{code}/feedback", json={"rating": 4}).status_code for _ in range(10)]
    assert codes[:9] == [201] * 9 and codes[9] == 429  # 10 per hour (one already sent)


def test_anonymous_ip_ceiling_stops_cookie_rotation(teacher, make_client, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS])
    monkeypatch.setattr(share_svc, "ANON_FEEDBACK_PER_IP_HOUR", 3)
    statuses = []
    for _ in range(4):
        fresh = make_client()  # a new browser profile each time, same IP
        fresh.get(f"/api/share/{code}")
        statuses.append(fresh.post(f"/api/share/{code}/feedback", json={"rating": 4}).status_code)
    assert statuses == [201, 201, 201, 429]


# ============================================================================ clone
def test_clone_only_public_or_demo(teacher, other_user, client):
    c, _ = teacher
    o, student = other_user
    private = create_lab(c, title="Bài của lớp 10A")
    public = create_lab(c, title="Con lắc công khai")
    code_private = publish(c, private["id"], [STEPS])
    code_public = publish(c, public["id"], [STEPS, QUIZ], "public")
    # draft edits after publishing must not leak into copies
    version = c.get(f"/api/labs/{public['id']}").json()["version"]
    c.patch(f"/api/labs/{public['id']}", json={"version": version, "spec": {"blocks": [STEPS, QUIZ, {"id": "secret", "type": "text", "body": "nháp"}]}})

    r = o.post(f"/api/share/{code_private}/clone")
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
    assert client.post(f"/api/share/{code_public}/clone").status_code == 401
    r = o.post(f"/api/share/{code_public}/clone")
    assert r.status_code == 201, r.text
    copy = r.json()
    assert copy["id"] != public["id"] and copy["status"] == "draft" and copy["owner"]["id"] == student["id"]
    assert copy["title"] == "Con lắc công khai (bản sao)"
    assert [b["id"] for b in copy["spec"]["blocks"]] == ["b1", "qz"]
    assert [q["id"] for q in copy["spec"]["blocks"][1]["questions"]] == ["q1", "q2", "q3", "q4", "q5"]
    assert copy["analysis"]["status"] == "none"
    assert o.get("/api/labs").json()["total"] == 1

    set_lab(private["id"], is_demo=True)
    assert o.post(f"/api/share/{code_private}/clone").status_code == 201  # demo labs are templates


# ============================================================================ results
def test_results_are_aggregates_only(teacher, other_user, make_client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    code = publish(c, lab["id"], [STEPS, QUIZ])
    learners = [make_client() for _ in range(3)]
    for learner in learners:
        learner.get(f"/api/share/{code}")
    a, b, d = learners
    post = lambda who, phase, answers, name=None: who.post(  # noqa: E731
        f"/api/share/{code}/quiz-attempts", json={"block_id": "qz", "phase": phase, "answers": answers, "display_name": name}
    )
    assert post(a, "pre", [{"question_id": "q1", "answer": 1}, {"question_id": "q2", "answer": 1}], "Nguyễn Văn An").status_code == 201
    assert post(b, "pre", [{"question_id": "q1", "answer": 0}, {"question_id": "q2", "answer": 0}]).status_code == 201
    assert post(a, "post", all_right(a, code), "Nguyễn Văn An").status_code == 201
    assert post(d, "practice", [{"question_id": "q1", "answer": 0}]).status_code == 201
    for who, rating, comment in ((a, 5, "Rất hay"), (b, 4, None), (d, 2, "Hơi khó")):
        assert who.post(f"/api/share/{code}/feedback", json={"rating": rating, "comment": comment}).status_code == 201
    db = SessionLocal()
    try:
        long_question = "Tại sao " + "chu kỳ " * 60
        for text, channel, role in (("Vì sao L tăng thì T tăng?", "share", "user"), (long_question, "share", "user"), ("Câu trả lời", "share", "assistant"), ("Studio", "studio", "user")):
            db.add(ChatMessage(lab_id=lab["id"], viewer_key="v", channel=channel, role=role, content=text))
        db.commit()
    finally:
        db.close()

    r = c.get(f"/api/labs/{lab['id']}/results")
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["lab_id"] == lab["id"] and res["attempts_total"] == 4
    assert res["by_phase"]["pre"] == {"count": 2, "avg_pct": 50.0}  # 1/2 and 1/2
    assert res["by_phase"]["post"] == {"count": 1, "avg_pct": 100.0}
    assert res["by_phase"]["practice"] == {"count": 1, "avg_pct": 100.0}
    stats = {q["question_id"]: q for q in res["questions"]}
    assert list(stats) == ["q1", "q2", "q3", "q4", "q5"]
    assert stats["q1"] == {"block_id": "qz", "question_id": "q1", "prompt": "Chu kỳ phụ thuộc vào?", "attempts": 4, "correct": 3, "correct_rate": 0.75}
    assert stats["q2"]["attempts"] == 3 and stats["q2"]["correct"] == 2
    assert stats["q3"]["attempts"] == 1 and stats["q5"]["correct_rate"] == 1.0
    assert res["feedback_count"] == 3 and res["feedback_avg"] == pytest.approx(3.67, abs=0.01)
    assert res["feedback_distribution"] == {"1": 0, "2": 1, "3": 0, "4": 1, "5": 1}
    assert len(res["recent_feedback"]) == 3 and set(res["recent_feedback"][0]) == {"id", "rating", "comment", "created_at"}
    assert res["tutor_questions"] == 2
    assert "Vì sao L tăng thì T tăng?" in res["recent_tutor_questions"]
    assert max(len(t) for t in res["recent_tutor_questions"]) <= 200
    assert "Nguyễn Văn An" not in r.text  # never lists or ranks individual learners
    assert o.get(f"/api/labs/{lab['id']}/results").status_code == 404


def test_results_empty_and_guest(teacher, client):
    c, _ = teacher
    lab = create_lab(c)
    res = c.get(f"/api/labs/{lab['id']}/results").json()
    assert res["attempts_total"] == 0 and res["questions"] == [] and res["feedback_avg"] is None
    assert res["by_phase"]["pre"] == {"count": 0, "avg_pct": None}
    assert res["feedback_distribution"] == {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
    assert client.get(f"/api/labs/{lab['id']}/results").status_code == 401


def test_register_helper_available(make_client):
    # Sanity check that a second teacher can publish independently (codes never collide).
    t2 = make_client()
    register(t2, "t2@example.com", "teacher", "Thầy Bình")
    lab = create_lab(t2)
    assert len(publish(t2, lab["id"], [STEPS])) == 6


# ============================================================================ widget render routes
def test_widget_render_routes(teacher, other_user, client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    page = "<!doctype html><html><head><title>w</title></head><body><p>Xin chào</p><script>1+1</script></body></html>"
    approved = {"id": "w1", "type": "widget", "prompt": "…", "html": page, "status": "validated", "approved": True}
    draft = {"id": "w2", "type": "widget", "prompt": "…", "html": page.replace("Xin chào", "Bản nháp"), "status": "draft"}
    code = publish(c, lab["id"], [STEPS, approved, draft])

    r = client.get(f"/api/share/{code}/widgets/w1/render")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    assert "sandbox allow-scripts" in r.headers["content-security-policy"]
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert "cl-widget" in r.text and "Xin chào" in r.text
    assert client.get(f"/api/share/{code}/widgets/w2/render").status_code == 404  # never published
    assert client.get(f"/api/share/{code}/widgets/b1/render").status_code == 404
    assert client.get("/api/share/ZZZZZZ/widgets/w1/render").status_code == 404

    own = c.get(f"/api/labs/{lab['id']}/widgets/w2/render")  # the author validates drafts
    assert own.status_code == 200 and "Bản nháp" in own.text and "sandbox" in own.headers["content-security-policy"]
    assert o.get(f"/api/labs/{lab['id']}/widgets/w2/render").status_code == 404
    assert client.get(f"/api/labs/{lab['id']}/widgets/w2/render").status_code == 401
