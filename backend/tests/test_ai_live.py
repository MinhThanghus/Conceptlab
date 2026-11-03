"""Live tests against the real Meta Model API (marker ``live``).

Run:  RUN_LIVE_AI=1 .venv/Scripts/python.exe -m pytest tests/test_ai_live.py -s
(the key is read from backend/.env and never printed). Every AI feature runs end to end
through the real routes, services, media processing and models. Assertions check structure
and sanity (shapes, ranges, provenance, citations, validation), never wording. Each call's
latency is printed and summarised at the end of the module.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import pytest

from app.ai import client as ai_client
from app.ai.client import MetaAIClient, set_ai
from app.schemas.spec import LabSpec
from app.services import generation, quiz_gen, segmentation, widgets
from app.services.expr import compile_expr
from tests.conftest import create_lab
from tests.test_ai_offline import EXACT_QUOTE, patch_lab, pendulum_analysis, publish, sse_events, upload

pytestmark = pytest.mark.live

FIX = Path(__file__).resolve().parent / "fixtures"
SEED = Path(__file__).resolve().parents[1] / "app" / "seed" / "assets"
TIMINGS: list[tuple[str, float, int]] = []
LOCATED = {"exact", "approximate", "none"}


class LoopSafeClient(MetaAIClient):
    """Real client that opens a fresh connection pool per event loop (each TestClient runs
    the app in its own loop, and pooled connections cannot move between loops)."""

    _loop = None

    def _http(self):
        loop = asyncio.get_running_loop()
        if self._client is not None and self._loop is not loop:
            self._client = None
        self._loop = loop
        return super()._http()


@pytest.fixture
def live_ai():
    """Request it AFTER the client fixtures so it is torn down first."""
    previous = ai_client._client
    client = LoopSafeClient()
    if not client.settings.ai_configured:
        pytest.skip("MODEL_API_KEY is not configured")
    set_ai(client)
    segmentation._PHRASE_CACHE.clear()
    yield client
    set_ai(previous)


@pytest.fixture(scope="module", autouse=True)
def _latency_report():
    yield
    if TIMINGS:
        say("\n\nLIVE AI LATENCIES (end-to-end HTTP, including media processing)")
        for label, seconds, status in TIMINGS:
            say(f"  {label:<34} {seconds:7.1f} s   HTTP {status}")


def say(*parts) -> None:
    """print() that works on any console (Windows consoles/redirects may not encode Vietnamese)."""
    encoding = getattr(sys.stdout, "encoding", None) or "utf-8"
    text = " ".join(str(part) for part in parts)
    print(text.encode(encoding, "backslashreplace").decode(encoding), flush=True)


def timed(label: str, call, *args, **kwargs):
    started = time.perf_counter()
    response = call(*args, **kwargs)
    elapsed = time.perf_counter() - started
    TIMINGS.append((label, elapsed, response.status_code))
    say(f"\nLIVE {label}: {elapsed:.1f} s (HTTP {response.status_code})")
    return response


def ok(response):
    assert response.status_code in (200, 201), response.text[:2000]
    return response.json()


def all_refs(node, out=None):
    out = [] if out is None else out
    if isinstance(node, dict):
        if "located" in node and "source_id" in node:
            out.append(node)
        for value in node.values():
            all_refs(value, out)
    elif isinstance(node, list):
        for item in node:
            all_refs(item, out)
    return out


def in_unit(box) -> bool:
    return len(box) == 4 and all(0 <= v <= 1 for v in box) and box[0] < box[2] and box[1] < box[3]


# ============================================================================ School2Lab analysis
def test_live_analyze_textbook_photo_and_measurements(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, title="Con lắc đơn", topic="Chu kỳ dao động của con lắc đơn")
    page = upload(c, lab["id"], (SEED / "pendulum_textbook_page.png").read_bytes(), "sgk_con_lac.png")
    photo = upload(c, lab["id"], (SEED / "pendulum_classroom_photo.jpg").read_bytes(), "anh_lop.jpg")
    data = ok(c.post(f"/api/labs/{lab['id']}/sources/data",
                     json={"title": "Số đo của lớp", "values": [{"symbol": "L", "name": "chiều dài dây", "value": 0.5, "unit": "m"}]}))
    body = ok(timed("analyze (2 images + data)", c.post, f"/api/labs/{lab['id']}/ai/analyze",
                    json={"source_ids": [page["id"], photo["id"], data["id"]]}))
    analysis = body["analysis"]
    result = analysis["result"]
    assert analysis["status"] == "done" and analysis["model"] == "muse-spark-1.3-contributor"
    assert result["topic"] and result["summary"]
    expressions = [f["expression"] for f in result["formulas"] if f["expression"]]
    assert expressions, result["formulas"]
    for expression in expressions:
        compile_expr(expression)  # stored expressions always compile
    length = next(v for v in result["variables"] if v["symbol"] == "L")
    assert length["value"] == 0.5 and length["provenance"] == "user" and length["source_ref"]["source_id"] == data["id"]
    for variable in result["variables"]:
        assert variable["provenance"] in {"document", "user", "assumption", "unknown"}
        if variable["provenance"] == "unknown":
            assert variable["value"] is None
    assert result["objects"] and all(o["sam_phrase"].isascii() for o in result["objects"])
    assert any(o["sam_phrase"] for o in result["objects"])
    refs = all_refs(result)
    assert refs and all(r["located"] in LOCATED for r in refs)
    for r in refs:
        if r["bbox"] is not None:
            assert in_unit(r["bbox"]) and r["located"] in {"exact", "approximate"}
    assert any(s["type"] == "simulation" and s["model"] == "pendulum" for s in result["suggested_blocks"]), result["suggested_blocks"]
    say("  formulas:", [f["latex"] for f in result["formulas"]][:3], "| objects:", [o["sam_phrase"] for o in result["objects"]][:4])


# ============================================================================ Paper2Explorer
def test_live_paper_structure_and_explore_equation(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, space="paper2explorer", title="Attention Is All You Need", subject="computer_science",
                     grade="university", language="en", goal="explore_paper")
    pdf = upload(c, lab["id"], (FIX / "attention_paper.pdf").read_bytes(), "attention.pdf")
    body = ok(timed("paper-structure", c.post, f"/api/labs/{lab['id']}/ai/paper-structure", json={"source_id": pdf["id"]}))
    paper = body["analysis"]["paper"]
    assert paper["title"] and paper["equations"], paper
    refs = all_refs(paper)
    assert refs and all(r["located"] in LOCATED for r in refs)
    exact = [r for r in refs if r["located"] == "exact"]
    assert exact and all(in_unit(r["bbox"]) and r["page"] in (1, 2) for r in exact)  # verbatim quotes found in the text layer
    attention = next((e for e in paper["equations"] if "softmax" in e["latex"].lower()), paper["equations"][0])
    out = ok(timed("explore-equation", c.post, f"/api/labs/{lab['id']}/ai/explore-equation", json={"equation_id": attention["id"]}))
    assert out["equation"]["id"] == attention["id"] and out["notes"]
    block = out["block"]
    assert block is not None, out["notes"]
    LabSpec.model_validate({"blocks": [block]})
    assert block["ai_generated"] is True and block["confirmed"] is False
    if block["type"] == "algorithm":
        config = block["config"]
        n = len(config["tokens"])
        assert block["algorithm"] == "attention" and 2 <= n <= 4
        assert len(config["Q"]) == len(config["K"]) == len(config["V"]) == n
        assert len(config["Q"][0]) == len(config["K"][0]) >= 2 and len(config["V"][0]) >= 2
    say("  equations:", len(paper["equations"]), "| exact refs:", len(exact), "of", len(refs), "| block:", block["type"])


# ============================================================================ block generation + quiz
def test_live_generate_blocks_and_quiz(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, title="Con lắc đơn", topic="Chu kỳ con lắc đơn")
    data = ok(c.post(f"/api/labs/{lab['id']}/sources/data",
                     json={"title": "Số đo", "values": [{"symbol": "L", "name": "chiều dài dây", "value": 0.5, "unit": "m"}]}))
    reviewed = pendulum_analysis(data["id"])
    reviewed["result"]["formulas"][0]["description"] = "Ví dụ trong sách: L = 1 m, g = 9,8 m/s² thì T ≈ 2,01 s."
    patch_lab(c, lab["id"], analysis=reviewed)
    out = ok(timed("generate steps+simulation+quiz", c.post, f"/api/labs/{lab['id']}/ai/generate",
                   json={"block_types": ["steps", "simulation", "quiz"]}))
    spec = out["lab"]["spec"]
    LabSpec.model_validate(spec)
    blocks = {b["type"]: b for b in spec["blocks"]}
    assert set(blocks) == {"steps", "simulation", "quiz"}, out["warnings"]
    assert len(blocks["steps"]["steps"]) >= 2 and blocks["steps"]["sequence_confirmed"] is True
    sim = blocks["simulation"]
    params = {p["symbol"]: p for p in sim["params"]}
    assert sim["model"] == "pendulum" and set(params) == {"L", "g", "theta0"}
    assert params["L"]["value"] == 0.5 and params["L"]["provenance"] == "user"
    assert all(p["min"] <= p["value"] <= p["max"] and p["step"] > 0 for p in params.values())
    assert all(case["output"] in generation.SIM_MODELS["pendulum"]["outputs"] for case in sim["reference_cases"])
    questions = blocks["quiz"]["questions"]
    assert questions and all(q["approved"] is False for q in questions)
    assert all(b["ai_generated"] is True and b["confirmed"] is False for b in spec["blocks"])
    assert spec["summary"] and spec["objectives"]
    report = ok(c.post(f"/api/labs/{lab['id']}/validate"))
    assert [check for check in report["checks"] if check["status"] == "fail"] == []

    quiz = ok(timed("quiz (3 questions)", c.post, f"/api/labs/{lab['id']}/ai/quiz",
                    json={"count": 3, "kinds": ["mcq", "truefalse", "numeric"]}))["questions"]
    assert 1 <= len(quiz) <= 3 and all(q["approved"] is False and q["kind"] in {"mcq", "truefalse", "numeric"} for q in quiz)
    LabSpec.model_validate({"blocks": [{"id": "q", "type": "quiz", "questions": quiz}]})
    # engaging questions: a thinking level, feedback that lines up with the options, hints that keep the answer back
    for q in questions + quiz:
        assert q["cognitive_level"] in (None, "recall", "understand", "apply", "extend")
        expected = {"mcq": len(q["options"]), "truefalse": 2}.get(q["kind"], 0)
        assert not q["option_feedback"] or len(q["option_feedback"]) == expected, q
        assert all(len(note) <= 400 for note in q["option_feedback"])
        assert not (q["hint"] and quiz_gen.hint_reveals(q["hint"], q)), q
    say("  quiz levels:", [q["cognitive_level"] for q in questions], "| hints:", sum(bool(q["hint"]) for q in questions))
    say("  warnings:", out["warnings"], "| reference cases:", sim["reference_cases"])

    paper_lab = create_lab(c, space="paper2explorer", title="Scaled dot-product attention", subject="computer_science",
                           grade="university", language="en")
    patch_lab(c, paper_lab["id"], analysis={"status": "done", "result": {
        "topic": "Scaled dot-product attention", "summary": "Attention weights are softmax(QK^T / sqrt(d_k)) and mix the values V.",
        "formulas": [{"id": "f1", "latex": "\\mathrm{softmax}(QK^T/\\sqrt{d_k})V"}],
        "suggested_blocks": [{"type": "algorithm", "algorithm": "attention"}]}})
    out = ok(timed("generate algorithm (attention)", c.post, f"/api/labs/{paper_lab['id']}/ai/generate", json={"block_types": ["algorithm"]}))
    block = out["lab"]["spec"]["blocks"][0]
    config = block["config"]
    assert block["type"] == "algorithm" and block["algorithm"] == "attention"
    assert len(config["tokens"]) == len(config["Q"]) == len(config["K"]) == len(config["V"]) >= 2


# ============================================================================ video
def test_live_video_markers_and_tracking(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, subject="pe", title="Chuyền bóng thấp tay", topic="Bóng chuyền: đệm bóng")
    started = time.perf_counter()
    video = upload(c, lab["id"], (SEED / "volleyball_practice.mp4").read_bytes(), "tap_dem_bong.mp4",
                   contains_people=True, consent_confirmed=True)
    TIMINGS.append(("upload + transcode video", time.perf_counter() - started, 201))
    assert video["status"] == "ready", video
    duration = video["duration_ms"] / 1000
    out = ok(timed("video-markers", c.post, f"/api/labs/{lab['id']}/ai/video-markers", json={"source_id": video["id"]}))
    markers = out["markers"]
    assert markers and out["limits"]
    assert all(m["ai_suggested"] is True and m["confirmed"] is False and 0 <= m["t"] <= duration for m in markers)
    assert [m["t"] for m in markers] == sorted(m["t"] for m in markers)
    out = ok(timed("track (Vietnamese phrase)", c.post, f"/api/labs/{lab['id']}/ai/track",
                   json={"source_id": video["id"], "phrase": "quả bóng vàng"}))
    track = out["track"]
    assert track["phrase"] == "quả bóng vàng" and track["frames"]
    assert [f["t"] for f in track["frames"]] == sorted(f["t"] for f in track["frames"])
    assert all(in_unit(box) for f in track["frames"] for box in f["boxes"])
    assert out["frames_with_objects"] >= len(track["frames"]) // 2, out["frames_with_objects"]
    say("  markers:", [(m["t"], m["label"]) for m in markers], "| frames with the ball:", out["frames_with_objects"], "/", len(track["frames"]))


# ============================================================================ SAM + diagram
def test_live_segment_phrase_and_point(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c)
    photo = upload(c, lab["id"], (SEED / "pendulum_classroom_photo.jpg").read_bytes(), "con_lac.jpg")
    out = ok(timed("segment phrase 'red ball'", c.post, f"/api/labs/{lab['id']}/ai/segment",
                   json={"source_id": photo["id"], "phrase": "red ball"}))
    assert (out["width"], out["height"]) == (1200, 900) and out["phrase_used"] == "red ball"

    def near_ball(obj) -> bool:
        x1, y1, x2, y2 = obj["box"]
        return abs((x1 + x2) / 2 - 725) < 40 and abs((y1 + y2) / 2 - 573) < 40 and 40 < x2 - x1 < 200

    assert any(near_ball(o) for o in out["objects"]), out["objects"]
    assert all(o["mask"] is None or o["mask"]["payload"] for o in out["objects"])
    out = ok(timed("segment point", c.post, f"/api/labs/{lab['id']}/ai/segment",
                   json={"source_id": photo["id"], "points": [{"x": 725, "y": 573}]}))
    assert out["objects"], out
    x1, y1, x2, y2 = out["objects"][0]["box"]
    assert x1 <= 725 <= x2 and y1 <= 573 <= y2


def test_live_diagram_hotspots(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, subject="biology", grade="8", title="Hệ tuần hoàn", topic="Vòng tuần hoàn lớn và nhỏ")
    image = upload(c, lab["id"], (SEED / "circulatory_diagram.png").read_bytes(), "tuan_hoan.png")
    out = ok(timed("diagram (Muse + SAM refine)", c.post, f"/api/labs/{lab['id']}/ai/diagram", json={"source_id": image["id"]}))
    hotspots = out["hotspots"]
    assert len(hotspots) >= 3 and all(in_unit(h["bbox"]) and h["label"] for h in hotspots)
    ids = {h["id"] for h in hotspots}
    assert all(r["source"] in ids and r["target"] in ids for r in out["relations"])
    lungs = [0.36, 0.07, 0.64, 0.23]  # where the lungs sit in the figure (it prints no words)

    def overlaps(box) -> bool:
        return min(box[2], lungs[2]) > max(box[0], lungs[0]) and min(box[3], lungs[3]) > max(box[1], lungs[1])

    assert any(overlaps(h["bbox"]) for h in hotspots), hotspots
    assert set(out["masks"]) <= ids
    LabSpec.model_validate({"blocks": [{"id": "d", "type": "diagram", "image": out["image"], "hotspots": hotspots, "relations": out["relations"]}]})
    say("  hotspots:", [h["label"] for h in hotspots], "| refined by SAM:", len(out["masks"]))


# ============================================================================ widgets, translation, cover, field
def test_live_widget_static_checks_and_render(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, title="Con lắc đơn")
    out = ok(timed("widget", c.post, f"/api/labs/{lab['id']}/ai/widget",
                   json={"description": "Một thanh trượt chiều dài dây L từ 0,2 m đến 2 m và hiển thị chu kỳ T = 2π√(L/g) với g = 9,81 m/s²."}))
    html = out["html"]
    assert "<html" in html.lower() and len(html.encode()) <= widgets.MAX_BYTES
    assert [c_.model_dump() for c_ in widgets.check_html(html, "vi")] == out["checks"]
    assert out["status"] == "validated", [ch for ch in out["checks"] if ch["status"] == "fail"]
    patch_lab(c, lab["id"], spec={"blocks": [{"id": "w1", "type": "widget", "prompt": "…", "html": html, "status": out["status"]}]})
    r = c.get(f"/api/labs/{lab['id']}/widgets/w1/render")
    assert r.status_code == 200 and r.headers["content-security-policy"] == widgets.WIDGET_CSP and "cl-widget" in r.text


def test_live_translate_vi_to_en(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c)
    spec = {
        "summary": "Khám phá vì sao chu kỳ $T = 2\\pi\\sqrt{L/g}$ của con lắc đơn chỉ phụ thuộc chiều dài dây.",
        "objectives": ["Giải thích ảnh hưởng của chiều dài dây đến chu kỳ"],
        "blocks": [{"id": "s", "type": "steps", "title": "Các bước thí nghiệm", "steps": [
            {"id": "s1", "title": "Kéo lệch quả nặng", "body": "Kéo quả nặng lệch một góc nhỏ rồi thả nhẹ tay."},
            {"id": "s2", "title": "Đo thời gian", "body": "Bấm giờ 10 dao động rồi chia cho 10."}]},
            {"id": "q", "type": "quiz", "title": "Câu hỏi", "questions": [
                {"id": "q1", "kind": "truefalse", "prompt": "Quả nặng hơn thì chu kỳ dài hơn.", "options": ["Đúng", "Sai"], "answer_index": 1}]}],
    }
    patch_lab(c, lab["id"], spec=spec)
    out = ok(timed("translate vi→en", c.post, f"/api/labs/{lab['id']}/ai/translate", json={"target": "en"}))
    translated = out["spec"]
    LabSpec.model_validate(translated)
    assert "$T = 2\\pi\\sqrt{L/g}$" in translated["summary"] and translated["summary"] != spec["summary"]
    steps = translated["blocks"][0]["steps"]
    assert [s["id"] for s in steps] == ["s1", "s2"] and steps[0]["title"] != spec["blocks"][0]["steps"][0]["title"]
    assert "10" in steps[1]["body"]
    assert translated["blocks"][1]["questions"][0]["options"] == ["True", "False"]
    assert translated["glossary"] and all(g["vi"] and g["en"] for g in translated["glossary"])
    say("  summary:", translated["summary"])


def test_live_cover_image(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, topic="Dao động của con lắc đơn")
    asset = ok(timed("cover image", c.post, f"/api/labs/{lab['id']}/ai/cover", json={}))
    assert asset["kind"] == "cover" and asset["ai_generated"] is True and asset["width"] and asset["height"]
    file = c.get(asset["url"])
    assert file.status_code == 200 and file.headers["content-type"].startswith("image/") and len(file.content) > 5000
    assert c.get(f"/api/labs/{lab['id']}").json()["cover_url"] == asset["url"]


def test_live_field_scenario(teacher, live_ai):
    c, _ = teacher
    lab = create_lab(c, subject="pe", title="Bóng chuyền: phối hợp chuyền hai")
    out = ok(timed("field-scenario", c.post, f"/api/labs/{lab['id']}/ai/field-scenario",
                   json={"sport": "volleyball", "description": "Đỡ bước một, chuyền hai cho đồng đội đập bóng ở vị trí số 4."}))
    assert out["prompt"] and 1 <= len(out["frames"]) <= 8
    for frame in out["frames"]:
        assert sum(p["team"] == "A" for p in frame["players"]) <= 6 and sum(p["team"] == "B" for p in frame["players"]) <= 6
        assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in frame["players"])
    LabSpec.model_validate({"blocks": [{"id": "f", "type": "field", "sport": "volleyball", "frames": out["frames"]}]})


# ============================================================================ active learning + voice
def test_live_explain_change_and_prediction_feedback(teacher, client, live_ai):
    c, _ = teacher
    lab = create_lab(c)
    block = {"id": "g1", "type": "graph", "title": "Chu kỳ theo chiều dài", "expression": "2*pi*sqrt(L/g)", "x_var": "L",
             "x_min": 0.1, "x_max": 2, "params": [{"symbol": "g", "unit": "m/s²", "value": 9.81, "min": 1, "max": 20, "step": 0.1}],
             "active": {"question": "Nếu g giảm từ 9,81 xuống 1,62 (Mặt Trăng) thì chu kỳ thay đổi thế nào?", "param": "g",
                        "from_value": 9.81, "to_value": 1.62, "observe": "y_max", "options": ["Tăng", "Giảm", "Không đổi"],
                        "correct_option": 0}}
    code = publish(c, lab["id"], [block])
    out = ok(timed("explain-change (share)", client.post, f"/api/share/{code}/ai/explain-change",
                   json={"block_id": "g1", "before": {"g": 9.81, "T_at_L_1m": 2.006}, "after": {"g": 1.62, "T_at_L_1m": 4.937}}))
    assert len(out["explanation"]) > 20
    out = ok(timed("prediction-feedback (share)", client.post, f"/api/share/{code}/ai/prediction-feedback",
                   json={"block_id": "g1", "prediction": "Tăng", "observed": {"before": 2.006, "after": 4.937},
                         "reasoning": "Vì g nhỏ thì vật rơi chậm hơn"}))
    assert out["correct"] is True and len(out["feedback"]) > 20


def test_live_transcribe(teacher, live_ai):
    client, _ = teacher  # anonymous callers need a shared lesson's code
    r = timed("transcribe (4.4 s WAV)", client.post, "/api/ai/transcribe",
              files={"audio": ("speech_en.wav", (FIX / "speech_en.wav").read_bytes(), "audio/wav")}, data={"lang": "en"})
    out = ok(r)
    words = [w for w in out["transcript"].split() if any(ch.isalpha() for ch in w)]
    assert len(words) >= 3, out
    say("  transcript:", out["transcript"])


# ============================================================================ tutor chat
def test_live_chat_streams_a_cited_answer(teacher, make_client, live_ai):
    c, _ = teacher
    lab = create_lab(c, space="paper2explorer", title="Attention", subject="computer_science", grade="university", language="en")
    pdf = upload(c, lab["id"], (FIX / "attention_paper.pdf").read_bytes(), "attention.pdf")
    block = {"id": "b1", "type": "steps", "title": "Scaled dot-product attention", "steps": [
        {"id": "s1", "title": "Scale the scores", "body": "Divide the dot products by sqrt(d_k), then apply softmax.",
         "source_refs": [{"source_id": pdf["id"], "page": 1, "quote": EXACT_QUOTE, "located": "exact"}]}]}
    code = publish(c, lab["id"], [block])
    learner = make_client()
    r = timed("chat (share, SSE)", learner.post, f"/api/share/{code}/chat",
              json={"message": "Why are the dot products divided by sqrt(d_k)?", "context": {"block_id": "b1", "item_id": "s1"}})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = sse_events(r.text)
    assert events[-1][0] == "done", events[-3:]
    assert sum(e == "delta" for e, _ in events) >= 1
    done = events[-1][1]
    assert done["content"] and done["citations"], done
    for citation in done["citations"]:
        assert citation["source_id"] == pdf["id"] and citation["located"] in LOCATED and f"[{citation['n']}]" in done["content"]
    assert any(cit["located"] == "exact" and cit["page"] in (1, 2) and in_unit(cit["bbox"]) for cit in done["citations"])
    history = learner.get(f"/api/share/{code}/chat").json()
    assert [m["role"] for m in history] == ["user", "assistant"] and history[1]["citations"] == done["citations"]
    say("  answer:", json.dumps(done["content"][:300], ensure_ascii=False), "| citations:", [cit["n"] for cit in done["citations"]])
