"""Public gallery, shared labs by class code, quiz attempts, feedback, teacher results and
cloning shared labs. Contract: docs/API.md §Sharing, learners, results.

The router has no prefix: it serves ``/api/public/*``, ``/api/share/*`` and
``/api/labs/{id}/results``. Share-scoped file routes live in ``api/sources.py``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from ..db import get_db
from ..schemas.api import (
    FeedbackIn,
    FeedbackOut,
    Grade,
    LabList,
    LabOut,
    LabSummary,
    Locale,
    QuizAttemptIn,
    QuizAttemptOut,
    ResultsOut,
    SharedLabOut,
    Space,
    Subject,
    TranslateIn,
)
from ..security import Actor, ensure_viewer_cookie, get_actor, require_user
from ..services import labs as labs_svc
from ..services import share as svc
from ..services import share_translation
from ..errors import AppError

router = APIRouter(tags=["share"])


# ============================================================================ gallery
@router.get("/api/public/labs", response_model=LabList)
def public_labs(
    space: Space | None = Query(default=None),
    subject: Subject | None = Query(default=None),
    grade: Grade | None = Query(default=None),
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1, le=1000),
    page_size: int = Query(default=24, ge=1, le=60),
    lang: Locale | None = Query(default=None),
    db: Session = Depends(get_db),
) -> LabList:
    """Published labs whose authors chose "public" (newest first)."""
    result = svc.public_labs(db, space=space, subject=subject, grade=grade, q=q, page=page, page_size=page_size)
    share_translation.localize_summaries(db, result.items, lang)
    return result


@router.get("/api/public/featured", response_model=list[LabSummary])
def featured_labs(lang: Locale | None = Query(default=None), db: Session = Depends(get_db)) -> list[LabSummary]:
    """Up to six published demo labs (pendulum, volleyball, attention …)."""
    return share_translation.localize_summaries(db, svc.featured_labs(db), lang)


# ============================================================================ learners
@router.get("/api/share/{code}", response_model=SharedLabOut)
def get_shared_lab(
    code: str,
    request: Request,
    response: Response,
    lang: Locale | None = Query(default=None),
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> SharedLabOut:
    lab = svc.published_lab(db, code, actor)
    ensure_viewer_cookie(request, response)
    if lang and lang != lab.language:
        translated = share_translation.cached(db, lab, lang)
        if translated is not None:
            return share_translation._public_copy(translated)
    # Quiz answers, explanations and option feedback are withheld in every language.
    return svc.learner_copy(svc.shared_lab(db, lab))


@router.post("/api/share/{code}/translate", response_model=SharedLabOut)
async def translate_shared_lab(
    code: str, body: TranslateIn, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> SharedLabOut:
    """Translate the published learner view without changing the source or the author's draft."""
    lab = svc.published_lab(db, code, actor)
    return await share_translation.translated_shared(db, lab, actor, body.target)


@router.post("/api/share/{code}/quiz-attempts", response_model=QuizAttemptOut, status_code=201)
def submit_quiz_attempt(
    code: str,
    body: QuizAttemptIn,
    request: Request,
    response: Response,
    lang: Locale | None = Query(default=None),
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> QuizAttemptOut:
    """Scored on the server against the published quiz; the client never sends a score.
    Answers use the option order learners were shown; results come back in that order too."""
    lab = svc.published_lab(db, code, actor)
    translated = share_translation.cached(db, lab, lang) if lang and lang != lab.language else None
    if lang and lang != lab.language and translated is None:
        raise AppError("translation_unavailable", 409, "Translate the current lesson before submitting in another language")
    viewer = None if actor.user else ensure_viewer_cookie(request, response)
    result = svc.submit_attempt(db, lab, body, actor, viewer)
    if translated is not None:
        # The translated explanation and option feedback replace the original texts.
        texts = {
            str(question.get('id')): question
            for block in translated.spec.get('blocks', []) if block.get('type') == 'quiz' and block.get('id') == body.block_id
            for question in block.get('questions', []) if isinstance(question, dict)
        }
        for item in result.results:
            question = texts.get(item.question_id)
            if question is None:
                continue
            item.explanation = question.get('explanation', '')
            feedback = svc.result_feedback(question)
            if len(feedback) == len(item.option_feedback):
                item.option_feedback = feedback
    return result


@router.post("/api/share/{code}/feedback", response_model=FeedbackOut, status_code=201)
def send_feedback(
    code: str,
    body: FeedbackIn,
    request: Request,
    response: Response,
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    lab = svc.published_lab(db, code, actor)
    viewer = None if actor.user else ensure_viewer_cookie(request, response)
    return svc.add_feedback(db, lab, body, actor, viewer)


@router.post("/api/share/{code}/clone", response_model=LabOut, status_code=201)
def clone_shared_lab(code: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> LabOut:
    """Copy the published version into the caller's labs (public or demo labs only)."""
    lab = svc.published_lab(db, code, actor)
    return labs_svc.lab_out(db, svc.clone_shared(db, lab, actor))


# ============================================================================ teacher results
@router.get("/api/labs/{lab_id}/results", response_model=ResultsOut)
def lab_results(lab_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> ResultsOut:
    """Aggregates only — never ranks or lists individual learners."""
    return svc.lab_results(db, labs_svc.get_lab_for_owner(db, lab_id, actor))


# Widget render routes (/api/labs/{id}/widgets/{block_id}/render and
# /api/share/{code}/widgets/{block_id}/render) live in api/ai.py next to widget generation.
