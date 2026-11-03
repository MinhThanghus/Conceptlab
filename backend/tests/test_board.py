"""Board block (photo of handwriting → reviewed transcription → clean redrawn sheet).

Pure helpers of ``services/board.py`` (title written once, crossed-out lines left out and quoted,
a drawing's description never listed as text to write, arrow conditions, sizes, proof results),
the two AI endpoints through the fake Meta Model API of ``test_ai_offline`` (extended here with
``/images/edits``), validation checks, publish + clone of the photo and the redrawn sheet, the
translation field map and the guard that keeps AI generation from proposing empty boards.
"""

from __future__ import annotations

import base64
import io
import json
import re
from pathlib import Path

import httpx
import pytest
from PIL import Image
from sqlalchemy import select

from app import storage
from app.ai import client as ai_client
from app.ai import prompts
from app.ai.client import MetaAIClient, set_ai
from app.ai.outputs import BoardProofOutput
from app.config import Settings
from app.db import SessionLocal
from app.errors import AppError
from app.models import AICall, Asset, Lab, Source
from app.schemas.analysis import BlockType, LabAnalysis
from app.schemas.api import GenerateIn
from app.schemas.spec import AI_BLOCK_TYPES, BLOCK_TYPES, BoardItem, BoardProof, LabSpec
from app.services import board, generation, translate
from app.services.labs import validate_spec
from app.services.validation import CHECK_CODES, validate_lab
from tests.conftest import create_lab
from tests.test_ai_offline import CONTRIBUTOR, STANDARD, FakeMeta, _png, fixture_bytes, patch_lab, upload

EQUATION_LATEX = r"6CO_2 + 6H_2O \xrightarrow[\text{diệp lục}]{\text{ánh sáng}} C_6H_{12}O_6 + 6O_2"

ITEMS = [
    {"id": "b1", "kind": "heading", "text": "Con lắc đơn", "bbox": [0.18, 0.05, 0.51, 0.23]},
    {"id": "b2", "kind": "formula", "text": "Chu kì: T = 2π√(l/g)", "lead": "Chu kì:", "latex": r"T = 2\pi\sqrt{l/g}"},
    {"id": "b3", "kind": "bullet", "text": "Không phụ thuộc khối lượng m"},
    {"id": "b4", "kind": "diagram", "text": "Con lắc treo trên trần, dây dài l lệch góc α", "labels": ["l", "α", "m"],
     "bbox": [0.5, 0.44, 0.86, 0.83]},
    {"id": "b5", "kind": "text", "text": "dao động??", "struck": True},
]


def items(*rows) -> list[BoardItem]:
    return [BoardItem.model_validate(row) for row in rows]


# ============================================================================ fake /images/edits
def _webp(size, color=(247, 245, 236)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "WEBP")
    return buf.getvalue()


def multipart_parts(request: httpx.Request) -> dict[str, dict]:
    boundary = request.headers["content-type"].split("boundary=", 1)[1].encode()
    parts: dict[str, dict] = {}
    for chunk in request.content.split(b"--" + boundary):
        head, sep, body = chunk.partition(b"\r\n\r\n")
        name = re.search(rb'name="([^"]+)"', head)
        if not (sep and name):
            continue
        filename = re.search(rb'filename="([^"]*)"', head)
        ctype = re.search(rb"content-type: ([^\r\n]+)", head, re.IGNORECASE)
        parts[name.group(1).decode()] = {
            "body": body[:-2] if body.endswith(b"\r\n") else body,
            "filename": filename.group(1).decode() if filename else None,
            "content_type": ctype.group(1).decode() if ctype else None,
        }
    return parts


class BoardFake(FakeMeta):
    """FakeMeta + ``/images/edits`` (multipart). ``sheets`` are returned in order (the last repeats);
    ``edit_failures`` maps the n-th edit call (1-based) to an HTTP status."""

    def __init__(self) -> None:
        super().__init__()
        self.sheets: list[bytes] = [_webp((1536, 1024))]
        self.edit_failures: dict[int, int] = {}

    def handler(self, request: httpx.Request) -> httpx.Response:
        if not request.url.path.endswith("/images/edits"):
            return super().handler(request)
        parts = multipart_parts(request)
        fields = {k: v["body"].decode() for k, v in parts.items() if k != "image"}
        self.calls.append({"kind": "edit", "fields": fields, "image": parts.get("image"), "content_type": request.headers["content-type"]})
        status = self.edit_failures.get(len(self.by("edit")))
        if status:
            return httpx.Response(status, json={"error": {"message": "fake edit failure"}})
        sheet = self.sheets.pop(0) if len(self.sheets) > 1 else self.sheets[0]
        return httpx.Response(200, json={"created": 1, "data": [{"b64_json": base64.b64encode(sheet).decode()}], "output_format": "webp",
                                         "usage": {"input_tokens": 22928, "output_tokens": 2370, "total_tokens": 25298}})


@pytest.fixture
def board_ai():
    fake = BoardFake()
    previous = ai_client._client
    set_ai(MetaAIClient(settings=Settings(model_api_key="offline-test-key", ai_max_retries=0), transport=httpx.MockTransport(fake.handler)))
    yield fake
    set_ai(previous)


def read_item(kind="text", text="", box=(0.1, 0.1, 0.5, 0.2), lead="", latex="", labels=(), uncertain=(), struck=False) -> dict:
    return {"kind": kind, "text": text, "lead": lead, "latex": latex, "labels": list(labels), "box": list(box),
            "uncertain": list(uncertain), "struck": struck}


def read_out(rows, title="Con lắc đơn", surface="whiteboard", unreadable="") -> dict:
    return {"surface": surface, "title": title, "items": rows, "unreadable": unreadable}


def proof_out(differences=(), missing=(), extra=()) -> dict:
    return {"differences": [{"expected": e, "found": f} for e, f in differences], "missing": list(missing), "extra": list(extra)}


def photo(c, lab_id: str, size=(1200, 800), **fields) -> dict:
    return upload(c, lab_id, _png(size, (230, 232, 228)), "bang.png", **fields)


def visual_body(source_id: str, **extra) -> dict:
    return {"source_id": source_id, "title": "Con lắc đơn", "surface": "whiteboard", "items": ITEMS, **extra}


def lab_files(lab_id: str) -> set[str]:
    folder = storage.root() / "labs" / lab_id
    return {p.name for p in folder.iterdir()} if folder.exists() else set()


# ============================================================================ pure helpers
def test_title_is_written_once():
    rows = items(ITEMS[0], ITEMS[2])
    assert board.visible_lines("  con lắc   ĐƠN ", rows) == ["Con lắc đơn", "Không phụ thuộc khối lượng m"]
    assert board.visible_lines("Dao động", rows)[:2] == ["Dao động", "Con lắc đơn"]  # a different title comes first
    lines = board.write_lines("Con lắc đơn", rows)
    assert lines == ["1. [title] Con lắc đơn", "2. [bullet point] Không phụ thuộc khối lượng m"]
    assert board.visual_prompt("Con lắc đơn", rows).count("Con lắc đơn") == 1
    # a crossed-out heading does not stand in for the title
    struck_heading = items({**ITEMS[0], "struck": True}, ITEMS[2])
    assert board.visible_lines("Con lắc đơn", struck_heading) == ["Con lắc đơn", "Không phụ thuộc khối lượng m"]
    assert board.write_lines("", rows)[0] == "1. [heading] Con lắc đơn"


def test_struck_items_and_drawings_are_not_text_to_write():
    rows = items(*ITEMS)
    lines = board.visible_lines("Con lắc đơn", rows)
    assert lines == ["Con lắc đơn", "Chu kì: T = 2π√(l/g)", "Không phụ thuộc khối lượng m"]
    assert board.struck_quotes(rows) == ["dao động??"]
    prompt = board.visual_prompt("Con lắc đơn", rows)
    text_part, rest = prompt.split("DRAWINGS TO REDRAW", 1)
    drawings, leave_out = rest.split("LEAVE OUT:", 1)
    assert "Con lắc treo trên trần" not in text_part and "dao động??" not in text_part
    assert "2. [formula, typeset like a textbook] Chu kì: T = 2π√(l/g)" in text_part
    assert '1. At the right side: Con lắc treo trên trần, dây dài l lệch góc α. Labels to write on it: "l", "α", "m".' in drawings
    assert leave_out.startswith(' crossed-out writing ("dao động??"), any other writing')
    assert "#F7F5EC" in prompt and "#70E093" in prompt
    reference, labels = board.proof_reference("Con lắc đơn", rows)
    assert reference == "Con lắc đơn\nChu kì: T = 2π√(l/g)\nKhông phụ thuộc khối lượng m"
    assert labels == '"l", "α", "m"'
    # no drawing and nothing crossed out
    plain = board.visual_prompt("Con lắc đơn", items(ITEMS[2]))
    assert "never the description:\nnone\nLEAVE OUT: any other writing" in plain
    assert board.position_words([0, 0, 0.2, 0.2]) == "top left" and board.position_words([0.4, 0.4, 0.6, 0.6]) == "centre"
    assert board.position_words([0.7, 0.8, 0.9, 0.95]) == "lower right" and board.position_words(None) == ""


def test_equation_arrow_conditions():
    assert board.arrow_conditions(EQUATION_LATEX) == [("ánh sáng", "diệp lục")]
    assert board.arrow_conditions(r"2KClO_3 \xrightarrow{t^\circ} 2KCl + 3O_2") == [("t°", "")]
    assert board.arrow_conditions(r"N_2 + 3H_2 \xrightleftharpoons[\text{xt}]{\text{t}^o, p} 2NH_3") == [("t°, p", "xt")]
    assert board.arrow_conditions(r"A \xrightarrow{\text{a}} B \xrightarrow[\mathrm{b}]{} C") == [("a", ""), ("", "b")]
    assert board.arrow_conditions(r"\xi + \alpha \to \beta") == []
    assert board.latex_plain(EQUATION_LATEX) == "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂"
    assert board.latex_plain(r"T = 2\pi\sqrt{\frac{l}{g}}") == "T = 2π√(l/g)"

    equation = items({"id": "e", "kind": "equation", "text": "6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", "latex": EQUATION_LATEX})
    assert board.visible_lines("", equation) == ["6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂", "ánh sáng", "diệp lục"]
    assert board.write_lines("", equation) == [
        '1. [equation, typeset like a textbook] 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂, with "ánh sáng" written over the arrow and "diệp lục" under it'
    ]
    # words already in the line are not repeated; a formula without text falls back to its LaTeX
    inline = items({"id": "e", "kind": "equation", "text": "A → B (ánh sáng)", "latex": r"A \xrightarrow{\text{ánh sáng}} B"})
    assert board.visible_lines("", inline) == ["A → B (ánh sáng)"]
    bare = items({"id": "f", "kind": "formula", "lead": "Chu kì:", "latex": r"T = 2\pi\sqrt{l/g}"})
    assert board.visible_lines("", bare) == ["Chu kì: T = 2π√(l/g)"]


def test_edit_size_follows_the_photo_shape():
    assert board.edit_size(1600, 1067) == "1536x1024"
    assert board.edit_size(1000, 1000) == board.edit_size(1100, 1000) == "1024x1024"
    assert board.edit_size(1131, 1600) == "1024x1536"
    assert board.edit_size(0, 0) == "1024x1024"


def test_proof_result_and_corrections():
    ok = board.proof_result(BoardProofOutput.model_validate(proof_out()))
    assert ok == BoardProof(checked=True, ok=True)
    out = BoardProofOutput.model_validate(proof_out(
        differences=[("Chu kì", "Chu ki"), ("m", "m"), ("Chu kì", "Chu ki")], missing=["l tăng 4 lần"], extra=["α", "Con lắc đơn", "  ", "•", "→"]))
    proof = board.proof_result(out, labels=["l", "α", "m"])
    assert proof.checked and not proof.ok and proof.attempts == 1
    assert [(d.expected, d.found) for d in proof.differences] == [("Chu kì", "Chu ki")]  # same text and repeats dropped
    assert proof.extra == ["Con lắc đơn"] and proof.missing == ["l tăng 4 lần"]  # labels are allowed on drawings
    assert board.issue_count(proof) == 3
    fixes = board.corrections(proof, ["Con lắc đơn", "Chu kì: T = 2π√(l/g)"])
    assert fixes == prompts.BOARD_VISUAL_CORRECTIONS.format(
        fixes='write "Chu kì", not "Chu ki"; write "Con lắc đơn" only once; also write "l tăng 4 lần".')
    other = board.proof_result(BoardProofOutput.model_validate(proof_out(extra=["diệp lục tố??"])))
    assert board.corrections(other, ["Quang hợp"]).endswith('do not write "diệp lục tố??".')
    long = board.proof_result(BoardProofOutput.model_validate(proof_out(extra=[f"x{i}" for i in range(40)])))
    assert len(long.extra) == 30


# ============================================================================ read endpoint
def test_board_read_assigns_ids_normalises_boxes_and_clips(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    board_ai.json_outputs["board_read"] = read_out([
        read_item("heading", "Con lắc đơn", box=(182, 46, 508, 231)),  # 0..1000 grid
        read_item("formula", "Chu kì:  T = 2π√(l/g)\n", lead="Chu kì:", latex=r"T = 2\pi\sqrt{l/g}", box=(0.13, 0.13, 0.64, 0.34),
                  uncertain=["l/g", "không có", "l/g"]),
        read_item("bullet", "- Không phụ thuộc khối lượng m", lead="x", latex="y", labels=["z"]),
        read_item("text", "   "),  # nothing read: dropped
        read_item("text", "chữ " * 600, box=(0, 0, 0, 0)),
        read_item("diagram", "Hình con lắc", labels=["l", "α", "m"] + [f"x{i}" for i in range(25)], box=(606, 350, 1101, 665)),
        read_item("text", "dao động??", struck=True),
        read_item("equation", "", latex=EQUATION_LATEX),
    ], unreadable="Vết xóa mờ")
    r = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["image"] == {"source_id": image["id"], "page": None, "asset_id": None}
    assert (out["image_width"], out["image_height"], out["surface"], out["title"]) == (1200, 800, "whiteboard", "Con lắc đơn")
    assert (out["unreadable"], out["notes"]) == ("Vết xóa mờ", "")
    got = out["items"]
    assert [i["id"] for i in got] == ["b1", "b2", "b3", "b4", "b5", "b6", "b7"]
    assert got[0]["bbox"] == [0.182, 0.046, 0.508, 0.231] and got[0]["kind"] == "heading"
    assert (got[1]["text"], got[1]["lead"], got[1]["uncertain"]) == ("Chu kì: T = 2π√(l/g)", "Chu kì:", ["l/g"])
    assert (got[2]["text"], got[2]["lead"], got[2]["latex"], got[2]["labels"]) == ("Không phụ thuộc khối lượng m", "", "", [])
    assert len(got[3]["text"]) == 2000 and got[3]["text"].endswith("…") and got[3]["bbox"] is None
    assert got[4]["labels"][:3] == ["l", "α", "m"] and len(got[4]["labels"]) == 20
    assert got[4]["bbox"] == pytest.approx([0.505, 0.4375, 0.9175, 0.8313], abs=1e-3)
    assert got[5]["struck"] is True and got[6]["latex"] == EQUATION_LATEX and got[6]["text"] == ""
    LabSpec.model_validate({"blocks": [{"id": "bd", "type": "board", "image": out["image"], "items": got}]})

    call = board_ai.last("board_read")
    assert call["model"] == CONTRIBUTOR and call["payload"]["response_format"]["json_schema"]["strict"] is True
    content = call["payload"]["messages"][1]["content"]
    assert [p["type"] for p in content] == ["text", "image_url", "text"]
    assert re.search(r"PHOTO: the photo “[^”]*”, 1200×800 px\.", content[0]["text"]) and "LESSON CONTEXT" in content[0]["text"]
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg")
    assert content[2]["text"] == prompts.BOARD_READ_TASK and r"\xrightarrow[under]{over}" in prompts.BOARD_READ_TASK

    db = SessionLocal()
    try:
        assert [row.feature for row in db.scalars(select(AICall).where(AICall.lab_id == lab["id"]))] == ["board-read"]
    finally:
        db.close()


def test_board_read_limits_items_and_accepts_an_empty_board(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    board_ai.json_outputs["board_read"] = [read_out([read_item("text", f"dòng {i}") for i in range(95)]), read_out([], title="")]
    many = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]}).json()
    assert len(many["items"]) == 80 and many["items"][-1]["id"] == "b80"
    empty = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]})
    assert empty.status_code == 200 and empty.json()["items"] == [] and empty.json()["title"] == ""


def test_board_read_is_for_the_owner_and_needs_a_picture(teacher, other_user, client, board_ai):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c)
    image = photo(c, lab["id"])
    board_ai.json_outputs["board_read"] = read_out([read_item("text", "a")])
    assert client.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]}).status_code == 401
    r = o.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]})
    assert r.status_code == 404
    r = o.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 404
    note = c.post(f"/api/labs/{lab['id']}/sources/note", json={"title": "Ghi chú", "text": "Chu kì con lắc"}).json()
    r = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": note["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_file"
    assert c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": "nope"}).status_code == 404
    assert c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"], "extra": 1}).status_code == 422
    assert board_ai.by("board_read") == []


def test_board_read_and_draw_a_pdf_page(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    pdf = upload(c, lab["id"], fixture_bytes("attention_paper.pdf"), "bai.pdf")
    board_ai.json_outputs["board_read"] = read_out([read_item("text", "Attention")], surface="paper")
    r = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": pdf["id"], "page": 2})
    assert r.status_code == 200, r.text
    assert r.json()["image"] == {"source_id": pdf["id"], "page": 2, "asset_id": None}
    assert "PHOTO: page 2 of the PDF" in board_ai.last("board_read")["payload"]["messages"][1]["content"][0]["text"]
    assert c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": pdf["id"]}).json()["image"]["page"] == 1
    r = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": pdf["id"], "page": 999})
    assert r.status_code == 404

    board_ai.json_outputs["board_proof"] = proof_out()
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(pdf["id"], page=1))
    assert r.status_code == 200, r.text
    edit = board_ai.last("edit")
    assert edit["fields"]["size"] == "1024x1536" and edit["image"]["content_type"] == "image/png"  # portrait page render


def test_board_read_photo_of_people_uses_standard_mode(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"], contains_people=True, consent_confirmed=True)
    board_ai.json_outputs["board_read"] = read_out([read_item("text", "a")])
    out = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": image["id"]}).json()
    assert board_ai.last("board_read")["model"] == STANDARD
    assert out["notes"] == prompts.msg("privacy_standard", "vi")


# ============================================================================ visual endpoint
def test_board_visual_redraws_with_one_multipart_call_and_stores_a_generated_asset(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    before = lab_files(lab["id"])
    board_ai.json_outputs["board_proof"] = proof_out()
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 200, r.text
    out = r.json()
    asset = out["asset"]
    assert out["visual"] == {"source_id": None, "page": None, "asset_id": asset["id"]}
    assert (asset["kind"], asset["ai_generated"], asset["source_id"], asset["mime"]) == ("generated", True, image["id"], "image/jpeg")
    assert (asset["width"], asset["height"]) == (1536, 1024)
    assert asset["meta"] == {"model": "muse-image-1.0", "feature": "board", "size": "1536x1024", "attempts": 1, "proof_ok": True}
    assert out["proof"] == {"checked": True, "ok": True, "differences": [], "missing": [], "extra": [], "attempts": 1}
    assert len(lab_files(lab["id"]) - before) == 1
    file = c.get(asset["url"])
    assert file.status_code == 200 and file.headers["content-type"] == "image/jpeg"

    (edit,) = board_ai.by("edit")
    assert edit["content_type"].startswith("multipart/form-data")
    assert {k: v for k, v in edit["fields"].items() if k != "prompt"} == {"model": "muse-image-1.0", "n": "1", "size": "1536x1024"}
    assert edit["image"]["filename"] == "image.jpg" and edit["image"]["content_type"] == "image/jpeg"
    with Image.open(io.BytesIO(edit["image"]["body"])) as sent:
        assert sent.size == (1200, 800)
    prompt = edit["fields"]["prompt"]
    assert prompt == board.visual_prompt("Con lắc đơn", items(*ITEMS))
    assert prompt.count("Con lắc đơn") == 1 and 'crossed-out writing ("dao động??")' in prompt

    (proof,) = board_ai.by("board_proof")
    content = proof["payload"]["messages"][0]["content"]
    assert content[0]["image_url"]["url"].startswith("data:image/jpeg") and proof["model"] == CONTRIBUTOR
    assert content[1]["text"].endswith(
        'REFERENCE LINES:\nCon lắc đơn\nChu kì: T = 2π√(l/g)\nKhông phụ thuộc khối lượng m\nLABELS:\n"l", "α", "m"')

    db = SessionLocal()
    try:
        features = sorted(row.feature for row in db.scalars(select(AICall).where(AICall.lab_id == lab["id"])))
        assert features == ["board-proof", "board-visual"]
    finally:
        db.close()


@pytest.mark.parametrize(
    ("second_issues", "kept_width"),
    [(1, 1500), (2, 1500), (3, 1536)],  # fewer issues or a tie: the redraw; more issues: the first sheet
)
def test_board_visual_mismatch_redraws_once_and_keeps_the_better_sheet(teacher, board_ai, second_issues, kept_width):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    before = lab_files(lab["id"])
    board_ai.sheets = [_webp((1536, 1024)), _webp((1500, 1000))]
    first = proof_out(differences=[("Chu kì", "Chu ki")], extra=["Con lắc đơn"])
    second = proof_out(missing=["m", "l", "α"][:second_issues])
    board_ai.json_outputs["board_proof"] = [first, second]
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 200, r.text
    out = r.json()
    assert len(board_ai.by("edit")) == 2 and len(board_ai.by("board_proof")) == 2
    retry = board_ai.by("edit")[1]["fields"]["prompt"]
    assert retry.startswith(board_ai.by("edit")[0]["fields"]["prompt"] + "\nCORRECTIONS:")
    assert 'write "Chu kì", not "Chu ki"; write "Con lắc đơn" only once.' in retry
    assert out["asset"]["width"] == kept_width and out["proof"]["attempts"] == 2 and out["proof"]["ok"] is False
    if kept_width == 1500:
        assert out["proof"]["missing"] == ["m", "l", "α"][:second_issues] and out["proof"]["differences"] == []
    else:
        assert out["proof"]["differences"] == [{"expected": "Chu kì", "found": "Chu ki"}] and out["proof"]["extra"] == ["Con lắc đơn"]
    # only the kept sheet is stored
    db = SessionLocal()
    try:
        generated = db.scalars(select(Asset).where(Asset.lab_id == lab["id"], Asset.kind == "generated")).all()
        assert [a.id for a in generated] == [out["asset"]["id"]]
    finally:
        db.close()
    assert len(lab_files(lab["id"]) - before) == 1


def test_board_visual_keeps_an_unchecked_sheet_when_proofreading_fails(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    board_ai.errors["board_proof"] = 500
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 200, r.text
    assert r.json()["proof"] == {"checked": False, "ok": False, "differences": [], "missing": [], "extra": [], "attempts": 1}
    assert len(board_ai.by("edit")) == 1


def test_board_visual_keeps_the_first_sheet_when_the_redraw_fails(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    board_ai.edit_failures = {2: 500}
    board_ai.json_outputs["board_proof"] = proof_out(missing=["m"])
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["proof"]["missing"] == ["m"] and out["proof"]["attempts"] == 2 and out["asset"]["width"] == 1536
    assert len(board_ai.by("edit")) == 2 and len(board_ai.by("board_proof")) == 1


def test_board_visual_errors(teacher, board_ai):
    c, _ = teacher
    lab = create_lab(c)
    image = photo(c, lab["id"])
    struck_only = [{"id": "b1", "kind": "text", "text": "gạch", "struck": True}, {"id": "b2", "kind": "text", "text": "  "}]
    for body in (visual_body(image["id"], items=struck_only), visual_body(image["id"], items=[])):
        r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=body)
        assert r.status_code == 422 and r.json()["error"]["code"] == "board_nothing_to_draw"
    long_items = [{"id": f"b{i}", "kind": "text", "text": "x" * 400} for i in range(4)]
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"], items=long_items))
    assert r.status_code == 422 and r.json()["error"]["code"] == "board_too_long"
    assert r.json()["error"]["chars"] > 1500 and "Text view" in r.json()["error"]["message"]
    bad = visual_body(image["id"], items=[{"id": "b1", "kind": "poem", "text": "x"}])
    assert c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=bad).status_code == 422
    assert board_ai.by("edit") == []

    ai_client._client.settings.enable_image_generation = False
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 403 and r.json()["error"]["code"] == "ai_feature_disabled"

    ai_client._client.settings.enable_image_generation = True
    board_ai.edit_failures = {1: 429}
    r = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"]))
    assert r.status_code == 429 and r.json()["error"]["code"] == "ai_rate_limited"


def test_board_endpoints_need_ai(teacher):
    c, _ = teacher
    lab = create_lab(c)
    previous = ai_client._client
    set_ai(MetaAIClient(settings=Settings(model_api_key=None)))
    try:
        r = c.post(f"/api/labs/{lab['id']}/ai/board-read", json={"source_id": "x"})
        assert r.status_code == 503 and r.json()["error"]["code"] == "ai_not_configured"
    finally:
        set_ai(previous)


# ============================================================================ spec, validation
def board_block(**extra) -> dict:
    return {"id": "bd", "type": "board", "title": "Con lắc đơn", "image": {"source_id": "img"}, "surface": "whiteboard",
            "items": ITEMS, **extra}


def test_board_block_in_the_spec_and_the_ai_block_types():
    assert "board" in BLOCK_TYPES and "board" not in AI_BLOCK_TYPES and "board" not in BlockType.__args__
    spec = validate_spec({"blocks": [board_block()]})
    block = spec["blocks"][0]
    assert block["show"] == "visual" and block["visual"] is None and block["visual_proof"] is None and block["unreadable"] == ""
    assert block["items"][3]["labels"] == ["l", "α", "m"] and block["items"][4]["struck"] is True
    with pytest.raises(AppError):
        validate_spec({"blocks": [board_block(surface="wall")]})
    with pytest.raises(AppError):
        validate_spec({"blocks": [board_block(items=[{"id": "b1", "kind": "poem"}])]})
    with pytest.raises(AppError):
        validate_spec({"blocks": [board_block(items=[{"id": "b1", "text": "x"}] * 81)]})
    with pytest.raises(AppError) as err:
        generation.plan_types(GenerateIn(block_types=["steps", "board"]), LabAnalysis(), "vi")
    assert err.value.status == 422 and err.value.fields == {"block_types": "board"}


def _lab(blocks, sources=(), assets=()) -> Lab:
    lab = Lab(id="lab1", spec_json=validate_spec({"blocks": blocks}), language="vi")
    lab.sources = list(sources)
    lab.assets = list(assets)
    return lab


def _check(report, code):
    found = [c for c in report.checks if c.code == code and c.block_id == "bd"]
    assert len(found) == 1, [c.model_dump() for c in report.checks]
    return found[0]


def test_board_validation_checks():
    image = Source(id="img", kind="image", title="Bảng", status="ready")
    sheet = Asset(id="sheet", kind="generated", storage_key="k", mime="image/jpeg")
    good = board_block(visual={"asset_id": "sheet"}, visual_proof={"checked": True, "ok": True})
    report = validate_lab(None, _lab([good], [image], [sheet]))
    assert report.ok and {c.code for c in report.checks} <= set(CHECK_CODES)
    assert _check(report, "media_available").status == "pass"
    assert _check(report, "board_text").status == "pass" and _check(report, "board_text").detail == {"uncertain": 0, "items": 4}
    assert _check(report, "board_visual").status == "pass"
    assert _check(report, "sources_cited").status == "pass"

    assert _check(validate_lab(None, _lab([good], [], [sheet])), "media_available").detail["issue"] == "missing"
    assert _check(validate_lab(None, _lab([board_block(image={})], [image])), "media_available").status == "fail"

    unread = validate_lab(None, _lab([board_block(items=[])], [image]))
    assert not unread.ok and _check(unread, "board_text").detail["issue"] == "not_read"
    struck = board_block(items=[{**ITEMS[4]}, {"id": "b9", "kind": "text", "text": " "}])
    assert _check(validate_lab(None, _lab([struck], [image])), "board_text").detail["issue"] == "no_visible_item"
    unsure = board_block(items=[{**ITEMS[0], "uncertain": ["lắc", "đơn"]}, {**ITEMS[4], "uncertain": ["động"]}])
    check = _check(validate_lab(None, _lab([unsure], [image])), "board_text")
    assert check.status == "warn" and check.detail["uncertain"] == 2 and check.message.startswith("2 words")

    def visual_issue(**extra):
        check = _check(validate_lab(None, _lab([board_block(**extra)], [image], [sheet])), "board_visual")
        assert check.status == "warn"
        return check.detail

    assert visual_issue() == {"issue": "none"}
    assert visual_issue(visual={"asset_id": "gone"}) == {"issue": "missing"}
    assert visual_issue(visual={"asset_id": "sheet"}, visual_proof={"checked": False}) == {"issue": "unchecked"}
    mismatch = {"checked": True, "ok": False, "differences": [{"expected": "a", "found": "b"}], "extra": ["c"]}
    assert visual_issue(visual={"asset_id": "sheet"}, visual_proof=mismatch) == {"issue": "differences", "count": 2}


# ============================================================================ publish, clone
def test_publish_and_clone_keep_the_photo_and_the_redrawn_sheet(teacher, other_user, client, board_ai):
    c, _ = teacher
    o, _ = other_user
    lab = create_lab(c, title="Bảng con lắc")
    image = photo(c, lab["id"])
    board_ai.json_outputs["board_proof"] = proof_out()
    drawn = c.post(f"/api/labs/{lab['id']}/ai/board-visual", json=visual_body(image["id"])).json()
    sheet_id = drawn["asset"]["id"]
    block = board_block(image={"source_id": image["id"], "page": None, "asset_id": None}, visual=drawn["visual"],
                        visual_proof=drawn["proof"])
    patch_lab(c, lab["id"], spec={"blocks": [block]})
    report = c.post(f"/api/labs/{lab['id']}/validate").json()
    assert report["ok"] is True
    r = c.post(f"/api/labs/{lab['id']}/publish", json={"visibility": "public", "allow_tutor": True})
    assert r.status_code == 200, r.text
    code = r.json()["share_code"]

    shared = client.get(f"/api/share/{code}").json()
    assert sheet_id in [a["id"] for a in shared["assets"]] and image["id"] in [s["id"] for s in shared["sources"]]
    assert shared["spec"]["blocks"][0]["visual"]["asset_id"] == sheet_id
    assert client.get(f"/api/share/{code}/assets/{sheet_id}/file").status_code == 200

    for copy in (o.post(f"/api/share/{code}/clone").json(), c.post(f"/api/labs/{lab['id']}/duplicate").json()):
        copied = copy["spec"]["blocks"][0]
        assert copied["type"] == "board" and copy["id"] != lab["id"]
        assert copied["image"]["source_id"] == copy["sources"][0]["id"] != image["id"]
        assets = {a["id"]: a for a in copy["assets"]}
        assert copied["visual"]["asset_id"] in assets and copied["visual"]["asset_id"] != sheet_id
        assert assets[copied["visual"]["asset_id"]]["kind"] == "generated"
        assert assets[copied["visual"]["asset_id"]]["source_id"] == copy["sources"][0]["id"]


# ============================================================================ translation
def test_translation_extracts_the_board_lines(teacher, board_ai):
    spec = validate_spec({"blocks": [board_block(description="Ghi chép trên bảng", unreadable="Vết mờ")]})
    paths = {path: text for path, text, _limit in translate.extract_strings(spec)}
    assert paths == {
        ("blocks", 0, "title"): "Con lắc đơn",
        ("blocks", 0, "description"): "Ghi chép trên bảng",
        ("blocks", 0, "items", 0, "text"): "Con lắc đơn",
        ("blocks", 0, "items", 1, "text"): "Chu kì: T = 2π√(l/g)",
        ("blocks", 0, "items", 1, "lead"): "Chu kì:",
        ("blocks", 0, "items", 2, "text"): "Không phụ thuộc khối lượng m",
        ("blocks", 0, "items", 3, "text"): "Con lắc treo trên trần, dây dài l lệch góc α",
    }
    limits = {path: limit for path, _text, limit in translate.extract_strings(spec)}
    assert limits[("blocks", 0, "items", 1, "lead")] == 200 and limits[("blocks", 0, "items", 1, "text")] == 2000

    c, _ = teacher
    lab = create_lab(c)
    patch_lab(c, lab["id"], spec=spec)

    def fake_translate(payload):
        rows = json.loads(payload["messages"][1]["content"].split("ITEMS (JSON):\n", 1)[1])
        return {"items": [{"id": row["id"], "text": "EN " + row["text"]} for row in rows], "glossary": []}

    board_ai.json_outputs["translate"] = fake_translate
    r = c.post(f"/api/labs/{lab['id']}/ai/translate", json={"target": "en"})
    assert r.status_code == 200, r.text
    translated = r.json()["spec"]["blocks"][0]
    assert translated["items"][1]["lead"] == "EN Chu kì:" and translated["items"][1]["latex"] == r"T = 2\pi\sqrt{l/g}"
    assert translated["items"][3]["labels"] == ["l", "α", "m"] and translated["items"][4]["text"] == "dao động??"
    assert translated["unreadable"] == "Vết mờ"


def test_board_prompts_keep_their_placeholders():
    assert set(re.findall(r"{(\w+)}", prompts.BOARD_VISUAL_PROMPT)) == {"lines", "drawings", "leave_out"}
    assert set(re.findall(r"{(\w+)}", prompts.BOARD_PROOF_TASK)) == {"lines", "labels"}
    assert set(re.findall(r"{(\w+)}", prompts.BOARD_VISUAL_CORRECTIONS)) == {"fixes"}
    assert Path(board.__file__).name == "board.py"
