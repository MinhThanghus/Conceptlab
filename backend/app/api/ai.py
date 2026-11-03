"""AI features (Meta Model API): analysis, paper structure, equation exploration, block
generation, quiz, video markers, diagram hotspots, handwriting boards (read, redraw, proofread),
SAM segmentation/tracking, widgets (+ the
sandboxed render routes), translation, cover images, transcription, active-learning feedback
and field scenarios. Contract: docs/API.md §AI. Business logic lives in ``app/services``.

Every AI endpoint checks permissions first (owner/admin for ``/api/labs/{id}/…``, published
lab with the tutor allowed for ``/api/share/{code}/…``), then applies ``ai_rate_limit``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..ai.client import AIError, get_ai
from ..db import get_db
from ..errors import AppError
from ..models import Lab
from ..schemas.api import (
    AnalyzeIn,
    AnalyzeOut,
    AssetOut,
    BoardReadIn,
    BoardReadOut,
    BoardVisualIn,
    BoardVisualOut,
    CoverIn,
    DiagramIn,
    DiagramOut,
    ExplainChangeIn,
    ExplainOut,
    Locale,
    ExploreEquationIn,
    ExploreEquationOut,
    FieldScenarioIn,
    FieldScenarioOut,
    GenerateIn,
    GenerateOut,
    PaperStructureIn,
    PredictionFeedbackIn,
    PredictionFeedbackOut,
    QuizGenIn,
    QuizGenOut,
    SegmentIn,
    SegmentOut,
    TrackIn,
    TrackOut,
    TranscribeOut,
    TranslateIn,
    TranslateOut,
    VideoMarkersIn,
    VideoMarkersOut,
    WidgetIn,
    WidgetOut,
    WidgetRepairIn,
)
from ..security import Actor, ai_rate_limit, get_actor, require_user
from ..services import analysis, board, generation, labs, learning, paper, quiz_gen, segmentation, translate, video_ai, widgets
from ..services import share as share_svc
from ..services import share_translation

router = APIRouter(tags=["ai"])


# ============================================================================ access helpers
def ensure_ai() -> None:
    if not get_ai().settings.ai_configured:
        raise AIError("ai_not_configured", 503, "AI service is not configured on this server")


def owner_lab(db: Session, lab_id: str, actor: Actor) -> Lab:
    lab = labs.get_lab_for_owner(db, lab_id, actor)
    ai_rate_limit(actor)
    ensure_ai()
    return lab


def tutor_lab(db: Session, code: str, actor: Actor) -> Lab:
    """Published lab whose teacher allows AI help for learners (unknown codes count towards
    the per-IP miss budget of the share routes, so codes cannot be enumerated here either)."""
    lab = share_svc.published_lab(db, code, actor)
    if not lab.allow_tutor:
        raise AppError("tutor_disabled", 403, "The teacher has turned off the AI tutor for this lab")
    ai_rate_limit(actor)
    ensure_ai()
    return lab


def published_spec(lab: Lab) -> dict:
    return (lab.published_spec_json or {}).get("spec") or {}


# ============================================================================ School2Lab / Paper2Explorer
@router.post("/api/labs/{lab_id}/ai/analyze", response_model=AnalyzeOut)
async def analyze(lab_id: str, body: AnalyzeIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> AnalyzeOut:
    return await analysis.analyze(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/paper-structure", response_model=AnalyzeOut)
async def paper_structure(
    lab_id: str, body: PaperStructureIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> AnalyzeOut:
    return await paper.paper_structure(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/explore-equation", response_model=ExploreEquationOut)
async def explore_equation(
    lab_id: str, body: ExploreEquationIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> ExploreEquationOut:
    return await paper.explore_equation(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/generate", response_model=GenerateOut)
async def generate(lab_id: str, body: GenerateIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> GenerateOut:
    return await generation.generate(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/quiz", response_model=QuizGenOut)
async def quiz(lab_id: str, body: QuizGenIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> QuizGenOut:
    return await quiz_gen.quiz(db, owner_lab(db, lab_id, actor), actor, body)


# ============================================================================ media: video, SAM, diagram
@router.post("/api/labs/{lab_id}/ai/video-markers", response_model=VideoMarkersOut)
async def video_markers(
    lab_id: str, body: VideoMarkersIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> VideoMarkersOut:
    return await video_ai.video_markers(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/track", response_model=TrackOut)
async def track(lab_id: str, body: TrackIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> TrackOut:
    return await video_ai.track(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/segment", response_model=SegmentOut)
async def segment(lab_id: str, body: SegmentIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> SegmentOut:
    return await segmentation.segment(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/segment-frame", response_model=SegmentOut)
async def segment_frame(
    lab_id: str,
    file: UploadFile = File(...),
    phrase: str | None = Form(default=None, max_length=120),
    points: str | None = Form(default=None, max_length=4000),
    actor: Actor = Depends(require_user),
    db: Session = Depends(get_db),
) -> SegmentOut:
    return await segmentation.segment_frame(db, owner_lab(db, lab_id, actor), actor, file, phrase, points)


@router.post("/api/labs/{lab_id}/ai/diagram", response_model=DiagramOut)
async def diagram(lab_id: str, body: DiagramIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> DiagramOut:
    return await segmentation.diagram(db, owner_lab(db, lab_id, actor), actor, body)


# Board block: a photo of handwriting is read (Muse Spark), then redrawn as a clean sheet (Muse Image
# /images/edits) and proofread against the teacher-confirmed transcription (services/board.py).
@router.post("/api/labs/{lab_id}/ai/board-read", response_model=BoardReadOut)
async def board_read(lab_id: str, body: BoardReadIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> BoardReadOut:
    return await board.read_board(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/board-visual", response_model=BoardVisualOut)
async def board_visual(
    lab_id: str, body: BoardVisualIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> BoardVisualOut:
    return await board.draw_board(db, owner_lab(db, lab_id, actor), actor, body)


# ============================================================================ widgets
@router.post("/api/labs/{lab_id}/ai/widget", response_model=WidgetOut)
async def widget(lab_id: str, body: WidgetIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> WidgetOut:
    lab = owner_lab(db, lab_id, actor)
    db.commit()
    return await widgets.widget(lab, actor, body)


@router.post("/api/labs/{lab_id}/ai/widget/repair", response_model=WidgetOut)
async def widget_repair(
    lab_id: str, body: WidgetRepairIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> WidgetOut:
    lab = owner_lab(db, lab_id, actor)
    db.commit()
    return await widgets.repair(lab, actor, body)


# The page a sandboxed iframe loads (spec §9.5, docs/API.md §Widgets): strict sandbox CSP
# (opaque origin, no network, no cookies), the cl-widget harness injected first,
# X-Frame-Options SAMEORIGIN and no-store (services/widgets.render_response).
@router.get("/api/labs/{lab_id}/widgets/{block_id}/render", response_class=HTMLResponse, include_in_schema=False)
def render_widget(lab_id: str, block_id: str, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> HTMLResponse:
    """The author's current widget (any status) so the editor can validate it before approval."""
    lab = labs.get_lab_for_owner(db, lab_id, actor)
    html = widgets.find_widget(lab.spec_json, block_id).get("html") or ""
    if not html.strip():
        raise AppError("not_found", 404, "This widget has no content yet")
    return widgets.render_response(html)


@router.get("/api/share/{code}/widgets/{block_id}/render", response_class=HTMLResponse, include_in_schema=False)
def render_shared_widget(code: str, block_id: str, actor: Actor = Depends(get_actor), db: Session = Depends(get_db)) -> HTMLResponse:
    """Learners only ever get approved + validated widgets of the published snapshot."""
    lab = share_svc.published_lab(db, code, actor)
    return widgets.render_response(widgets.published_widget_html(lab.published_spec_json, block_id))


# ============================================================================ language, images
@router.post("/api/labs/{lab_id}/ai/translate", response_model=TranslateOut)
async def translate_lab(
    lab_id: str, body: TranslateIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> TranslateOut:
    return await translate.translate_spec(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/labs/{lab_id}/ai/cover", response_model=AssetOut)
async def cover(lab_id: str, body: CoverIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)) -> AssetOut:
    return await generation.generate_cover(db, owner_lab(db, lab_id, actor), actor, body)


@router.post("/api/ai/transcribe", response_model=TranscribeOut)
async def transcribe(
    audio: UploadFile = File(...),
    lang: str | None = Form(default=None, pattern="^(vi|en)$"),
    keywords: str | None = Form(default=None, max_length=4000),
    code: str | None = Form(default=None, max_length=40),
    actor: Actor = Depends(get_actor),
    db: Session = Depends(get_db),
) -> TranscribeOut:
    """Signed-in users, or a learner asking the tutor of a shared lesson (``code``: its share
    code, checked like the shared tutor: published and the tutor allowed)."""
    if actor.user is not None:
        ai_rate_limit(actor)
        ensure_ai()
    elif code:
        tutor_lab(db, code, actor)
        db.commit()
    else:
        raise AppError("unauthorized", 401, "Please sign in")
    return await learning.transcribe(actor, audio, lang, keywords)


# ============================================================================ sport & active learning
@router.post("/api/labs/{lab_id}/ai/field-scenario", response_model=FieldScenarioOut)
async def field_scenario(
    lab_id: str, body: FieldScenarioIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> FieldScenarioOut:
    lab = owner_lab(db, lab_id, actor)
    db.commit()
    return await learning.field_scenario(lab, actor, body)


@router.post("/api/labs/{lab_id}/ai/explain-change", response_model=ExplainOut)
async def explain_change(
    lab_id: str, body: ExplainChangeIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> ExplainOut:
    lab = owner_lab(db, lab_id, actor)
    db.commit()
    return await learning.explain_change(lab, actor, lab.spec_json or {}, body)


@router.post("/api/share/{code}/ai/explain-change", response_model=ExplainOut)
async def shared_explain_change(
    code: str, body: ExplainChangeIn, lang: Locale | None = Query(default=None), actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> ExplainOut:
    lab = tutor_lab(db, code, actor)
    translated = share_translation.cached(db, lab, lang) if lang and lang != lab.language else None
    if lang and lang != lab.language and translated is None:
        raise AppError('translation_unavailable', 409, 'Translate the current lesson first')
    db.commit()
    return await learning.explain_change(share_svc.LearnerView(lab, lang), actor, translated.spec if translated else published_spec(lab), body)


@router.post("/api/labs/{lab_id}/ai/prediction-feedback", response_model=PredictionFeedbackOut)
async def prediction_feedback(
    lab_id: str, body: PredictionFeedbackIn, actor: Actor = Depends(require_user), db: Session = Depends(get_db)
) -> PredictionFeedbackOut:
    lab = owner_lab(db, lab_id, actor)
    db.commit()
    return await learning.prediction_feedback(lab, actor, lab.spec_json or {}, body)


@router.post("/api/share/{code}/ai/prediction-feedback", response_model=PredictionFeedbackOut)
async def shared_prediction_feedback(
    code: str, body: PredictionFeedbackIn, lang: Locale | None = Query(default=None), actor: Actor = Depends(get_actor), db: Session = Depends(get_db)
) -> PredictionFeedbackOut:
    lab = tutor_lab(db, code, actor)
    translated = share_translation.cached(db, lab, lang) if lang and lang != lab.language else None
    if lang and lang != lab.language and translated is None:
        raise AppError('translation_unavailable', 409, 'Translate the current lesson first')
    db.commit()
    return await learning.prediction_feedback(share_svc.LearnerView(lab, lang), actor, translated.spec if translated else published_spec(lab), body)
