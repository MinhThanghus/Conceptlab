"""AI-facing structured-output models (what Muse is asked to return).

These models are sent to Meta Model API as strict JSON schemas (``client.schema_for``) and
validated with Pydantic afterwards. They are deliberately *different* from the stored
contracts (``schemas.spec`` / ``schemas.analysis``):

* the model cites sources by **number + page index + verbatim quote** (``AICite``); services
  resolve those into real ``SourceRef`` locations (never trusting a model-given location);
* ids are assigned by the services, never by the model;
* free-form dictionaries are avoided (strict mode only allows closed objects), so maps are
  expressed as lists of pairs.

Schema rules for strict mode: every property is required (use ``X | None`` for optional
values), no ``dict`` fields, and no ``description`` on a field whose type is a nested model
(that would put a sibling next to ``$ref``). Tests check these rules for every model here.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProvenanceLit = Literal["document", "user", "assumption", "unknown"]
BlockTypeLit = Literal[
    "steps", "flow", "diagram", "graph", "simulation", "algorithm", "video", "field", "quiz", "widget", "text"
]
SimModelLit = Literal["pendulum", "projectile", "compound_interest", "spring_mass"]
AlgorithmLit = Literal["attention", "bubble_sort", "selection_sort", "insertion_sort", "quick_sort", "merge_sort", "heap_sort", "counting_sort", "radix_sort", "bucket_sort", "binary_search", "linear_search"]
SuggestionLit = Literal["graph", "simulation", "algorithm", "diagram", "none"]
CandidateSuggestionLit = Literal["graph", "simulation", "algorithm", "diagram", "flow", "steps", "none"]


class AIModel(BaseModel):
    """Base for AI outputs: tolerant of extra keys (the schema forbids them anyway)."""

    model_config = ConfigDict(extra="ignore")


# ============================================================================ citations
class AICite(AIModel):
    source: int = Field(description="Number of the source in the SOURCES list (1-based).")
    page_index: int | None = Field(
        description=(
            "PDF only: 1-based position of the page inside the attached PDF file (the first page of the "
            "attached file is 1). This is NOT the page number printed on the paper. null for other sources."
        )
    )
    page_label: str | None = Field(
        description="Page number printed on the page if visible, e.g. 'Trang 64' or '12'. null if none is visible."
    )
    quote: str = Field(
        description=(
            "5-25 consecutive words copied exactly from the source (same language and spelling, no paraphrase, "
            "no ellipsis). Empty string when the evidence is purely visual."
        )
    )
    box: list[float] | None = Field(
        description=(
            "Images and scanned pages: approximate region [x0, y0, x1, y1] as fractions 0..1 of the width and "
            "height. null when not applicable or unsure."
        )
    )
    time: float | None = Field(description="Video only: moment in seconds. null otherwise.")


# ============================================================================ analysis (School2Lab)
class AIObject(AIModel):
    name: str = Field(description="Name in the output language.")
    description: str = Field(description="One or two sentences: what it is and its role, as the sources say.")
    sam_phrase: str = Field(
        description=(
            "Short ENGLISH noun phrase (1-4 words) describing how the object looks in a photo or figure, for an "
            "image segmentation model, e.g. 'red ball', 'white string', 'ruler'. Empty string if the object does "
            "not appear in any image."
        )
    )
    cites: list[AICite]


class AIFormula(AIModel):
    latex: str = Field(description="LaTeX of the whole formula without $ delimiters, e.g. 'T = 2\\pi\\sqrt{\\frac{L}{g}}'.")
    expression: str = Field(
        description="Right-hand side only, in the SAFE EXPRESSION SYNTAX, e.g. '2*pi*sqrt(L/g)'. Empty string if impossible."
    )
    output_symbol: str = Field(description="Left-hand side symbol, e.g. 'T'.")
    description: str = Field(
        description="What the formula means and any worked example values the source gives (e.g. 'L = 1 m gives T ≈ 2.01 s')."
    )
    variables: list[str] = Field(description="Symbols used on the right-hand side.")
    cites: list[AICite]


class AIVariable(AIModel):
    symbol: str = Field(description="Symbol as used in the formulas, plain text, e.g. 'L', 'g', 'theta0', 'd_k'.")
    name: str = Field(description="Short name in the output language, e.g. 'chiều dài dây'.")
    unit: str = Field(description="SI unit symbol, e.g. 'm', 's', 'kg', 'm/s²', '°'. Empty string if dimensionless or unknown.")
    value: float | None = Field(description="Numeric value only if a source states it or the user's measurements give it.")
    role: Literal["input", "output", "constant"]
    provenance: ProvenanceLit
    cites: list[AICite]


class AIStep(AIModel):
    title: str = Field(description="Short title of the step (at most 8 words).")
    description: str = Field(description="What happens in this step, from the sources (1-3 sentences).")
    cites: list[AICite]


class AIRelation(AIModel):
    source: str = Field(description="Name of the source object/stage.")
    target: str = Field(description="Name of the target object/stage.")
    description: str = Field(description="The link as stated by the source, e.g. 'longer string gives a longer period'.")
    cites: list[AICite]


class AISuggestion(AIModel):
    type: BlockTypeLit
    reason: str = Field(description="Why this interactive fits the material (one sentence, output language).")
    feasibility: Literal["ready", "needs_input", "not_supported"]
    model: SimModelLit | None = Field(description="Simulation model when type is 'simulation' and the topic matches; else null.")
    algorithm: AlgorithmLit | None = Field(description="Algorithm when type is 'algorithm'; else null.")


class AIMissing(AIModel):
    text: str = Field(description="What is missing and why it matters (output language).")
    symbol: str | None = Field(description="Related variable symbol, or null.")


class AIAssumption(AIModel):
    text: str = Field(description="The simplification in the output language, e.g. 'Bỏ qua lực cản của không khí'.")
    stated_in_source: bool = Field(description="True if a source states this condition itself.")


class AnalysisOutput(AIModel):
    topic: str
    summary: str = Field(description="2-4 sentences on what the sources teach, output language.")
    objects: list[AIObject]
    formulas: list[AIFormula]
    variables: list[AIVariable]
    steps: list[AIStep]
    sequence_clear: bool = Field(description="True only if the sources state the order of the steps explicitly.")
    relations: list[AIRelation]
    suggested_blocks: list[AISuggestion]
    missing_info: list[AIMissing]
    assumptions: list[AIAssumption]
    warnings: list[str] = Field(description="Problems: unreadable parts, conflicting values, values a photo cannot give.")


# ============================================================================ Paper2Explorer
class AIPaperVariable(AIModel):
    symbol: str
    meaning: str = Field(description="Meaning according to the paper (output language).")
    unit: str = Field(description="Unit if the paper gives one, else empty string.")
    known_value: float | None = Field(description="Numeric value only if the paper states it.")
    provenance: ProvenanceLit


class AIEquation(AIModel):
    label: str = Field(description="Equation label as printed, e.g. '(1)'; empty string if none.")
    latex: str = Field(description="LaTeX without $ delimiters.")
    expression: str = Field(
        description=(
            "Right-hand side in the SAFE EXPRESSION SYNTAX when it is a scalar formula that can be evaluated with "
            "numbers; empty string for matrix/operator equations."
        )
    )
    context: str = Field(description="What the equation computes, in one or two sentences (output language).")
    variables: list[AIPaperVariable]
    conditions: str = Field(description="Conditions/assumptions stated for it; empty string if none.")
    missing: list[str] = Field(description="Values or definitions needed to explore it that the paper does not give.")
    explorable: bool = Field(description="True if a small interactive (graph, simulation or algorithm demo) is feasible.")
    suggestion: SuggestionLit
    algorithm: AlgorithmLit | None
    cites: list[AICite]


class AIFigure(AIModel):
    label: str = Field(description="e.g. 'Figure 2'.")
    caption: str = Field(description="Caption copied from the paper (original language).")
    description: str = Field(description="What the figure shows (output language). Do not invent data values.")
    cites: list[AICite]


class AITable(AIModel):
    label: str
    caption: str
    columns: list[str]
    rows: list[list[str]] = Field(description="Only cells you can read reliably; never guess values.")
    cites: list[AICite]


class AISection(AIModel):
    title: str
    page_start_index: int | None = Field(description="1-based page position in the attached file where the section starts.")
    page_end_index: int | None = Field(description="1-based page position in the attached file where it ends.")
    summary: str = Field(description="One sentence (output language).")


class AIMethod(AIModel):
    title: str
    summary: str = Field(description="The method in a few sentences (output language).")
    cites: list[AICite]


class AICandidate(AIModel):
    kind: Literal["equation", "figure", "table", "method", "algorithm"]
    ref_index: int | None = Field(
        description="1-based index into the list of that kind (equations, figures, tables or methods); null for 'algorithm'."
    )
    title: str
    reason: str = Field(description="What a student could explore interactively (output language).")
    suggestion: CandidateSuggestionLit


class PaperOutput(AIModel):
    title: str
    summary: str = Field(description="3-5 sentences (output language).")
    sections: list[AISection]
    equations: list[AIEquation]
    figures: list[AIFigure]
    tables: list[AITable]
    methods: list[AIMethod]
    candidates: list[AICandidate]
    warnings: list[str]


# ============================================================================ explore equation
class AIParam(AIModel):
    symbol: str
    name: str = Field(description="Short name in the output language.")
    unit: str
    value: float = Field(description="Default value.")
    min: float
    max: float
    step: float
    role: Literal["input", "constant"]
    provenance: ProvenanceLit


class AIActive(AIModel):
    question: str = Field(description="Prediction question for the learner (output language).")
    param: str = Field(description="Symbol of the parameter the learner changes.")
    from_value: float | None
    to_value: float | None
    observe: str = Field(description="What to observe, e.g. 'y_vertex', 'period', 'range'.")
    options: list[str] = Field(description="2-4 short answer options (output language).")
    correct_option: int | None = Field(description="0-based index of the correct option.")
    explanation: str = Field(description="Why, grounded in the formula/model (output language).")


class AIGraphSpec(AIModel):
    expression: str = Field(description="Right-hand side in the SAFE EXPRESSION SYNTAX as a function of x_var.")
    x_var: str
    x_min: float
    x_max: float
    y_min: float | None
    y_max: float | None
    x_label: str = Field(description="Axis label with unit, e.g. 'L (m)'.")
    y_label: str = Field(description="Axis label with unit, e.g. 'T (s)'.")
    params: list[AIParam]
    explanation: str


class AIAttentionSpec(AIModel):
    tokens: list[str] = Field(description="3-4 short example tokens.")
    d_k: int = Field(description="Key/query dimension, 2-4.")
    Q: list[list[float]] = Field(description="tokens x d_k matrix of small numbers.")
    K: list[list[float]] = Field(description="tokens x d_k matrix of small numbers.")
    V: list[list[float]] = Field(description="tokens x d_v matrix (d_v 2-4) of small numbers.")
    explanation: str


class AISimParam(AIModel):
    symbol: str
    value: float
    min: float
    max: float
    step: float
    provenance: ProvenanceLit


class AISimSpec(AIModel):
    model: SimModelLit
    params: list[AISimParam]
    notes: str


class ExploreOutput(AIModel):
    variables: list[AIPaperVariable]
    known: list[str] = Field(description="Values already available, e.g. 'h = 8 (paper)'.")
    missing: list[str] = Field(description="Values or definitions still missing.")
    block_kind: Literal["graph", "simulation", "algorithm", "none"]
    graph: AIGraphSpec | None
    attention: AIAttentionSpec | None
    simulation: AISimSpec | None
    notes: str = Field(description="What the interactive shows and its limits, or what is missing and a suggested diagram.")


# ============================================================================ block generation
class GenStep(AIModel):
    title: str
    body: str
    check_question: str | None = Field(
        default=None,
        description=(
            "For about half of the steps: one short why / what-if / predict question (at most 25 words) that makes the "
            "learner think about this step. Never a yes/no question, never answered by a word copied from the body. "
            "null for the other steps."
        ),
    )
    ref_ids: list[str] = Field(description="Ids of analysis items this step comes from (e.g. 's1', 'f1', 'v:L').")


class GenSteps(AIModel):
    title: str
    description: str
    steps: list[GenStep]


class GenFlowNode(AIModel):
    key: str = Field(description="Short unique key, e.g. 'n1'.")
    label: str
    description: str
    ref_ids: list[str]


class GenFlowEdge(AIModel):
    source_key: str
    target_key: str
    label: str
    description: str


class GenFlow(AIModel):
    title: str
    description: str
    layout: Literal["cycle", "linear"]
    nodes: list[GenFlowNode]
    edges: list[GenFlowEdge]


class GenGraph(AIModel):
    title: str
    description: str
    ref_ids: list[str]
    graph: AIGraphSpec
    active: AIActive | None


class GenRefCaseInput(AIModel):
    symbol: str
    value: float


class GenRefCase(AIModel):
    inputs: list[GenRefCaseInput]
    output: str
    expected: float
    tolerance: float = Field(description="Relative tolerance, e.g. 0.02.")
    quote: str = Field(description="The sentence of the source that states this example.")


class GenSimParam(AIModel):
    symbol: str
    name: str = Field(description="Short name in the output language.")
    value: float
    min: float
    max: float
    step: float
    provenance: ProvenanceLit


class GenSimulation(AIModel):
    title: str
    description: str
    ref_ids: list[str]
    params: list[GenSimParam]
    reference_cases: list[GenRefCase]
    active: AIActive | None
    notes: str


class GenAlgorithm(AIModel):
    title: str
    description: str
    ref_ids: list[str]
    algorithm: AlgorithmLit
    tokens: list[str]
    Q: list[list[float]]
    K: list[list[float]]
    V: list[list[float]]
    array: list[float]
    target: float | None
    explanation: str


class GenText(AIModel):
    title: str
    body: str


class GenGlossaryTerm(AIModel):
    vi: str
    en: str
    note: str


class GenLessonMeta(AIModel):
    summary: str
    objectives: list[str]
    glossary: list[GenGlossaryTerm]


# ============================================================================ quiz
CognitiveLevelLit = Literal["recall", "understand", "apply", "extend"]
COGNITIVE_LEVELS: tuple[str, ...] = ("recall", "understand", "apply", "extend")
# Names a model may use instead of the four levels (Bloom's verbs, Vietnamese textbook levels).
_LEVEL_ALIASES = {
    "remember": "recall", "knowledge": "recall", "recognise": "recall", "recognize": "recall", "nhận biết": "recall",
    "comprehension": "understand", "understanding": "understand", "explain": "understand", "thông hiểu": "understand",
    "application": "apply", "applying": "apply", "use": "apply", "vận dụng": "apply",
    "analyse": "extend", "analyze": "extend", "analysis": "extend", "evaluate": "extend", "evaluation": "extend",
    "create": "extend", "predict": "extend", "vận dụng cao": "extend",
}


class GenQuestion(AIModel):
    kind: Literal["mcq", "truefalse", "order", "numeric"]
    cognitive_level: CognitiveLevelLit | None = Field(
        default=None,
        description=(
            "The thinking the question asks for: 'recall' (name, recognise), 'understand' (explain why, compare), "
            "'apply' (use the rule or formula in a new case) or 'extend' (predict, analyse a situation, judge a claim)."
        ),
    )
    context: str = Field(
        default="",
        description=(
            "Optional hook shown above the question: one or two sentences describing a situation the learner can "
            "picture, taken from the lesson's own material first (class photo, measured values, textbook example), "
            "otherwise from everyday life in Vietnam. Never contains or hints at the answer. Empty string if not needed."
        ),
    )
    prompt: str = Field(
        description="The question itself: one clear question of at most 30 words; define every symbol and give every value with its unit."
    )
    options: list[str] = Field(
        description="mcq: 3-4 options; truefalse: empty list; order: the items in the CORRECT order; numeric: empty list."
    )
    answer_index: int | None = Field(description="mcq: 0-based index of the correct option. truefalse: 0 = true, 1 = false.")
    answer_value: float | None = Field(description="numeric: the correct number.")
    tolerance: float | None = Field(description="numeric: accepted relative error, e.g. 0.02.")
    unit: str = Field(description="numeric: unit of the answer, else empty string.")
    option_feedback: list[str] = Field(
        default_factory=list,
        description=(
            "mcq: one note per option, in the same order as `options`; truefalse: exactly two notes, for answering True "
            "then False; order and numeric: empty list. At most 25 words each: for the correct option say why it is "
            "right; for a wrong one name the misconception kindly and what to re-check. Never refer to option letters."
        ),
    )
    hint: str = Field(
        default="",
        description=(
            "One sentence pointing to the idea, step or formula to use, without the answer, the correct option's "
            "words or the final number. Empty string if none."
        ),
    )
    explanation: str = Field(
        description="1-3 sentences of reasoning for the correct answer, grounded in the lesson (numeric: show the substitution)."
    )
    ref_ids: list[str] = Field(description="Ids of the analysis items used, e.g. 'f1', 's2', 'v:L', 'r1'.")

    @field_validator("cognitive_level", mode="before")
    @classmethod
    def _known_level(cls, value: object) -> str | None:
        """An unknown level is dropped instead of failing the whole question set."""
        if value is None:
            return None
        key = " ".join(str(value).strip().lower().split())
        key = _LEVEL_ALIASES.get(key, key)
        return key if key in COGNITIVE_LEVELS else None

    @field_validator("context", "hint", mode="before")
    @classmethod
    def _text_or_empty(cls, value: object) -> object:
        return "" if value is None else value

    @field_validator("option_feedback", mode="before")
    @classmethod
    def _feedback_texts(cls, value: object) -> object:
        if value is None:
            return []
        if isinstance(value, list):
            return ["" if item is None else str(item) for item in value]
        return value


class QuizOutput(AIModel):
    questions: list[GenQuestion]
    title: str = Field(default="", description="An inviting name for the question set, at most 6 words (output language).")
    intro: str = Field(default="", description="One sentence telling the learner what they will figure out (output language).")


# ============================================================================ video, diagram, segmentation
class AIMarker(AIModel):
    t: float = Field(description="Moment in seconds from the start of the video.")
    label: str = Field(description="Short label (at most 6 words), output language.")
    note: str = Field(description="What to observe at this moment, neutral wording, no judgement of the performer.")


class MarkersOutput(AIModel):
    markers: list[AIMarker]
    limits: str = Field(description="What cannot be seen reliably (occlusion, camera angle, blur, small size).")
    notes: str


class AIDiagramPart(AIModel):
    key: str = Field(description="Short unique key, e.g. 'p1'.")
    label: str
    description_simple: str = Field(description="One short sentence for beginners.")
    description_detailed: str = Field(description="2-4 sentences with the details given by the source.")
    box: list[float] = Field(description="[x0, y0, x1, y1] fractions 0..1 of the image width and height, tight around the part.")


class AIDiagramRelation(AIModel):
    source_key: str
    target_key: str
    label: str
    description: str


class DiagramOutput(AIModel):
    parts: list[AIDiagramPart]
    relations: list[AIDiagramRelation]
    notes: str


class PhraseOutput(AIModel):
    phrase: str = Field(description="Short English noun phrase, 1-4 words, no articles.")


class VisualPhrasesOutput(AIModel):
    phrases: list[str] = Field(
        description="Up to 3 short, concrete English noun phrases (1-4 words) naming the visible object the user means, best first."
    )


# ============================================================================ widgets, translation, learning
class WidgetOutput(AIModel):
    html: str = Field(description="One complete, self-contained HTML document.")
    summary: str = Field(description="One sentence describing the interface (output language).")


class TranslateItem(AIModel):
    id: str
    text: str


class TranslateOutput(AIModel):
    items: list[TranslateItem]
    glossary: list[GenGlossaryTerm]


class PredictionOutput(AIModel):
    feedback: str
    verdict: Literal["correct", "partly_correct", "incorrect", "cannot_tell"]


class AIPoint(AIModel):
    x: float
    y: float


class AIPlayer(AIModel):
    team: Literal["A", "B"]
    label: str = Field(description="At most 3 characters, e.g. 'A1', 'GK', 'S'.")
    x: float = Field(description="0..1 along the length of the field/court (0 = team A's end line).")
    y: float = Field(description="0..1 across the width (0 = top touchline).")


class AIArrow(AIModel):
    kind: Literal["run", "pass"]
    x1: float
    y1: float
    x2: float
    y2: float


class AIFieldFrame(AIModel):
    note: str = Field(description="What happens in this frame (output language).")
    players: list[AIPlayer]
    ball: AIPoint | None
    arrows: list[AIArrow]


class FieldOutput(AIModel):
    prompt: str = Field(description="The task for the learner (output language).")
    frames: list[AIFieldFrame]


# ============================================================================ helpers
def clip(text: object, limit: int) -> str:
    """Trim a model string to a stored field limit (whitespace-normalised ends)."""
    value = "" if text is None else str(text).strip()
    if len(value) <= limit:
        return value
    cut = value[: max(0, limit - 1)].rstrip()
    return cut + "…"


def clip_list(items: list | None, limit: int) -> list:
    return list(items or [])[:limit]


ALL_OUTPUT_MODELS: tuple[type[BaseModel], ...] = (
    AnalysisOutput,
    PaperOutput,
    ExploreOutput,
    GenSteps,
    GenFlow,
    GenGraph,
    GenSimulation,
    GenAlgorithm,
    GenText,
    GenLessonMeta,
    QuizOutput,
    MarkersOutput,
    DiagramOutput,
    PhraseOutput,
    WidgetOutput,
    TranslateOutput,
    PredictionOutput,
    FieldOutput,
)


# ============================================================================ board (handwriting photo → clean sheet)
BoardKindLit = Literal["heading", "text", "bullet", "formula", "equation", "diagram", "note"]
BoardSurfaceLit = Literal["whiteboard", "blackboard", "paper", "notebook", "screen", "other"]


class BoardReadItemOut(AIModel):
    kind: BoardKindLit
    text: str = Field(
        description=(
            "What is written, one line, verbatim in the writer's language, with Unicode symbols and subscripts. "
            "formula: the whole line (Chu kì: T = 2π√(l/g)); equation: the equation without the arrow words; "
            "diagram: one sentence saying what the drawing shows, in the output language."
        )
    )
    lead: str = Field(description="formula/equation only: the words written before the formula (e.g. 'Chu kì:'), else empty.")
    latex: str = Field(description="formula/equation only: the formula itself in KaTeX syntax, else empty.")
    labels: list[str] = Field(description="diagram only: the words and symbols written on the drawing, else empty.")
    box: list[float] = Field(description="[x0, y0, x1, y1] fractions 0..1 of the image width and height, tight around the item.")
    uncertain: list[str] = Field(description="Words of text you could not read with confidence, exactly as you wrote them.")
    struck: bool = Field(description="true for crossed-out writing.")


class BoardReadOutput(AIModel):
    surface: BoardSurfaceLit
    title: str = Field(description="The main heading, or a short topic name when there is none.")
    items: list[BoardReadItemOut]
    unreadable: str = Field(description="What could not be read at all, in the output language; empty when everything was read.")


class BoardProofDiffOut(AIModel):
    expected: str = Field(description="The reference text.")
    found: str = Field(description="What the image shows instead.")


class BoardProofOutput(AIModel):
    differences: list[BoardProofDiffOut]
    missing: list[str] = Field(description="Reference lines or words the image does not show.")
    extra: list[str] = Field(description="Text in the image that is not in the reference, including any line written twice.")


ALL_OUTPUT_MODELS = ALL_OUTPUT_MODELS + (BoardReadOutput, BoardProofOutput)
