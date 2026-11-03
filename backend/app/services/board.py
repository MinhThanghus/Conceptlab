"""Board block: a photo of handwriting (board, notebook, paper) → a clean, easy-to-read sheet.

* :func:`read_board` — Muse Spark reads the photo (image source or PDF page) into items in
  reading order (heading, text, bullet, formula, equation, diagram, note), each with a box on the
  photo, the words it is unsure of and crossed-out writing marked. Ids are assigned here
  (``b1``, ``b2`` …), boxes are normalised, texts clipped to the stored limits.
* :func:`draw_board` — Muse Image (``/images/edits``) re-makes the photo from the
  teacher-confirmed transcription; Muse Spark proofreads the result against exactly the lines
  that should appear. On a mismatch the sheet is redrawn once with the corrections and the
  attempt with fewer issues is kept (ties: the later one). Attempts stay in memory, so only the
  kept sheet is ever written to storage, as an ``Asset(kind="generated")``.

The pure helpers below carry what a live probe taught (prompts in ``ai/prompts.py``): the title
is written once, crossed-out lines are quoted under LEAVE OUT, a drawing's description is never
listed as text to write (only its labels are), and the proof reference holds only what should
appear.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

import anyio
from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import get_ai, part_image, part_text
from ..ai.outputs import BoardProofOutput, BoardReadItemOut, BoardReadOutput, clip
from ..errors import AppError
from ..models import Asset, Lab
from ..schemas.api import BoardReadIn, BoardReadOut, BoardVisualIn, BoardVisualOut
from ..schemas.spec import BoardDiff, BoardItem, BoardProof, ImageRef
from ..security import Actor
from . import labs as lab_svc
from . import media
from .analysis import SourceInfo, call_ctx, choose_mode, effort, load_sources, norm_box, snapshot_source
from .segmentation import load_sam_image

log = logging.getLogger("conceptlab.board")

MAX_ITEMS = 80
MAX_VISIBLE_CHARS = 1500  # longer text does not fit one legible sheet (the Text view still works)
FORMULA_KINDS = ("formula", "equation")
_BULLET_RE = re.compile(r"^[-–—•·∙◦▪●○*+]\s+")
_TAGS = {
    "heading": "heading",
    "bullet": "bullet point",
    "formula": "formula, typeset like a textbook",
    "equation": "equation, typeset like a textbook",
    "note": "note in a box",
}


# ============================================================================ text helpers
def _one_line(text: object) -> str:
    return " ".join(str(text or "").split())


def _norm(text: str) -> str:
    """Comparison key: NFC, case-folded, single spaces, no surrounding punctuation."""
    text = unicodedata.normalize("NFC", text or "").casefold()
    return " ".join(text.split()).strip(" :.;,-–—")


def _quote(text: str) -> str:
    return '"' + _one_line(text).replace('"', "'") + '"'


def _unique(values: Iterable[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        if value and value not in out:
            out.append(value)
    return out


# ============================================================================ LaTeX helpers
# KaTeX extensible arrows (\xrightarrow, \xleftrightarrow, \xrightleftharpoons, \xRightarrow, …), not \xi
_ARROW_RE = re.compile(r"\\x(?:[lL]eft|[rR]ight|hook|mapsto|long|twohead|tofrom)[A-Za-z]*")
_WRAPPERS_RE = re.compile(r"\\(?:text|textrm|textit|textbf|mathrm|mathit|mathbf|operatorname|mbox)\s*\{([^{}]*)\}")
_FRAC_RE = re.compile(r"\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
_SQRT_RE = re.compile(r"\\sqrt\s*\{([^{}]*)\}")
_SCRIPT_RE = re.compile(r"([_^])\s*(?:\{([^{}]*)\}|([0-9A-Za-z+\-]))")
_SUB = str.maketrans("0123456789+-=()", "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎")
_SUP = str.maketrans("0123456789+-=()", "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾")
_SYMBOLS = {
    "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε", "varepsilon": "ε", "zeta": "ζ",
    "eta": "η", "theta": "θ", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ", "pi": "π",
    "rho": "ρ", "sigma": "σ", "tau": "τ", "phi": "φ", "varphi": "φ", "chi": "χ", "psi": "ψ", "omega": "ω",
    "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Pi": "Π", "Sigma": "Σ", "Phi": "Φ", "Psi": "Ψ",
    "Omega": "Ω", "cdot": "·", "times": "×", "div": "÷", "pm": "±", "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥",
    "ne": "≠", "neq": "≠", "approx": "≈", "infty": "∞", "circ": "°", "degree": "°", "to": "→", "rightarrow": "→",
    "leftarrow": "←", "Rightarrow": "⇒", "leftrightarrow": "↔", "rightleftharpoons": "⇌", "uparrow": "↑",
    "downarrow": "↓", "sqrt": "√", "sum": "Σ", "int": "∫", "partial": "∂", "percent": "%",
}


def _group(text: str, i: int, opener: str) -> tuple[str | None, int]:
    """The balanced ``[…]`` or ``{…}`` group starting at ``text[i]`` (spaces skipped), or (None, i)."""
    j = i
    while j < len(text) and text[j] == " ":
        j += 1
    if j >= len(text) or text[j] != opener:
        return None, i
    depth, k = 0, j + 1
    while k < len(text):
        ch = text[k]
        if ch == "\\":
            k += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            if opener == "{" and depth == 0:
                return text[j + 1 : k], k + 1
            depth -= 1
        elif ch == "]" and opener == "[" and depth == 0:
            return text[j + 1 : k], k + 1
        k += 1
    return None, i


def _scripts(match: re.Match) -> str:
    """_2 → ₂, ^{12} → ¹², ^o → ° ; other scripts stay readable (x_max, e^(-x))."""
    mark = match.group(1)
    body = (match.group(2) if match.group(2) is not None else match.group(3)).strip()
    if mark == "^" and body in ("o", "°"):
        return "°"
    if body and all(ch in "0123456789+-=()" for ch in body):
        return body.translate(_SUB if mark == "_" else _SUP)
    return f"{mark}{body}" if len(body) <= 1 or body.isalnum() else f"{mark}({body})"


def _wrap(part: str) -> str:
    return part if len(part) <= 1 or part.isalnum() else f"({part})"


def _arrow_symbol(name: str) -> str:
    if "harpoons" in name:
        return " ⇌ "
    if "leftright" in name.lower():
        return " ↔ "
    return " ← " if name.lower().startswith("\\xleft") else " → "


def latex_plain(latex: str) -> str:
    """A readable one-line approximation of a KaTeX formula (Unicode symbols, sub/superscript digits).
    Extensible arrows lose their conditions here (see :func:`arrow_conditions`)."""
    text = latex or ""
    out, i = [], 0
    for match in _ARROW_RE.finditer(text):  # \xrightarrow[under]{over} → →
        if match.start() < i:
            continue
        out.append(text[i : match.start()])
        _under, j = _group(text, match.end(), "[")
        _over, j = _group(text, j, "{")
        out.append(_arrow_symbol(match.group(0)))
        i = j
    text = "".join(out) + text[i:]
    for _ in range(4):  # nested wrappers resolve from the inside out
        text = _WRAPPERS_RE.sub(r"\1", text)
        text = _FRAC_RE.sub(lambda m: f"{_wrap(m.group(1).strip())}/{_wrap(m.group(2).strip())}", text)
        text = _SQRT_RE.sub(lambda m: f"√{_wrap(m.group(1).strip())}", text)
    text = re.sub(r"\\(?:left|right|big|Big|bigg|Bigg)\b", "", text)
    text = re.sub(r"\\[,;:! ]|\\q?quad\b", " ", text)
    text = re.sub(r"\^\s*\{?\s*\\circ\s*\}?", "°", text)
    text = re.sub(r"\\([A-Za-z]+)", lambda m: _SYMBOLS.get(m.group(1), m.group(1)), text)
    text = _SCRIPT_RE.sub(_scripts, text)
    text = text.replace("{", "").replace("}", "").replace("\\", "")
    return _one_line(text)


def arrow_conditions(latex: str) -> list[tuple[str, str]]:
    """``(over, under)`` words of every extensible arrow (``\\xrightarrow[under]{over}``,
    ``\\xrightarrow{over}``, ``\\xrightleftharpoons…``), as plain text without ``\\text{}``."""
    text = latex or ""
    pairs: list[tuple[str, str]] = []
    pos = 0
    while True:
        match = _ARROW_RE.search(text, pos)
        if match is None:
            break
        under, j = _group(text, match.end(), "[")
        over, j = _group(text, j, "{")
        pairs.append((latex_plain(over or ""), latex_plain(under or "")))
        pos = max(j, match.end())
    return pairs


# ============================================================================ what the sheet shows
def item_text(item: BoardItem) -> str:
    """The line a learner reads for an item; a formula without ``text`` falls back to its LaTeX."""
    text = _one_line(item.text)
    if not text and item.kind in FORMULA_KINDS and item.latex.strip():
        text = _one_line(f"{item.lead} {latex_plain(item.latex)}")
    return text


def is_visible(item: BoardItem) -> bool:
    """Shown to learners and redrawn: not crossed out and with something to show."""
    if item.struck:
        return False
    if item.kind == "diagram":
        return bool(_one_line(item.text) or any(_one_line(label) for label in item.labels))
    return bool(item_text(item))


def _written(items: Sequence[BoardItem]) -> list[BoardItem]:
    return [i for i in items if i.kind != "diagram" and is_visible(i)]


def title_line(title: str, items: Sequence[BoardItem]) -> str:
    """The title to write, or "" when a visible line already says the same (it is written once)."""
    title = _one_line(title)
    key = _norm(title)
    if not key or any(_norm(item_text(i)) == key for i in _written(items)):
        return ""
    return title


def _conditions(item: BoardItem) -> list[tuple[str, str]]:
    """Arrow conditions that are not already part of the item's line."""
    if item.kind not in FORMULA_KINDS:
        return []
    line = _norm(item_text(item))
    keep = lambda word: word if word and _norm(word) not in line else ""  # noqa: E731
    return [(keep(over), keep(under)) for over, under in arrow_conditions(item.latex)]


def visible_lines(title: str, items: Sequence[BoardItem]) -> list[str]:
    """Exactly the text the clean sheet must show, in order: the title once (skipped when a visible
    line already says it), every visible non-diagram item, and for formulas/equations the words
    written over or under their arrows. Crossed-out items and drawings are not text to write."""
    lines: list[str] = []
    head = title_line(title, items)
    if head:
        lines.append(head)
    for item in _written(items):
        lines.append(item_text(item))
        for over, under in _conditions(item):
            lines.extend(word for word in (over, under) if word and word not in lines)
    return lines


def diagram_labels(items: Sequence[BoardItem]) -> list[str]:
    return _unique(_one_line(label) for i in items if i.kind == "diagram" and is_visible(i) for label in i.labels)


def position_words(bbox: Sequence[float] | None) -> str:
    """Where a box sits on the photo: "top left", "right side", "centre", "lower right" …"""
    if not bbox or len(bbox) != 4:
        return ""
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    col = "left" if cx < 1 / 3 else "right" if cx > 2 / 3 else "centre"
    row = "top" if cy < 1 / 3 else "lower" if cy > 2 / 3 else "middle"
    if row == "middle":
        return "centre" if col == "centre" else f"{col} side"
    return f"{row} {col}"


def _arrow_note(item: BoardItem) -> str:
    pairs = _conditions(item)
    many = sum(1 for over, under in pairs if over or under) > 1
    notes: list[str] = []
    for n, (over, under) in enumerate(pairs, start=1):
        arrow = f"arrow {n}" if many else "the arrow"
        if over and under:
            notes.append(f"{_quote(over)} written over {arrow} and {_quote(under)} under it")
        elif over:
            notes.append(f"{_quote(over)} written over {arrow}")
        elif under:
            notes.append(f"{_quote(under)} written under {arrow}")
    return f", with {'; '.join(notes)}" if notes else ""


def write_lines(title: str, items: Sequence[BoardItem]) -> list[str]:
    """TEXT TO WRITE for the redraw prompt: numbered, with how to set each line in [brackets]."""
    out: list[str] = []
    head = title_line(title, items)
    if head:
        out.append(f"1. [title] {head}")
    title_key, title_done = _norm(title), bool(head)
    for item in _written(items):
        text = item_text(item)
        tag = _TAGS.get(item.kind, "")
        if not title_done and title_key and _norm(text) == title_key:
            tag, title_done = "title", True  # the heading that repeats the title is the main heading
        prefix = f"{len(out) + 1}. " + (f"[{tag}] " if tag else "")
        out.append(prefix + text + _arrow_note(item))
    return out


def drawing_lines(items: Sequence[BoardItem]) -> list[str]:
    """DRAWINGS TO REDRAW: where each drawing is, what it shows (never written) and its labels."""
    out: list[str] = []
    for item in items:
        if item.kind != "diagram" or not is_visible(item):
            continue
        where = position_words(item.bbox)
        description = _one_line(item.text).rstrip(".") or "a drawing"
        labels = _unique(_one_line(label) for label in item.labels)
        line = f"{len(out) + 1}. " + (f"At the {where}: " if where else "") + f"{description}."
        line += f" Labels to write on it: {', '.join(_quote(label) for label in labels)}." if labels else " No labels."
        out.append(line)
    return out


def struck_quotes(items: Sequence[BoardItem]) -> list[str]:
    """The crossed-out lines (to quote under LEAVE OUT)."""
    return _unique(item_text(i) for i in items if i.struck and i.kind != "diagram")


def visual_prompt(title: str, items: Sequence[BoardItem], corrections: str = "") -> str:
    lines = write_lines(title, items)
    drawings = drawing_lines(items)
    struck = struck_quotes(items)
    leave_out = f"crossed-out writing ({', '.join(_quote(s) for s in struck)}), " if struck else ""
    prompt = prompts.BOARD_VISUAL_PROMPT.format(
        lines="\n".join(lines) or "none", drawings="\n".join(drawings) or "none", leave_out=leave_out
    )
    return f"{prompt}\n{corrections}" if corrections else prompt


def proof_reference(title: str, items: Sequence[BoardItem]) -> tuple[str, str]:
    """(REFERENCE LINES, LABELS) for the proofreading prompt."""
    lines = visible_lines(title, items)
    labels = diagram_labels(items)
    return "\n".join(lines) or "none", ", ".join(_quote(label) for label in labels) or "none"


def edit_size(width: int, height: int) -> str:
    """The /images/edits size closest to the photo's shape."""
    ratio = (width or 1) / max(1, height or 1)
    if ratio > 1.2:
        return "1536x1024"
    if ratio < 0.83:
        return "1024x1536"
    return "1024x1024"


def _clean_list(values: Iterable[object], limit: int = 30) -> list[str]:
    return _unique(clip(_one_line(v), 200) for v in values)[:limit]


def proof_result(output: BoardProofOutput, labels: Iterable[str] = ()) -> BoardProof:
    """The model's proofreading as a stored :class:`BoardProof` (``ok`` = nothing to report).
    Differences whose two sides are identical, "extra" text that is an allowed drawing label and
    "extra" marks without a letter or digit (bullet dots, arrows: layout) are dropped."""
    allowed = {_norm(label) for label in labels if _norm(label)}
    diffs: list[BoardDiff] = []
    seen: set[tuple[str, str]] = set()
    for diff in output.differences:
        expected, found = clip(_one_line(diff.expected), 200), clip(_one_line(diff.found), 200)
        if unicodedata.normalize("NFC", expected) == unicodedata.normalize("NFC", found) or (expected, found) in seen:
            continue
        seen.add((expected, found))
        diffs.append(BoardDiff(expected=expected, found=found))
    missing = _clean_list(output.missing)
    extra = [e for e in _clean_list(output.extra) if _norm(e) not in allowed and any(ch.isalnum() for ch in e)]
    diffs = diffs[:30]
    return BoardProof(checked=True, ok=not (diffs or missing or extra), differences=diffs, missing=missing, extra=extra)


def issue_count(proof: BoardProof) -> int:
    return len(proof.differences) + len(proof.missing) + len(proof.extra)


def corrections(proof: BoardProof, lines: Sequence[str]) -> str:
    """BOARD_VISUAL_CORRECTIONS for a second attempt: write "X" not "Y"; do not write "Z"; also write "W"."""
    keys = [_norm(line) for line in lines]
    fixes: list[str] = []
    for diff in proof.differences:
        if diff.expected and diff.found:
            fixes.append(f"write {_quote(diff.expected)}, not {_quote(diff.found)}")
        elif diff.expected:
            fixes.append(f"also write {_quote(diff.expected)}")
        elif diff.found:
            fixes.append(f"do not write {_quote(diff.found)}")
    for text in proof.extra:
        key = _norm(text)
        repeated = bool(key) and any(key == line or key in line for line in keys)
        fixes.append(f"write {_quote(text)} only once" if repeated else f"do not write {_quote(text)}")
    fixes.extend(f"also write {_quote(text)}" for text in proof.missing)
    if not fixes:
        return ""
    return prompts.BOARD_VISUAL_CORRECTIONS.format(fixes="; ".join(_unique(fixes)) + ".")


# ============================================================================ reading
def read_items(raw: Sequence[BoardReadItemOut], width: int, height: int) -> list[BoardItem]:
    """Model items → stored items: server ids, normalised boxes, clipped texts; items with neither
    text nor LaTeX are dropped; unsure words must appear in the item; at most 80."""
    items: list[BoardItem] = []
    for entry in raw:
        kind = entry.kind
        formula = kind in FORMULA_KINDS
        text = _one_line(entry.text)
        if kind == "bullet":
            text = _BULLET_RE.sub("", text)
        text = clip(text, 2000)
        latex = clip(entry.latex, 2000) if formula else ""
        if not text and not latex:
            continue
        lead = clip(_one_line(entry.lead), 200) if formula else ""
        labels = _clean_list(entry.labels, 20) if kind == "diagram" else []
        haystack = _norm(" ".join([text, lead, *labels]))
        uncertain = [w for w in _clean_list(entry.uncertain, 20) if _norm(w) and _norm(w) in haystack]
        items.append(
            BoardItem(
                id=f"b{len(items) + 1}",
                kind=kind,
                text=text,
                lead=lead,
                latex=latex,
                labels=labels,
                bbox=norm_box(entry.box, width, height),
                uncertain=uncertain,
                struck=bool(entry.struck),
            )
        )
        if len(items) >= MAX_ITEMS:
            break
    return items


def _photo(db: Session, lab: Lab, source_id: str) -> SourceInfo:
    src = load_sources(db, lab, [source_id])[0]
    if src.kind not in ("image", "pdf"):
        raise AppError("unsupported_file", 422, "Choose a photo or a PDF page")
    return snapshot_source(src)


async def read_board(db: Session, lab: Lab, actor: Actor, body: BoardReadIn) -> BoardReadOut:
    info = _photo(db, lab, body.source_id)
    page = (body.page or 1) if info.kind == "pdf" else None
    db.commit()
    img = await anyio.to_thread.run_sync(lambda: load_sam_image(lab, info, None, page))
    mode, warnings = choose_mode(lab, people=info.contains_people)
    where = f"page {img.image.page} of the PDF “{info.title}”" if img.image.page else f"the photo “{info.title}”"
    content = [
        part_text(prompts.lesson_context(lab) + f"\n\nPHOTO: {where}, {img.width}×{img.height} px."),
        part_image(img.data, img.mime),
        part_text(prompts.BOARD_READ_TASK),
    ]
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab)}, {"role": "user", "content": content}],
        ctx=call_ctx("board-read", actor, lab),
        model_cls=BoardReadOutput,
        name="board_read",
        mode=mode,
        effort=effort(True),
    )
    out: BoardReadOutput = result.data
    return BoardReadOut(
        image=img.image,
        image_width=img.width,
        image_height=img.height,
        surface=out.surface,
        title=clip(_one_line(out.title), 200),
        items=read_items(out.items, img.width, img.height),
        unreadable=clip(out.unreadable, 2000),
        notes="\n".join(warnings).strip(),
    )


# ============================================================================ drawing
@dataclass
class _Sheet:
    data: bytes
    mime: str
    width: int
    height: int


async def draw_board(db: Session, lab: Lab, actor: Actor, body: BoardVisualIn) -> BoardVisualOut:
    info = _photo(db, lab, body.source_id)
    items = list(body.items)
    if not any(is_visible(i) for i in items):
        raise AppError("board_nothing_to_draw", 422, "Nothing is left to draw: every line is empty or crossed out")
    lines = visible_lines(body.title, items)
    chars = len("\n".join(lines))
    if chars > MAX_VISIBLE_CHARS:
        raise AppError(
            "board_too_long",
            422,
            f"The text is too long for one clean sheet ({chars} characters, at most {MAX_VISIBLE_CHARS}). "
            "Learners can still read it in the Text view.",
            extra={"chars": chars, "max_chars": MAX_VISIBLE_CHARS},
        )
    page = (body.page or 1) if info.kind == "pdf" else None
    db.commit()
    img = await anyio.to_thread.run_sync(lambda: load_sam_image(lab, info, None, page))
    mode, _warnings = choose_mode(lab, people=info.contains_people)
    size = edit_size(img.width, img.height)
    prompt = visual_prompt(body.title, items)
    ref_lines, ref_labels = proof_reference(body.title, items)
    labels = diagram_labels(items)
    ai = get_ai()

    async def redraw(text: str) -> _Sheet:
        raw, _mime = await ai.edit_image(prompt=text, image=img.data, mime=img.mime, ctx=call_ctx("board-visual", actor, lab), size=size)
        data, mime, width, height = await anyio.to_thread.run_sync(lambda: media.normalize_image_bytes(raw, media.AI_IMAGE_SIDE))
        return _Sheet(data, mime, width, height)

    async def proofread(sheet: _Sheet) -> BoardProof:
        task = prompts.BOARD_PROOF_TASK.format(lines=ref_lines, labels=ref_labels)
        try:
            result = await ai.chat_json(
                messages=[{"role": "user", "content": [part_image(sheet.data, sheet.mime), part_text(task)]}],
                ctx=call_ctx("board-proof", actor, lab),
                model_cls=BoardProofOutput,
                name="board_proof",
                mode=mode,
                effort=effort(True),
            )
        except AppError:  # the sheet is kept; the teacher sees that it was not checked
            log.warning("board proofreading failed", exc_info=True)
            return BoardProof(checked=False, ok=False)
        return proof_result(result.data, labels)

    sheet = await redraw(prompt)
    proof = await proofread(sheet)
    attempts = 1
    if proof.checked and not proof.ok:
        fixes = corrections(proof, lines)
        attempts = 2
        try:
            second = await redraw(f"{prompt}\n{fixes}" if fixes else prompt)
        except AppError:  # keep the first sheet and its honest proof
            log.warning("board redraw with corrections failed", exc_info=True)
            second = None
        if second is not None:
            second_proof = await proofread(second)
            if second_proof.checked and issue_count(second_proof) <= issue_count(proof):
                sheet, proof = second, second_proof
    proof = proof.model_copy(update={"attempts": attempts})

    key = storage.save_bytes(lab.id, sheet.data, "png" if sheet.mime == "image/png" else "jpg")
    try:
        db.refresh(lab)
        asset = Asset(
            lab_id=lab.id,
            source_id=info.id if any(s.id == info.id for s in lab.sources) else None,
            kind="generated",
            storage_key=key,
            mime=sheet.mime,
            width=sheet.width,
            height=sheet.height,
            ai_generated=True,
            meta_json={"model": ai.settings.image_model, "feature": "board", "size": size, "attempts": attempts, "proof_ok": proof.ok},
        )
        db.add(asset)
        db.commit()
        db.refresh(asset)
    except Exception:
        db.rollback()
        storage.delete_key(key)
        raise
    return BoardVisualOut(visual=ImageRef(asset_id=asset.id), asset=lab_svc.asset_out(asset), proof=proof)


__all__ = [
    "arrow_conditions",
    "corrections",
    "diagram_labels",
    "draw_board",
    "drawing_lines",
    "edit_size",
    "is_visible",
    "issue_count",
    "item_text",
    "latex_plain",
    "position_words",
    "proof_reference",
    "proof_result",
    "read_board",
    "read_items",
    "struck_quotes",
    "title_line",
    "visible_lines",
    "visual_prompt",
    "write_lines",
]
