"""Offline tests of every AI feature — no network.

A fake Meta Model API sits at the HTTP boundary (``httpx.MockTransport`` →
``MetaAIClient(transport=…)`` installed with ``app.ai.client.set_ai`` and restored afterwards),
so the real routes, services, database, media processing and the real client (payloads,
structured-output parsing, streaming, error mapping) all run.

Covered: the happy path of every AI endpoint; permissions (guest 401, other user 404,
unpublished share 404, ``tutor_disabled`` 403, rate limit 429, AI not configured 503);
honest citation resolution on the attention-paper PDF (exact bbox from the text layer /
approximate / none); model and mode selection with the privacy switch to Standard mode;
generated blocks validating against ``schemas/spec.py`` (invalid ones dropped with a warning);
chat SSE format, persistence and citations; transcription of a non-WAV recording; SAM prompt
building; video track normalisation.
"""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path
from typing import Any

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app.ai import client as ai_client
from app.ai.client import MetaAIClient, schema_for, set_ai
from app.ai.outputs import ALL_OUTPUT_MODELS, GenSimParam
from app.ai.sam import SamObject, SamResult, parse_sam_text
from app.config import Settings, get_settings
from app.db import SessionLocal
from app.models import AICall
from app.schemas.api import PointIn
from app.schemas.spec import ImageRef, LabSpec
from app.services import generation, media, segmentation, video_ai
from tests.conftest import create_lab, register

FIX = Path(__file__).resolve().parent / "fixtures"
SEED = Path(__file__).resolve().parents[1] / "app" / "seed" / "assets"

CONTRIBUTOR, STANDARD, DEEP = "muse-spark-1.3-contributor", "muse-spark-1.3", "muse-wonder-1.0"
EXACT_QUOTE = "We compute the dot products of the query with all keys"  # attention_paper.pdf, page 1
TWO_LINE_QUOTE = "divide each by sqrt(d_k), and apply a softmax function to obtain the weights"
PAGE2_QUOTE = "we linearly project the queries, keys and values h times"


# ============================================================================ fake Meta Model API
def _multipart(request: httpx.Request) -> dict[str, bytes]:
    boundary = request.headers["content-type"].split("boundary=", 1)[1].encode()
    parts: dict[str, bytes] = {}
    for chunk in request.content.split(b"--" + boundary):
        head, sep, body = chunk.partition(b"\r\n\r\n")
        name = re.search(rb'name="([^"]+)"', head)
        if sep and name:
            parts[name.group(1).decode()] = body[:-2] if body.endswith(b"\r\n") else body
    return parts


class FakeMeta:
    """Answers like Meta Model API. ``json_outputs[schema name]`` is a dict, a callable
    ``(payload) -> dict`` or a list consumed in order (the last item repeats)."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.json_outputs: dict[str, Any] = {}
        self.text_output = "Khi dây dài hơn, chu kỳ tăng vì T tỉ lệ với căn bậc hai của L."
        self.stream_chunks = ["Chu kỳ ", "tăng [1]."]
        self.sam: Any = "<0f>0<|box;x1=681;y1=529;x2=769;y2=617;w=1200;h=900|><|mask;x=0;y=0;data=89,89,~abc|>"
        self.image = _png((1536, 1024), (20, 120, 110))
        self.transcript = "the period of a pendulum"
        self.errors: dict[str, int] = {}  # schema name, "chat", "stream", "sam", "image", "asr" → HTTP status

    # -- helpers for assertions
    def by(self, kind: str) -> list[dict[str, Any]]:
        return [c for c in self.calls if c["kind"] == kind or c.get("name") == kind]

    def last(self, kind: str) -> dict[str, Any]:
        found = self.by(kind)
        assert found, f"no {kind} call in {[c.get('name') or c['kind'] for c in self.calls]}"
        return found[-1]

    def _fail(self, key: str) -> httpx.Response | None:
        status = self.errors.get(key)
        if status:
            return httpx.Response(status, json={"error": {"message": f"fake {key} failure"}})
        return None

    def _next(self, name: str, payload: dict[str, Any]) -> Any:
        out = self.json_outputs[name]
        if isinstance(out, list):
            out = out.pop(0) if len(out) > 1 else out[0]
        return out(payload) if callable(out) else out

    # -- transport
    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path.endswith("/chat/completions"):
            payload = json.loads(request.content)
            name = ((payload.get("response_format") or {}).get("json_schema") or {}).get("name")
            stream = bool(payload.get("stream"))
            self.calls.append({"kind": "stream" if stream else "chat", "name": name, "model": payload["model"], "payload": payload})
            failure = self._fail("stream" if stream else (name or "chat"))
            if failure is not None:
                return failure
            if stream:
                lines = [f"data: {json.dumps({'choices': [{'delta': {'content': c}}]})}\n\n" for c in self.stream_chunks]
                lines.append('data: {"choices":[],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\ndata: [DONE]\n\n')
                return httpx.Response(200, content="".join(lines).encode(), headers={"content-type": "text/event-stream"})
            if name:
                out = self._next(name, payload)
                content = out if isinstance(out, str) else json.dumps(out, ensure_ascii=False)
            else:
                content = self.text_output
            return httpx.Response(200, json={"choices": [{"message": {"content": content}}], "usage": {"prompt_tokens": 12, "completion_tokens": 7}})
        if path.endswith("/responses"):
            payload = json.loads(request.content)
            content = payload["input"][0]["content"]
            media_part = next(p for p in content if p["type"] in ("input_image", "input_video"))
            url = media_part.get("image_url") or media_part.get("video_url")
            self.calls.append(
                {"kind": "sam", "model": payload["model"], "prompt": content[0]["text"], "media": media_part["type"],
                 "mime": url.split(";", 1)[0][5:], "payload": payload}
            )
            failure = self._fail("sam")
            if failure is not None:
                return failure
            text = self.sam(payload) if callable(self.sam) else self.sam
            return httpx.Response(200, json={"output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}]})
        if path.endswith("/images/generations"):
            payload = json.loads(request.content)
            self.calls.append({"kind": "image", "model": payload["model"], "payload": payload})
            failure = self._fail("image")
            if failure is not None:
                return failure
            return httpx.Response(200, json={"data": [{"b64_json": base64.b64encode(self.image).decode()}], "output_format": "png"})
        if path.endswith("/asr/transcribe"):
            parts = _multipart(request)
            self.calls.append({"kind": "asr", "request": json.loads(parts["request"]), "audio": parts["audio"]})
            failure = self._fail("asr")
            if failure is not None:
                return failure
            return httpx.Response(200, json={"transcript": f"  {self.transcript}  ", "audioDurationMs": 4440, "turns": []})
        return httpx.Response(404, json={"error": {"message": "unknown fake route"}})


def _png(size=(64, 48), color=(200, 60, 50)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "PNG")
    return buf.getvalue()


@pytest.fixture
def fake_ai():
    fake = FakeMeta()
    previous = ai_client._client
    set_ai(MetaAIClient(settings=Settings(model_api_key="offline-test-key", ai_max_retries=0), transport=httpx.MockTransport(fake.handler)))
    segmentation._PHRASE_CACHE.clear()
    yield fake
    set_ai(previous)


# ============================================================================ helpers
def fixture_bytes(name: str) -> bytes:
    return (FIX / name).read_bytes()


def upload(c, lab_id: str, content: bytes, name: str, **fields) -> dict:
    data = {k: (str(v).lower() if isinstance(v, bool) else v) for k, v in fields.items()}
    r = c.post(f"/api/labs/{lab_id}/sources", files={"file": (name, content, "application/octet-stream")}, data=data)
    assert r.status_code == 201, r.text
    return c.get(f"/api/sources/{r.json()['id']}").json()  # videos are processed after the response


def patch_lab(c, lab_id: str, **fields) -> dict:
    version = c.get(f"/api/labs/{lab_id}").json()["version"]
    r = c.patch(f"/api/labs/{lab_id}", json={"version": version, **fields})
    assert r.status_code == 200, r.text
    return r.json()


def publish(c, lab_id: str, blocks: list[dict], allow_tutor: bool = True) -> str:
    patch_lab(c, lab_id, spec={"blocks": blocks})
    r = c.post(f"/api/labs/{lab_id}/publish", json={"visibility": "link", "allow_tutor": allow_tutor})
    assert r.status_code == 200, r.text
    return r.json()["share_code"]


def sse_events(text: str) -> list[tuple[str, Any]]:
    events = []
    for block in text.split("\n\n"):
        lines = [line for line in block.split("\n") if line and not line.startswith(":")]
        if not lines:
            continue
        event = next((line[6:].strip() for line in lines if line.startswith("event:")), "message")
        data = "\n".join(line[5:].strip() for line in lines if line.startswith("data:"))
        events.append((event, json.loads(data) if data else None))
    return events


def cite(source: int = 1, page_index: int | None = None, quote: str = "", box=None, time=None, page_label=None) -> dict:
    return {"source": source, "page_index": page_index, "page_label": page_label, "quote": quote, "box": box, "time": time}


def analysis_out(**fields) -> dict:
    base = {"topic": "", "summary": "", "objects": [], "formulas": [], "variables": [], "steps": [], "sequence_clear": False,
            "relations": [], "suggested_blocks": [], "missing_info": [], "assumptions": [], "warnings": []}
    return {**base, **fields}


def step_out(title: str, cites: list[dict], description: str = "…") -> dict:
    return {"title": title, "description": description, "cites": cites}


def variable_out(symbol: str, value, provenance: str, cites: list[dict], unit: str = "", role: str = "input") -> dict:
    return {"symbol": symbol, "name": symbol, "unit": unit, "value": value, "role": role, "provenance": provenance, "cites": cites}


def suggestion(kind: str, feasibility: str = "ready", model=None, algorithm=None) -> dict:
    return {"type": kind, "reason": "phù hợp", "feasibility": feasibility, "model": model, "algorithm": algorithm}


def active_out(param: str, observe: str, from_value=None, to_value=None) -> dict:
    return {"question": "Điều gì xảy ra?", "param": param, "from_value": from_value, "to_value": to_value, "observe": observe,
            "options": ["Tăng", "Giảm", "Không đổi"], "correct_option": 0, "explanation": "Vì công thức."}


def ref(source_id: str, quote: str) -> dict:
    return {"source_id": source_id, "quote": quote, "located": "exact"}


# ============================================================================ output schemas
@pytest.mark.parametrize("model_cls", ALL_OUTPUT_MODELS, ids=lambda m: m.__name__)
def test_output_models_follow_strict_schema_rules(model_cls):
    """Strict structured output: closed objects, every property required, no free-form maps,
    nothing next to a $ref."""

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" or "properties" in node:
                assert node.get("additionalProperties") is False, path
                assert set(node.get("required", [])) == set(node.get("properties", {})), path
            if "$ref" in node:
                assert set(node) == {"$ref"}, f"{path}: $ref with siblings {sorted(node)}"
            for key, value in node.items():
                walk(value, f"{path}/{key}")
        elif isinstance(node, list):
            for i, item in enumerate(node):
                walk(item, f"{path}[{i}]")

    walk(schema_for(model_cls), model_cls.__name__)
    assert "additionalProperties" not in json.dumps(model_cls.model_json_schema())  # no dict fields


# ============================================================================ analyze
def test_analyze_resolves_citations_and_saves(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, space="paper2explorer", title="Attention", subject="computer_science", grade="university",
                     language="en", goal="explore_paper")
    pdf = upload(c, lab["id"], fixture_bytes("attention_paper.pdf"), "attention.pdf")
    data = c.post(f"/api/labs/{lab['id']}/sources/data",
                  json={"title": "Settings", "values": [{"symbol": "d_k", "name": "key size", "value": 64, "unit": ""}]}).json()
    note = c.post(f"/api/labs/{lab['id']}/sources/note",
                  json={"title": "Teacher note", "text": "Focus on why the scores are divided by the square root of d_k."}).json()
    fake_ai.json_outputs["analysis"] = analysis_out(
        topic="Scaled dot-product attention",
        summary="How attention weights are computed.",
        objects=[
            {"name": "Query vector", "description": "…", "sam_phrase": "arrow diagram", "cites": []},
            {"name": "Mũi tên", "description": "…", "sam_phrase": "mũi tên đỏ", "cites": []},
        ],
        formulas=[
            {"latex": "s = \\frac{q k}{\\sqrt{d_k}}", "expression": "s = q*k/sqrt(d_k)", "output_symbol": "", "description": "score",
             "variables": ["q", "k", "d_k"], "cites": [cite(1, 1, EXACT_QUOTE)]},
            {"latex": "broken", "expression": "2*(x", "output_symbol": "y", "description": "", "variables": [], "cites": []},
        ],
        variables=[
            variable_out("d_k", 8, "document", [cite(1, 2, "d_k = d_v = d_model / h = 64")]),
            variable_out("h", 8, "user", [cite(1, 2, "we employ h = 8 parallel attention layers")]),
            variable_out("x", 3, "unknown", []),
        ],
        steps=[
            step_out("Scale and softmax", [cite(1, 1, TWO_LINE_QUOTE)]),
            step_out("Invented", [cite(1, 1, "The attention layer reads the moon every Tuesday", box=[100, 200, 500, 300])]),
            step_out("Unlocatable", [cite(1, 1, "a sentence that does not exist in this paper")]),
            step_out("From the note", [cite(3, None, "divided by the square root of d_k")]),
            step_out("Bad source", [cite(9, 1, EXACT_QUOTE)]),
        ],
        sequence_clear=True,
        relations=[{"source": "query", "target": "key", "description": "dot product", "cites": []},
                   {"source": "", "target": "x", "description": "", "cites": []}],
        suggested_blocks=[suggestion("algorithm", algorithm="attention"), suggestion("simulation"), suggestion("video")],
        missing_info=[{"text": "Example Q, K, V values", "symbol": "Q"}, {"text": "Key size", "symbol": "d_k"}],
        assumptions=[{"text": "Tiny example matrices", "stated_in_source": False},
                     {"text": "tiny example matrices", "stated_in_source": False}],
        warnings=["Figure 2 is not included."],
    )
    version = c.get(f"/api/labs/{lab['id']}").json()["version"]
    r = c.post(f"/api/labs/{lab['id']}/ai/analyze", json={"source_ids": [pdf["id"], data["id"], note["id"]], "focus": "scaling"})
    assert r.status_code == 200, r.text
    body = r.json()

    call = fake_ai.last("analysis")
    assert call["model"] == CONTRIBUTOR
    payload = call["payload"]
    assert payload["response_format"]["json_schema"]["strict"] is True
    assert payload["reasoning_effort"] == get_settings().ai_effort_deep
    content = payload["messages"][1]["content"]
    assert any(p["type"] == "file" and p["file"]["file_data"].startswith("data:application/pdf;base64,") for p in content)
    intro = content[0]["text"]
    assert "d_k = 64" in intro and "provenance 'user'" in intro and "Focus on why the scores" in intro and "scaling" in intro

    result = body["analysis"]["result"]
    formula = result["formulas"][0]
    assert formula["expression"] == "q*k/sqrt(d_k)" and formula["output_symbol"] == "s"
    exact = formula["source_refs"][0]
    assert exact["located"] == "exact" and exact["source_id"] == pdf["id"] and exact["page"] == 1
    assert exact["bbox"] == pytest.approx([0.084, 0.2706, 0.4923, 0.2869], abs=0.002)
    assert result["formulas"][1]["expression"] == ""  # not computable → never stored

    steps = {s["title"]: s["source_refs"] for s in result["steps"]}
    two_lines = steps["Scale and softmax"][0]
    assert two_lines["located"] == "exact" and two_lines["bbox"][1] < 0.272 and two_lines["bbox"][3] > 0.3
    assert steps["Invented"][0] == {**steps["Invented"][0], "located": "approximate", "page": 1, "bbox": [0.1, 0.2, 0.5, 0.3]}
    assert steps["Unlocatable"][0]["located"] == "none" and steps["Unlocatable"][0]["page"] == 1
    assert steps["Unlocatable"][0]["bbox"] is None
    assert steps["From the note"][0]["located"] == "exact" and steps["From the note"][0]["source_id"] == note["id"]
    assert steps["Bad source"] == []
    assert result["sequence_clear"] is True

    variables = {v["symbol"]: v for v in result["variables"]}
    assert variables["d_k"]["value"] == 64 and variables["d_k"]["provenance"] == "user"  # the measurement wins
    assert variables["d_k"]["source_ref"]["source_id"] == data["id"] and variables["d_k"]["source_ref"]["located"] == "exact"
    assert variables["h"]["provenance"] == "document" and variables["h"]["value"] == 8  # "user" needs a user source
    assert variables["h"]["source_ref"]["located"] == "exact" and variables["h"]["source_ref"]["page"] == 2
    assert variables["x"]["provenance"] == "unknown" and variables["x"]["value"] is None

    assert [o["sam_phrase"] for o in result["objects"]] == ["arrow diagram", ""]
    assert [(r_["source"], r_["target"]) for r_ in result["relations"]] == [("query", "key")]
    feasibility = {s["type"]: s["feasibility"] for s in result["suggested_blocks"]}
    assert feasibility == {"algorithm": "ready", "simulation": "not_supported", "video": "needs_input"}
    assert {m["symbol"]: m["resolved"] for m in result["missing_info"]} == {"Q": False, "d_k": True}
    assert [a["text"] for a in result["assumptions"]] == ["Tiny example matrices"]
    assert all(a["confirmed"] is False for a in result["assumptions"])
    warnings = " ".join(result["warnings"])
    assert "Figure 2 is not included." in warnings
    assert "could not be turned into a computable expression" in warnings
    assert "2 citations could not be matched" in warnings  # approximate + none on a text PDF

    saved = c.get(f"/api/labs/{lab['id']}").json()
    assert saved["analysis"]["status"] == "done" and saved["analysis"]["mode"] == "contributor"
    assert saved["analysis"]["model"] == CONTRIBUTOR
    assert saved["analysis"]["source_ids"] == [pdf["id"], data["id"], note["id"]]
    assert saved["version"] == version + 1 and body["lab"]["version"] == version + 1
    assert any(v["note"] == "AI analysis" for v in c.get(f"/api/labs/{lab['id']}/versions").json())


def test_analyze_mode_selection_and_privacy_switch(teacher, fake_ai, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)  # Vietnamese, contributor mode by default
    people = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "lop.jpg", contains_people=True, consent_confirmed=True)
    objects = upload(c, lab["id"], fixture_bytes("textbook_pendulum.png"), "sgk.png")
    fake_ai.json_outputs["analysis"] = analysis_out(topic="Con lắc")
    analyze = lambda ids, **extra: c.post(f"/api/labs/{lab['id']}/ai/analyze", json={"source_ids": ids, **extra})  # noqa: E731

    r = analyze([objects["id"], people["id"]])
    assert r.status_code == 200, r.text
    assert fake_ai.last("analysis")["model"] == STANDARD  # media with people never goes to contributor mode
    warning = r.json()["analysis"]["result"]["warnings"][0]
    assert warning.startswith("Một số ảnh hoặc video đã chọn có người") and "Standard" in warning
    assert r.json()["analysis"]["mode"] == "standard"
    parts = fake_ai.last("analysis")["payload"]["messages"][1]["content"]
    assert sum(p["type"] == "image_url" for p in parts) == 2

    assert analyze([objects["id"]]).status_code == 200
    assert fake_ai.last("analysis")["model"] == CONTRIBUTOR
    assert analyze([objects["id"]], deep=True).status_code == 200
    deep = fake_ai.last("analysis")
    assert deep["model"] == DEEP and deep["payload"]["reasoning_effort"] == get_settings().ai_effort_deep

    monkeypatch.setattr(get_settings(), "enable_deep_analysis", False)
    r = analyze([objects["id"]], deep=True)
    assert fake_ai.last("analysis")["model"] == CONTRIBUTOR
    assert "Muse Wonder" in r.json()["analysis"]["result"]["warnings"][0]

    patch_lab(c, lab["id"], ai_mode="standard")
    r = analyze([objects["id"], people["id"]])
    assert fake_ai.last("analysis")["model"] == STANDARD
    assert not any("có người" in w for w in r.json()["analysis"]["result"]["warnings"])  # already private


def test_analyze_validation_and_ai_errors(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    other = create_lab(c, title="Lab khác")
    img = upload(c, other["id"], fixture_bytes("pendulum_photo.jpg"), "a.jpg")
    assert c.post(f"/api/labs/{lab['id']}/ai/analyze", json={"source_ids": [img["id"]]}).status_code == 404  # not this lab
    assert c.post(f"/api/labs/{lab['id']}/ai/analyze", json={"source_ids": []}).status_code == 422
    mine = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "b.jpg")
    url = f"/api/labs/{lab['id']}/ai/analyze"

    fake_ai.errors["analysis"] = 429
    r = c.post(url, json={"source_ids": [mine["id"]]})
    assert r.status_code == 429 and r.json()["error"]["code"] == "ai_rate_limited"
    fake_ai.errors["analysis"] = 400
    assert c.post(url, json={"source_ids": [mine["id"]]}).json()["error"]["code"] == "ai_bad_request"
    fake_ai.errors.clear()

    before = len(fake_ai.by("analysis"))
    fake_ai.json_outputs["analysis"] = "this is not json"
    r = c.post(url, json={"source_ids": [mine["id"]]})
    assert r.status_code == 502 and r.json()["error"]["code"] == "ai_bad_output"
    assert len(fake_ai.by("analysis")) - before == 2  # one automatic repair round
    fake_ai.json_outputs["analysis"] = ["{\"topic\": 1}", analysis_out(topic="Con lắc")]
    assert c.post(url, json={"source_ids": [mine["id"]]}).status_code == 200
    repair = fake_ai.last("analysis")["payload"]["messages"]
    assert repair[-1]["role"] == "user" and "previous JSON was invalid" in repair[-1]["content"]

    db = SessionLocal()  # every call is recorded (metadata only: feature, model, status, latency, tokens)
    try:
        rows = db.scalars(select(AICall).where(AICall.feature == "analyze")).all()
    finally:
        db.close()
    statuses = sorted(r.error_code or r.status for r in rows)
    assert statuses == ["ai_bad_request", "ai_rate_limited", "ok", "ok", "ok", "ok"]
    assert all(r.lab_id == lab["id"] and r.model == CONTRIBUTOR and r.latency_ms >= 0 for r in rows)


# ============================================================================ permissions
OWNER_AI = [
    ("ai/analyze", {"source_ids": ["abc"]}),
    ("ai/paper-structure", {"source_id": "abc"}),
    ("ai/explore-equation", {"latex": "y = x^2"}),
    ("ai/generate", {}),
    ("ai/quiz", {}),
    ("ai/video-markers", {"source_id": "abc"}),
    ("ai/track", {"source_id": "abc", "phrase": "ball"}),
    ("ai/segment", {"source_id": "abc", "phrase": "ball"}),
    ("ai/diagram", {"source_id": "abc"}),
    ("ai/board-read", {"source_id": "abc"}),
    ("ai/board-visual", {"source_id": "abc", "items": [{"id": "b1", "text": "Con lắc đơn"}]}),
    ("ai/widget", {"description": "A slider that changes a bar"}),
    ("ai/widget/repair", {"html": "<p>x</p>", "errors": ["broken"]}),
    ("ai/translate", {"target": "en"}),
    ("ai/cover", {}),
    ("ai/field-scenario", {"sport": "football", "description": "Một đường chuyền"}),
    ("ai/explain-change", {"block_id": "b1", "before": {}, "after": {}}),
    ("ai/prediction-feedback", {"block_id": "b1", "prediction": "Tăng"}),
    ("chat", {"message": "Xin chào"}),
]


def test_owner_ai_routes_require_the_owner(teacher, other_user, client, fake_ai):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    for path, body in OWNER_AI:
        url = f"/api/labs/{lab['id']}/{path}"
        assert client.post(url, json=body).status_code == 401, path
        r = o.post(url, json=body)
        assert r.status_code == 404 and r.json()["error"]["code"] == "not_found", path
        assert c.post(f"/api/labs/ZZZZ{lab['id'][4:]}/{path}", json=body).status_code == 404, path
    frame = {"file": ("f.png", _png(), "image/png")}
    assert client.post(f"/api/labs/{lab['id']}/ai/segment-frame", files=frame, data={"phrase": "ball"}).status_code == 401
    assert o.post(f"/api/labs/{lab['id']}/ai/segment-frame", files=frame, data={"phrase": "ball"}).status_code == 404
    assert client.get(f"/api/labs/{lab['id']}/chat").status_code == 401
    assert o.get(f"/api/labs/{lab['id']}/chat").status_code == 404
    assert fake_ai.calls == []  # nothing reached the model


def test_share_ai_routes_respect_publication_and_tutor_switch(teacher, client, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    block = {"id": "g1", "type": "graph", "title": "T(L)", "expression": "2*pi*sqrt(L/g)", "x_var": "L", "x_min": 0.1, "x_max": 2,
             "params": [{"symbol": "g", "value": 9.81, "min": 1, "max": 20, "step": 0.1}]}
    patch_lab(c, lab["id"], spec={"blocks": [block]})
    share_paths = [("ai/explain-change", {"block_id": "g1", "before": {}, "after": {}}),
                   ("ai/prediction-feedback", {"block_id": "g1", "prediction": "Tăng"}), ("chat", {"message": "Vì sao?"})]
    for path, body in share_paths:  # nothing is published yet / unknown code
        assert client.post(f"/api/share/ABCDEF/{path}", json=body).status_code == 404
    assert client.get("/api/share/ABCDEF/chat").status_code == 404

    code = publish(c, lab["id"], [block], allow_tutor=False)
    for path, body in share_paths:
        r = client.post(f"/api/share/{code}/{path}", json=body)
        assert r.status_code == 403 and r.json()["error"]["code"] == "tutor_disabled", path
    assert client.get(f"/api/share/{code}/chat").json() == []  # history is still readable (empty)

    c.post(f"/api/labs/{lab['id']}/unpublish")
    for path, body in share_paths:
        assert client.post(f"/api/share/{code}/{path}", json=body).status_code == 404
    assert fake_ai.calls == []


def test_ai_rate_limit_and_configuration(teacher, client, fake_ai, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    patch_lab(c, lab["id"], spec={"blocks": [{"id": "b1", "type": "text", "body": "x"}]})
    url = f"/api/labs/{lab['id']}/ai/explain-change"
    body = {"block_id": "b1", "before": {"L": 1}, "after": {"L": 2}}
    monkeypatch.setattr(get_settings(), "user_ai_requests_per_hour", 2)
    assert c.post(url, json=body).status_code == 200
    assert c.post(url, json=body).status_code == 200
    r = c.post(url, json=body)
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited" and r.json()["error"]["retry_after"] > 0

    monkeypatch.setattr(get_settings(), "anon_ai_requests_per_hour", 1)
    code = publish(c, lab["id"], [{"id": "b1", "type": "text", "body": "x"}])
    wav = {"audio": ("a.wav", fixture_bytes("speech_en.wav"), "audio/wav")}
    assert client.post("/api/ai/transcribe", files=wav, data={"code": code}).status_code == 200
    assert client.post("/api/ai/transcribe", files=wav, data={"code": code}).status_code == 429

    set_ai(MetaAIClient(settings=Settings(model_api_key=None)))
    monkeypatch.setattr(get_settings(), "user_ai_requests_per_hour", 100)
    from app.security import rate_limiter

    rate_limiter.reset()
    r = c.post(url, json=body)
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_not_configured"


# ============================================================================ Paper2Explorer
def paper_out() -> dict:
    eq = {"label": "(1)", "latex": "\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}(QK^T/\\sqrt{d_k})V", "expression": "",
          "context": "Attention weights.", "conditions": "", "missing": ["Example Q, K, V"], "explorable": True,
          "suggestion": "algorithm", "algorithm": "attention", "cites": [cite(1, 1, EXACT_QUOTE)],
          "variables": [{"symbol": "d_k", "meaning": "key dimension", "unit": "", "known_value": 64, "provenance": "document"},
                        {"symbol": "Q", "meaning": "queries", "unit": "", "known_value": None, "provenance": "document"}]}
    eq2 = {**eq, "label": "(2)", "latex": "\\mathrm{MultiHead}(Q,K,V)", "suggestion": "diagram", "algorithm": None,
           "cites": [cite(1, 2, PAGE2_QUOTE)]}
    return {
        "title": "Attention Is All You Need (excerpt)", "summary": "Attention only.",
        "sections": [{"title": "3.2 Attention", "page_start_index": 1, "page_end_index": 2, "summary": "…"}],
        "equations": [eq, eq2],
        "figures": [{"label": "Figure 2", "caption": "Scaled Dot-Product Attention.", "description": "Two diagrams.",
                     "cites": [cite(1, 2, "Multi-Head Attention consists of several attention layers running in parallel")]}],
        "tables": [{"label": "Table 1", "caption": "Complexity", "columns": ["Layer", "Complexity"], "rows": [["Self-Attention", "O(n^2 d)"]],
                    "cites": [cite(1, 2, "Maximum path lengths and per-layer complexity")]}],
        "methods": [{"title": "Scaled dot-product attention", "summary": "…", "cites": [cite(1, 1, TWO_LINE_QUOTE)]}],
        "candidates": [{"kind": "equation", "ref_index": 1, "title": "Attention", "reason": "…", "suggestion": "algorithm"},
                       {"kind": "figure", "ref_index": 7, "title": "Nope", "reason": "…", "suggestion": "diagram"}],
        "warnings": [],
    }


def explore_out(kind: str, **fields) -> dict:
    base = {"variables": [{"symbol": "d_k", "meaning": "key size", "unit": "", "known_value": 64, "provenance": "document"}],
            "known": ["d_k = 64 (paper)"], "missing": ["Example matrices"], "block_kind": kind, "graph": None,
            "attention": None, "simulation": None, "notes": "Shows how the weights change."}
    return {**base, **fields}


def test_paper_structure_and_explore_equation(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, space="paper2explorer", title="Attention", subject="computer_science", grade="university", language="en")
    pdf = upload(c, lab["id"], fixture_bytes("attention_paper.pdf"), "paper.pdf")
    fake_ai.json_outputs["paper_structure"] = paper_out()
    r = c.post(f"/api/labs/{lab['id']}/ai/paper-structure", json={"source_id": pdf["id"]})
    assert r.status_code == 200, r.text
    paper = r.json()["analysis"]["paper"]
    assert fake_ai.last("paper_structure")["model"] == CONTRIBUTOR
    eq1, eq2 = paper["equations"]
    assert eq1["id"] == "eq1" and eq1["source_refs"][0]["located"] == "exact" and eq1["source_refs"][0]["page"] == 1
    assert eq2["source_refs"][0]["located"] == "exact" and eq2["source_refs"][0]["page"] == 2
    assert paper["figures"][0]["source_refs"][0]["located"] == "exact"
    assert paper["sections"][0]["page_start"] == 1 and paper["sections"][0]["page_end"] == 2
    assert [cand["ref_id"] for cand in paper["candidates"]] == ["eq1", ""]
    assert paper["tables"][0]["rows"] == [["Self-Attention", "O(n^2 d)"]]
    assert r.json()["lab"]["analysis"]["paper"]["title"].startswith("Attention")

    # a page selection maps positions in the attached subset back to the original pages
    r = c.post(f"/api/labs/{lab['id']}/ai/paper-structure", json={"source_id": pdf["id"], "pages": [2], "deep": True})
    assert r.status_code == 200 and fake_ai.last("paper_structure")["model"] == DEEP
    assert r.json()["analysis"]["paper"]["sections"][0]["page_start"] == 2

    patch_lab(c, lab["id"], analysis={**c.get(f"/api/labs/{lab['id']}").json()["analysis"], "paper": paper})
    attention = {"tokens": ["the", "cat", "sat"], "d_k": 2, "Q": [[1, 0], [0, 1], [1, 1]], "K": [[1, 0], [0, 1], [0.5, 0.5]],
                 "V": [[1, 2], [3, 4], [0.5, 9]], "explanation": "Weights per token."}
    fake_ai.json_outputs["explore_equation"] = explore_out("algorithm", attention=attention)
    r = c.post(f"/api/labs/{lab['id']}/ai/explore-equation", json={"equation_id": "eq1"})
    assert r.status_code == 200, r.text
    out = r.json()
    block = out["block"]
    assert block["type"] == "algorithm" and block["algorithm"] == "attention"
    assert block["config"] == {"tokens": ["the", "cat", "sat"], "Q": attention["Q"], "K": attention["K"],
                               "V": [[1, 2], [3, 4], [0.5, 5]]}  # values are kept small for a readable heatmap
    assert block["ai_generated"] is True and block["confirmed"] is False
    assert block["source_refs"][0]["located"] == "exact"
    assert "partial illustration" in block["explanation"]
    assert out["equation"]["explorable"] is True and out["equation"]["suggestion"] == "algorithm"
    assert "Known: d_k = 64 (paper)" in out["notes"]
    prompt = fake_ai.last("explore_equation")["payload"]["messages"][1]["content"]
    assert "TEXT AROUND THE EQUATION" in prompt and "Scaled Dot-Product Attention" in prompt

    graph = {"expression": "a*x^2 + d_k", "x_var": "x", "x_min": -3, "x_max": 3, "y_min": None, "y_max": None, "x_label": "x",
             "y_label": "y", "explanation": "Parabola.",
             "params": [{"symbol": "a", "name": "a", "unit": "", "value": 1, "min": -2, "max": 2, "step": 0.1, "role": "input",
                         "provenance": "assumption"},
                        {"symbol": "d_k", "name": "d_k", "unit": "", "value": 4, "min": 1, "max": 10, "step": 1, "role": "constant",
                         "provenance": "assumption"}]}
    fake_ai.json_outputs["explore_equation"] = explore_out("graph", graph=graph)
    r = c.post(f"/api/labs/{lab['id']}/ai/explore-equation", json={"latex": "y = a x^2 + d_k", "context": "toy"})
    block = r.json()["block"]
    assert block["type"] == "graph" and block["expression"] == "a*x^2 + d_k"
    params = {p["symbol"]: p for p in block["params"]}
    assert params["d_k"]["value"] == 64 and params["d_k"]["provenance"] == "document" and params["d_k"]["max"] >= 64
    LabSpec.model_validate({"blocks": [block]})

    fake_ai.json_outputs["explore_equation"] = explore_out("none")
    r = c.post(f"/api/labs/{lab['id']}/ai/explore-equation", json={"equation_id": "eq2"})
    assert r.json()["block"] is None and r.json()["equation"]["suggestion"] == "diagram"
    assert "explanatory diagram" in r.json()["notes"]
    assert c.post(f"/api/labs/{lab['id']}/ai/explore-equation", json={"equation_id": "eq99"}).status_code == 404
    assert c.post(f"/api/labs/{lab['id']}/ai/explore-equation", json={}).status_code == 422


# ============================================================================ generation
def pendulum_analysis(data_id: str) -> dict:
    measured = ref(data_id, "L = 0.5 m")
    return {
        "status": "done", "model": "fake", "mode": "contributor", "source_ids": [data_id],
        "result": {
            "topic": "Con lắc đơn", "summary": "Chu kỳ của con lắc đơn phụ thuộc vào chiều dài dây.",
            "objects": [{"id": "o1", "name": "Quả nặng", "source_refs": []}],
            "formulas": [{"id": "f1", "latex": "T = 2\\pi\\sqrt{L/g}", "expression": "2*pi*sqrt(L/g)", "output_symbol": "T",
                          "variables": ["L", "g"], "source_refs": [measured]}],
            "variables": [
                {"symbol": "L", "name": "Chiều dài dây", "unit": "m", "value": 0.5, "provenance": "user", "source_ref": measured},
                {"symbol": "g", "name": "Gia tốc trọng trường", "unit": "m/s²", "value": 9.8, "provenance": "document"},
            ],
            "steps": [{"id": "s1", "title": "Kéo lệch quả nặng", "source_refs": [measured]}, {"id": "s2", "title": "Thả và bấm giờ"}],
            "sequence_clear": True,
            "suggested_blocks": [{"type": "steps"}, {"type": "simulation", "model": "pendulum"}, {"type": "quiz"}],
            "assumptions": [{"id": "a1", "text": "Góc lệch nhỏ (dưới 10°)"}],
        },
    }


def quiz_out() -> dict:
    q = {"options": [], "answer_index": None, "answer_value": None, "tolerance": None, "unit": "", "explanation": "Vì T = 2π√(L/g).",
         "ref_ids": ["f1"]}
    return {"questions": [
        # a repeated option before the answer: the answer index must be found again by its text
        {**q, "kind": "mcq", "cognitive_level": "understand", "context": "Lan đo chu kỳ hai con lắc dài khác nhau ở sân trường.",
         "prompt": "Chu kỳ phụ thuộc vào gì?", "options": ["Khối lượng", "Khối lượng", "Chiều dài dây", "Màu quả nặng"], "answer_index": 2,
         "option_feedback": ["m không có trong công thức.", "m không có trong công thức.", "Đúng: T tăng theo căn bậc hai của L.",
                             "Màu không ảnh hưởng chu kỳ."],
         "hint": "Nhìn lại các đại lượng có trong công thức của T."},
        {**q, "kind": "truefalse", "prompt": "Quả nặng hơn thì chu kỳ dài hơn.", "options": ["x"], "answer_index": 1,
         "cognitive_level": "recall", "option_feedback": ["Sai lầm thường gặp: m không có trong công thức.", "Đúng: m không ảnh hưởng T."]},
        {**q, "kind": "order", "prompt": "Sắp xếp các bước", "options": ["Kéo lệch", "Thả", "Bấm giờ"]},
        {**q, "kind": "numeric", "prompt": "T khi L = 1 m?", "answer_value": 2.01, "tolerance": 0.02, "unit": "s"},
        {**q, "kind": "mcq", "prompt": "Câu lỗi", "options": ["A", "B"], "answer_index": 5},
    ]}


def generation_outputs(fake: FakeMeta) -> None:
    fake.json_outputs.update({
        "block_steps": {"title": "Các bước thí nghiệm", "description": "Làm theo từng bước.", "steps": [
            {"title": "Kéo lệch", "body": "Kéo quả nặng lệch một góc nhỏ.", "check_question": "Góc lệch bao nhiêu?", "ref_ids": ["s1"]},
            {"title": "Thả", "body": "Thả tay và bấm giờ.", "check_question": None, "ref_ids": ["s2", "f1"]}]},
        "block_simulation": {
            "title": "Mô phỏng con lắc", "description": "Thay đổi chiều dài dây.", "ref_ids": ["f1"],
            "params": [
                {"symbol": "l", "name": "Chiều dài", "value": 0.7, "min": 0, "max": 2, "step": 0.01, "provenance": "document"},
                {"symbol": "g", "name": "g", "value": 9.8, "min": 9, "max": 10, "step": 0.01, "provenance": "document"},
                {"symbol": "θ0", "name": "Góc", "value": 5, "min": 1, "max": 30, "step": 1, "provenance": "user"}],
            "reference_cases": [
                {"inputs": [{"symbol": "L", "value": 1}], "output": "period", "expected": 2.01, "tolerance": 0.02, "quote": "L = 1 m thì T ≈ 2,01 s"},
                {"inputs": [{"symbol": "L", "value": 1}], "output": "period", "expected": 3.5, "tolerance": 0.02, "quote": "sai số"},
                {"inputs": [{"symbol": "L", "value": 1}], "output": "speed", "expected": 1, "tolerance": 0.02, "quote": "?"},
                {"inputs": [{"symbol": "L", "value": 1}], "output": "period", "expected": 2.0, "tolerance": 0.02, "quote": ""}],
            "active": active_out("L", "chu kỳ", 0.5, 9), "notes": "Bỏ qua lực cản không khí."},
        "block_graph": {"title": "Đồ thị T theo L", "description": "", "ref_ids": ["f1"], "active": active_out("g", "period", 9.8, 1.6),
                        "graph": {"expression": "2*pi*sqrt(L/g)", "x_var": "L", "x_min": 0.1, "x_max": 2, "y_min": None, "y_max": None,
                                  "x_label": "L (m)", "y_label": "T (s)", "explanation": "Đường cong căn bậc hai.",
                                  "params": [{"symbol": "g", "name": "g", "unit": "m/s²", "value": 9.8, "min": 1, "max": 20, "step": 0.1,
                                              "role": "input", "provenance": "document"}]}},
        "block_flow": {"title": "Quy trình", "description": "", "layout": "linear",
                       "nodes": [{"key": "n1", "label": "Kéo lệch", "description": "", "ref_ids": ["s1"]},
                                 {"key": "n2", "label": "Thả", "description": "", "ref_ids": ["s2"]},
                                 {"key": "n1", "label": "Trùng", "description": "", "ref_ids": []}],
                       "edges": [{"source_key": "n1", "target_key": "n2", "label": "rồi", "description": ""},
                                 {"source_key": "n1", "target_key": "zz", "label": "?", "description": ""}]},
        "block_text": {"title": "Ghi chú", "body": "Dùng mô phỏng để kiểm tra dự đoán."},
        "block_lesson_meta": {"summary": "Khám phá chu kỳ con lắc.", "objectives": ["Giải thích vì sao chu kỳ phụ thuộc L"],
                              "glossary": [{"vi": "chu kỳ", "en": "period", "note": "thời gian một dao động"}]},
        "quiz": quiz_out(),
    })


def test_generate_builds_valid_blocks(teacher, fake_ai, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    assert c.post(f"/api/labs/{lab['id']}/ai/generate", json={}).json()["error"]["code"] == "analysis_required"
    data = c.post(f"/api/labs/{lab['id']}/sources/data",
                  json={"title": "Số đo", "values": [{"symbol": "L", "name": "chiều dài", "value": 0.5, "unit": "m"}]}).json()
    patch_lab(c, lab["id"], analysis=pendulum_analysis(data["id"]))
    generation_outputs(fake_ai)
    monkeypatch.setattr(generation, "build_flow_block", lambda out, basis: {"id": "", "type": "flow", "title": out.title})
    kinds = ["steps", "simulation", "algorithm", "quiz", "graph", "flow", "text"]
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": kinds})
    assert r.status_code == 200, r.text
    out = r.json()
    blocks = {b["type"]: b for b in out["lab"]["spec"]["blocks"]}
    assert set(blocks) == {"steps", "simulation", "quiz", "graph", "text"}  # flow invalid, algorithm unsupported
    assert out["generated_block_ids"] == [b["id"] for b in out["lab"]["spec"]["blocks"]]
    warnings = " | ".join(out["warnings"])
    assert "Khối “flow” do AI tạo không hợp lệ" in warnings
    assert "Chưa khớp thuật toán nào" in warnings
    assert "Đã bỏ 3 ví dụ tham chiếu" in warnings and "Đã bỏ 1 câu hỏi AI tạo" in warnings
    LabSpec.model_validate(out["lab"]["spec"])
    for block in blocks.values():
        assert block["ai_generated"] is True and block["confirmed"] is False
    assert {call["model"] for call in fake_ai.calls} == {CONTRIBUTOR}

    steps = blocks["steps"]
    assert steps["sequence_confirmed"] is True and [s["id"] for s in steps["steps"]] == ["s1", "s2"]
    assert steps["steps"][0]["source_refs"][0]["source_id"] == data["id"] and steps["steps"][0]["highlight"]["source_id"] == data["id"]

    sim = blocks["simulation"]
    assert sim["model"] == "pendulum" and [p["symbol"] for p in sim["params"]] == ["L", "g", "theta0"]
    params = {p["symbol"]: p for p in sim["params"]}
    assert params["L"]["value"] == 0.5 and params["L"]["provenance"] == "user" and params["L"]["min"] > 0  # domain L > 0
    assert params["L"]["source_ref"]["source_id"] == data["id"]
    assert params["g"]["value"] == 9.8 and params["g"]["provenance"] == "document"
    assert params["theta0"]["provenance"] == "assumption" and params["theta0"]["unit"] == "°"  # no user measurement
    assert sim["reference_cases"] == [{"inputs": {"L": 1.0, "g": 9.8, "theta0": 5.0}, "output": "period", "expected": 2.01, "tolerance": 0.02}]
    assert sim["active"]["observe"] == "period" and sim["active"]["param"] == "L"
    assert sim["active"]["to_value"] == params["L"]["max"]  # clamped into the slider range
    assert "không phải phép đo trực tiếp từ ảnh" in sim["notes"]

    graph = blocks["graph"]
    assert graph["active"]["observe"] in generation.GRAPH_OBSERVE_KEYS and graph["active"]["param"] == "g"
    assert graph["active"]["to_value"] == 1.6 and graph["params"][0]["provenance"] == "document"

    questions = blocks["quiz"]["questions"]
    assert [q["kind"] for q in questions] == ["mcq", "truefalse", "order", "numeric"]
    assert all(q["approved"] is False for q in questions) and len({q["id"] for q in questions}) == 4
    mcq = questions[0]
    assert mcq["options"] == ["Khối lượng", "Chiều dài dây", "Màu quả nặng"] and mcq["answer_index"] == 1  # found by its text
    assert mcq["option_feedback"][1].startswith("Đúng") and len(mcq["option_feedback"]) == 3
    assert mcq["context"].startswith("Lan đo") and mcq["hint"] and mcq["cognitive_level"] == "understand"
    assert questions[1]["options"] == ["Đúng", "Sai"] and questions[1]["option_feedback"][1] == "Đúng: m không ảnh hưởng T."
    assert questions[3]["option_feedback"] == [] and questions[3]["cognitive_level"] is None
    order = questions[2]
    assert [order["options"][i] for i in order["answer_order"]] == ["Kéo lệch", "Thả", "Bấm giờ"]
    assert questions[3]["answer_value"] == 2.01 and questions[3]["unit"] == "s"

    spec = out["lab"]["spec"]
    assert spec["summary"] == "Khám phá chu kỳ con lắc." and spec["glossary"][0]["en"] == "period"
    assert spec["assumptions"][0]["text"] == "Góc lệch nhỏ (dưới 10°)"

    report = c.post(f"/api/labs/{lab['id']}/validate").json()
    failing = [check for check in report["checks"] if check["status"] == "fail"]
    assert failing == [], failing  # generated blocks pass the publishing checks
    sim_ref = next(check for check in report["checks"] if check["code"] == "sim_reference")
    assert sim_ref["status"] == "pass"

    # replace: only the new blocks remain; a failed call becomes a warning, other blocks still arrive
    fake_ai.errors["block_text"] = 500
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["steps", "text"], "replace": True})
    assert r.status_code == 200, r.text
    assert [b["type"] for b in r.json()["lab"]["spec"]["blocks"]] == ["steps"]
    assert any("Chưa tạo được khối “text”" in w for w in r.json()["warnings"])
    fake_ai.errors["block_steps"] = 500
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["steps", "text"]})
    assert r.status_code == 502 and r.json()["error"]["code"] == "ai_upstream_error"  # nothing could be made
    assert c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["hologram"]}).status_code == 422


def test_generate_selected_formulas_are_independent_and_grounded(teacher, monkeypatch):
    c, _ = teacher
    lab = create_lab(c)
    first = c.post(f"/api/labs/{lab['id']}/sources/data", json={"title": "First", "values": [{"symbol": "m", "value": 1}]}).json()
    second = c.post(f"/api/labs/{lab['id']}/sources/data", json={"title": "Second", "values": [{"symbol": "V", "value": 2}]}).json()
    analysis = {"status": "done", "result": {"topic": "Moles", "formulas": [
        {"id": "f1", "latex": "n=m/M", "expression": "m/M", "output_symbol": "n", "variables": ["m", "M"], "confirmed": True, "source_refs": [ref(first["id"], "n=m/M")]},
        {"id": "f2", "latex": "n=V/22.4", "expression": "V/22.4", "output_symbol": "n", "variables": ["V"], "confirmed": True, "source_refs": [ref(second["id"], "n=V/22.4")]},
        {"id": "f3", "latex": "x", "expression": "x", "confirmed": False},
        {"id": "f4", "latex": "bad", "expression": "???", "confirmed": True},
    ], "variables": [{"symbol": "M", "unit": "g/mol", "provenance": "unknown"}]}}
    patch_lab(c, lab["id"], analysis=analysis)
    seen = []
    wrong = False

    async def gen_call(lab, actor, basis, *, kind, model_cls, task, mode):
        if kind == "lesson_meta":
            return generation.GenLessonMeta.model_validate({"summary": "", "objectives": [], "glossary": []})
        assert kind == "graph"
        formulas = basis.digest["formulas"]
        assert len(formulas) == 1
        f = formulas[0]
        seen.append(f["id"])
        expression = "m/M" if f["id"] == "f1" else "V/22.4"
        if wrong and f["id"] == "f2":
            expression = "V/24"
        return generation.GenGraph.model_validate({
            "title": f["id"], "description": "", "ref_ids": ["f2" if f["id"] == "f1" else "f1"], "active": None,
            "graph": {"expression": expression, "x_var": "m" if f["id"] == "f1" else "V", "x_min": 0.1,
                      "x_max": 10, "y_min": None, "y_max": None, "x_label": "m (invented)", "y_label": "n (invented)",
                      "explanation": "", "params": [{"symbol": "M", "name": "mass", "unit": "incorrect",
                      "value": 2, "min": 1, "max": 3, "step": 1, "role": "input", "provenance": "document"}] if f["id"] == "f1" else []},
        })

    monkeypatch.setattr(generation, "gen_call", gen_call)
    result = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["graph"], "formula_ids": ["f1", "f2"]})
    assert result.status_code == 200, result.text
    payload = result.json()
    graphs = payload["lab"]["spec"]["blocks"]
    assert seen == ["f1", "f2"]
    assert payload["generated_formula_ids"] == ["f1", "f2"]
    assert [g["expression"] for g in graphs] == ["m/M", "V/22.4"]
    assert [g["source_refs"][0]["source_id"] for g in graphs] == [first["id"], second["id"]]
    assert graphs[0]["params"][0]["provenance"] == "assumption" and graphs[0]["params"][0]["unit"] == "g/mol"
    assert graphs[0]["x_label"] == "m" and graphs[0]["y_label"] == "n"
    assert all(not g["confirmed"] and "chỉ là gợi ý" in g["description"] for g in graphs)
    assert any("điều kiện áp dụng" in warning for warning in payload["warnings"])

    # A later batch adds to the existing work, and a changed expression is never saved.
    wrong = True
    again = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["graph"], "formula_ids": ["f2"]})
    assert again.status_code == 200 and not again.json()["generated_block_ids"]
    assert again.json()["generated_formula_ids"] == []
    assert len(again.json()["lab"]["spec"]["blocks"]) == 2
    assert any("f2" in w and "biểu thức khác" in w for w in again.json()["warnings"])
    partial = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["graph"], "formula_ids": ["f1", "f2"]})
    assert partial.status_code == 200 and partial.json()["generated_formula_ids"] == ["f1"]
    assert len(partial.json()["lab"]["spec"]["blocks"]) == 3
    assert any("f2" in w and "biểu thức khác" in w for w in partial.json()["warnings"])
    for invalid in (["f3"], ["f4"], ["missing"], ["f1", "f1"], [], ["f1"] * 9):
        assert c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["graph"], "formula_ids": invalid}).status_code == 422
    assert c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["steps"], "formula_ids": ["f1"]}).status_code == 422


def test_generate_algorithm_configs(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, subject="informatics", title="Thuật toán sắp xếp", grade="11")
    analysis = {"status": "done", "result": {"topic": "Sắp xếp nổi bọt và tìm kiếm nhị phân", "summary": "So sánh và đổi chỗ.",
                                             "suggested_blocks": [{"type": "algorithm", "algorithm": "bubble_sort"}]}}
    patch_lab(c, lab["id"], analysis=analysis)
    base = {"title": "Sắp xếp", "description": "", "ref_ids": [], "tokens": [], "Q": [], "K": [], "V": [], "target": None,
            "explanation": "Đổi chỗ hai phần tử cạnh nhau."}
    fake_ai.json_outputs["block_algorithm"] = {**base, "algorithm": "bubble_sort", "array": [5, 2.0, 9, 1, 6]}
    fake_ai.json_outputs["block_lesson_meta"] = {"summary": "", "objectives": [], "glossary": []}
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["algorithm"]})
    assert r.status_code == 200, r.text
    block = r.json()["lab"]["spec"]["blocks"][0]
    assert block["algorithm"] == "bubble_sort" and block["config"] == {"array": [5, 2, 9, 1, 6]}
    assert "dãy số nhỏ" in block["explanation"] and "bài báo" not in block["explanation"]

    # builders used for other algorithms (search needs a sorted array + target; attention needs matrices)
    basis = generation.LessonBasis(analysis=generation.LabAnalysis(), digest={})
    out = generation.GenAlgorithm.model_validate({**base, "algorithm": "binary_search", "array": [9, 3, 3, 12, 7], "target": 7})
    built = generation.build_algorithm_block(out, "binary_search", basis, "en")
    assert built["config"] == {"array": [3, 7, 9, 12], "target": 7}
    generation.validate_block(built)
    out = generation.GenAlgorithm.model_validate({**base, "algorithm": "attention", "array": [], "tokens": ["a", "b"],
                                                  "Q": [[1, 0], [0, 1]], "K": [[1, 0], [0, 1]], "V": [[1], [2]]})
    assert generation.build_algorithm_block(out, "attention", basis, "en") is None  # V needs at least 2 columns
    out = generation.GenAlgorithm.model_validate({**base, "algorithm": "insertion_sort", "array": [1, 2]})
    assert generation.build_algorithm_block(out, "insertion_sort", basis, "en") is None

    # a requested simulation is recognised from the topic when the analysis suggested none
    plan, warnings = generation.plan_types(
        generation.GenerateIn(block_types=["simulation", "algorithm"]),
        generation.LabAnalysis.model_validate({"result": {"topic": "Con lắc lò xo nằm ngang"}}), "vi")
    assert plan == [("simulation", {"model": "spring_mass"})] and len(warnings) == 1


def test_generate_never_empties_the_lesson_when_nothing_is_made(teacher, fake_ai, monkeypatch):
    c, _ = teacher
    lab = create_lab(c, title="Phù sa sông Hồng", subject="geography")
    kept = {"id": "b1", "type": "text", "title": "Ý chính", "body": "Bài cô Lan đã soạn."}
    patch_lab(c, lab["id"], spec={"blocks": [kept], "summary": "Tóm tắt của cô Lan."},
              analysis={"status": "done", "result": {"topic": "Sông bồi đắp đồng bằng", "summary": "Phù sa theo dòng nước."}})
    version = c.get(f"/api/labs/{lab['id']}").json()["version"]
    # only an unsupported simulation was asked for: the plan is empty, so nothing is replaced
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["simulation"], "replace": True})
    assert r.status_code == 200, r.text
    out = r.json()
    assert [b["id"] for b in out["lab"]["spec"]["blocks"]] == ["b1"] and out["generated_block_ids"] == []
    assert len(out["warnings"]) == 1 and "mô hình mô phỏng đã kiểm thử" in out["warnings"][0]
    assert out["lab"]["version"] == version and fake_ai.calls == []  # nothing saved, no AI call paid for

    # every block the model returned was unusable: replacing would leave an empty lesson too
    generation_outputs(fake_ai)
    monkeypatch.setattr(generation, "build_flow_block", lambda out, basis: {"id": "", "type": "flow", "title": out.title})
    r = c.post(f"/api/labs/{lab['id']}/ai/generate", json={"block_types": ["flow"], "replace": True})
    assert r.status_code == 200, r.text
    spec = r.json()["lab"]["spec"]
    assert [b["id"] for b in spec["blocks"]] == ["b1"] and spec["summary"] == "Tóm tắt của cô Lan."


def test_simulation_params_stay_inside_the_engine_domain():
    raw = [GenSimParam(symbol="K", name="", value=-5, min=-10, max=0, step=0, provenance="document"),
           GenSimParam(symbol="M", name="mass", value=0.8, min=0, max=1, step=0.5, provenance="user")]
    params = {p["symbol"]: p for p in generation.simulation_params("spring_mass", raw, "en")}
    assert list(params) == ["k", "m"]  # only real model inputs become sliders
    assert params["k"]["value"] == 20.0 and params["k"]["min"] > 0 and params["k"]["provenance"] == "assumption"
    assert (params["m"]["value"], params["m"]["min"], params["m"]["max"]) == (0.8, 0.05, 1)  # m > 0
    assert params["m"]["name"] == "mass" and params["k"]["name"] == "Spring constant"
    assert params["m"]["provenance"] == "assumption"  # "user" needs a user measurement in the analysis
    ci = {p["symbol"]: p for p in generation.simulation_params("compound_interest", [], "en")}
    assert ci["t"]["unit"] == "years" and ci["r"]["unit"] == "%"
    assert {p["symbol"]: p["unit"] for p in generation.simulation_params("compound_interest", [], "vi")}["t"] == "năm"


# ============================================================================ quiz
def test_quiz_endpoint(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    assert c.post(f"/api/labs/{lab['id']}/ai/quiz", json={}).json()["error"]["code"] == "analysis_required"
    patch_lab(c, lab["id"], spec={"blocks": [{"id": "t1", "type": "text", "title": "Ghi chú", "body": "T = 2π√(L/g)"}]})
    fake_ai.json_outputs["quiz"] = quiz_out()
    r = c.post(f"/api/labs/{lab['id']}/ai/quiz", json={"count": 2, "kinds": ["mcq", "numeric"], "block_ids": ["t1"]})
    assert r.status_code == 200, r.text
    questions = r.json()["questions"]
    assert [q["kind"] for q in questions] == ["mcq", "numeric"] and all(q["approved"] is False for q in questions)
    assert questions[0]["options"][questions[0]["answer_index"]] == "Chiều dài dây" and len(questions[0]["option_feedback"]) == 3
    assert questions[0]["hint"] and questions[0]["context"] and questions[0]["cognitive_level"] == "understand"
    prompt = fake_ai.last("quiz")["payload"]["messages"][1]["content"]
    assert "T = 2π√(L/g)" in prompt and "Write 2 self-check questions" in prompt
    assert c.post(f"/api/labs/{lab['id']}/ai/quiz", json={"block_ids": ["nope"]}).status_code == 404


# ============================================================================ video
def markers_out(duration_hint: float) -> dict:
    return {"markers": [
        {"t": 4.0, "label": "Chạm bóng", "note": "Quan sát vị trí tay."},
        {"t": 1.0, "label": "Tư thế chuẩn bị", "note": ""},
        {"t": 1.1, "label": "Quá gần mốc trước", "note": ""},
        {"t": duration_hint + 50, "label": "Kết thúc", "note": ""},
        {"t": 2.0, "label": "", "note": "không nhãn"}],
        "limits": "Tay bị che khuất ở giây thứ 3.", "notes": "Video ngắn."}


def test_video_markers_and_tracking(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, subject="pe", title="Chuyền bóng thấp tay")
    video = upload(c, lab["id"], fixture_bytes("practice_h264.mp4"), "tap.mp4", contains_people=True, consent_confirmed=True)
    assert video["status"] == "ready"
    duration = video["duration_ms"] / 1000
    fake_ai.json_outputs["video_markers"] = markers_out(duration)
    r = c.post(f"/api/labs/{lab['id']}/ai/video-markers", json={"source_id": video["id"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert [m["t"] for m in out["markers"]] == [1.0, 4.0, round(duration, 2)]
    assert all(m["ai_suggested"] is True and m["confirmed"] is False for m in out["markers"])
    assert out["limits"].startswith("Tay bị che khuất") and "giáo viên kiểm tra và xác nhận" in out["limits"]
    call = fake_ai.last("video_markers")
    assert call["model"] == STANDARD  # a practice video with students
    content = call["payload"]["messages"][1]["content"]
    assert any(p["type"] == "video_url" and p["video_url"]["url"].startswith("data:video/mp4;base64,") for p in content)
    assert "Do NOT grade" in content[-1]["text"]

    frames = "\n".join([
        "<0f>0<|box;x1=10;y1=20;x2=29;y2=39;w=200;h=100|><|mask;x=0;y=0;data=20,20,~abc|>",
        "<2f>0<|box;x1=0;y1=0;x2=199;y2=99;w=200;h=100|>",
    ])
    fake_ai.sam = frames
    fake_ai.json_outputs["sam_phrase"] = {"phrase": "volleyball"}
    r = c.post(f"/api/labs/{lab['id']}/ai/track", json={"source_id": video["id"], "phrase": "quả bóng"})
    assert r.status_code == 200, r.text
    track = r.json()["track"]
    sam = fake_ai.last("sam")
    assert sam["prompt"] == "volleyball" and sam["media"] == "input_video" and sam["mime"] == "video/mp4"
    assert track["phrase"] == "quả bóng" and r.json()["frames_with_objects"] == 2
    assert len(track["frames"]) == round(min(duration, 120) * 12)
    assert track["frames"][0] == {"t": 0.0, "boxes": [[0.05, 0.2, 0.15, 0.4]]}
    assert track["frames"][1] == {"t": round(1 / 12, 3), "boxes": []}
    assert track["frames"][2]["boxes"] == [[0.0, 0.0, 1.0, 1.0]]

    image = upload(c, lab["id"], fixture_bytes("pendulum_photo.jpg"), "a.jpg")
    assert c.post(f"/api/labs/{lab['id']}/ai/video-markers", json={"source_id": image["id"]}).json()["error"]["code"] == "unsupported_file"


def test_track_frames_normalisation_and_proxy_limit():
    result = SamResult(width=100, height=50, frames={0: [SamObject(id="0", frame=0, box=[0, 0, 49, 24])],
                                                     5: [SamObject(id="0", frame=5, box=[50, 25, 99, 49])]})
    frames, with_objects = video_ai.track_frames(result, duration=1.0)
    assert len(frames) == 12 and with_objects == 2
    assert frames[0].boxes == [[0.0, 0.0, 0.5, 0.5]] and frames[5].boxes == [[0.5, 0.5, 1.0, 1.0]]
    assert frames[5].t == round(5 / 12, 3) and frames[3].boxes == []
    frames, _ = video_ai.track_frames(result, duration=300.0)
    assert len(frames) == 120 * 12  # the AI proxy covers the first 120 s only
    assert video_ai.track_frames(SamResult(), duration=3.0) == ([], 0)


# ============================================================================ SAM segmentation
def test_sam_records_may_have_a_space_after_the_separator():
    line = ("<0f>0<|box;x1=1;y1=1;x2=2;y2=2;w=10;h=10|>, 1<|box;x1=3;y1=3;x2=4;y2=4;w=10;h=10|>,"
            "  2<|box;x1=5;y1=5;x2=6;y2=6;w=10;h=10|><|mask;x=0;y=0;data=2,2,~ab|>")
    objects = parse_sam_text(line).frames[0]
    assert [(o.id, o.box) for o in objects] == [("0", [1, 1, 2, 2]), ("1", [3, 3, 4, 4]), ("2", [5, 5, 6, 6])]
    assert objects[2].mask == {"encoding": "lossless", "payload": "~ab", "height": 2, "width": 2}
    assert len(parse_sam_text(line.replace(", ", ",").replace(",  ", ",")).frames[0]) == 3


def test_segment_prompts_on_images_pages_assets_and_frames(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    photo = upload(c, lab["id"], (SEED / "pendulum_classroom_photo.jpg").read_bytes(), "con_lac.jpg")
    assert (photo["width"], photo["height"]) == (1200, 900)
    url = f"/api/labs/{lab['id']}/ai/segment"

    r = c.post(url, json={"source_id": photo["id"], "phrase": "red ball"})
    assert r.status_code == 200, r.text
    assert r.json() == {"width": 1200, "height": 900, "phrase_used": "red ball", "objects": [
        {"id": "0", "box": [681, 529, 769, 617], "mask": {"encoding": "lossless", "payload": "~abc", "width": 89, "height": 89},
         "confidence": None}]}
    sam = fake_ai.last("sam")
    assert sam["model"] == "sam-3.1" and sam["prompt"] == "red ball" and sam["media"] == "input_image" and sam["mime"] == "image/jpeg"

    c.post(url, json={"source_id": photo["id"], "points": [{"x": 725, "y": 573}, {"x": 100, "y": 100, "negative": True}]})
    assert fake_ai.last("sam")["prompt"] == "<0f>1<|point;x=725;y=573;w=1200;h=900|>-<|point;x=100;y=100;w=1200;h=900|>"
    c.post(url, json={"source_id": photo["id"], "points": [{"x": 0.5, "y": 0.25}]})  # fractions of the image
    assert fake_ai.last("sam")["prompt"] == "<0f>1<|point;x=600;y=225;w=1200;h=900|>"
    c.post(url, json={"source_id": photo["id"], "box": [850, 660, 600, 480]})
    assert fake_ai.last("sam")["prompt"] == "<0f>1<|box;x1=600;y1=480;x2=850;y2=660;w=1200;h=900|>"
    c.post(url, json={"source_id": photo["id"], "phrase": "<|box;x1=1|> ball <0f>"})
    assert fake_ai.last("sam")["prompt"] == "ball"  # control tokens never reach SAM

    fake_ai.json_outputs["sam_phrase"] = {"phrase": "red ball"}
    for phrase in ("quả bóng đỏ", "qua bong do"):  # Vietnamese with and without diacritics
        r = c.post(url, json={"source_id": photo["id"], "phrase": phrase})
        assert r.json()["phrase_used"] == "red ball" and fake_ai.last("sam")["prompt"] == "red ball"
    assert len(fake_ai.by("sam_phrase")) == 2
    c.post(url, json={"source_id": photo["id"], "phrase": "Quả bóng đỏ"})
    assert len(fake_ai.by("sam_phrase")) == 2  # translation cached

    big = upload(c, lab["id"], _png((2000, 1500)), "lon.png")  # the AI copy is at most 1600 px
    c.post(url, json={"source_id": big["id"], "points": [{"x": 1000, "y": 750}]})
    assert fake_ai.last("sam")["prompt"] == "<0f>1<|point;x=800;y=600;w=1600;h=1200|>"

    pdf = upload(c, lab["id"], fixture_bytes("attention_paper.pdf"), "paper.pdf")
    r = c.post(url, json={"source_id": pdf["id"], "page": 2, "points": [{"x": 100, "y": 200}]})
    assert r.status_code == 200 and fake_ai.last("sam")["mime"] == "image/png"
    assert re.fullmatch(r"<0f>1<\|point;x=100;y=200;w=893;h=1263\|>", fake_ai.last("sam")["prompt"])
    assert c.post(url, json={"source_id": pdf["id"], "page": 9, "phrase": "ball"}).status_code == 404

    asset = c.post(f"/api/labs/{lab['id']}/assets", files={"file": ("f.png", _png((320, 240)), "image/png")}, data={"kind": "frame"}).json()
    r = c.post(url, json={"asset_id": asset["id"], "box": [0.25, 0.25, 0.75, 0.75]})
    assert r.status_code == 200 and fake_ai.last("sam")["prompt"] == "<0f>1<|box;x1=80;y1=60;x2=240;y2=180;w=320;h=240|>"

    frame = {"file": ("frame.png", _png((400, 300)), "image/png")}
    r = c.post(f"/api/labs/{lab['id']}/ai/segment-frame", files=frame, data={"points": json.dumps([{"x": 200, "y": 150}])})
    assert r.status_code == 200, r.text
    assert fake_ai.last("sam")["prompt"] == "<0f>1<|point;x=200;y=150;w=400;h=300|>"
    r = c.post(f"/api/labs/{lab['id']}/ai/segment-frame", files=frame, data={"phrase": "ball"})
    assert r.status_code == 200 and fake_ai.last("sam")["prompt"] == "ball"
    bad = c.post(f"/api/labs/{lab['id']}/ai/segment-frame", files={"file": ("x.txt", b"hello", "text/plain")}, data={"phrase": "ball"})
    assert bad.status_code == 415
    assert c.post(f"/api/labs/{lab['id']}/ai/segment-frame", files=frame, data={"points": "not json"}).status_code == 422

    fake_ai.sam = ""  # zero matches is a valid answer
    r = c.post(url, json={"source_id": photo["id"], "phrase": "giraffe"})
    assert r.json() == {"width": 1200, "height": 900, "phrase_used": "giraffe", "objects": []}
    assert c.post(url, json={"source_id": photo["id"]}).json()["error"]["code"] == "validation_error"
    assert c.post(url, json={"phrase": "ball"}).status_code == 422


def test_point_and_box_prompts_rescale_to_the_sam_image():
    img = segmentation.SamImage(b"", "image/png", 800, 600, 1600, 1200, ImageRef())
    assert segmentation.point_prompt_for([PointIn(x=1600, y=0)], img) == "<0f>1<|point;x=799;y=0;w=800;h=600|>"
    assert segmentation.point_prompt_for([PointIn(x=0.5, y=0.5, negative=True)], img) == "<0f>1-<|point;x=400;y=300;w=800;h=600|>"
    assert segmentation.box_prompt_for([400, 300, 1200, 900], img) == "<0f>1<|box;x1=200;y1=150;x2=600;y2=450;w=800;h=600|>"
    assert segmentation.needs_translation("qua bong") and segmentation.needs_translation("dây")
    assert not segmentation.needs_translation("red ball") and not segmentation.needs_translation("long white string")


# ============================================================================ diagram
def test_diagram_parts_refined_with_sam(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, subject="biology", title="Tuần hoàn máu", grade="8")
    image = upload(c, lab["id"], (SEED / "circulatory_diagram.png").read_bytes(), "tuan_hoan.png")
    part = lambda key, label, box: {"key": key, "label": label, "description_simple": "Đơn giản.", "description_detailed": "Chi tiết.", "box": box}  # noqa: E731
    fake_ai.json_outputs["diagram"] = {
        "parts": [part("p1", "Tim", [0.1, 0.1, 0.3, 0.3]), part("p2", "Phổi", [0.5, 0.5, 0.7, 0.8]),
                  part("p3", "Rỗng", [0, 0, 0, 0]), part("p1", "Trùng", [0.2, 0.2, 0.4, 0.4])],
        "relations": [{"source_key": "p1", "target_key": "p2", "label": "bơm máu", "description": "…"},
                      {"source_key": "p2", "target_key": "p9", "label": "?", "description": ""}],
        "notes": "Hình rõ."}

    def sam(payload):
        prompt = payload["input"][0]["content"][0]["text"]
        x1, y1, x2, y2 = map(int, re.search(r"x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+)", prompt).groups())
        if x1 < 300:  # agrees with the proposal (shifted by 10 px)
            return f"<0f>0<|box;x1={x1 + 10};y1={y1 + 10};x2={x2 + 10};y2={y2 + 10};w=1200;h=1000|><|mask;x=0;y=0;data=4,4,~zz|>"
        return "<0f>0<|box;x1=0;y1=0;x2=50;y2=50;w=1200;h=1000|>"  # unrelated object: proposal kept

    fake_ai.sam = sam
    r = c.post(f"/api/labs/{lab['id']}/ai/diagram", json={"source_id": image["id"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["image"] == {"source_id": image["id"], "page": None, "asset_id": None}
    assert (out["image_width"], out["image_height"]) == (1200, 1000)
    h1, h2 = out["hotspots"]
    assert (h1["label"], h2["label"]) == ("Tim", "Phổi") and len(out["hotspots"]) == 2
    assert h1["bbox"] == pytest.approx([0.1083, 0.11, 0.3083, 0.31], abs=1e-3)
    assert h2["bbox"] == [0.5, 0.5, 0.7, 0.8]
    assert set(out["masks"]) == {"h1"} and out["masks"]["h1"]["mask"]["payload"] == "~zz"
    assert h1["source_refs"][0] == {"source_id": image["id"], "page": None, "page_label": None, "bbox": h1["bbox"], "time": None,
                                    "quote": None, "located": "approximate"}
    assert out["relations"] == [{"id": "rel1", "source": "h1", "target": "h2", "label": "bơm máu", "description": "…"}]
    assert len(fake_ai.by("sam")) == 2 and fake_ai.last("diagram")["model"] == CONTRIBUTOR
    LabSpec.model_validate({"blocks": [{"id": "d1", "type": "diagram", "image": out["image"], "hotspots": out["hotspots"],
                                       "relations": out["relations"]}]})

    r = c.post(f"/api/labs/{lab['id']}/ai/diagram", json={"source_id": image["id"], "refine_with_sam": False})
    assert r.json()["hotspots"][0]["bbox"] == [0.1, 0.1, 0.3, 0.3] and len(fake_ai.by("sam")) == 2


# ============================================================================ widgets
SAFE_PAGE = ('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, '
             'initial-scale=1"></head><body><label>L <input id="l" type="range"></label><svg xmlns="http://www.w3.org/2000/svg">'
             '</svg><script>document.getElementById("l").oninput = () => {};</script></body></html>')


def test_widget_generation_auto_repair_and_repair_endpoint(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    unsafe = SAFE_PAGE.replace("() => {}", "() => fetch('/api/auth/me')")
    fake_ai.json_outputs["widget"] = [{"html": "```html\n" + unsafe + "\n```", "summary": "…"}, {"html": SAFE_PAGE, "summary": "…"}]
    r = c.post(f"/api/labs/{lab['id']}/ai/widget", json={"description": "Thanh trượt đổi chiều dài dây"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["status"] == "validated" and out["html"] == SAFE_PAGE
    assert all(check["status"] != "fail" for check in out["checks"])
    calls = fake_ai.by("widget")
    assert len(calls) == 2  # generation + one automatic repair round
    assert "network_fetch" in calls[1]["payload"]["messages"][1]["content"]

    patch_lab(c, lab["id"], spec={"blocks": [{"id": "w1", "type": "widget", "html": SAFE_PAGE, "prompt": "…"}]})
    fake_ai.json_outputs["widget"] = {"html": SAFE_PAGE.replace("L <input", "Chiều dài <input"), "summary": "…"}
    r = c.post(f"/api/labs/{lab['id']}/ai/widget", json={"description": "Đổi nhãn thành Chiều dài", "block_id": "w1"})
    assert "CURRENT HTML" in fake_ai.last("widget")["payload"]["messages"][1]["content"] and r.json()["status"] == "validated"

    fake_ai.json_outputs["widget"] = {"html": unsafe, "summary": "…"}  # repair keeps failing → honest status
    r = c.post(f"/api/labs/{lab['id']}/ai/widget/repair", json={"html": unsafe, "errors": ["Uncaught ReferenceError: x (line 3)"]})
    assert r.status_code == 200 and r.json()["status"] == "failed"
    sent = fake_ai.last("widget")["payload"]["messages"][1]["content"]
    assert "Uncaught ReferenceError" in sent and "network_fetch" in sent


# ============================================================================ translation, cover, field
def test_translate_keeps_math_ids_and_saves_nothing(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    spec = {
        "summary": "Chu kỳ $T = 2\\pi\\sqrt{L/g}$ của con lắc.",
        "objectives": ["Giải thích chu kỳ"],
        "glossary": [{"id": "g1", "vi": "con lắc", "en": "pendulum", "note": ""}],
        "blocks": [
            {"id": "s", "type": "steps", "title": "Các bước", "steps": [{"id": "s1", "title": "Kéo lệch", "body": "Góc $\\alpha$ nhỏ."}]},
            {"id": "q", "type": "quiz", "title": "Câu hỏi", "questions": [
                {"id": "q1", "kind": "truefalse", "prompt": "Chu kỳ tăng khi L tăng.", "options": ["Đúng", "Sai"], "answer_index": 0},
                {"id": "q2", "kind": "mcq", "prompt": "Chọn đáp án", "options": ["Dài hơn", "Ngắn hơn"], "answer_index": 0,
                 "context": "Lan thả con lắc dài.", "hint": "Xem công thức chu kỳ.", "cognitive_level": "apply",
                 "option_feedback": ["Đúng vì T tăng theo L.", "Ngược lại."]}]},
        ],
    }
    saved = patch_lab(c, lab["id"], spec=spec)

    def translate(payload):
        items = json.loads(payload["messages"][1]["content"].split("ITEMS (JSON):\n", 1)[1])
        out = []
        for item in items:
            text = "EN " + item["text"]
            if item["text"].startswith("Góc"):
                text = "Small angle."  # lost its formula placeholder → original kept
            out.append({"id": item["id"], "text": text})
        return {"items": out, "glossary": [{"vi": "chu kỳ", "en": "period", "note": "time of one swing"},
                                           {"vi": "con lắc", "en": "pendulum", "note": "dup"}]}

    fake_ai.json_outputs["translate"] = translate
    r = c.post(f"/api/labs/{lab['id']}/ai/translate", json={"target": "en"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["target"] == "en"
    translated = out["spec"]
    assert translated["summary"] == "EN Chu kỳ $T = 2\\pi\\sqrt{L/g}$ của con lắc."
    sent = fake_ai.last("translate")["payload"]["messages"][1]["content"]
    assert "⟦M1⟧" in sent and "2\\\\pi" not in sent  # formulas never reach the translator
    steps = translated["blocks"][0]
    assert steps["id"] == "s" and steps["steps"][0]["id"] == "s1" and steps["title"] == "EN Các bước"
    assert steps["steps"][0]["body"] == "Góc $\\alpha$ nhỏ."
    quiz = translated["blocks"][1]["questions"]
    assert quiz[0]["options"] == ["True", "False"] and quiz[0]["answer_index"] == 0
    assert quiz[1]["options"] == ["EN Dài hơn", "EN Ngắn hơn"]
    assert quiz[1]["context"] == "EN Lan thả con lắc dài." and quiz[1]["hint"] == "EN Xem công thức chu kỳ."
    assert quiz[1]["option_feedback"] == ["EN Đúng vì T tăng theo L.", "EN Ngược lại."] and quiz[1]["cognitive_level"] == "apply"
    assert [(g["vi"], g["en"]) for g in translated["glossary"]] == [("con lắc", "pendulum"), ("chu kỳ", "period")]
    LabSpec.model_validate(translated)
    after = c.get(f"/api/labs/{lab['id']}").json()
    assert after["version"] == saved["version"] and after["spec"]["summary"] == spec["summary"]  # the teacher applies it


def test_cover_image_is_saved_as_ai_asset(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, topic="Dao động của con lắc")
    r = c.post(f"/api/labs/{lab['id']}/ai/cover", json={"prompt": "quả bóng đỏ treo trên dây"})
    assert r.status_code == 200, r.text
    asset = r.json()
    assert asset["kind"] == "cover" and asset["ai_generated"] is True and (asset["width"], asset["height"]) == (1280, 853)
    call = fake_ai.last("image")
    assert call["model"] == "muse-image-1.0" and "Dao động của con lắc" in call["payload"]["prompt"]
    assert "quả bóng đỏ treo trên dây" in call["payload"]["prompt"] and "No text" in call["payload"]["prompt"]
    got = c.get(f"/api/labs/{lab['id']}").json()
    assert got["cover_url"] == asset["url"]
    assert c.get(asset["url"]).headers["content-type"] == asset["mime"] == "image/jpeg"  # re-encoded, no metadata

    ai_client._client.settings.enable_image_generation = False
    r = c.post(f"/api/labs/{lab['id']}/ai/cover", json={})
    assert r.status_code == 403 and r.json()["error"]["code"] == "ai_feature_disabled"


def test_cover_style_reaches_the_prompt_and_the_asset_meta(teacher, fake_ai):
    from app.ai.cover_prompt import HOUSE, PRESETS

    c, _ = teacher
    lab = create_lab(c, subject="biology", grade="7", topic="Quang hợp ở lá cây")
    for bad in ({"style": "watercolour"}, {"style": "AUTO"}, {"style": None}, {"look": "clay"}):
        r = c.post(f"/api/labs/{lab['id']}/ai/cover", json=bad)
        assert r.status_code == 422, bad
    assert fake_ai.by("image") == []

    r = c.post(f"/api/labs/{lab['id']}/ai/cover", json={"style": "riso", "prompt": "một chiếc lá lớn đón nắng"})
    assert r.status_code == 200, r.text
    assert r.json()["meta"] == {"model": "muse-image-1.0", "style": "riso", "prompt_version": 2, "prompt": "một chiếc lá lớn đón nắng"}
    prompt = fake_ai.last("image")["payload"]["prompt"]
    assert PRESETS["riso"] in prompt and PRESETS["papercut"] not in prompt and HOUSE in prompt
    assert prompt.index("một chiếc lá lớn đón nắng") < prompt.index("No text")

    r = c.post(f"/api/labs/{lab['id']}/ai/cover", json={})  # auto: biology is a paper-cut diorama
    assert r.status_code == 200, r.text
    assert r.json()["meta"]["style"] == "papercut" and r.json()["meta"]["prompt"] == ""
    assert PRESETS["papercut"] in fake_ai.last("image")["payload"]["prompt"]
    assert fake_ai.last("image")["payload"]["size"] == "1536x1024"


def test_cover_prompt_uses_the_lessons_objects_and_glossary(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, subject="agriculture", space="paper2explorer", grade="university", goal="explore_paper", topic=None,
                     title="Lúa nước và phát thải")
    objects = [
        {"id": "o1", "name": "ruộng lúa", "description": "ruộng lúa ngập nước nông", "sam_phrase": "flooded rice paddy", "confirmed": True},
        {"id": "o2", "name": "rãnh", "description": "rãnh thoát nước giữa các ô ruộng", "sam_phrase": "drainage ditch"},
    ]
    patch_lab(c, lab["id"], analysis={"result": {"topic": "Quản lý mực nước", "objects": objects}},
              spec={"glossary": [{"id": "g1", "vi": "phát thải", "en": "methane emission"}, {"id": "g2", "vi": "mực nước", "en": "water level"}]})
    r = c.post(f"/api/labs/{lab['id']}/ai/cover", json={})
    assert r.status_code == 200, r.text
    prompt = fake_ai.last("image")["payload"]["prompt"]
    assert prompt.startswith("Cover picture for a university agriculture lesson")
    assert "Quản lý mực nước" in prompt  # the analysed topic, as the lab has none
    assert "flooded rice paddy (ruộng lúa ngập nước nông); drainage ditch (rãnh thoát nước giữa các ô ruộng)" in prompt
    assert "methane emission, water level" in prompt
    assert r.json()["meta"]["style"] == "papercut"


def test_a_new_cover_on_a_shared_lab_waits_for_publish_changes(teacher, client, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [graph_block()])
    first = c.post(f"/api/labs/{lab['id']}/ai/cover", json={}).json()
    after = c.get(f"/api/labs/{lab['id']}").json()
    assert after["cover_url"] == first["url"] and after["has_unpublished_changes"] is True  # "Publish changes" turns on
    assert client.get(f"/api/share/{code}").json()["cover_url"] is None  # learners see the shared snapshot

    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": True})
    assert r.status_code == 200, r.text
    assert r.json()["lab"]["has_unpublished_changes"] is False
    shared_url = client.get(f"/api/share/{code}").json()["cover_url"]
    assert shared_url and shared_url.endswith(f"/assets/{first['id']}/file")
    assert client.get(shared_url).headers["content-type"] == "image/jpeg"

    draft = create_lab(c, title="Bản nháp")
    version = c.get(f"/api/labs/{draft['id']}").json()["version"]
    c.post(f"/api/labs/{draft['id']}/ai/cover", json={})
    assert c.get(f"/api/labs/{draft['id']}").json()["version"] == version  # a draft keeps its version: no conflict for its editor


def test_field_scenario_normalises_coordinates_and_keeps_player_ids(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, subject="pe", title="Futsal")
    player = lambda team, label, x, y: {"team": team, "label": label, "x": x, "y": y}  # noqa: E731
    fake_ai.json_outputs["field_scenario"] = {"prompt": "Kéo người nhận bóng tới chỗ trống.", "frames": [
        {"note": "Bắt đầu", "players": [player("A", "A1", 20, 50), player("A", "A2", 40, 20)] + [player("A", f"X{i}", 50, 50) for i in range(5)]
         + [player("B", "GK", 95, 50)], "ball": {"x": 20, "y": 50},
         "arrows": [{"kind": "pass", "x1": 20, "y1": 50, "x2": 40, "y2": 20}]},
        {"note": "Chuyền", "players": [player("A", "A1", 30, 50), player("A", "A2", 40, 20)], "ball": None, "arrows": []}]}
    r = c.post(f"/api/labs/{lab['id']}/ai/field-scenario", json={"sport": "futsal", "description": "Phối hợp hai người"})
    assert r.status_code == 200, r.text
    frames = r.json()["frames"]
    first, second = frames
    assert sum(p["team"] == "A" for p in first["players"]) == 5  # futsal: 5 per team
    assert first["players"][0] == {"id": "p1", "team": "A", "label": "A1", "x": 0.2, "y": 0.5}
    assert second["players"][0]["id"] == "p1" and second["players"][0]["x"] == 0.3  # same player, same id
    assert first["ball"] == {"x": 0.2, "y": 0.5} and second["ball"] is None
    assert first["arrows"][0] == {"id": "a1", "kind": "pass", "x1": 0.2, "y1": 0.5, "x2": 0.4, "y2": 0.2}
    assert "futsal" in fake_ai.last("field_scenario")["payload"]["messages"][1]["content"]


# ============================================================================ active learning
def graph_block() -> dict:
    return {"id": "g1", "type": "graph", "title": "T theo L", "expression": "2*pi*sqrt(L/g)", "x_var": "L", "x_min": 0.1, "x_max": 2,
            "params": [{"symbol": "g", "value": 9.81, "min": 1, "max": 20, "step": 0.1, "role": "input"}],
            "active": {"question": "g giảm thì T thế nào?", "param": "g", "from_value": 9.81, "to_value": 1.62,
                       "observe": "y_max", "options": ["Tăng", "Giảm", "Không đổi"], "correct_option": 0}}


def test_explain_change_and_prediction_feedback(teacher, client, fake_ai):
    c, _ = teacher
    lab = create_lab(c)
    code = publish(c, lab["id"], [graph_block()])
    patch_lab(c, lab["id"], spec={"blocks": [graph_block(), {"id": "draft", "type": "text", "body": "nháp"}]})

    r = client.post(f"/api/share/{code}/ai/explain-change", json={"block_id": "g1", "before": {"g": 9.81, "T": 2.0}, "after": {"g": 1.62, "T": 4.9}})
    assert r.status_code == 200 and r.json() == {"explanation": fake_ai.text_output}
    prompt = fake_ai.last("chat")["payload"]["messages"][1]["content"]
    assert '"g":1.62' in prompt and "2*pi*sqrt(L/g)" in prompt
    assert client.post(f"/api/share/{code}/ai/explain-change", json={"block_id": "draft", "before": {}, "after": {}}).status_code == 404
    r = c.post(f"/api/labs/{lab['id']}/ai/explain-change", json={"block_id": "draft", "before": {}, "after": {}})
    assert r.status_code == 200  # the author previews the draft

    fake_ai.json_outputs["prediction_feedback"] = {"feedback": "Đúng rồi! g nhỏ hơn làm chu kỳ dài hơn.", "verdict": "incorrect"}
    r = client.post(f"/api/share/{code}/ai/prediction-feedback", json={"block_id": "g1", "prediction": "tăng", "observed": {"before": 2.0, "after": 4.9}})
    assert r.status_code == 200 and r.json()["correct"] is True  # decided by the block, not the model
    assert "CORRECT" in fake_ai.last("prediction_feedback")["payload"]["messages"][1]["content"]
    r = client.post(f"/api/share/{code}/ai/prediction-feedback", json={"block_id": "g1", "prediction": "2"})
    assert r.json()["correct"] is False  # "2" = the second option
    fake_ai.json_outputs["prediction_feedback"] = {"feedback": "Chưa rõ.", "verdict": "cannot_tell"}
    r = client.post(f"/api/share/{code}/ai/prediction-feedback", json={"block_id": "g1", "prediction": "nó sẽ dao động lạ"})
    assert r.json() == {"feedback": "Chưa rõ.", "correct": None}


# ============================================================================ transcription
def test_transcribe_converts_browser_recordings(teacher, fake_ai):
    client, _ = teacher
    wav = fixture_bytes("speech_en.wav")
    webm = media._run(["-i", "pipe:0", "-c:a", "libopus", "-b:a", "24k", "-f", "webm", "pipe:1"], timeout=60, input_bytes=wav)
    r = client.post("/api/ai/transcribe", files={"audio": ("q.webm", webm, "audio/webm")},
                    data={"lang": "en", "keywords": "pendulum, chu kỳ"})
    assert r.status_code == 200, r.text
    assert r.json() == {"transcript": "the period of a pendulum", "duration_ms": 4440}
    call = fake_ai.last("asr")
    assert media.is_supported_wav(call["audio"]) and call["audio"] != webm
    assert call["request"] == {"mode": "PUSH_TO_TALK", "model": "muse-voice-transcribe-1.0", "audioEncoding": "WAV",
                               "languageBias": ["English", "Vietnamese"], "keywords": ["pendulum", "chu kỳ"]}

    r = client.post("/api/ai/transcribe", files={"audio": ("q.wav", wav, "audio/wav")}, data={"lang": "vi"})
    assert r.status_code == 200 and fake_ai.last("asr")["audio"] == wav  # supported WAV is sent unchanged
    assert fake_ai.last("asr")["request"]["languageBias"] == ["Vietnamese", "English"]
    bad = client.post("/api/ai/transcribe", files={"audio": ("q.webm", b"not audio at all" * 20, "audio/webm")})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_audio"
    assert client.post("/api/ai/transcribe", files={"audio": ("q.wav", b"", "audio/wav")}).status_code == 400
    assert client.post("/api/ai/transcribe", files={"audio": ("q.wav", wav, "audio/wav")}, data={"lang": "fr"}).status_code == 422


def test_transcribe_is_for_signed_in_users_or_a_shared_lesson_with_its_tutor(teacher, client, fake_ai):
    c, _ = teacher
    wav = {"audio": ("q.wav", fixture_bytes("speech_en.wav"), "audio/wav")}
    assert c.post("/api/ai/transcribe", files=wav).status_code == 200  # a signed-in user needs no lesson

    r = client.post("/api/ai/transcribe", files=wav)  # anonymous, no lesson: the paid call is refused
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    assert client.post("/api/ai/transcribe", files=wav, data={"code": "ZZZZZZ"}).status_code == 404
    lab = create_lab(c)
    code = publish(c, lab["id"], [{"id": "b1", "type": "text", "body": "x"}])
    r = client.post("/api/ai/transcribe", files=wav, data={"code": code})  # a learner asking the lesson's tutor
    assert r.status_code == 200 and r.json()["transcript"] == "the period of a pendulum"
    assert len(fake_ai.by("asr")) == 2

    c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "link", "allow_tutor": False})
    r = client.post("/api/ai/transcribe", files=wav, data={"code": code})
    assert r.status_code == 403 and r.json()["error"]["code"] == "tutor_disabled"
    assert len(fake_ai.by("asr")) == 2


# ============================================================================ chat (SSE)
def chat_lab(c) -> tuple[dict, dict]:
    lab = create_lab(c, space="paper2explorer", title="Attention", subject="computer_science", grade="university", language="en")
    pdf = upload(c, lab["id"], fixture_bytes("attention_paper.pdf"), "paper.pdf")
    block = {"id": "b1", "type": "steps", "title": "Attention", "steps": [
        {"id": "s1", "title": "Scale", "body": "Divide by sqrt(d_k).",
         "source_refs": [{"source_id": pdf["id"], "page": 1, "quote": EXACT_QUOTE, "located": "exact"}]}]}
    patch_lab(c, lab["id"], spec={"blocks": [block], "assumptions": [{"id": "a1", "text": "Tiny matrices", "confirmed": True}]})
    return lab, pdf


def test_owner_chat_streams_cited_answers_and_keeps_history(teacher, fake_ai):
    c, _ = teacher
    lab, pdf = chat_lab(c)
    fake_ai.stream_chunks = ["The scores are divided ", "by the square root of d_k [1]", " so softmax stays smooth [7; 1]. Beyond [99]."]
    r = c.post(f"/api/labs/{lab['id']}/chat", json={"message": "Why divide by sqrt(d_k)?",
                                                    "context": {"block_id": "b1", "item_id": "s1", "state": {"d_k": 4}}})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-store" and r.text.startswith(": ok\n\n")
    events = sse_events(r.text)
    assert [e for e, _ in events] == ["delta", "delta", "delta", "done"]
    assert "".join(d["text"] for e, d in events if e == "delta") == "".join(fake_ai.stream_chunks)
    done = events[-1][1]
    assert done["role"] == "assistant"
    assert done["content"] == "The scores are divided by the square root of d_k [1] so softmax stays smooth [1]. Beyond."
    (citation,) = done["citations"]
    assert citation["n"] == 1 and citation["source_id"] == pdf["id"] and citation["page"] == 1
    assert citation["located"] == "exact" and len(citation["bbox"]) == 4 and citation["title"] == "paper.pdf"
    assert "Attention Is All You Need" in citation["quote"]

    call = fake_ai.last("stream")
    assert call["model"] == CONTRIBUTOR
    system = call["payload"]["messages"][0]["content"]
    assert "SOURCE EXCERPTS (cite with [n])" in system and "[1] “paper.pdf” (page 1)" in system
    assert "Beyond the sources:" in system and "Ngoài tài liệu:" not in system
    assert '"d_k":4' in system and "Assumption (confirmed): Tiny matrices" in system
    assert call["payload"]["messages"][-1] == {"role": "user", "content": "Why divide by sqrt(d_k)?"}

    history = c.get(f"/api/labs/{lab['id']}/chat").json()
    assert [m["role"] for m in history] == ["user", "assistant"] and history[1]["citations"][0]["n"] == 1
    c.post(f"/api/labs/{lab['id']}/chat", json={"message": "And for d_k = 64?"})
    assert fake_ai.last("stream")["payload"]["messages"][1:3] == [
        {"role": "user", "content": "Why divide by sqrt(d_k)?"}, {"role": "assistant", "content": done["content"]}]

    fake_ai.errors["stream"] = 500
    events = sse_events(c.post(f"/api/labs/{lab['id']}/chat", json={"message": "Again?"}).text)
    assert events == [("error", {"code": "ai_upstream_error", "message": "The AI service had a problem, please retry"})]
    assert len(c.get(f"/api/labs/{lab['id']}/chat").json()) == 4  # failed turns are not saved


def test_vietnamese_tutor_prompt_uses_vietnamese_source_boundary(teacher, fake_ai):
    c, _ = teacher
    lab = create_lab(c, language="vi")
    response = c.post(f"/api/labs/{lab['id']}/chat", json={"message": "Tại sao?"})
    assert response.status_code == 200
    system = fake_ai.last("stream")["payload"]["messages"][0]["content"]
    assert "Ngoài tài liệu:" in system and "Beyond the sources:" not in system


def test_share_chat_uses_snapshot_and_groups_anonymous_history(teacher, make_client, fake_ai):
    c, _ = teacher
    lab, pdf = chat_lab(c)
    code = publish(c, lab["id"], c.get(f"/api/labs/{lab['id']}").json()["spec"]["blocks"])
    learner, other = make_client(), make_client()
    r = learner.post(f"/api/share/{code}/chat", json={"message": "Tại sao chia cho căn d_k?"})
    assert r.status_code == 200 and "cl_viewer" in r.cookies
    done = sse_events(r.text)[-1]
    assert done[0] == "done" and done[1]["citations"][0]["source_id"] == pdf["id"]
    system = fake_ai.last("stream")["payload"]["messages"][0]["content"]
    assert "guide with hints" in system  # learner channel
    assert [m["role"] for m in learner.get(f"/api/share/{code}/chat").json()] == ["user", "assistant"]
    assert other.get(f"/api/share/{code}/chat").json() == []  # another learner sees nothing
    student = make_client()
    register(student, "hs@example.com", "student", "An")
    student.post(f"/api/share/{code}/chat", json={"message": "Hi"})
    assert len(student.get(f"/api/share/{code}/chat").json()) == 2
    assert len(learner.get(f"/api/share/{code}/chat").json()) == 2
    assert c.get(f"/api/labs/{lab['id']}/chat").json() == []  # studio and share histories are separate
