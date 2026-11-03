"""AI analysis of a lab's sources (School2Lab) + helpers shared by every AI service.

Shared helpers
--------------
* :func:`choose_mode` — lab ``ai_mode`` (contributor/standard), ``deep`` → Muse Wonder, and the
  privacy rule of spec §16: media showing people never goes to contributor mode.
* :class:`Material` / :func:`build_materials` — selected sources turned into model inputs:
  PDF page subsets (with the subset→original page map), downscaled images, the small AI video
  proxy, user-provided measurements and teacher notes.
* :func:`resolve_cite` — turns a model citation (source number, page index, verbatim quote,
  approximate box) into a :class:`SourceRef`. Location policy (never invent a location):
  quote found in the PDF text layer → ``exact`` with its bbox; otherwise a model box →
  ``approximate``; otherwise ``none``.
* :func:`save_analysis` — merge into ``analysis_json`` and save with optimistic versioning,
  re-reading the lab so a concurrent autosave is never lost or blocks the AI result.
"""

from __future__ import annotations

import copy
import math
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import anyio
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import CallContext, Mode, get_ai, part_image, part_pdf, part_text, part_video
from ..ai.outputs import AICite, AnalysisOutput, clip
from ..ai.sam import clean_phrase
from ..config import get_settings
from ..db import utcnow
from ..errors import AppError
from ..models import Lab, Source
from ..schemas.analysis import (
    AnalysisFormula,
    AnalysisObject,
    AnalysisRelation,
    AnalysisResult,
    AnalysisStep,
    LabAnalysis,
    MissingInfo,
    SuggestedBlock,
)
from ..schemas.api import AnalyzeIn, AnalyzeOut
from ..schemas.spec import Assumption, Quantity, SourceRef
from ..security import Actor
from . import labs as lab_svc
from . import media
from .expr import ExprError, compile_expr

MAX_PDF_PAGES = 30
MAX_PAYLOAD_BYTES = 45 * 1024 * 1024  # base64 media budget for one request
AI_VIDEO_FPS = 12.0  # media.transcode_video makes the AI proxy at 12 fps …
AI_VIDEO_MAX_SECONDS = 120.0  # … and cuts it after 120 s


# ============================================================================ mode
def choose_mode(lab: Lab, *, people: bool = False, deep: bool = False) -> tuple[Mode, list[str]]:
    """Pick the Muse mode for a call. Returns (mode, user-facing warnings in the lab language)."""
    warnings: list[str] = []
    settings = get_settings()
    if deep:
        if settings.enable_deep_analysis:
            return "deep", warnings  # Muse Wonder runs in Standard mode (no training on content)
        warnings.append(prompts.msg("deep_disabled", lab.language))
    mode: Mode = "standard" if lab.ai_mode == "standard" else "contributor"
    if mode == "contributor" and people:
        mode = "standard"
        warnings.append(prompts.msg("privacy_standard", lab.language))
    return mode, warnings


def effort(deep: bool) -> str:
    settings = get_settings()
    return settings.ai_effort_deep if deep else settings.ai_effort_fast


def call_ctx(feature: str, actor: Actor | None, lab: Lab | None) -> CallContext:
    return CallContext(feature=feature, user_id=actor.user_id if actor else None, lab_id=lab.id if lab else None)


# ============================================================================ sources → materials
@dataclass
class SourceInfo:
    """Plain snapshot of a Source row (safe to use from worker threads)."""

    id: str
    kind: str
    title: str
    status: str
    storage_key: str | None
    mime: str | None
    width: int | None
    height: int | None
    duration_ms: int | None
    fps: float | None
    page_count: int | None
    text: str | None
    data: Any
    meta: dict[str, Any]
    contains_people: bool


def snapshot_source(src: Source) -> SourceInfo:
    return SourceInfo(
        id=src.id,
        kind=src.kind,
        title=src.title or "",
        status=src.status,
        storage_key=src.storage_key,
        mime=src.mime,
        width=src.width,
        height=src.height,
        duration_ms=src.duration_ms,
        fps=src.fps,
        page_count=src.page_count,
        text=src.text_content,
        data=copy.deepcopy(src.data_json),
        meta=copy.deepcopy(src.meta_json or {}),
        contains_people=bool(src.contains_people),
    )


def data_rows(data: Any) -> list[dict[str, Any]]:
    """Measured values of a data source: ``[{symbol, name, value, unit}]`` (tolerates a wrapper dict)."""
    rows = data.get("values") if isinstance(data, dict) else data
    out = []
    for row in rows or []:
        if not isinstance(row, dict) or not str(row.get("symbol") or "").strip():
            continue
        try:
            value = float(row.get("value"))
        except (TypeError, ValueError):
            continue
        if not math.isfinite(value):
            continue
        out.append(
            {
                "symbol": str(row.get("symbol")).strip()[:40],
                "name": str(row.get("name") or "").strip()[:120],
                "value": value,
                "unit": str(row.get("unit") or "").strip()[:40],
            }
        )
    return out


def data_note(info: SourceInfo) -> str:
    if isinstance(info.data, dict) and info.data.get("note"):
        return str(info.data["note"])[:2000]
    return (info.text or "")[:2000]


def format_value(value: float) -> str:
    return f"{value:g}"


@dataclass
class Material:
    n: int
    info: SourceInfo
    parts: list[dict[str, Any]] = field(default_factory=list)
    line: str = ""
    page_map: list[int] = field(default_factory=list)
    has_text_layer: bool = False
    width: int | None = None
    height: int | None = None
    duration_s: float | None = None
    rows: list[dict[str, Any]] = field(default_factory=list)
    text: str = ""
    payload_bytes: int = 0

    @property
    def kind(self) -> str:
        return self.info.kind

    @property
    def source_id(self) -> str:
        return self.info.id


def load_sources(db: Session, lab: Lab, source_ids: list[str]) -> list[Source]:
    """Sources of this lab in the requested order; foreign or unknown ids → 404."""
    by_id = {s.id: s for s in lab.sources}
    out: list[Source] = []
    for sid in dict.fromkeys(source_ids):
        src = by_id.get(sid)
        if src is None:
            raise AppError("not_found", 404, "Source not found")
        out.append(src)
    return out


def _page_map_text(page_map: list[int]) -> str:
    pairs = [f"{i + 1}→{p}" for i, p in enumerate(page_map)]
    if len(pairs) > 12:
        pairs = pairs[:6] + ["…"] + pairs[-3:]
    return ", ".join(pairs)


def build_materials(
    infos: list[SourceInfo],
    pages: dict[str, list[int]] | None,
    lang: str,
    *,
    include_media: bool = True,
    max_pdf_pages: int = MAX_PDF_PAGES,
) -> tuple[list[Material], list[str]]:
    """Turn sources into model inputs (blocking: run in a worker thread)."""
    materials: list[Material] = []
    warnings: list[str] = []
    pages = pages or {}
    for info in infos:
        n = len(materials) + 1
        mat = Material(n=n, info=info)
        title = info.title or info.kind
        if info.kind == "pdf":
            if info.status != "ready" or not info.storage_key:
                raise AppError("source_not_ready", 409, "The source is still being processed")
            wanted = [int(p) for p in (pages.get(info.id) or []) if isinstance(p, int) or str(p).isdigit()]
            total = info.page_count or 0
            if not wanted and total > max_pdf_pages:
                warnings.append(prompts.msg("pdf_truncated", lang, n=max_pdf_pages, title=title))
            data, page_map = media.pdf_subset(info.storage_key, wanted or None, max_pages=max_pdf_pages)
            mat.page_map = page_map
            texts = media.pdf_text_pages(info.storage_key, page_map, max_chars=20000)
            mat.has_text_layer = any(len((t.get("text") or "").strip()) > 20 for t in texts)
            scan = "" if mat.has_text_layer else " It is a scan without a text layer: read it visually."
            mat.line = (
                f"[{n}] PDF “{title}” — attached file with {len(page_map)} page(s); page_index → original page: "
                f"{_page_map_text(page_map)}.{scan}"
            )
            if include_media:
                mat.parts = [part_pdf(data, f"source-{n}.pdf")]
                mat.payload_bytes = len(data)
        elif info.kind == "image":
            if info.status != "ready" or not info.storage_key:
                raise AppError("source_not_ready", 409, "The source is still being processed")
            if include_media:
                data, mime, width, height = media.image_for_ai(info.storage_key)
                mat.parts = [part_image(data, mime)]
                mat.payload_bytes = len(data)
                mat.width, mat.height = width, height
            else:
                mat.width, mat.height = info.width, info.height
            size = f"{mat.width}×{mat.height} px" if mat.width and mat.height else "image"
            mat.line = f"[{n}] Image “{title}” — {size} (a photo of a real object, a textbook page or a figure)."
        elif info.kind == "video":
            ai_key = info.meta.get("ai_key")
            if info.status != "ready" or not ai_key or not storage.exists(ai_key):
                warnings.append(prompts.msg("video_not_ready", lang, title=title))
                continue
            mat.duration_s = (info.duration_ms or 0) / 1000 or None
            if include_media:
                data = storage.read_bytes(ai_key)
                mat.parts = [part_video(data, "video/mp4")]
                mat.payload_bytes = len(data)
            dur = f"{mat.duration_s:.1f} s" if mat.duration_s else "short clip"
            mat.line = f"[{n}] Video “{title}” — {dur}, low-resolution preview at 12 frames per second."
        elif info.kind == "data":
            mat.rows = data_rows(info.data)
            values = "; ".join(
                f"{r['symbol']} = {format_value(r['value'])}{(' ' + r['unit']) if r['unit'] else ''}"
                + (f" ({r['name']})" if r["name"] else "")
                for r in mat.rows
            )
            note = data_note(info)
            mat.text = values + (f". Note: {note}" if note else "")
            mat.line = f"[{n}] User-provided measurements “{title}” (provenance 'user'): {values or 'no values'}" + (
                f". Note: {note}" if note else ""
            )
        elif info.kind == "note":
            mat.text = (info.text or "")[:8000]
            mat.line = f"[{n}] Teacher note “{title}”: {mat.text}"
        else:  # pragma: no cover - kinds are constrained by the DB
            continue
        materials.append(mat)
    total = sum(m.payload_bytes for m in materials)
    if total * 4 / 3 > MAX_PAYLOAD_BYTES:
        raise AppError("ai_input_too_large", 413, "The material is too large for the AI service")
    return materials, warnings


def material_content(materials: list[Material]) -> list[dict[str, Any]]:
    """Interleave a label before each media part so the model can map files to source numbers."""
    content: list[dict[str, Any]] = []
    for mat in materials:
        if mat.parts:
            content.append(part_text(f"Source [{mat.n}] — {mat.info.title or mat.kind}:"))
            content.extend(mat.parts)
    return content


def has_people(materials: list[Material]) -> bool:
    return any(m.info.contains_people for m in materials)


# ============================================================================ citations
def _norm_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "").lower()
    return re.sub(r"\s+", " ", text).strip()


def norm_box(box: list[float] | None, width: int | None = None, height: int | None = None) -> list[float] | None:
    """Model box → normalized ``[x0, y0, x1, y1]`` in 0..1, or None when unusable."""
    if not box or len(box) != 4:
        return None
    try:
        vals = [float(v) for v in box]
    except (TypeError, ValueError):
        return None
    if any(not math.isfinite(v) for v in vals):
        return None
    peak = max(abs(v) for v in vals)
    if peak > 1.5:
        if peak <= 1000.5:
            vals = [v / 1000.0 for v in vals]  # some models answer on a 0..1000 grid
        elif width and height:
            vals = [vals[0] / width, vals[1] / height, vals[2] / width, vals[3] / height]
        else:
            return None
    x0, x1 = sorted((vals[0], vals[2]))
    y0, y1 = sorted((vals[1], vals[3]))
    x0, y0, x1, y1 = (max(0.0, min(1.0, v)) for v in (x0, y0, x1, y1))
    if x1 - x0 < 0.003 or y1 - y0 < 0.003:
        return None
    if x1 - x0 > 0.995 and y1 - y0 > 0.995:
        return None  # the whole page/image carries no location information
    return [round(v, 4) for v in (x0, y0, x1, y1)]


class Locator:
    """Memoised ``media.locate_quote`` (quote search in the PDF text layer)."""

    def __init__(self) -> None:
        self._cache: dict[tuple[str, str, int | None], dict[str, Any] | None] = {}

    def find(self, key: str, quote: str, page_hint: int | None) -> dict[str, Any] | None:
        cache_key = (key, quote, page_hint)
        if cache_key not in self._cache:
            try:
                self._cache[cache_key] = media.locate_quote(key, quote, page_hint)
            except AppError:
                self._cache[cache_key] = None
        return self._cache[cache_key]


def resolve_cite(cite: AICite, materials: list[Material], locator: Locator | None = None) -> SourceRef | None:
    """Model citation → SourceRef with an honest ``located`` value (blocking: PDF search)."""
    if not (1 <= int(cite.source or 0) <= len(materials)):
        return None
    mat = materials[cite.source - 1]
    quote = clip(cite.quote, 600) or None
    label = clip(cite.page_label, 40) or None
    sid = mat.source_id
    if mat.kind == "pdf":
        page = None
        if cite.page_index and 1 <= cite.page_index <= len(mat.page_map):
            page = mat.page_map[cite.page_index - 1]
        elif len(mat.page_map) == 1:
            page = mat.page_map[0]
        if quote and mat.has_text_layer and mat.info.storage_key:
            found = (locator or Locator()).find(mat.info.storage_key, quote, page)
            if found:
                return SourceRef(
                    source_id=sid,
                    page=found["page"],
                    page_label=label if found["page"] == page else None,
                    bbox=found["bbox"],
                    quote=found["matched_quote"],
                    located=found["located"],
                )
        box = norm_box(cite.box)
        if box and page:
            return SourceRef(source_id=sid, page=page, page_label=label, bbox=box, quote=quote, located="approximate")
        return SourceRef(source_id=sid, page=page, page_label=label, quote=quote, located="none")
    if mat.kind == "image":
        box = norm_box(cite.box, mat.width, mat.height)
        return SourceRef(source_id=sid, bbox=box, quote=quote, page_label=label, located="approximate" if box else "none")
    if mat.kind == "video":
        t = cite.time
        if t is not None and math.isfinite(t) and t >= 0:
            if mat.duration_s:
                t = min(float(t), mat.duration_s)
            return SourceRef(source_id=sid, time=round(float(t), 2), quote=quote, located="approximate")
        return SourceRef(source_id=sid, quote=quote, located="none")
    if mat.kind == "data":
        return SourceRef(source_id=sid, quote=quote, located="exact")
    if mat.kind == "note":
        located = "exact" if quote and _norm_text(quote) in _norm_text(mat.text) else "none"
        return SourceRef(source_id=sid, quote=quote, located=located)
    return None


def _ref_key(ref: SourceRef) -> tuple:
    return (ref.source_id, ref.page, tuple(ref.bbox or ()), ref.time, ref.quote)


def resolve_cites(
    cites: list[AICite], materials: list[Material], locator: Locator | None = None, limit: int = 12
) -> list[SourceRef]:
    out: list[SourceRef] = []
    seen: set[tuple] = set()
    for cite in cites or []:
        ref = resolve_cite(cite, materials, locator)
        if ref is None or _ref_key(ref) in seen:
            continue
        seen.add(_ref_key(ref))
        out.append(ref)
        if len(out) >= limit:
            break
    return out


def count_unlocated(refs: list[SourceRef], materials: list[Material]) -> int:
    """Refs with a quote on a text PDF that could not be matched (reported honestly)."""
    text_pdfs = {m.source_id for m in materials if m.kind == "pdf" and m.has_text_layer}
    return sum(1 for r in refs if r.source_id in text_pdfs and r.quote and r.located != "exact")


# ============================================================================ expressions
_LHS_RE = re.compile(r"^\s*([A-Za-z_][\w]*(?:\([^)]*\))?)\s*=\s*(.+)$")


def clean_expression(expression: str, output_symbol: str = "") -> tuple[str, str]:
    """Strip a leading ``X =`` and LaTeX leftovers. Returns (expression, output_symbol)."""
    expr = (expression or "").strip().strip("$").strip()
    expr = expr.replace("\\cdot", "*").replace("\\times", "*").replace("\\pi", "pi").replace("−", "-")
    match = _LHS_RE.match(expr)
    if match and "=" not in match.group(2):
        lhs, expr = match.group(1), match.group(2)
        output_symbol = output_symbol or re.sub(r"\(.*\)$", "", lhs)
    return expr.strip()[:400], (output_symbol or "").strip()[:200]


def check_expression(expression: str) -> str | None:
    """None if the expression compiles with services/expr.py, else a short error text."""
    if not expression:
        return "empty"
    try:
        compile_expr(expression)
    except ExprError as exc:
        return str(exc)[:160]
    return None


# ============================================================================ analysis conversion
def _short(text: Any) -> str:
    return clip(text, 200)


def _medium(text: Any) -> str:
    return clip(text, 2000)


def _long(text: Any) -> str:
    return clip(text, 12000)


def _data_values(materials: list[Material]) -> dict[str, tuple[dict[str, Any], Material]]:
    out: dict[str, tuple[dict[str, Any], Material]] = {}
    for mat in materials:
        if mat.kind == "data":
            for row in mat.rows:
                out.setdefault(row["symbol"], (row, mat))
    return out


def _user_ref(mat: Material, row: dict[str, Any]) -> SourceRef:
    quote = f"{row['symbol']} = {format_value(row['value'])}{(' ' + row['unit']) if row['unit'] else ''}"
    return SourceRef(source_id=mat.source_id, quote=quote, located="exact")


def convert_analysis(out: AnalysisOutput, materials: list[Material], lang: str) -> tuple[AnalysisResult, list[str]]:
    """Model output → stored AnalysisResult (ids, resolved refs, validated expressions)."""
    locator = Locator()
    warnings: list[str] = []
    all_refs: list[SourceRef] = []

    def refs(cites: list[AICite]) -> list[SourceRef]:
        resolved = resolve_cites(cites, materials, locator)
        all_refs.extend(resolved)
        return resolved

    by_n = {m.n: m for m in materials}

    objects = []
    for i, obj in enumerate(out.objects[:40], start=1):
        obj_refs = refs(obj.cites)
        image_src = next(
            (by_n[c.source].source_id for c in obj.cites if c.source in by_n and by_n[c.source].kind == "image"), None
        )
        phrase = clean_phrase(obj.sam_phrase)
        objects.append(
            AnalysisObject(
                id=f"o{i}",
                name=_short(obj.name) or f"#{i}",
                description=_medium(obj.description),
                sam_phrase=_short(phrase if phrase.isascii() else ""),
                source_id=image_src if phrase else None,
                source_refs=obj_refs,
            )
        )

    formulas = []
    for i, f in enumerate(out.formulas[:30], start=1):
        expression, output_symbol = clean_expression(f.expression, f.output_symbol)
        if expression:
            error = check_expression(expression)
            if error:
                warnings.append(prompts.msg("invalid_expression", lang, formula=clip(f.latex or expression, 120), error=error))
                expression = ""
        formulas.append(
            AnalysisFormula(
                id=f"f{i}",
                latex=clip(f.latex, 600),
                expression=expression,
                output_symbol=_short(output_symbol),
                description=_medium(f.description),
                variables=[_short(v) for v in f.variables[:20] if str(v).strip()],
                source_refs=refs(f.cites),
            )
        )

    user_values = _data_values(materials)
    variables: list[Quantity] = []
    seen_symbols: set[str] = set()
    for var in out.variables:
        symbol = _short(var.symbol)
        if not symbol or symbol in seen_symbols or len(variables) >= 40:
            continue
        seen_symbols.add(symbol)
        var_refs = refs(var.cites)
        value = var.value if var.value is not None and math.isfinite(var.value) else None
        provenance = var.provenance
        unit = clip(var.unit, 40)
        source_ref = var_refs[0] if var_refs else None
        if symbol in user_values:
            row, mat = user_values[symbol]
            value, provenance = row["value"], "user"
            unit = row["unit"] or unit
            source_ref = _user_ref(mat, row)
        elif provenance == "user":
            backed = any(by_n.get(c.source) and by_n[c.source].kind in ("data", "note") for c in var.cites)
            if not backed:
                has_doc = any(by_n.get(c.source) and by_n[c.source].kind in ("pdf", "image") for c in var.cites)
                provenance = "document" if has_doc and value is not None else "unknown"
        if provenance == "unknown":
            value = None
        variables.append(
            Quantity(
                symbol=symbol,
                name=_short(var.name),
                unit=unit,
                value=value,
                role=var.role,
                provenance=provenance,
                source_ref=source_ref,
            )
        )
    for symbol, (row, mat) in user_values.items():  # every measurement reaches the lesson
        if symbol not in seen_symbols and len(variables) < 40:
            variables.append(
                Quantity(
                    symbol=_short(symbol),
                    name=_short(row["name"]),
                    unit=row["unit"],
                    value=row["value"],
                    role="input",
                    provenance="user",
                    source_ref=_user_ref(mat, row),
                )
            )

    steps = [
        AnalysisStep(id=f"s{i}", title=_short(s.title) or f"{i}", description=_long(s.description), source_refs=refs(s.cites))
        for i, s in enumerate(out.steps[:40], start=1)
    ]
    relations = [
        AnalysisRelation(
            id=f"r{i}",
            source=_short(r.source),
            target=_short(r.target),
            description=_medium(r.description),
            source_refs=refs(r.cites),
        )
        for i, r in enumerate(out.relations[:60], start=1)
        if str(r.source).strip() and str(r.target).strip()
    ]

    has_video = any(m.kind == "video" for m in materials)
    suggestions: list[SuggestedBlock] = []
    seen_suggestions: set[tuple] = set()
    for s in out.suggested_blocks:
        feasibility = s.feasibility
        model = s.model if s.type == "simulation" else None
        algorithm = s.algorithm if s.type == "algorithm" else None
        if (s.type == "simulation" and model is None) or (s.type == "algorithm" and algorithm is None):
            feasibility = "not_supported"
        if s.type == "video" and not has_video and feasibility == "ready":
            feasibility = "needs_input"
        key = (s.type, model, algorithm)
        if key in seen_suggestions or len(suggestions) >= 12:
            continue
        seen_suggestions.add(key)
        suggestions.append(
            SuggestedBlock(type=s.type, reason=_medium(s.reason), feasibility=feasibility, model=model, algorithm=algorithm)
        )

    missing = []
    for i, m in enumerate(out.missing_info[:30], start=1):
        symbol = _short(m.symbol) if m.symbol else None
        missing.append(MissingInfo(id=f"m{i}", text=_medium(m.text), symbol=symbol or None, resolved=bool(symbol and symbol in user_values)))

    assumptions = []
    seen_texts: set[str] = set()
    for a in out.assumptions:
        text = _medium(a.text)
        if text and text.lower() not in seen_texts and len(assumptions) < 30:
            seen_texts.add(text.lower())
            assumptions.append(Assumption(id=f"a{len(assumptions) + 1}", text=text, confirmed=False))

    unlocated = count_unlocated(all_refs, materials)
    if unlocated:
        warnings.append(prompts.msg("unlocated_refs", lang, n=unlocated))
    model_warnings = [_medium(w) for w in out.warnings if str(w).strip()]
    result = AnalysisResult(
        topic=_short(out.topic),
        summary=_long(out.summary),
        objects=objects,
        formulas=formulas,
        variables=variables,
        steps=steps,
        sequence_clear=bool(out.sequence_clear and steps),
        relations=relations,
        suggested_blocks=suggestions,
        missing_info=missing,
        assumptions=assumptions,
        warnings=(model_warnings + warnings)[:20],
    )
    return result, warnings


# ============================================================================ saving
def restore_point(db: Session, lab: Lab, actor: Actor | None, note: str | None = None) -> None:
    """Version snapshot of the current state (lets the teacher undo an AI change)."""
    try:
        db.refresh(lab)
        lab_svc.maybe_snapshot(db, lab, actor, note=note, force=True)
    except IntegrityError:  # a concurrent request snapshotted the same version
        db.rollback()


def save_lab_json(
    db: Session,
    lab: Lab,
    column: str,
    mutate: Callable[[dict[str, Any]], dict[str, Any]],
    validate: Callable[[dict[str, Any]], dict[str, Any]],
    actor: Actor | None,
    note: str,
) -> Lab:
    """Apply ``mutate`` to the *current* JSON column and save it with optimistic versioning.

    The lab is re-read right before writing, so an autosave that happened while the model
    was working is kept (and never makes the AI result fail with a version conflict).
    """
    db.commit()
    restore_point(db, lab, actor)
    for attempt in range(3):
        db.refresh(lab)
        data = validate(mutate(copy.deepcopy(getattr(lab, column) or {})))
        try:
            lab = lab_svc.bump_version(db, lab, lab.version, {column: data})
            break
        except AppError as exc:
            if exc.code != "version_conflict" or attempt == 2:
                raise
    restore_point(db, lab, actor, note=note)
    return lab


def save_analysis(db: Session, lab: Lab, mutate: Callable[[dict[str, Any]], dict[str, Any]], actor: Actor | None, note: str) -> Lab:
    return save_lab_json(db, lab, "analysis_json", mutate, lab_svc.validate_analysis, actor, note)


def analysis_meta(model: str, mode: str, source_ids: list[str]) -> dict[str, Any]:
    return {
        "status": "done",
        "model": model[:200],
        "mode": mode,
        "created_at": utcnow().isoformat(),
        "source_ids": list(source_ids),
    }


# ============================================================================ endpoint service
async def analyze(db: Session, lab: Lab, actor: Actor, body: AnalyzeIn) -> AnalyzeOut:
    sources = load_sources(db, lab, body.source_ids)
    infos = [snapshot_source(s) for s in sources]
    materials, warnings = await anyio.to_thread.run_sync(lambda: build_materials(infos, body.pages, lab.language))
    if not materials:
        raise AppError("source_not_ready", 409, "None of the selected sources can be analysed yet")
    mode, mode_warnings = choose_mode(lab, people=has_people(materials), deep=body.deep)
    content = [part_text(prompts.lesson_context(lab, body.focus) + "\n\n" + prompts.sources_overview([m.line for m in materials]))]
    content += material_content(materials)
    content.append(
        part_text("\n\n".join([prompts.ANALYZE_TASK, prompts.SAFE_EXPRESSION_SYNTAX, prompts.BLOCK_TYPES_GUIDE]))
    )
    messages = [{"role": "system", "content": prompts.system_prompt(lab)}, {"role": "user", "content": content}]
    db.commit()  # no open transaction while waiting for the model
    result = await get_ai().chat_json(
        messages=messages,
        ctx=call_ctx("analyze", actor, lab),
        model_cls=AnalysisOutput,
        name="analysis",
        mode=mode,
        effort=effort(True),
    )
    analysis_result, _ = await anyio.to_thread.run_sync(lambda: convert_analysis(result.data, materials, lab.language))
    extra = mode_warnings + warnings
    if extra:
        analysis_result.warnings = ([clip(w, 2000) for w in extra] + analysis_result.warnings)[:20]
    source_ids = [m.source_id for m in materials]

    def mutate(current: dict[str, Any]) -> dict[str, Any]:
        merged = LabAnalysis.model_validate(current or {}).model_dump(mode="json")
        merged.update(analysis_meta(result.model, mode, source_ids))
        merged["result"] = analysis_result.model_dump(mode="json")
        return merged

    lab = save_analysis(db, lab, mutate, actor, note="AI analysis")
    analysis = LabAnalysis.model_validate(lab.analysis_json)
    return AnalyzeOut(analysis=analysis, lab=lab_svc.lab_out(db, lab))
