"""Pre-publication checks (services/validation.py): every check, pass and fail/warn cases."""

from __future__ import annotations

import copy
import json

import pytest

from app.models import Asset, Lab, Source
from app.services.labs import validate_spec
from app.services.validation import CHECK_CODES, validate_lab
from tests.conftest import create_lab

STEPS = {"id": "st", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Kéo lệch", "body": "…"}]}

GRAPH = {
    "id": "g1",
    "type": "graph",
    "title": "Parabol",
    "expression": "a*x^2 + b*x + c",
    "x_min": -10,
    "x_max": 10,
    "params": [
        {"symbol": "a", "value": 1, "min": -5, "max": 5, "step": 0.1, "provenance": "user"},
        {"symbol": "b", "value": 0, "min": -10, "max": 10, "step": 0.1, "provenance": "user"},
        {"symbol": "c", "value": 0, "min": -10, "max": 10, "step": 0.1, "provenance": "user"},
    ],
}

PENDULUM = {
    "id": "p1",
    "type": "simulation",
    "title": "Con lắc đơn",
    "model": "pendulum",
    "params": [
        {"symbol": "L", "unit": "m", "value": 1, "min": 0.1, "max": 3, "step": 0.01, "provenance": "user"},
        {"symbol": "g", "unit": "m/s²", "value": 9.81, "min": 1, "max": 25, "step": 0.01, "role": "constant", "provenance": "assumption"},
        {"symbol": "theta0", "unit": "°", "value": 10, "min": 1, "max": 80, "step": 1, "provenance": "user"},
    ],
    "reference_cases": [{"inputs": {"L": 1, "g": 9.81}, "output": "period", "expected": 2.006, "tolerance": 0.01}],
}


def make_lab(blocks, sources=(), assets=()) -> Lab:
    lab = Lab(id="lab1", spec_json=validate_spec({"blocks": blocks}), language="vi")
    lab.sources = list(sources)
    lab.assets = list(assets)
    return lab


def run(blocks, sources=(), assets=()):
    return validate_lab(None, make_lab(blocks, sources, assets))


def checks_for(report, code, block_id=None):
    return [c for c in report.checks if c.code == code and (block_id is None or c.block_id == block_id)]


def one(report, code, block_id=None):
    found = checks_for(report, code, block_id)
    assert len(found) == 1, (code, block_id, [c.model_dump() for c in report.checks])
    return found[0]


def edit(block, **changes):
    out = copy.deepcopy(block)
    out.update(changes)
    return out


def edit_param(block, which, **changes):
    out = copy.deepcopy(block)
    for p in out["params"]:
        if p["symbol"] == which:
            p.update(changes)
    return out


# ----------------------------------------------------------------------------- lab level
def test_good_lab_passes_and_report_is_json_safe():
    report = run([STEPS, GRAPH, PENDULUM])
    assert report.ok
    assert {c.code for c in report.checks} <= set(CHECK_CODES)
    assert all(c.status in ("pass", "warn", "skip", "fail") for c in report.checks)
    assert all(c.message for c in report.checks)
    json.dumps(report.model_dump(mode="json"), allow_nan=False)
    assert one(report, "blocks_present").block_id is None


def test_blocks_present():
    assert one(run([]), "blocks_present").status == "fail"
    hidden = {"id": "q", "type": "quiz", "questions": [{"id": "q1", "prompt": "?", "options": ["a", "b"], "answer_index": 0}]}
    check = one(run([hidden]), "blocks_present")
    assert check.status == "fail" and check.detail == {"blocks": 1, "visible_blocks": 0}
    assert one(run([STEPS]), "blocks_present").status == "pass"


def test_consent():
    with_people = Source(id="v1", kind="video", title="Bài tập", status="ready", contains_people=True, consent_confirmed=False)
    report = run([STEPS], sources=[with_people])
    check = one(report, "consent")
    assert check.status == "fail" and check.detail["source_ids"] == ["v1"] and not report.ok
    with_people.consent_confirmed = True
    assert one(run([STEPS], sources=[with_people]), "consent").status == "pass"


def test_duplicate_block_ids_fail():
    report = run([STEPS, edit(STEPS, title="copy")])
    assert one(report, "block_ids_unique").status == "fail" and not report.ok
    assert not checks_for(run([STEPS]), "block_ids_unique")


# ----------------------------------------------------------------------------- graph
def test_expression_parses():
    report = run([edit(GRAPH, expression="a*x^ + ")])
    check = one(report, "expression_parses", "g1")
    assert check.status == "fail" and check.detail["error"] == "unexpected_token"
    assert one(report, "expression_vars", "g1").status == "skip"
    assert one(run([edit(GRAPH, expression="")]), "expression_parses").status == "fail"


def test_expression_vars_unknown_variable_fails():
    report = run([edit(GRAPH, expression="a*x^2 + k*x + c")])
    check = one(report, "expression_vars", "g1")
    assert check.status == "fail" and check.detail["unknown"] == ["k"] and not report.ok
    # constants and the x variable are fine; x_var can be renamed
    renamed = edit(GRAPH, expression="a*t^2 + b*t + c + pi + e", x_var="t")
    assert one(run([renamed]), "expression_vars").status == "pass"


def test_expression_finite():
    assert one(run([GRAPH]), "expression_finite").status == "pass"
    half = edit(GRAPH, expression="sqrt(x) + a + b + c")  # 50 % of samples are real
    assert one(run([half]), "expression_finite").status == "pass"
    sparse = edit(GRAPH, expression="ln(x - 5) + a + b + c")  # 25 %
    assert one(run([sparse]), "expression_finite").status == "warn"
    empty = edit(GRAPH, expression="sqrt(x - 100) + a + b + c")
    check = one(run([empty]), "expression_finite")
    assert check.status == "fail" and check.detail["settings"][0]["finite_ratio"] == 0
    # empty only at the end of a slider: circle radius r can reach 0
    circle = {
        "id": "g2",
        "type": "graph",
        "expression": "sqrt(r^2 - x^2)",
        "x_min": -5,
        "x_max": 5,
        "params": [{"symbol": "r", "value": 3, "min": 0, "max": 5, "step": 0.5, "provenance": "user"}],
    }
    check = one(run([circle]), "expression_finite")
    assert check.status == "fail" and "r = 0" in check.message
    small_circle = one(run([edit_param(circle, "r", min=1)]), "expression_finite")
    assert small_circle.status == "warn" and "r = 1" in small_circle.message  # only |x| ≤ 1 is drawn
    fitted = edit(edit_param(circle, "r", min=1), x_min=-1, x_max=1)
    assert one(run([fitted]), "expression_finite").status == "pass"


def test_param_ranges():
    assert one(run([GRAPH]), "param_ranges").status == "pass"
    cases = {
        "min_not_less_than_max": edit_param(GRAPH, "a", min=5, max=5),
        "value_out_of_range": edit_param(GRAPH, "a", value=7),
        "step_not_positive": edit_param(GRAPH, "a", step=0),
        "x_range": edit(GRAPH, x_min=3, x_max=-3),
        "conflicts_with_x": edit_param(GRAPH, "c", symbol="x"),
        "duplicate_symbol": edit_param(GRAPH, "c", symbol="b"),
    }
    for issue, block in cases.items():
        report = run([block])
        check = one(report, "param_ranges", "g1")
        assert check.status == "fail", issue
        assert issue in [i["issue"] for i in check.detail["issues"]], (issue, check.detail)
        assert not report.ok
    y_range = edit(GRAPH, y_min=4, y_max=1)
    assert one(run([y_range]), "param_ranges").status == "fail"


def test_slider_effect():
    assert one(run([GRAPH]), "slider_effect").status == "pass"
    unused = edit(GRAPH, expression="a*x^2 + b*x")
    check = one(run([unused]), "slider_effect", "g1")
    assert check.status == "warn" and check.detail["no_effect"] == ["c"]
    assert run([unused]).ok  # warnings never block publishing


def test_active_learning():
    active = {"enabled": True, "question": "Khi a tăng?", "param": "a", "from_value": 1, "to_value": 3, "observe": "y", "options": ["Hẹp lại", "Rộng ra"], "correct_option": 0}
    assert one(run([edit(GRAPH, active=active)]), "active_learning").status == "pass"
    broken = {**active, "param": "z", "correct_option": 5}
    check = one(run([edit(GRAPH, active=broken)]), "active_learning")
    assert check.status == "warn" and {"unknown_param", "correct_option_out_of_range"} <= set(check.detail["issues"])
    out_of_range = {**active, "to_value": 50}
    assert "to_value_out_of_range" in one(run([edit(GRAPH, active=out_of_range)]), "active_learning").detail["issues"]
    sim_active = {**active, "param": "L", "observe": "speed"}
    assert "unknown_output" in one(run([edit(PENDULUM, active=sim_active)]), "active_learning").detail["issues"]
    assert not checks_for(run([GRAPH]), "active_learning")


# ----------------------------------------------------------------------------- simulation
def test_units_consistent():
    assert one(run([PENDULUM]), "units_consistent").status == "pass"
    for unit in ("m/s2", "m/s^2", "m·s⁻²", "m s^-2"):
        assert one(run([edit_param(PENDULUM, "g", unit=unit)]), "units_consistent").status == "pass", unit
    check = one(run([edit_param(PENDULUM, "L", unit="cm")]), "units_consistent")
    assert check.status == "warn" and check.detail["mismatches"] == [{"symbol": "L", "unit": "cm", "expected": "m"}]
    assert one(run([edit_param(PENDULUM, "theta0", unit="rad")]), "units_consistent").status == "warn"
    assert one(run([edit_param(PENDULUM, "L", unit="")]), "units_consistent").status == "warn"
    interest = {
        "id": "ci",
        "type": "simulation",
        "model": "compound_interest",
        "params": [
            {"symbol": "P", "unit": "đồng", "value": 1000000, "min": 0, "max": 10000000, "provenance": "user"},
            {"symbol": "r", "unit": "%/năm", "value": 6, "min": 0, "max": 20, "provenance": "document"},
            {"symbol": "t", "unit": "năm", "value": 5, "min": 0, "max": 30, "provenance": "user"},
        ],
    }
    assert one(run([interest]), "units_consistent").status == "pass"
    assert one(run([edit_param(interest, "r", unit="")]), "units_consistent").status == "warn"


def test_sim_reference():
    report = run([PENDULUM])
    check = one(report, "sim_reference", "p1")
    assert check.status == "pass" and check.detail["builtin_cases"] >= 5 and check.detail["failed"] == 0
    wrong = edit(PENDULUM, reference_cases=[{"inputs": {"L": 1, "g": 9.81}, "output": "period", "expected": 3.0, "tolerance": 0.01}])
    report = run([wrong])
    check = one(report, "sim_reference", "p1")
    assert check.status == "fail" and not report.ok
    assert check.detail["cases"][0]["ok"] is False and check.detail["cases"][0]["actual"] == pytest.approx(2.00607, abs=1e-4)
    unknown = edit(PENDULUM, reference_cases=[{"inputs": {"L": 1}, "output": "speed", "expected": 1}])
    check = one(run([unknown]), "sim_reference")
    assert check.status == "fail" and check.detail["cases"][0]["error"] == "sim_unknown_output"
    typo = edit(PENDULUM, reference_cases=[{"inputs": {"L": 1, "G": 9.81}, "output": "period", "expected": 2.006, "tolerance": 0.01}])
    check = one(run([typo]), "sim_reference")
    assert check.status == "pass" and check.detail["cases"][0]["unused_inputs"] == ["G"]
    none = edit(PENDULUM, reference_cases=[])
    check = one(run([none]), "sim_reference")
    assert check.status == "pass" and check.detail["cases"] == [] and check.detail["builtin_cases"] > 0
    big_angle = edit(PENDULUM, reference_cases=[{"inputs": {"L": 1, "g": 9.81, "theta0": 60}, "output": "period_numeric", "expected": 2.1529, "tolerance": 0.001}])
    assert one(run([big_angle]), "sim_reference").status == "pass"


def test_simulation_param_domains():
    zero_length = edit_param(PENDULUM, "L", value=0, min=0)
    check = one(run([zero_length]), "param_ranges", "p1")
    assert check.status == "fail" and any(i["issue"] == "domain" for i in check.detail["issues"])
    slider_to_zero = edit_param(PENDULUM, "L", min=0)
    check = one(run([slider_to_zero]), "param_ranges", "p1")
    assert check.status == "warn" and check.detail["issues"][0]["issue"] == "domain_slider"
    missing_length = edit(PENDULUM, params=[p for p in PENDULUM["params"] if p["symbol"] != "L"], reference_cases=[])
    check = one(run([missing_length]), "param_ranges", "p1")
    assert check.status == "warn" and check.detail["issues"][0] == {"symbol": "L", "issue": "missing_input", "level": "warn"}


def test_simulation_slider_effect_mass_is_reported_but_not_blocking():
    with_mass = copy.deepcopy(PENDULUM)
    with_mass["params"].append({"symbol": "m", "unit": "kg", "value": 0.2, "min": 0.1, "max": 1, "provenance": "user"})
    report = run([with_mass])
    check = one(report, "slider_effect", "p1")
    assert check.status == "warn" and check.detail["not_model_inputs"] == ["m"]
    assert report.ok
    assert one(run([PENDULUM]), "slider_effect").status == "pass"


def test_simulation_object_asset():
    sim = edit(PENDULUM, object_asset_id="a1")
    asset = Asset(id="a1", kind="cutout", storage_key="labs/x/y.png", mime="image/png")
    assert one(run([sim], assets=[asset]), "media_available", "p1").status == "pass"
    assert one(run([sim]), "media_available", "p1").status == "warn"


# ----------------------------------------------------------------------------- quiz
def quiz(*questions):
    return {"id": "qz", "type": "quiz", "title": "Kiểm tra", "questions": list(questions)}


GOOD_QUESTIONS = [
    {"id": "q1", "kind": "mcq", "prompt": "Chu kỳ phụ thuộc?", "options": ["L", "m", "màu"], "answer_index": 0, "approved": True},
    {"id": "q2", "kind": "truefalse", "prompt": "T tăng khi L tăng", "options": ["Đúng", "Sai"], "answer_index": 0, "approved": True},
    {"id": "q3", "kind": "order", "prompt": "Sắp xếp", "options": ["a", "b", "c"], "answer_order": [2, 0, 1], "approved": True},
    {"id": "q4", "kind": "numeric", "prompt": "T khi L = 1 m?", "answer_value": 2.01, "tolerance": 0.02, "unit": "s", "approved": True},
]


def test_quiz_answers_pass():
    check = one(run([quiz(*GOOD_QUESTIONS)]), "quiz_answers")
    assert check.status == "pass" and check.detail["approved"] == 4


@pytest.mark.parametrize(
    ("question", "issue"),
    [
        ({"id": "x", "kind": "mcq", "prompt": "?", "options": ["a", "b"], "answer_index": 2, "approved": True}, "answer_out_of_range"),
        ({"id": "x", "kind": "mcq", "prompt": "?", "options": ["a", "b"], "answer_index": None, "approved": True}, "answer_out_of_range"),
        ({"id": "x", "kind": "mcq", "prompt": "?", "options": ["a"], "answer_index": 0, "approved": True}, "too_few_options"),
        ({"id": "x", "kind": "mcq", "prompt": "", "options": ["a", "b"], "answer_index": 0, "approved": True}, "empty_prompt"),
        ({"id": "x", "kind": "truefalse", "prompt": "?", "answer_index": 3, "approved": True}, "answer_out_of_range"),
        ({"id": "x", "kind": "order", "prompt": "?", "options": ["a", "b", "c"], "answer_order": [0, 0, 1], "approved": True}, "order_not_permutation"),
        ({"id": "x", "kind": "order", "prompt": "?", "options": ["a", "b", "c"], "answer_order": None, "approved": True}, "order_not_permutation"),
        ({"id": "x", "kind": "numeric", "prompt": "?", "answer_value": None, "approved": True}, "missing_value"),
        ({"id": "x", "kind": "numeric", "prompt": "?", "answer_value": 1, "tolerance": -0.1, "approved": True}, "bad_tolerance"),
    ],
)
def test_quiz_answers_malformed_approved_fail(question, issue):
    report = run([STEPS, quiz(question)])
    check = one(report, "quiz_answers")
    assert check.status == "fail" and not report.ok
    assert issue in check.detail["problems"][0]["issues"]


def test_quiz_answers_drafts_and_duplicates():
    draft_bad = {"id": "x", "kind": "mcq", "prompt": "?", "options": ["a"], "answer_index": 5, "approved": False}
    check = one(run([STEPS, quiz(GOOD_QUESTIONS[0], draft_bad)]), "quiz_answers")
    assert check.status == "pass" and check.detail["total"] == 2  # unapproved drafts never reach learners
    check = one(run([STEPS, quiz(edit(GOOD_QUESTIONS[0], approved=False))]), "quiz_answers")
    assert check.status == "warn"
    dup = edit(GOOD_QUESTIONS[1], id="q1")
    assert one(run([quiz(GOOD_QUESTIONS[0], dup)]), "quiz_answers").status == "fail"


# ----------------------------------------------------------------------------- other blocks
def test_widget_status():
    widget = {"id": "w", "type": "widget", "prompt": "…", "html": "<p>x</p>", "status": "draft"}
    assert one(run([STEPS, widget]), "widget_status").status == "warn"
    assert one(run([STEPS, edit(widget, status="validated", approved=True)]), "widget_status").status == "pass"
    assert one(run([STEPS, edit(widget, status="failed", approved=True)]), "widget_status").status == "warn"


def test_sources_cited():
    check = one(run([STEPS]), "sources_cited", "st")
    assert check.status == "warn" and check.detail["uncited"] == ["s1"]
    ref = {"source_id": "src1", "page": 3, "located": "exact", "quote": "T = 2π√(l/g)"}
    src = Source(id="src1", kind="pdf", title="SGK", status="ready", page_count=10)
    cited = copy.deepcopy(STEPS)
    cited["steps"][0]["source_refs"] = [ref]
    assert one(run([cited], sources=[src]), "sources_cited").status == "pass"
    check = one(run([cited]), "sources_cited")  # the cited source was deleted
    assert check.status == "warn" and check.detail["missing_sources"] == ["src1"]
    unknown_values = edit_param(GRAPH, "c", provenance="unknown")
    check = one(run([unknown_values]), "sources_cited", "g1")
    assert check.status == "warn" and check.detail["uncited"] == ["c"]
    algorithm = {"id": "al", "type": "algorithm", "algorithm": "bubble_sort", "config": {"array": [3, 1, 2]}}
    assert one(run([algorithm]), "sources_cited").status == "warn"
    assert one(run([edit(algorithm, source_refs=[ref])], sources=[src]), "sources_cited").status == "pass"


def test_sequence_confirmed():
    ai_steps = edit(STEPS, ai_generated=True)
    assert one(run([ai_steps]), "sequence_confirmed").status == "warn"
    assert one(run([edit(ai_steps, sequence_confirmed=True)]), "sequence_confirmed").status == "pass"
    assert one(run([STEPS]), "sequence_confirmed").status == "pass"  # written by the teacher


def test_video_media_and_markers():
    video = {
        "id": "v",
        "type": "video",
        "source_id": "vid",
        "markers": [
            {"id": "m1", "t": 1.0, "label": "Chuẩn bị", "confirmed": True},
            {"id": "m2", "t": 2.5, "label": "Chạm bóng", "ai_suggested": True, "confirmed": False},
        ],
    }
    ready = Source(id="vid", kind="video", title="Bài tập", status="ready", contains_people=False)
    report = run([video], sources=[ready])
    assert one(report, "media_available", "v").status == "pass"
    check = one(report, "markers_confirmed", "v")
    assert check.status == "warn" and check.detail["unconfirmed"] == 1 and report.ok
    processing = Source(id="vid", kind="video", title="Bài tập", status="processing")
    report = run([video], sources=[processing])
    assert one(report, "media_available").status == "fail" and not report.ok
    assert one(run([video]), "media_available").detail["issue"] == "missing"
    assert one(run([edit(video, source_id=None)]), "media_available").detail["issue"] == "none"


def test_diagram_media():
    diagram = {"id": "d", "type": "diagram", "image": {"source_id": "img"}, "hotspots": []}
    image = Source(id="img", kind="image", title="Sơ đồ", status="ready")
    assert one(run([diagram], sources=[image]), "media_available").status == "pass"
    assert one(run([diagram]), "media_available").status == "fail"
    assert one(run([edit(diagram, image={})]), "media_available").detail["issue"] == "none"
    pdf = Source(id="img", kind="pdf", title="SGK", status="ready", page_count=2)
    on_page = edit(diagram, image={"source_id": "img", "page": 5})
    assert one(run([on_page], sources=[pdf]), "media_available").detail["issue"] == "bad_page"


# ----------------------------------------------------------------------------- through the API
def test_validate_endpoint_and_publish_gate(teacher):
    c, _ = teacher
    lab = create_lab(c)
    wrong = edit(PENDULUM, reference_cases=[{"inputs": {"L": 1, "g": 9.81}, "output": "period", "expected": 3.0, "tolerance": 0.01}])
    r = c.patch(f"/api/labs/{lab['id']}", json={"version": 1, "spec": {"blocks": [GRAPH, wrong]}})
    assert r.status_code == 200, r.text
    report = c.post(f"/api/labs/{lab['id']}/validate").json()
    assert report["ok"] is False
    assert any(ch["code"] == "sim_reference" and ch["status"] == "fail" and ch["block_id"] == "p1" for ch in report["checks"])
    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": True})
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_failed"
    assert r.json()["error"]["report"]["ok"] is False
    r = c.patch(f"/api/labs/{lab['id']}", json={"version": 2, "spec": {"blocks": [GRAPH, PENDULUM]}})
    assert c.post(f"/api/labs/{lab['id']}/validate").json()["ok"] is True
    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": True})
    assert r.status_code == 200, r.text
    assert r.json()["report"]["ok"] is True


def test_validate_requires_owner(teacher, other_user, client):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    assert o.post(f"/api/labs/{lab['id']}/validate").status_code == 404
    assert client.post(f"/api/labs/{lab['id']}/validate").status_code == 401
