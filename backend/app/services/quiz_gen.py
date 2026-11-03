"""Self-check question generation (spec §8.5, §10.2): the teacher approves before learners see them.

Questions are grounded in the reviewed analysis and the lesson's own blocks; every question is
checked for its kind (mcq / truefalse / order / numeric), gets a unique id, source refs from
the analysis items it used, and ``approved: false``. Besides the answer, a question may carry
a ``context`` hook, a ``hint`` (dropped when it would give the answer away), a
``cognitive_level`` and per-option ``option_feedback`` (learners only see it after marking).
"""

from __future__ import annotations

import random
import re
import secrets
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from ..ai import prompts
from ..ai.client import get_ai
from ..ai.outputs import COGNITIVE_LEVELS, GenQuestion, QuizOutput, clip
from ..errors import AppError
from ..models import Lab
from ..schemas.analysis import LabAnalysis
from ..schemas.api import QuizGenIn, QuizGenOut
from ..schemas.spec import QuizQuestion
from ..security import Actor
from .analysis import call_ctx, check_expression, choose_mode, clean_expression, effort
from .expr import CONSTANTS, compile_expr, unknown_variables
from .generation import LessonBasis, build_basis, num

BLOCK_TEXT_KEYS = ("title", "description", "body", "label", "description_simple", "description_detailed", "explanation",
                   "notes", "prompt", "note", "question", "x_label", "y_label", "limits_note", "expression", "latex")
MAX_MCQ_OPTIONS = 6
MAX_ORDER_ITEMS = 8
FEEDBACK_LIMIT = 400
TEXT_LIMIT = 2000
CONTENT_LIMIT = 12000

MATH_RE = re.compile(r"\$\$.+?\$\$|\$[^$\n]+?\$", re.DOTALL)
# A number standing on its own: not part of a word, a symbol (2π, x2), a power (^2) or a fraction (1/2).
NUMBER_RE = re.compile(r"(?<![\w.,/^\\])\d+(?:[.,]\d+)?(?![\w/^\\]|[.,]\d)")
DECIMAL_RE = re.compile(r"(?<![\w.,])\d+[.,]\d+(?![\w]|[.,]\d)")
LEADING_NUMBER_RE = re.compile(r"^\s*([-−]?\d+(?:[.,]\d+)?)(?!\d)")
# "... is false", "Nhận định này là sai", "Sai, vì ...": a hint that states the verdict.
VERDICT_RE = re.compile(
    r"(?<!\w)(?:là|thì|is|are|was|were)\s+(?:hoàn toàn\s+|completely\s+|not\s+)?(?:đúng|sai|true|false|correct|incorrect|wrong)(?!\w)"
    r"|^\W*(?:đúng|sai|true|false)(?!\w)",
    re.IGNORECASE,
)


def tf_options(lang: str) -> list[str]:
    return prompts.msg("tf_options", lang).split("|")


def block_text(block: dict[str, Any], limit: int = 3000) -> str:
    """Readable digest of a block's text content (for question writing and the tutor)."""
    lines: list[str] = []

    def walk(node: Any, depth: int = 0) -> None:
        if depth > 5 or sum(len(x) for x in lines) > limit:
            return
        if isinstance(node, dict):
            for key, value in node.items():
                if key in ("html", "mask_path", "frames", "tracks", "validation", "source_refs", "highlight", "Q", "K", "V"):
                    continue
                if isinstance(value, str) and key in BLOCK_TEXT_KEYS and value.strip():
                    lines.append(f"{key}: {value.strip()[:600]}")
                elif isinstance(value, (dict, list)):
                    walk(value, depth + 1)
                elif key in ("symbol", "value", "unit", "min", "max") and value not in (None, ""):
                    lines.append(f"{key}={value}")
        elif isinstance(node, list):
            for item in node[:40]:
                walk(item, depth + 1)

    walk(block)
    return "\n".join(lines)[:limit]


def lesson_content(blocks: list[dict[str, Any]] | None, objectives: list[Any] | tuple = (), limit: int = CONTENT_LIMIT) -> str:
    """LESSON CONTENT for question writing: the lesson goals, then a digest of each block (quiz and
    widget blocks left out), so questions can point at the lesson's own steps and interactives."""
    parts: list[str] = []
    goals = [" ".join(str(o).split()) for o in objectives or [] if str(o).strip()][:12]
    if goals:
        parts.append("Lesson goals:\n" + "\n".join(f"- {goal[:300]}" for goal in goals))
    usable = [b for b in blocks or [] if isinstance(b, dict) and b.get("type") not in ("quiz", "widget")]
    for block in usable[:12]:
        text = block_text(block, 2500)
        if text.strip():
            parts.append(f"[{block.get('type')}] {text}")
    return "\n\n".join(parts)[:limit]


def existing_prompts(blocks: list[dict[str, Any]] | None, limit: int = 40) -> list[str]:
    """Prompts of the questions a lesson already has, so new ones do not repeat them."""
    out: list[str] = []
    for block in blocks or []:
        if not isinstance(block, dict) or block.get("type") != "quiz":
            continue
        for question in block.get("questions") or []:
            text = " ".join(str(question.get("prompt") or "").split()) if isinstance(question, dict) else ""
            if text and text not in out:
                out.append(text[:300])
    return out[:limit]


# ============================================================================ which kinds fit the material
def numeric_ready(basis: LessonBasis) -> bool:
    """A numeric question needs a computable formula whose inputs all have values (printed in a
    source, measured by the user or a stated assumption), so its answer is never an invented number."""
    valued = {symbol for symbol, quantity in basis.variables.items() if quantity.value is not None}
    valued |= {str(row.get("symbol")) for row in basis.digest.get("user_measurements") or [] if isinstance(row, dict)}
    candidates: list[tuple[str, str, set[str]]] = []
    result = basis.analysis.result
    for formula in result.formulas if result else []:
        candidates.append((formula.expression, formula.output_symbol, set()))
    paper = basis.analysis.paper
    for equation in paper.equations if paper else []:
        candidates.append((equation.expression, "", {v.symbol for v in equation.variables if v.known_value is not None}))
    for raw, output, known in candidates:
        expression, _ = clean_expression(raw or "", output)
        if check_expression(expression):
            continue
        if compile_expr(expression).variables - set(CONSTANTS) and not unknown_variables(expression, valued | known):
            return True
    return False


def material_kinds(basis: LessonBasis | None) -> list[str]:
    """Question kinds the reviewed analysis supports: always multiple choice and true/false;
    ordering only when the sources state the sequence; numeric only with a valued formula."""
    kinds = ["mcq", "truefalse"]
    if basis is None:
        return kinds
    result = basis.analysis.result
    if result is not None and result.sequence_clear and len(result.steps) >= 2:
        kinds.append("order")
    if numeric_ready(basis):
        kinds.append("numeric")
    return kinds


# ============================================================================ conversion
def _key(text: str) -> str:
    return " ".join(str(text).split()).casefold()


def _phrase(text: str) -> re.Pattern[str] | None:
    """Whole-word, case-insensitive pattern for a phrase (end punctuation ignored)."""
    words = str(text).strip().strip(".,;:!?…").split()
    if not words:
        return None
    return re.compile(r"(?<!\w)" + r"\s+".join(re.escape(w) for w in words) + r"(?!\w)", re.IGNORECASE)


def _mentions(text: str, phrase: str, start: int = 0) -> re.Match[str] | None:
    pattern = _phrase(phrase)
    return pattern.search(text, start) if pattern is not None else None


def _numbers(text: str) -> list[float]:
    """Numbers written in a text. Inside $...$ only decimals count (formulas are full of 2π and x²)."""
    found = NUMBER_RE.findall(MATH_RE.sub(" ", text))
    for segment in MATH_RE.findall(text):
        found.extend(DECIMAL_RE.findall(segment.replace("{,}", ",")))
    values: list[float] = []
    for item in found:
        value = num(item.replace(",", "."))
        if value is not None:
            values.append(value)
    return values


def _same_number(found: float, answer: float, tolerance: float) -> bool:
    if answer == 0:
        return abs(found) <= 1e-9
    return abs(found - answer) <= tolerance * abs(answer)


def hint_reveals(hint: str, data: dict[str, Any]) -> bool:
    """True when a hint would give the answer away: the correct option's words, the final
    number, the sequence in its solved order, or a true/false verdict."""
    text = " ".join(hint.split())
    kind = data.get("kind")
    options = data.get("options") or []
    if kind == "mcq":
        correct = options[data["answer_index"]]
        if len(_key(correct)) >= 3 and _mentions(text, correct):
            return True
        lead = LEADING_NUMBER_RE.match(correct)
        value = num(lead.group(1).replace(",", ".").replace("−", "-")) if lead else None
        return value is not None and any(_same_number(found, value, 0.005) for found in _numbers(text))
    if kind == "truefalse":
        return VERDICT_RE.search(text) is not None
    if kind == "order":
        items = [options[i] for i in data.get("answer_order") or []]
        position = 0
        for item in items:
            match = _mentions(text, item, position)
            if match is None:
                return False
            position = match.end()
        return len(items) >= 2
    if kind == "numeric":
        answer = data.get("answer_value")
        tolerance = min(max(float(data.get("tolerance") or 0.02), 0.005), 0.05)
        return answer is not None and any(_same_number(found, answer, tolerance) for found in _numbers(text))
    return False


def _unique(texts: list[str]) -> list[str]:
    out, seen = [], set()
    for text in texts:
        key = _key(text)
        if text and key not in seen:
            seen.add(key)
            out.append(text)
    return out


def _mcq_options(q: GenQuestion) -> tuple[list[str], list[str], int] | None:
    """Options without blanks or repeats, their feedback kept alongside, and the answer index
    found again by the correct option's text (filtering must never shift it to another option)."""
    raw = [clip(option, 200) for option in q.options]
    notes = [clip(note, FEEDBACK_LIMIT) for note in q.option_feedback] if len(q.option_feedback) == len(q.options) else []
    answer = q.answer_index
    if answer is None or not 0 <= answer < len(raw) or not raw[answer]:
        return None
    options: list[str] = []
    feedback: list[str] = []
    slot: dict[str, int] = {}
    for i, text in enumerate(raw):
        if not text:
            continue
        key = _key(text)
        if key in slot:
            if i == answer and notes:
                feedback[slot[key]] = notes[i]  # the correct entry's note explains the right answer
            continue
        slot[key] = len(options)
        options.append(text)
        feedback.append(notes[i] if notes else "")
    index = slot[_key(raw[answer])]
    if len(options) > MAX_MCQ_OPTIONS:
        if index >= MAX_MCQ_OPTIONS:
            return None
        options, feedback = options[:MAX_MCQ_OPTIONS], feedback[:MAX_MCQ_OPTIONS]
    if len(options) < 2:
        return None
    return options, (feedback if any(feedback) else []), index


def convert_question(q: GenQuestion, basis: LessonBasis | None, lang: str, rng: random.Random) -> QuizQuestion | None:
    prompt = clip(q.prompt, TEXT_LIMIT)
    if not prompt:
        return None
    refs = basis.refs_for(q.ref_ids, 6) if basis else []
    data: dict[str, Any] = {
        "id": f"q_{secrets.token_hex(4)}",
        "kind": q.kind,
        "prompt": prompt,
        "context": clip(q.context, TEXT_LIMIT),
        "explanation": clip(q.explanation, TEXT_LIMIT),
        "cognitive_level": q.cognitive_level if q.cognitive_level in COGNITIVE_LEVELS else None,
        "option_feedback": [],
        "source_refs": [r.model_dump(mode="json") for r in refs],
        "approved": False,
        "options": [],
        "unit": "",
    }
    if q.kind == "mcq":
        picked = _mcq_options(q)
        if picked is None:
            return None
        options, feedback, index = picked
        data.update(options=options, answer_index=index, option_feedback=feedback)
    elif q.kind == "truefalse":
        if q.answer_index not in (0, 1):
            return None
        notes = [clip(note, FEEDBACK_LIMIT) for note in q.option_feedback]
        data.update(options=tf_options(lang), answer_index=q.answer_index, option_feedback=notes if len(notes) == 2 and any(notes) else [])
    elif q.kind == "order":
        items = _unique([clip(option, 200) for option in q.options if str(option).strip()])[:MAX_ORDER_ITEMS]
        if len(items) < 3:
            return None
        shuffled = items[:]
        for _ in range(8):
            rng.shuffle(shuffled)
            if shuffled != items:
                break
        data.update(options=shuffled, answer_order=[shuffled.index(item) for item in items])
    elif q.kind == "numeric":
        value = num(q.answer_value)
        if value is None:
            return None
        tolerance = num(q.tolerance, 0.02) or 0.02
        data.update(answer_value=value, tolerance=min(max(abs(tolerance), 0.001), 0.5), unit=clip(q.unit, 40))
    else:  # pragma: no cover - constrained by the schema
        return None
    hint = clip(q.hint, TEXT_LIMIT)
    data["hint"] = "" if hint and hint_reveals(hint, data) else hint
    try:
        return QuizQuestion.model_validate(data)
    except Exception:  # noqa: BLE001
        return None


# ============================================================================ generation
@dataclass
class QuizDraft:
    """Questions ready for the teacher's review, plus the set's suggested title and intro."""

    questions: list[QuizQuestion] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    title: str = ""
    intro: str = ""


async def generate_questions(
    lab: Lab,
    actor: Actor | None,
    *,
    basis: LessonBasis | None,
    count: int,
    kinds: list[str],
    extra_context: str = "",
    avoid: list[str] | None = None,
    mode: str | None = None,
) -> QuizDraft:
    lang = lab.language
    avoid = [text for text in avoid or [] if text.strip()][:40]
    parts = [prompts.lesson_context(lab)]
    if basis is not None and basis.digest:
        parts.append("REVIEWED ANALYSIS (JSON):\n" + prompts.as_json(basis.digest, 20000))
    if extra_context:
        parts.append("LESSON CONTENT:\n" + extra_context[:CONTENT_LIMIT])
    if avoid:
        parts.append("QUESTIONS THE LESSON ALREADY HAS (ask about something else):\n" + "\n".join(f"- {text[:300]}" for text in avoid))
    parts.append(prompts.QUIZ_TASK.format(count=count, kinds=", ".join(kinds)))
    if mode is None:
        mode, _ = choose_mode(lab)
    result = await get_ai().chat_json(
        messages=[
            {"role": "system", "content": prompts.system_prompt(lab, role=prompts.QUIZ_ROLE)},
            {"role": "user", "content": "\n\n".join(parts)},
        ],
        ctx=call_ctx("quiz", actor, lab),
        model_cls=QuizOutput,
        name="quiz",
        mode=mode,
        effort=effort(True),
    )
    rng = random.Random(secrets.randbits(32))
    questions: list[QuizQuestion] = []
    dropped = 0
    allowed = set(kinds)
    seen_prompts = {_key(text) for text in avoid}
    for q in result.data.questions:
        if q.kind not in allowed or len(questions) >= count:
            dropped += q.kind not in allowed
            continue
        converted = convert_question(q, basis, lang, rng)
        if converted is None or _key(converted.prompt) in seen_prompts:
            dropped += 1
            continue
        seen_prompts.add(_key(converted.prompt))
        questions.append(converted)
    warnings = [prompts.msg("quiz_dropped", lang, n=dropped)] if dropped else []
    title = clip(result.data.title, 200) if questions else ""
    intro = clip(result.data.intro, TEXT_LIMIT) if questions else ""
    return QuizDraft(questions=questions, warnings=warnings, title=title, intro=intro)


async def quiz(db: Session, lab: Lab, actor: Actor, body: QuizGenIn) -> QuizGenOut:
    analysis = LabAnalysis.model_validate(lab.analysis_json or {})
    spec = lab.spec_json or {}
    every_block = spec.get("blocks") or []
    blocks = every_block
    if body.block_ids:
        wanted = set(body.block_ids)
        blocks = [b for b in blocks if b.get("id") in wanted]
        if not blocks:
            raise AppError("not_found", 404, "Block not found")
    blocks = [b for b in blocks if b.get("type") not in ("quiz", "widget")]
    basis = build_basis(lab, analysis) if (analysis.result or analysis.paper) else None
    if basis is None and not any(block_text(b, 2500).strip() for b in blocks):
        raise AppError("analysis_required", 409, "Analyse the sources or add lesson content first")
    content = lesson_content(blocks, spec.get("objectives") or [])
    avoid = existing_prompts(every_block)
    db.commit()
    draft = await generate_questions(
        lab, actor, basis=basis, count=body.count, kinds=list(body.kinds), extra_context=content, avoid=avoid
    )
    return QuizGenOut(questions=draft.questions, title=draft.title, intro=draft.intro)
