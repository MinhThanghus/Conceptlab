"""Request/response DTOs for the REST API (the contract documented in ``docs/API.md``).

Inputs forbid unknown fields; outputs only expose what screens need (no password
hashes, tokens, storage keys or internal flags).
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .analysis import LabAnalysis, PaperEquation
from .spec import (
    FieldFrame,
    Hotspot,
    ImageRef,
    QuizQuestion,
    Relation,
    SourceRef,
    VideoMarker,
    VideoTrack,
    Visual3D,
)

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$")

Role = Literal["teacher", "student", "researcher", "admin"]
PublicRole = Literal["teacher", "student", "researcher"]
Locale = Literal["vi", "en"]
Space = Literal["school2lab", "paper2explorer"]
Subject = Literal[
    "math",
    "physics",
    "chemistry",
    "biology",
    "agriculture",
    "geography",
    "environment",
    "informatics",
    "pe",
    "computer_science",
    "engineering",
    "economics",
    "other",
]
Grade = Literal["6", "7", "8", "9", "10", "11", "12", "university"]
Goal = Literal["understand_process", "view_graph", "practice", "answer_questions", "explore_paper"]
Level = Literal["simple", "detailed"]
AIMode = Literal["contributor", "standard"]
Visibility = Literal["link", "public"]
LabStatus = Literal["draft", "published", "archived"]
QuizPhase = Literal["practice", "pre", "post"]


class In(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ============================================================================ auth
class RegisterIn(In):
    email: Annotated[str, Field(min_length=5, max_length=254)]
    password: Annotated[str, Field(min_length=8, max_length=128)]
    name: Annotated[str, Field(min_length=1, max_length=120)]
    role: PublicRole = "student"
    locale: Locale = "vi"
    school: Annotated[str, Field(max_length=160)] | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_RE.match(value):
            raise ValueError("invalid email address")
        return value


class LoginIn(In):
    email: Annotated[str, Field(min_length=3, max_length=254)]
    password: Annotated[str, Field(min_length=1, max_length=128)]

    @field_validator("email")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()


class UserOut(Out):
    id: str
    email: str
    name: str
    role: Role
    locale: Locale
    school: str | None = None
    created_at: datetime


class AIStatusOut(BaseModel):
    configured: bool
    default_mode: AIMode
    image_enabled: bool
    deep_enabled: bool
    models: dict[str, str]


class MeOut(BaseModel):
    user: UserOut | None
    csrf_token: str | None
    ai: AIStatusOut


class ProfileUpdate(In):
    name: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    locale: Locale | None = None
    school: Annotated[str, Field(max_length=160)] | None = None


class PasswordChange(In):
    current_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]


class DeleteAccountIn(In):
    password: Annotated[str, Field(min_length=1, max_length=128)]


# ============================================================================ labs & sources
class LabCreate(In):
    space: Space
    title: Annotated[str, Field(min_length=1, max_length=160)]
    subject: Subject
    grade: Grade
    topic: Annotated[str, Field(max_length=200)] | None = None
    language: Locale = "vi"
    goal: Goal = "understand_process"
    level: Level = "simple"
    ai_mode: AIMode | None = None


class LabUpdate(In):
    version: int = Field(ge=1)  # optimistic concurrency: must equal the current lab.version
    title: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    subject: Subject | None = None
    grade: Grade | None = None
    topic: Annotated[str, Field(max_length=200)] | None = None
    language: Locale | None = None
    goal: Goal | None = None
    level: Level | None = None
    ai_mode: AIMode | None = None
    allow_tutor: bool | None = None
    visibility: Visibility | None = None
    spec: dict[str, Any] | None = None  # validated as schemas.spec.LabSpec
    analysis: dict[str, Any] | None = None  # validated as schemas.analysis.LabAnalysis
    note: Annotated[str, Field(max_length=200)] | None = None  # version note


class SourceUrls(BaseModel):
    file: str | None = None
    poster: str | None = None
    page: str | None = None  # template with {n}, e.g. /api/sources/<id>/pages/{n}.png


class SourceOut(Out):
    id: str
    kind: Literal["pdf", "image", "video", "data", "note"]
    title: str
    filename: str | None = None
    mime: str | None = None
    size_bytes: int = 0
    status: Literal["ready", "processing", "failed"]
    error_code: str | None = None
    page_count: int | None = None
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    fps: float | None = None
    contains_people: bool = False
    consent_confirmed: bool = False
    data: Any | None = None  # data sources: [{symbol, name, value, unit}]
    text: str | None = None  # note sources
    toc: list[dict[str, Any]] = Field(default_factory=list)  # PDF outline [{level, title, page}]
    urls: SourceUrls = Field(default_factory=SourceUrls)
    created_at: datetime


class SourceUpdate(In):
    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    contains_people: bool | None = None
    consent_confirmed: bool | None = None
    data: list[dict[str, Any]] | None = None
    text: Annotated[str, Field(max_length=8000)] | None = None


class DataValue(In):
    symbol: Annotated[str, Field(min_length=1, max_length=40)]
    name: Annotated[str, Field(max_length=120)] = ""
    value: float
    unit: Annotated[str, Field(max_length=40)] = ""


class DataSourceIn(In):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    values: list[DataValue] = Field(min_length=1, max_length=40)
    note: Annotated[str, Field(max_length=2000)] | None = None


class NoteSourceIn(In):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    text: Annotated[str, Field(min_length=1, max_length=8000)]


class AssetOut(Out):
    id: str
    kind: Literal["cutout", "cover", "frame", "generated", "page"]
    mime: str
    width: int | None = None
    height: int | None = None
    ai_generated: bool = False
    source_id: str | None = None
    url: str
    meta: dict[str, Any] = Field(default_factory=dict)


class OwnerOut(BaseModel):
    id: str
    name: str


class LabSummary(BaseModel):
    id: str
    space: Space
    title: str
    subject: Subject
    grade: Grade
    topic: str | None = None
    language: Locale
    # Optional display metadata for public listings; original author metadata remains above.
    display_title: str | None = None
    display_topic: str | None = None
    display_language: Locale | None = None
    status: LabStatus
    visibility: Visibility
    share_code: str | None = None
    is_demo: bool = False
    cover_url: str | None = None
    block_count: int = 0
    source_count: int = 0
    owner: OwnerOut
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None = None


class LabOut(LabSummary):
    goal: Goal
    level: Level
    ai_mode: AIMode
    allow_tutor: bool
    version: int
    published_version: int | None = None
    has_unpublished_changes: bool = False
    spec: dict[str, Any]
    analysis: dict[str, Any]
    sources: list[SourceOut] = Field(default_factory=list)
    assets: list[AssetOut] = Field(default_factory=list)


class LabList(BaseModel):
    items: list[LabSummary]
    total: int
    page: int
    page_size: int


class VersionOut(BaseModel):
    version: int
    note: str | None = None
    created_at: datetime
    created_by_name: str | None = None


class ValidationCheck(BaseModel):
    code: str
    status: Literal["pass", "fail", "warn", "skip"]
    block_id: str | None = None
    message: str
    detail: dict[str, Any] = Field(default_factory=dict)


class ValidationReport(BaseModel):
    ok: bool  # no "fail" checks
    checked_at: datetime
    checks: list[ValidationCheck]


class PublishIn(In):
    visibility: Visibility = "link"
    allow_tutor: bool = True


class PublishOut(BaseModel):
    share_code: str
    share_url: str
    lab: LabOut
    report: ValidationReport


# ============================================================================ sharing, quiz, feedback
class SharedLabOut(BaseModel):
    id: str
    share_code: str
    space: Space
    title: str
    subject: Subject
    grade: Grade
    topic: str | None = None
    language: Locale
    level: Level
    allow_tutor: bool
    owner: OwnerOut
    published_at: datetime | None = None
    cover_url: str | None = None
    # A sample lab: the learner deck's cover may show its capture (frontend/public/covers).
    is_demo: bool = False
    spec: dict[str, Any]  # published snapshot only (drafts are never exposed)
    sources: list[SourceOut] = Field(default_factory=list)
    assets: list[AssetOut] = Field(default_factory=list)
    # Set only for a complete display translation; originals and citations are unchanged.
    translated_language: Locale | None = None
    translation_kind: Literal["reviewed", "machine"] | None = None


class QuizAnswerIn(In):
    question_id: Annotated[str, Field(min_length=1, max_length=200)]
    answer: Any = None  # int (mcq/truefalse), list[int] (order) or number (numeric)


class QuizAttemptIn(In):
    block_id: Annotated[str, Field(min_length=1, max_length=40)]
    phase: QuizPhase = "practice"
    display_name: Annotated[str, Field(max_length=60)] | None = None
    answers: list[QuizAnswerIn] = Field(min_length=1, max_length=40)


class QuizQuestionResult(BaseModel):
    question_id: str
    correct: bool
    # In the option order the learner was shown (an `order` question's options are permuted).
    correct_answer: Any = None
    explanation: str = ""
    # mcq: one note per option in the learner's option order; truefalse: two (True, False); else empty.
    option_feedback: list[str] = Field(default_factory=list)
    # numeric: the relative tolerance the answer was marked with; null for other kinds.
    tolerance: float | None = None


class QuizAttemptOut(BaseModel):
    id: str
    score: int
    total: int
    results: list[QuizQuestionResult]


class FeedbackIn(In):
    rating: int = Field(ge=1, le=5)
    comment: Annotated[str, Field(max_length=1000)] | None = None


class FeedbackOut(BaseModel):
    id: str
    rating: int
    comment: str | None = None
    created_at: datetime


class PhaseStat(BaseModel):
    count: int = 0
    avg_pct: float | None = None


class QuestionStat(BaseModel):
    block_id: str
    question_id: str
    prompt: str
    attempts: int
    correct: int
    correct_rate: float | None = None


class ResultsOut(BaseModel):
    lab_id: str
    attempts_total: int
    by_phase: dict[str, PhaseStat]
    questions: list[QuestionStat]
    feedback_count: int
    feedback_avg: float | None = None
    feedback_distribution: dict[str, int]
    recent_feedback: list[FeedbackOut]
    tutor_questions: int
    recent_tutor_questions: list[str]


# ============================================================================ AI features
class AnalyzeIn(In):
    source_ids: list[str] = Field(min_length=1, max_length=8)
    pages: dict[str, list[int]] | None = None  # per PDF source: 1-based pages to include
    focus: Annotated[str, Field(max_length=1500)] | None = None
    deep: bool = False  # use Muse Wonder (standard mode, higher cost)


class AnalyzeOut(BaseModel):
    analysis: LabAnalysis
    lab: LabOut


class PaperStructureIn(In):
    source_id: str
    pages: list[int] | None = None
    deep: bool = False


class ExploreEquationIn(In):
    equation_id: Annotated[str, Field(max_length=200)] | None = None
    latex: Annotated[str, Field(max_length=1000)] | None = None
    context: Annotated[str, Field(max_length=3000)] | None = None


class ExploreEquationOut(BaseModel):
    equation: PaperEquation
    block: dict[str, Any] | None = None  # a ready-to-insert graph/simulation/algorithm block
    notes: str = ""


class GenerateIn(In):
    block_types: list[str] | None = None  # default: analysis.suggested_blocks
    replace: bool = False  # replace existing blocks instead of appending
    visual3d: Visual3D | Literal["auto"] | None = None
    formula_ids: list[Annotated[str, Field(min_length=1, max_length=200)]] | None = Field(default=None, max_length=8)


class GenerateOut(BaseModel):
    lab: LabOut
    generated_block_ids: list[str]
    generated_formula_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class QuizGenIn(In):
    count: int = Field(default=5, ge=1, le=10)
    kinds: list[Literal["mcq", "truefalse", "order", "numeric"]] = Field(default_factory=lambda: ["mcq"])
    block_ids: list[str] | None = None


class QuizGenOut(BaseModel):
    questions: list[QuizQuestion]
    title: str = ""  # suggested name for the question set (may be empty)
    intro: str = ""  # suggested one-sentence description (may be empty)


class VideoMarkersIn(In):
    source_id: str


class VideoMarkersOut(BaseModel):
    markers: list[VideoMarker]
    notes: str = ""
    limits: str = ""


class DiagramIn(In):
    source_id: str
    page: int | None = None
    refine_with_sam: bool = True


class DiagramOut(BaseModel):
    image: ImageRef
    hotspots: list[Hotspot]  # bbox refined by SAM when available; mask_path left empty
    relations: list[Relation]
    notes: str = ""
    image_width: int | None = None  # pixel size of the image SAM saw
    image_height: int | None = None
    masks: dict[str, "SamObjectOut"] = Field(default_factory=dict)  # hotspot id → SAM object (decode in the browser)


class PointIn(In):
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    negative: bool = False


class SegmentIn(In):
    source_id: str | None = None  # image source, or PDF source + page
    asset_id: str | None = None  # an image asset (e.g. a saved video frame)
    page: int | None = None
    phrase: Annotated[str, Field(max_length=120)] | None = None
    points: list[PointIn] | None = Field(default=None, max_length=10)  # pixel coords of the media
    box: list[float] | None = Field(default=None, min_length=4, max_length=4)


class SamMask(BaseModel):
    encoding: Literal["lossless", "one_bit"]
    payload: str
    width: int
    height: int


class SamObjectOut(BaseModel):
    id: str
    box: list[int]  # [x1, y1, x2, y2] inclusive pixels
    mask: SamMask | None = None
    confidence: float | None = None


class SegmentOut(BaseModel):
    width: int
    height: int
    phrase_used: str | None = None
    objects: list[SamObjectOut]


class TrackIn(In):
    source_id: str
    phrase: Annotated[str, Field(min_length=1, max_length=120)]


class TrackOut(BaseModel):
    track: VideoTrack
    frames_with_objects: int


class WidgetIn(In):
    description: Annotated[str, Field(min_length=5, max_length=3000)]
    block_id: str | None = None


class WidgetRepairIn(In):
    html: Annotated[str, Field(min_length=1, max_length=80000)]
    errors: list[Annotated[str, Field(max_length=1000)]] = Field(min_length=1, max_length=20)


class WidgetCheck(BaseModel):
    code: str
    status: Literal["pass", "fail", "warn"]
    message: str


class WidgetOut(BaseModel):
    html: str
    checks: list[WidgetCheck]
    status: Literal["draft", "validated", "failed"]


class TranslateIn(In):
    target: Locale


class TranslateOut(BaseModel):
    spec: dict[str, Any]
    target: Locale


# The cover's medium (ai/cover_prompt.py PRESETS); "auto" picks one from the lab's subject.
CoverStyle = Literal["auto", "clay", "papercut", "riso", "specimen", "cyanotype"]


class CoverIn(In):
    prompt: Annotated[str, Field(max_length=600)] | None = None  # the teacher's idea, used verbatim
    style: CoverStyle = "auto"


class TranscribeOut(BaseModel):
    transcript: str
    duration_ms: int | None = None


class PredictionFeedbackIn(In):
    block_id: Annotated[str, Field(max_length=40)]
    prediction: Annotated[str, Field(max_length=1000)]
    observed: dict[str, Any] = Field(default_factory=dict)
    reasoning: Annotated[str, Field(max_length=1500)] | None = None


class PredictionFeedbackOut(BaseModel):
    feedback: str
    correct: bool | None = None


class ExplainChangeIn(In):
    block_id: Annotated[str, Field(max_length=40)]
    before: dict[str, Any]
    after: dict[str, Any]


class ExplainOut(BaseModel):
    explanation: str


class FieldScenarioIn(In):
    sport: Literal["football", "futsal", "volleyball", "basketball", "badminton"]
    description: Annotated[str, Field(min_length=3, max_length=2000)]


class FieldScenarioOut(BaseModel):
    prompt: str
    frames: list[FieldFrame]


class ChatContext(In):
    block_id: Annotated[str, Field(max_length=40)] | None = None
    item_id: Annotated[str, Field(max_length=200)] | None = None  # step / hotspot / question id
    selection: Annotated[str, Field(max_length=2000)] | None = None
    state: dict[str, Any] | None = None  # current params / outputs of the interactive
    source_ref: SourceRef | None = None


class ChatIn(In):
    message: Annotated[str, Field(min_length=1, max_length=2000)]
    context: ChatContext | None = None


class Citation(BaseModel):
    n: int
    source_id: str | None = None
    title: str = ""
    page: int | None = None
    bbox: list[float] | None = None
    time: float | None = None
    quote: str | None = None
    located: Literal["exact", "approximate", "none"] = "none"


class ChatMessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    citations: list[Citation] = Field(default_factory=list)
    created_at: datetime


# ============================================================================ admin
class AdminUserOut(UserOut):
    is_active: bool
    last_login_at: datetime | None = None
    lab_count: int = 0


class AdminUserUpdate(In):
    role: Role | None = None
    is_active: bool | None = None


class AdminUserList(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int


class AICallOut(BaseModel):
    id: str
    feature: str
    model: str
    status: str
    error_code: str | None = None
    http_status: int | None = None
    latency_ms: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    created_at: datetime
    lab_id: str | None = None


class AICallList(BaseModel):
    items: list[AICallOut]
    total: int
    page: int
    page_size: int


class AdminStatsOut(BaseModel):
    generated_at: datetime
    users_by_role: dict[str, int]
    labs_by_status: dict[str, int]
    labs_by_space: dict[str, int]
    labs_by_subject: dict[str, int]
    ai_calls_total: int
    ai_calls_last_7d: int
    ai_success_rate: float | None = None
    ai_by_feature: list[dict[str, Any]]  # [{feature, calls, errors, avg_latency_ms, tokens}]
    ai_by_model: list[dict[str, Any]]
    review_confirmed_ratio: float | None = None  # share of AI-extracted items confirmed by authors
    avg_prep_minutes: float | None = None  # created → first publish
    feedback_avg: float | None = None
    feedback_count: int = 0
    quiz_pre_avg_pct: float | None = None
    quiz_post_avg_pct: float | None = None
    storage_bytes: int = 0


# Resolve the forward reference used by DiagramOut.masks
DiagramOut.model_rebuild()


# --- BE-CORE additions (sources, sharing, admin) -----------------------------------------
class LocateIn(In):
    quote: Annotated[str, Field(min_length=1, max_length=600)]
    page: int | None = Field(default=None, ge=1, le=10000)  # 1-based page to try first


class LocateOut(BaseModel):
    located: Literal["exact", "approximate", "none"]
    page: int | None = None
    rects: list[list[float]] = Field(default_factory=list)  # normalized [x0, y0, x1, y1]
    bbox: list[float] | None = None  # union of rects


class PageTextOut(BaseModel):
    page: int
    width: float
    height: float
    words: list[list[Any]]  # [x0, y0, x1, y1, text], coordinates normalized 0..1
    text: str


class AdminFeedbackOut(BaseModel):
    id: str
    lab_id: str
    lab_title: str
    rating: int
    comment: str | None = None
    created_at: datetime


class AdminFeedbackList(BaseModel):
    items: list[AdminFeedbackOut]
    total: int
    page: int
    page_size: int


# --- Board block: photo of handwriting → reviewed transcription → clean redrawn sheet ---------
from .spec import BoardItem, BoardProof, BoardSurface  # noqa: E402  (kept next to the board DTOs)


class BoardReadIn(In):
    source_id: str
    page: int | None = Field(default=None, ge=1, le=10000)  # PDF sources only (default 1)


class BoardReadOut(BaseModel):
    image: ImageRef
    image_width: int  # pixel size of the image the model read
    image_height: int
    surface: BoardSurface = "other"
    title: str = ""
    items: list[BoardItem] = Field(default_factory=list)  # ids b1, b2, … ; empty: no handwriting found
    unreadable: str = ""
    notes: str = ""  # privacy-mode warnings (choose_mode)


class BoardVisualIn(In):
    source_id: str
    page: int | None = Field(default=None, ge=1, le=10000)
    title: Annotated[str, Field(max_length=200)] = ""
    surface: BoardSurface = "other"
    items: list[BoardItem] = Field(default_factory=list, max_length=80)  # the teacher-confirmed transcription


class BoardVisualOut(BaseModel):
    visual: ImageRef  # asset_id of the redrawn sheet (Asset kind "generated")
    asset: AssetOut
    proof: BoardProof
