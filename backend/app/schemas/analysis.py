"""Stored AI analysis of a Lab's sources (``labs.analysis_json``), editable in the Review step.

The AI never writes this shape directly: services convert the model's structured
output (which cites sources by index + verbatim quote) into these models, resolving
each citation to a real location (``located='exact'`` via PDF text search,
``'approximate'`` from a model-estimated box, or ``'none'``).
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from .spec import (
    AI_BLOCK_TYPES,
    AlgorithmKind,
    Assumption,
    Long,
    Medium,
    Quantity,
    Short,
    SimModel,
    SourceRef,
    SpecModel,
)

BlockType = Literal[
    "steps", "flow", "diagram", "graph", "simulation", "algorithm", "video", "field", "quiz", "widget", "text"
]
# Types the analysis may suggest: every block type except the teacher-only ones (a board is made from a photo).
assert set(BlockType.__args__) == set(AI_BLOCK_TYPES)  # keep in sync with spec.AI_BLOCK_TYPES

Refs = Annotated[list[SourceRef], Field(default_factory=list, max_length=12)]


class AnalysisObject(SpecModel):
    id: Short
    name: Short
    description: Medium = ""
    sam_phrase: Short = ""  # short English noun phrase usable as a SAM 3.1 prompt
    asset_id: str | None = None  # cut-out chosen with SAM in the Review step
    source_id: str | None = None  # image the object was selected in
    source_refs: Refs
    confirmed: bool = False


class AnalysisFormula(SpecModel):
    id: Short
    latex: Annotated[str, Field(max_length=600)] = ""
    expression: Annotated[str, Field(max_length=400)] = ""  # safe syntax of services/expr.py
    output_symbol: Short = ""  # left-hand side, e.g. "T"
    description: Medium = ""
    variables: list[Short] = Field(default_factory=list, max_length=20)
    source_refs: Refs
    confirmed: bool = False


class AnalysisStep(SpecModel):
    id: Short
    title: Short
    description: Long = ""
    source_refs: Refs
    confirmed: bool = False


class AnalysisRelation(SpecModel):
    id: Short
    source: Short
    target: Short
    description: Medium = ""
    source_refs: Refs
    confirmed: bool = False


class SuggestedBlock(SpecModel):
    type: BlockType
    reason: Medium = ""
    feasibility: Literal["ready", "needs_input", "not_supported"] = "ready"
    model: SimModel | None = None
    algorithm: AlgorithmKind | None = None


class MissingInfo(SpecModel):
    id: Short
    text: Medium
    symbol: Short | None = None
    resolved: bool = False


class AnalysisResult(SpecModel):
    topic: Short = ""
    summary: Long = ""
    objects: list[AnalysisObject] = Field(default_factory=list, max_length=40)
    formulas: list[AnalysisFormula] = Field(default_factory=list, max_length=30)
    variables: list[Quantity] = Field(default_factory=list, max_length=40)
    steps: list[AnalysisStep] = Field(default_factory=list, max_length=40)
    sequence_clear: bool = False
    relations: list[AnalysisRelation] = Field(default_factory=list, max_length=60)
    suggested_blocks: list[SuggestedBlock] = Field(default_factory=list, max_length=12)
    missing_info: list[MissingInfo] = Field(default_factory=list, max_length=30)
    assumptions: list[Assumption] = Field(default_factory=list, max_length=30)
    warnings: list[Medium] = Field(default_factory=list, max_length=20)


# ----------------------------------------------------------------------------- Paper2Explorer
class PaperVariable(SpecModel):
    symbol: Short
    meaning: Medium = ""
    unit: Annotated[str, Field(max_length=40)] = ""
    known_value: float | None = None
    provenance: Literal["document", "user", "assumption", "unknown"] = "unknown"


class PaperEquation(SpecModel):
    id: Short
    label: Annotated[str, Field(max_length=20)] = ""  # e.g. "(1)"
    latex: Annotated[str, Field(max_length=1000)] = ""
    expression: Annotated[str, Field(max_length=400)] = ""  # safe syntax when numerically evaluable
    context: Medium = ""
    variables: list[PaperVariable] = Field(default_factory=list, max_length=30)
    conditions: Medium = ""
    missing: list[Medium] = Field(default_factory=list, max_length=10)
    explorable: bool = False
    suggestion: Literal["graph", "simulation", "algorithm", "diagram", "none"] = "none"
    algorithm: AlgorithmKind | None = None
    source_refs: Refs


class PaperFigure(SpecModel):
    id: Short
    label: Short = ""
    caption: Medium = ""
    description: Medium = ""
    source_refs: Refs


class PaperTable(SpecModel):
    id: Short
    label: Short = ""
    caption: Medium = ""
    columns: list[Short] = Field(default_factory=list, max_length=20)
    rows: list[list[Short]] = Field(default_factory=list, max_length=60)
    source_refs: Refs


class PaperSection(SpecModel):
    id: Short
    title: Short
    page_start: int | None = None
    page_end: int | None = None
    summary: Medium = ""


class PaperMethod(SpecModel):
    id: Short
    title: Short
    summary: Long = ""
    source_refs: Refs


class PaperCandidate(SpecModel):
    id: Short
    kind: Literal["equation", "figure", "table", "method", "algorithm"]
    ref_id: Short = ""
    title: Short
    reason: Medium = ""
    suggestion: Literal["graph", "simulation", "algorithm", "diagram", "flow", "steps", "none"] = "none"


class PaperStructure(SpecModel):
    title: Short = ""
    summary: Long = ""
    sections: list[PaperSection] = Field(default_factory=list, max_length=60)
    equations: list[PaperEquation] = Field(default_factory=list, max_length=60)
    figures: list[PaperFigure] = Field(default_factory=list, max_length=60)
    tables: list[PaperTable] = Field(default_factory=list, max_length=30)
    methods: list[PaperMethod] = Field(default_factory=list, max_length=30)
    candidates: list[PaperCandidate] = Field(default_factory=list, max_length=30)
    warnings: list[Medium] = Field(default_factory=list, max_length=20)


class LabAnalysis(SpecModel):
    status: Literal["none", "done"] = "none"
    model: Short = ""
    mode: Literal["contributor", "standard", "deep"] = "contributor"
    created_at: str | None = None
    source_ids: list[str] = Field(default_factory=list)
    result: AnalysisResult | None = None
    paper: PaperStructure | None = None
