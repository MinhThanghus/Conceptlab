"""Public gallery, shared labs, learner quiz attempts and feedback, cloning, teacher results.

Rules (spec §10.5, §16, §17; docs/API.md §Sharing):

* Learners only ever see the published snapshot (``published_spec_json``) — never drafts,
  the AI analysis, unapproved questions or unconfirmed markers.
* Quiz answers are scored here, against the snapshot; the client never sends a score.
* Learner responses carry no answers, explanations or per-option feedback (``learner_copy``,
  every language); ``order`` items arrive in a fixed permutation that is never the solved
  order, and marking maps the learner's indices back.
* Results are aggregates for the lab owner. Individual learners are never ranked or
  listed (no names, no per-learner rows).
* Unknown share codes count toward a per-IP limit so class codes cannot be enumerated.
"""

from __future__ import annotations

import copy
import hashlib
import math
import unicodedata
from collections import Counter, defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import AppError
from ..models import Asset, ChatMessage, Feedback, Lab, QuizAttempt, Source, User
from ..schemas.api import (
    FeedbackIn,
    FeedbackOut,
    LabList,
    LabSummary,
    PhaseStat,
    QuestionStat,
    QuizAttemptIn,
    QuizAttemptOut,
    QuizQuestionResult,
    ResultsOut,
    SharedLabOut,
)
from ..schemas.spec import QUIZ_ANSWER_KEYS
from ..security import Actor, rate_limiter
from . import labs as labs_svc

SHARE_MISSES_PER_HOUR = 200  # wrong/unknown codes per IP (a whole school may share one IP)
QUIZ_ATTEMPTS_PER_HOUR = 60
FEEDBACK_PER_HOUR = 10
# Anonymous learners are keyed by their viewer cookie; a per-IP ceiling stops cookie
# rotation from multiplying the budget (sized for a whole class behind one school IP).
ANON_QUIZ_PER_IP_HOUR = 1500
ANON_FEEDBACK_PER_IP_HOUR = 200
CLONES_PER_HOUR = 20
MAX_LABS_PER_USER = 500
FEATURED_LIMIT = 6
DEFAULT_NUMERIC_TOLERANCE = 0.02
PHASES = ("practice", "pre", "post")


# ============================================================================ text search
def fold(text: str | None) -> str:
    """Case- and accent-insensitive form for search: "Con lắc Đơn" → "con lac don".

    Vietnamese learners often type without diacritics on phones, and SQLite's LOWER()
    only folds ASCII, so matching is done in Python on this form.
    """
    text = (text or "").replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.casefold().split())


def matches(query: str, *fields: str | None) -> bool:
    words = fold(query).split()
    haystack = fold(" ".join(f or "" for f in fields))
    return all(word in haystack for word in words)


# ============================================================================ share access
def _record_miss(actor: Actor) -> None:
    rate_limiter.hit("share-miss", actor.ip, SHARE_MISSES_PER_HOUR, 3600)


def published_lab(db: Session, code: str, actor: Actor) -> Lab:
    """``labs.get_published_lab`` + a per-IP budget for unknown codes (anti-enumeration)."""
    try:
        return labs_svc.get_published_lab(db, code)
    except AppError as exc:
        if exc.status == 404:
            _record_miss(actor)
        raise


def shared_source(db: Session, code: str, source_id: str, actor: Actor) -> tuple[Lab, Source]:
    published_lab(db, code, actor)
    try:
        return labs_svc.get_shared_source(db, code, source_id)
    except AppError as exc:
        if exc.status == 404:
            _record_miss(actor)
        raise


class LearnerView:
    """A published lab as learners see it, for AI prompts: the snapshot's title instead of a
    renamed draft. Every other attribute (id, language, grade, ai_mode …) is the lab's own."""

    def __init__(self, lab: Lab, language: str | None = None) -> None:
        self._lab = lab
        self.title = (lab.published_spec_json or {}).get("title") or lab.title
        self.language = language or lab.language

    def __getattr__(self, name: str) -> Any:
        return getattr(self._lab, name)


def _withheld(src: Source | None) -> bool:
    """Media showing students is only shown while consent stays confirmed (spec §16)."""
    return src is not None and bool(src.contains_people) and not src.consent_confirmed


def withheld_source_ids(lab: Lab) -> set[str]:
    return {s.id for s in lab.sources if _withheld(s)}


def shared_asset(db: Session, code: str, asset_id: str, actor: Actor) -> tuple[Lab, Asset]:
    published_lab(db, code, actor)
    try:
        lab, asset = labs_svc.get_shared_asset(db, code, asset_id)
    except AppError as exc:
        if exc.status == 404:
            _record_miss(actor)
        raise
    # A frame or cut-out of a video/photo whose consent was withdrawn shows the same students.
    if asset.source_id and _withheld(db.get(Source, asset.source_id)):
        raise AppError("not_found", 404, "Asset not found")
    return lab, asset


def shared_lab(db: Session, lab: Lab):
    """The published snapshot with every quiz answer (for marking, translation and the tutor).
    Learners get ``learner_copy`` of it, never this object."""
    out = labs_svc.shared_lab_out(db, lab)
    withheld = withheld_source_ids(lab)
    out.sources = [s for s in out.sources if s.id not in withheld]
    out.assets = [a for a in out.assets if a.source_id not in withheld]
    return out


# ============================================================================ learner copy (no answers)
# What a learner receives of a quiz question before answering. Answers, explanations and the
# per-option feedback (QUIZ_ANSWER_KEYS) only come back with the marked attempt.
LEARNER_QUESTION_KEYS = ("id", "kind", "prompt", "options", "unit", "context", "hint", "cognitive_level", "source_refs")
assert not set(LEARNER_QUESTION_KEYS) & set(QUIZ_ANSWER_KEYS)


def _is_permutation(order: Any, n: int) -> bool:
    return isinstance(order, list) and len(order) == n and sorted(v for v in order if isinstance(v, int)) == list(range(n))


def order_permutation(lab_id: str, question: dict[str, Any]) -> list[int]:
    """Public position -> stored option index of an ``order`` question.

    Learners see the items in an order derived only from ``sha256(lab_id + ":" + question_id)``:
    the same for everyone, every reload and every language, and never the solved order."""
    options = question.get("options") or []
    n = len(options)
    solved = question.get("answer_order")
    solved = list(solved) if _is_permutation(solved, n) else list(range(n))
    seed = hashlib.sha256(f"{lab_id}:{question.get('id')}".encode("utf-8")).digest()
    draws: list[int] = []
    counter = 0
    while len(draws) < n:
        block = hashlib.sha256(seed + counter.to_bytes(4, "big")).digest()
        draws.extend(int.from_bytes(block[k : k + 4], "big") for k in range(0, 32, 4))
        counter += 1
    positions = list(range(n))  # Fisher-Yates over positions in the solved sequence
    for i in range(n - 1, 0, -1):
        j = draws[i] % (i + 1)
        positions[i], positions[j] = positions[j], positions[i]
    if n >= 2 and positions == list(range(n)):
        positions = positions[1:] + positions[:1]  # a rotation is never the solved order
    return [solved[p] for p in positions]


def learner_question(lab_id: str, question: dict[str, Any]) -> dict[str, Any]:
    """A question as learners get it: no answer keys; an order question's items permuted."""
    out = {key: copy.deepcopy(question[key]) for key in LEARNER_QUESTION_KEYS if key in question}
    out["approved"] = True
    if question.get("kind") == "order":
        options = question.get("options") or []
        out["options"] = [options[i] for i in order_permutation(lab_id, question)]
    return out


def learner_spec(lab_id: str, spec: dict[str, Any]) -> dict[str, Any]:
    """Copy of a published spec for learners (every language): quiz answers withheld."""
    out = copy.deepcopy(spec or {})
    for block in out.get("blocks") or []:
        if isinstance(block, dict) and block.get("type") == "quiz":
            block["questions"] = [
                learner_question(lab_id, q) for q in block.get("questions") or [] if isinstance(q, dict) and q.get("approved", True)
            ]
    return out


def learner_copy(out: SharedLabOut) -> SharedLabOut:
    """What every learner-facing response returns (``GET /api/share/{code}`` in any language,
    translations, and therefore the Lite offline copy)."""
    result = out.model_copy(deep=True)
    result.spec = learner_spec(result.id, result.spec)
    return result


def result_feedback(question: dict[str, Any]) -> list[str]:
    """Per-option feedback in the learner's option order, only when it lines up with the options."""
    notes = question.get("option_feedback")
    if not isinstance(notes, list) or not any(isinstance(n, str) and n.strip() for n in notes):
        return []
    kind = question.get("kind") or "mcq"
    expected = 2 if kind == "truefalse" else len(question.get("options") or []) if kind == "mcq" else -1
    return [n if isinstance(n, str) else "" for n in notes] if len(notes) == expected else []


# ============================================================================ gallery
def _public_query():
    return (
        select(Lab)
        .join(User, User.id == Lab.owner_id)
        .where(Lab.status == "published", Lab.visibility == "public", User.is_active.is_(True))
    )


def public_labs(
    db: Session,
    *,
    space: str | None,
    subject: str | None,
    grade: str | None,
    q: str | None,
    page: int,
    page_size: int,
) -> LabList:
    query = _public_query()
    if space:
        query = query.where(Lab.space == space)
    if subject:
        query = query.where(Lab.subject == subject)
    if grade:
        query = query.where(Lab.grade == grade)
    order = (Lab.published_at.desc(), Lab.id.desc())
    offset = (page - 1) * page_size
    if q and fold(q):
        rows = db.execute(query.with_only_columns(Lab.id, Lab.title, Lab.topic).order_by(*order)).all()
        ids = [row.id for row in rows if matches(q, row.title, row.topic)]
        total = len(ids)
        page_ids = ids[offset : offset + page_size]
    else:
        total = db.scalar(select(func.count()).select_from(query.with_only_columns(Lab.id).subquery())) or 0
        page_ids = list(db.scalars(query.with_only_columns(Lab.id).order_by(*order).offset(offset).limit(page_size)))
    labs = {lab.id: lab for lab in db.scalars(select(Lab).where(Lab.id.in_(page_ids)))} if page_ids else {}
    items = [labs_svc.lab_summary(db, labs[i], public=True) for i in page_ids if i in labs and labs[i].published_spec_json]
    return LabList(items=items, total=total, page=page, page_size=page_size)


def featured_labs(db: Session) -> list[LabSummary]:
    rows = db.scalars(
        _public_query().where(Lab.is_demo.is_(True)).order_by(Lab.created_at.asc(), Lab.id.asc()).limit(FEATURED_LIMIT)
    )
    return [labs_svc.lab_summary(db, lab, public=True) for lab in rows if lab.published_spec_json]


# ============================================================================ quiz scoring
def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        text = value.strip().replace(" ", "").replace(" ", "").replace(" ", "")
        if "," in text and "." in text:
            # "1.234,5" (Vietnamese) or "1,234.5" (English): the last separator is decimal.
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            text = text.replace(",", ".")  # Vietnamese decimal comma: "2,01"
        if not text or len(text) > 40:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _index(value: Any) -> int | None:
    number = _number(value)
    if number is None or not float(number).is_integer() or abs(number) > 10_000:
        return None
    return int(number)


def _order(value: Any) -> list[int] | None:
    if not isinstance(value, list) or len(value) > 50:
        return None
    out = [_index(v) for v in value]
    return None if any(v is None for v in out) else out  # type: ignore[return-value]


def score_question(question: dict[str, Any], answer: Any) -> tuple[bool, Any, Any]:
    """(correct, normalized answer to store, correct answer to reveal)."""
    kind = question.get("kind") or "mcq"
    if kind in ("mcq", "truefalse"):
        given, expected = _index(answer), question.get("answer_index")
        return given is not None and given == expected, given, expected
    if kind == "order":
        given, expected = _order(answer), question.get("answer_order")
        return given is not None and isinstance(expected, list) and given == expected, given, expected
    if kind == "numeric":
        given, expected = _number(answer), _number(question.get("answer_value"))
        if given is None or expected is None:
            return False, given, expected
        if expected == 0:
            return abs(given) <= 1e-9, given, expected
        tolerance = abs(_number(question.get("tolerance")) or DEFAULT_NUMERIC_TOLERANCE)
        return abs(given - expected) <= tolerance * abs(expected), given, expected
    return False, None, None


def marking_tolerance(question: dict[str, Any]) -> float | None:
    """The relative tolerance a numeric answer is marked with (0 for an exact zero); None otherwise."""
    if (question.get("kind") or "mcq") != "numeric":
        return None
    if _number(question.get("answer_value")) == 0:
        return 0.0
    return abs(_number(question.get("tolerance")) or DEFAULT_NUMERIC_TOLERANCE)


def _from_public(answer: Any, permutation: list[int]) -> list[int] | None:
    """A learner's arrangement (indices into the options as shown) in snapshot indices."""
    order = _order(answer)
    if order is None or any(not 0 <= j < len(permutation) for j in order):
        return None
    return [permutation[j] for j in order]


def _to_public(expected: Any, permutation: list[int]) -> list[int] | None:
    """The solved order (snapshot indices) as indices into the options as shown."""
    if not _is_permutation(expected, len(permutation)):
        return None
    shown_at = {stored: j for j, stored in enumerate(permutation)}
    return [shown_at[stored] for stored in expected]


def mark_question(lab_id: str, question: dict[str, Any], answer: Any) -> tuple[bool, Any, QuizQuestionResult]:
    """Mark one answer given in the learner's option order: (correct, the answer to store in the
    snapshot's option order, the result to send back in the learner's option order)."""
    permutation = order_permutation(lab_id, question) if (question.get("kind") or "mcq") == "order" else None
    if permutation is not None:
        answer = _from_public(answer, permutation)
    correct, normalized, expected = score_question(question, answer)
    result = QuizQuestionResult(
        question_id=str(question.get("id")),
        correct=correct,
        correct_answer=_to_public(expected, permutation) if permutation is not None else expected,
        explanation=question.get("explanation") or "",
        option_feedback=result_feedback(question),
        tolerance=marking_tolerance(question),
    )
    return correct, normalized, result


def _clean_name(value: str | None) -> str | None:
    text = unicodedata.normalize("NFC", value or "")
    text = " ".join("".join(ch for ch in text if ch.isprintable()).split())[:60]
    return text or None


def _snapshot_quiz(lab: Lab, block_id: str) -> dict[str, Any]:
    spec = (lab.published_spec_json or {}).get("spec") or {}
    for block in spec.get("blocks") or []:
        if isinstance(block, dict) and block.get("id") == block_id and block.get("type") == "quiz":
            return block
    raise AppError("not_found", 404, "Quiz not found")


def submit_attempt(db: Session, lab: Lab, body: QuizAttemptIn, actor: Actor, viewer_key: str | None) -> QuizAttemptOut:
    budgets = [("quiz", actor.rate_key, QUIZ_ATTEMPTS_PER_HOUR, 3600)]
    if actor.user is None:
        budgets.append(("quiz-ip", actor.ip, ANON_QUIZ_PER_IP_HOUR, 3600))
    rate_limiter.hit_all(budgets)  # a refused request counts in neither bucket
    block = _snapshot_quiz(lab, body.block_id)
    questions = {str(q.get("id")): q for q in block.get("questions") or [] if isinstance(q, dict) and q.get("approved", True)}
    given: dict[str, Any] = {}
    for item in body.answers:
        if item.question_id in questions and item.question_id not in given:
            given[item.question_id] = item.answer  # ids outside the published quiz are ignored
    if not given:
        raise AppError(
            "validation_error",
            422,
            "None of the answers belong to this quiz. Reload the page and try again.",
            fields={"answers": "no matching questions"},
        )
    answers_json: list[dict[str, Any]] = []
    results: list[QuizQuestionResult] = []
    for qid, question in questions.items():  # published order
        if qid not in given:
            continue
        correct, normalized, result = mark_question(lab.id, question, given[qid])
        answers_json.append({"question_id": qid, "answer": normalized, "correct": correct})
        results.append(result)
    score = sum(1 for r in results if r.correct)
    attempt = QuizAttempt(
        lab_id=lab.id,
        block_id=body.block_id,
        user_id=actor.user_id,
        viewer_key=None if actor.user else viewer_key,
        display_name=_clean_name(body.display_name),
        phase=body.phase,
        answers_json=answers_json,
        score=score,
        total=len(results),
    )
    db.add(attempt)
    db.commit()
    return QuizAttemptOut(id=attempt.id, score=score, total=len(results), results=results)


# ============================================================================ feedback & clone
def add_feedback(db: Session, lab: Lab, body: FeedbackIn, actor: Actor, viewer_key: str | None) -> FeedbackOut:
    budgets = [("feedback", actor.rate_key, FEEDBACK_PER_HOUR, 3600)]
    if actor.user is None:
        budgets.append(("feedback-ip", actor.ip, ANON_FEEDBACK_PER_IP_HOUR, 3600))
    rate_limiter.hit_all(budgets)
    comment = unicodedata.normalize("NFC", body.comment or "")
    comment = "".join(ch for ch in comment if ch.isprintable() or ch == "\n").strip()[:1000] or None
    row = Feedback(
        lab_id=lab.id,
        user_id=actor.user_id,
        viewer_key=None if actor.user else viewer_key,
        rating=body.rating,
        comment=comment,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return FeedbackOut(id=row.id, rating=row.rating, comment=row.comment, created_at=row.created_at)


def clone_shared(db: Session, lab: Lab, actor: Actor) -> Lab:
    if not (lab.visibility == "public" or lab.is_demo):
        raise AppError("forbidden", 403, "The author shares this lab by link only; it cannot be copied.")
    rate_limiter.hit("clone", actor.rate_key, CLONES_PER_HOUR, 3600)
    count = db.scalar(select(func.count()).select_from(Lab).where(Lab.owner_id == actor.user.id)) or 0
    if count >= MAX_LABS_PER_USER:
        raise AppError("quota_exceeded", 409, "You have reached the maximum number of labs")
    return labs_svc.duplicate_lab(db, lab, actor, from_published=True)


# ============================================================================ results (owner)
def _pct(score: int, total: int) -> float | None:
    return score * 100.0 / total if total else None


def lab_results(db: Session, lab: Lab) -> ResultsOut:
    """Aggregates only: per phase, per question, feedback and tutor-question counts."""
    phase_values: dict[str, list[float]] = defaultdict(list)
    phase_counts: Counter[str] = Counter()
    per_question: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    attempts_total = 0
    rows = db.execute(
        select(QuizAttempt.block_id, QuizAttempt.phase, QuizAttempt.score, QuizAttempt.total, QuizAttempt.answers_json)
        .where(QuizAttempt.lab_id == lab.id)
        .execution_options(yield_per=500)
    )
    for block_id, phase, score, total, answers in rows:
        attempts_total += 1
        phase_counts[phase] += 1
        pct = _pct(score, total)
        if pct is not None:
            phase_values[phase].append(pct)
        for answer in answers or []:
            if isinstance(answer, dict) and answer.get("question_id") is not None:
                stat = per_question[(block_id, str(answer["question_id"]))]
                stat[0] += 1
                stat[1] += 1 if answer.get("correct") else 0
    by_phase = {
        phase: PhaseStat(
            count=phase_counts.get(phase, 0),
            avg_pct=round(sum(phase_values[phase]) / len(phase_values[phase]), 1) if phase_values[phase] else None,
        )
        for phase in PHASES
    }

    # Question prompts from the published snapshot (what learners answered), then the draft.
    questions: list[QuestionStat] = []
    seen: set[tuple[str, str]] = set()
    specs = [((lab.published_spec_json or {}).get("spec") or {}), (lab.spec_json or {})]
    for spec in specs:
        for block in spec.get("blocks") or []:
            if not isinstance(block, dict) or block.get("type") != "quiz":
                continue
            for q in block.get("questions") or []:
                if not isinstance(q, dict):
                    continue
                key = (str(block.get("id")), str(q.get("id")))
                published = spec is specs[0]
                if key in seen or (not published and key not in per_question):
                    continue
                seen.add(key)
                attempts, correct = per_question.get(key, [0, 0])
                questions.append(
                    QuestionStat(
                        block_id=key[0],
                        question_id=key[1],
                        prompt=str(q.get("prompt") or ""),
                        attempts=attempts,
                        correct=correct,
                        correct_rate=round(correct / attempts, 3) if attempts else None,
                    )
                )

    ratings = [r for (r,) in db.execute(select(Feedback.rating).where(Feedback.lab_id == lab.id))]
    distribution = {str(i): 0 for i in range(1, 6)}
    for rating in ratings:
        if 1 <= rating <= 5:
            distribution[str(rating)] += 1
    recent = db.scalars(
        select(Feedback).where(Feedback.lab_id == lab.id).order_by(Feedback.created_at.desc(), Feedback.id.desc()).limit(10)
    )
    tutor_filter = (ChatMessage.lab_id == lab.id, ChatMessage.role == "user", ChatMessage.channel == "share")
    tutor_count = db.scalar(select(func.count()).select_from(ChatMessage).where(*tutor_filter)) or 0
    tutor_recent = db.scalars(
        select(ChatMessage.content).where(*tutor_filter).order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(20)
    )
    return ResultsOut(
        lab_id=lab.id,
        attempts_total=attempts_total,
        by_phase=by_phase,
        questions=questions,
        feedback_count=len(ratings),
        feedback_avg=round(sum(ratings) / len(ratings), 2) if ratings else None,
        feedback_distribution=distribution,
        recent_feedback=[FeedbackOut(id=f.id, rating=f.rating, comment=f.comment, created_at=f.created_at) for f in recent],
        tutor_questions=tutor_count,
        recent_tutor_questions=[_truncate(text, 200) for text in tutor_recent],
    )


def _truncate(text: str | None, limit: int) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"
