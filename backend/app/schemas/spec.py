"""Lab specification — the shared contract between AI generation, storage and the UI.

A Lab's ``spec_json`` is a :class:`LabSpec`. It describes sources references, objects,
variables, steps, assumptions and the interactive *blocks* the renderer draws.
Documented for humans in ``docs/LAB_SPEC.md``; mirrored by the frontend block registry
(``frontend/src/features/blocks``).

Provenance of every value (spec §11):
``document`` (từ tài liệu) · ``user`` (người dùng cung cấp) · ``assumption`` (giả định)
· ``unknown`` (chưa xác định).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["document", "user", "assumption", "unknown"]
Located = Literal["exact", "approximate", "none"]
SimModel = Literal["pendulum", "projectile", "compound_interest", "spring_mass"]
AlgorithmKind = Literal["attention", "bubble_sort", "selection_sort", "insertion_sort", "quick_sort", "merge_sort", "heap_sort", "counting_sort", "radix_sort", "bucket_sort", "binary_search", "linear_search"]
Sport = Literal["football", "futsal", "volleyball", "basketball", "badminton"]

Short = Annotated[str, Field(max_length=200)]
Medium = Annotated[str, Field(max_length=2000)]
Long = Annotated[str, Field(max_length=12000)]
BBox = Annotated[list[float], Field(min_length=4, max_length=4)]


class SpecModel(BaseModel):
    model_config = ConfigDict(extra="ignore")


class SourceRef(SpecModel):
    """Points at the evidence for a piece of content. Never invent a location:
    ``located='none'`` means the position could not be determined."""

    source_id: str | None = None
    page: int | None = Field(default=None, ge=1, le=10000)  # 1-based page index in the file
    page_label: str | None = Field(default=None, max_length=40)  # printed label, e.g. "Trang 64"
    bbox: BBox | None = None  # normalized [x0, y0, x1, y1] in 0..1 of the page/image
    time: float | None = Field(default=None, ge=0)  # seconds, for video sources
    quote: str | None = Field(default=None, max_length=600)
    located: Located = "none"


class Quantity(SpecModel):
    """A variable / parameter with unit, range and provenance."""

    symbol: Short
    name: Short = ""
    unit: Annotated[str, Field(max_length=40)] = ""
    value: float | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    role: Literal["input", "output", "constant"] = "input"
    provenance: Provenance = "unknown"
    source_ref: SourceRef | None = None
    confirmed: bool = False


class Assumption(SpecModel):
    id: Short
    text: Medium
    confirmed: bool = False


class GlossaryTerm(SpecModel):
    id: Short
    vi: Short
    en: Short
    note: Medium = ""


class ActiveLearning(SpecModel):
    """Predict → change → run → compare → explain (spec §10.2)."""

    enabled: bool = True
    question: Medium = ""
    param: Short = ""  # symbol changed by the learner
    from_value: float | None = None
    to_value: float | None = None
    observe: Short = ""  # output key, e.g. "period", "range", "y_vertex"
    options: list[Short] = Field(default_factory=list, max_length=6)
    correct_option: int | None = None
    explanation: Medium = ""


class ReferenceCase(SpecModel):
    inputs: dict[str, float] = Field(default_factory=dict)
    output: Short
    expected: float
    tolerance: float = 0.01  # relative tolerance


class BlockBase(SpecModel):
    id: Annotated[str, Field(min_length=1, max_length=40)]
    title: Short = ""
    description: Medium = ""
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=20)
    confirmed: bool = False  # reviewed by the teacher / author
    ai_generated: bool = False


# ----------------------------------------------------------------------------- steps / flow
class Step(SpecModel):
    id: Short
    title: Short
    body: Long = ""
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=10)
    highlight: SourceRef | None = None  # region of a page/image to highlight for this step
    check_question: Medium | None = None


class StepsBlock(BlockBase):
    type: Literal["steps"] = "steps"
    steps: list[Step] = Field(default_factory=list, max_length=40)
    sequence_confirmed: bool = False  # order stated by the source or confirmed by a human
    autoplay_seconds: int = Field(default=6, ge=2, le=60)


class FlowNode(SpecModel):
    id: Short
    label: Short
    description: Medium = ""
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=10)


class FlowEdge(SpecModel):
    id: Short
    source: Short
    target: Short
    label: Short = ""
    description: Medium = ""
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=10)


class FlowBlock(BlockBase):
    type: Literal["flow"] = "flow"
    layout: Literal["cycle", "linear"] = "linear"
    nodes: list[FlowNode] = Field(default_factory=list, max_length=30)
    edges: list[FlowEdge] = Field(default_factory=list, max_length=60)


# ----------------------------------------------------------------------------- diagram
class ImageRef(SpecModel):
    source_id: str | None = None
    page: int | None = None  # for PDF sources
    asset_id: str | None = None


class Hotspot(SpecModel):
    id: Short
    label: Short
    description_simple: Medium = ""
    description_detailed: Long = ""
    bbox: BBox  # normalized
    mask_path: Annotated[str, Field(max_length=60000)] | None = None  # SVG path in normalized 0..1000 units
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=10)


class Relation(SpecModel):
    id: Short
    source: Short  # hotspot id
    target: Short
    label: Short = ""
    description: Medium = ""


class DiagramBlock(BlockBase):
    type: Literal["diagram"] = "diagram"
    image: ImageRef = Field(default_factory=ImageRef)
    hotspots: list[Hotspot] = Field(default_factory=list, max_length=40)
    relations: list[Relation] = Field(default_factory=list, max_length=60)


# ----------------------------------------------------------------------------- graph / simulation
class GraphBlock(BlockBase):
    type: Literal["graph"] = "graph"
    expression: Annotated[str, Field(max_length=400)] = ""
    x_var: Short = "x"
    x_min: float = -10
    x_max: float = 10
    y_min: float | None = None
    y_max: float | None = None
    x_label: Short = ""
    y_label: Short = ""
    params: list[Quantity] = Field(default_factory=list, max_length=12)
    explanation: Long = ""
    active: ActiveLearning | None = None


class SimulationBlock(BlockBase):
    type: Literal["simulation"] = "simulation"
    model: SimModel = "pendulum"
    params: list[Quantity] = Field(default_factory=list, max_length=12)
    object_asset_id: str | None = None  # SAM cut-out used as the moving object
    reference_cases: list[ReferenceCase] = Field(default_factory=list, max_length=10)
    active: ActiveLearning | None = None
    notes: Long = ""


class AlgorithmBlock(BlockBase):
    type: Literal["algorithm"] = "algorithm"
    algorithm: AlgorithmKind = "attention"
    config: dict[str, Any] = Field(default_factory=dict)
    explanation: Long = ""


# ----------------------------------------------------------------------------- video / field
class VideoMarker(SpecModel):
    id: Short
    t: float = Field(ge=0)
    label: Short
    note: Medium = ""
    confirmed: bool = False
    ai_suggested: bool = False


class TrackFrame(SpecModel):
    t: float = Field(ge=0)
    boxes: list[BBox] = Field(default_factory=list, max_length=20)  # normalized


class VideoTrack(SpecModel):
    id: Short
    phrase: Short
    frames: list[TrackFrame] = Field(default_factory=list, max_length=5000)


class VideoBlock(BlockBase):
    type: Literal["video"] = "video"
    source_id: str | None = None
    markers: list[VideoMarker] = Field(default_factory=list, max_length=60)
    compare: ImageRef | None = None  # textbook page / reference video shown side by side
    tracks: list[VideoTrack] = Field(default_factory=list, max_length=6)
    limits_note: Medium = ""


class Point(SpecModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class FieldPlayer(SpecModel):
    id: Short
    team: Literal["A", "B"] = "A"
    label: Annotated[str, Field(max_length=4)] = ""
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class FieldArrow(SpecModel):
    id: Short
    kind: Literal["run", "pass"] = "run"
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)


class FieldFrame(SpecModel):
    id: Short
    note: Medium = ""
    players: list[FieldPlayer] = Field(default_factory=list, max_length=30)
    ball: Point | None = None
    arrows: list[FieldArrow] = Field(default_factory=list, max_length=40)


class FieldBlock(BlockBase):
    type: Literal["field"] = "field"
    sport: Sport = "football"
    prompt: Medium = ""
    frames: list[FieldFrame] = Field(default_factory=list, max_length=30)
    solution_frames: list[FieldFrame] = Field(default_factory=list, max_length=30)


# ----------------------------------------------------------------------------- quiz / widget / text
CognitiveLevel = Literal["recall", "understand", "apply", "extend"]  # Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao
COGNITIVE_LEVELS: tuple[str, ...] = ("recall", "understand", "apply", "extend")
# Keys learners never receive before they submit (answers, explanations, per-option feedback).
QUIZ_ANSWER_KEYS: tuple[str, ...] = ("answer_index", "answer_order", "answer_value", "tolerance", "explanation", "option_feedback")


class QuizQuestion(SpecModel):
    id: Short
    kind: Literal["mcq", "truefalse", "order", "numeric"] = "mcq"
    prompt: Medium
    options: list[Short] = Field(default_factory=list, max_length=8)
    answer_index: int | None = None  # mcq / truefalse (0 = true, 1 = false)
    answer_order: list[int] | None = None  # order: correct sequence of option indices
    answer_value: float | None = None  # numeric
    tolerance: float | None = None  # numeric, relative
    unit: Annotated[str, Field(max_length=40)] = ""
    explanation: Medium = ""
    # A short situation shown above the prompt (the lesson's own material first, else everyday life).
    context: Medium = ""
    # One sentence pointing to the idea to use, never the answer; learners open it on demand.
    hint: Medium = ""
    cognitive_level: CognitiveLevel | None = None
    # mcq: one note per option in option order; truefalse: two (answering True, then False);
    # order / numeric: empty. Withheld from learners until their answer is marked.
    option_feedback: list[Annotated[str, Field(max_length=400)]] = Field(default_factory=list, max_length=8)
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=6)
    approved: bool = False  # only approved questions are shown to learners


class QuizBlock(BlockBase):
    type: Literal["quiz"] = "quiz"
    questions: list[QuizQuestion] = Field(default_factory=list, max_length=40)


class WidgetBlock(BlockBase):
    type: Literal["widget"] = "widget"
    prompt: Medium = ""
    html: Annotated[str, Field(max_length=80000)] = ""
    status: Literal["draft", "validated", "failed"] = "draft"
    validation: dict[str, Any] = Field(default_factory=dict)
    approved: bool = False


Visual3D = Literal["enzyme_binding", "population_grid", "circulation", "molecular_geometry", "solar_globe", "water_cycle", "image_relief", "data_tree", "quadrotor", "solar_cell", "diffusion_process", "agriculture_field", "reaction_diffusion", "porous_adsorption", "semiconductor_chip"]


class TextBlock(BlockBase):
    type: Literal["text"] = "text"
    body: Long = ""
    # Optional built-in conceptual illustration; never arbitrary executable HTML.
    visual3d: Visual3D | None = None
    visual_mode: Literal["device", "cmos", "stack", "memristor"] | None = None
    visual_geometry: Literal["planar", "nanosheet", "nanowire"] | None = None


# ----------------------------------------------------------------------------- board (handwriting photo)
BoardItemKind = Literal["heading", "text", "bullet", "formula", "equation", "diagram", "note"]
BoardSurface = Literal["whiteboard", "blackboard", "paper", "notebook", "screen", "other"]


class BoardItem(SpecModel):
    """One line or logical unit read from a photo of handwriting (services/board.py)."""

    id: Short  # "b1", "b2", ...
    kind: BoardItemKind = "text"
    # What is written, one line, Unicode symbols/subscripts (T = 2π√(l/g); 6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂).
    # diagram: one sentence saying what the drawing shows (lab output language).
    text: Medium = ""
    lead: Short = ""  # formula/equation only: the words before the formula ("Chu kì:"), shown before it
    latex: Medium = ""  # formula/equation only: KaTeX of the formula itself (arrow conditions: \xrightarrow[under]{over})
    labels: list[Short] = Field(default_factory=list, max_length=20)  # diagram only: words/symbols written on the drawing
    bbox: BBox | None = None  # normalized [x0, y0, x1, y1] on the photo
    uncertain: list[Short] = Field(default_factory=list, max_length=20)  # words of `text` read without confidence
    struck: bool = False  # crossed out in the photo; never shown to learners, never redrawn


class BoardDiff(SpecModel):
    expected: Short = ""
    found: Short = ""


class BoardProof(SpecModel):
    """Proofreading of the redrawn sheet against the confirmed transcription."""

    checked: bool = False  # False when the proofreading call failed or was skipped
    ok: bool = False  # checked and no differences, missing or extra text
    differences: list[BoardDiff] = Field(default_factory=list, max_length=30)
    missing: list[Short] = Field(default_factory=list, max_length=30)
    extra: list[Short] = Field(default_factory=list, max_length=30)
    attempts: int = Field(default=1, ge=1, le=5)


class BoardBlock(BlockBase):
    """A photo of a board or a notebook page, its reviewed transcription and a clean redrawn sheet.
    Only the teacher creates it (from a photo); AI generation never proposes it."""

    type: Literal["board"] = "board"
    image: ImageRef = Field(default_factory=ImageRef)  # the photo: source_id (+ page for a PDF)
    surface: BoardSurface = "other"
    items: list[BoardItem] = Field(default_factory=list, max_length=80)
    unreadable: Medium = ""  # what the model could not read at all
    visual: ImageRef | None = None  # the redrawn sheet: asset_id of an Asset(kind="generated")
    visual_proof: BoardProof | None = None
    show: Literal["visual", "text"] = "visual"  # the view learners see first


Block = Annotated[
    Union[
        StepsBlock,
        FlowBlock,
        DiagramBlock,
        GraphBlock,
        SimulationBlock,
        AlgorithmBlock,
        VideoBlock,
        FieldBlock,
        QuizBlock,
        WidgetBlock,
        TextBlock,
        BoardBlock,
    ],
    Field(discriminator="type"),
]

BLOCK_TYPES = (
    "steps",
    "flow",
    "diagram",
    "graph",
    "simulation",
    "algorithm",
    "video",
    "field",
    "quiz",
    "widget",
    "text",
    "board",
)

# Block types only a teacher creates (from their own material): AI analysis, lesson generation
# and the paper flow never propose or build them.
TEACHER_ONLY_BLOCK_TYPES = ("board",)
AI_BLOCK_TYPES = tuple(t for t in BLOCK_TYPES if t not in TEACHER_ONLY_BLOCK_TYPES)


class LabSpec(SpecModel):
    schema_version: int = 1
    summary: Long = ""
    objectives: list[Medium] = Field(default_factory=list, max_length=12)
    glossary: list[GlossaryTerm] = Field(default_factory=list, max_length=120)
    assumptions: list[Assumption] = Field(default_factory=list, max_length=40)
    blocks: list[Block] = Field(default_factory=list, max_length=40)


def empty_spec() -> dict[str, Any]:
    return LabSpec().model_dump(mode="json")
