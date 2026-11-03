"""Paper2Explorer: paper structure (sections, equations, figures, tables, methods, candidates)
and equation exploration (variables, known/missing values, a ready graph/attention/simulation
block when feasible — otherwise honest notes recommending an explanatory diagram)."""

from __future__ import annotations

from typing import Any

import anyio
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..ai import prompts
from ..ai.client import get_ai, part_text
from ..ai.outputs import ExploreOutput, PaperOutput, clip
from ..errors import AppError
from ..models import Lab
from ..schemas.analysis import (
    LabAnalysis,
    PaperCandidate,
    PaperEquation,
    PaperFigure,
    PaperMethod,
    PaperSection,
    PaperStructure,
    PaperTable,
    PaperVariable,
)
from ..schemas.api import AnalyzeOut, ExploreEquationIn, ExploreEquationOut, PaperStructureIn
from ..schemas.spec import Quantity
from ..security import Actor
from . import labs as lab_svc
from . import media
from .analysis import (
    Locator,
    Material,
    analysis_meta,
    build_materials,
    call_ctx,
    check_expression,
    choose_mode,
    clean_expression,
    count_unlocated,
    effort,
    load_sources,
    material_content,
    resolve_cites,
    save_analysis,
    snapshot_source,
)
from .generation import SIM_MODELS, build_attention_block, build_graph_block, new_id, simulation_params, validate_block

MAX_PAPER_PAGES = 30


# ============================================================================ structure
def _variables(items: list[Any]) -> list[PaperVariable]:
    out, seen = [], set()
    for v in items:
        symbol = clip(v.symbol, 200)
        if not symbol or symbol in seen or len(out) >= 30:
            continue
        seen.add(symbol)
        out.append(
            PaperVariable(
                symbol=symbol,
                meaning=clip(v.meaning, 2000),
                unit=clip(v.unit, 40),
                known_value=v.known_value,
                provenance=v.provenance if v.known_value is not None else "unknown",
            )
        )
    return out


def convert_paper(out: PaperOutput, materials: list[Material], lang: str) -> PaperStructure:
    locator = Locator()
    all_refs = []
    warnings: list[str] = []

    def refs(cites):
        resolved = resolve_cites(cites, materials, locator)
        all_refs.extend(resolved)
        return resolved

    page_map = materials[0].page_map if materials else []

    def page(idx: int | None) -> int | None:
        if idx and 1 <= idx <= len(page_map):
            return page_map[idx - 1]
        return None

    sections = [
        PaperSection(
            id=f"sec{i}",
            title=clip(s.title, 200) or f"§{i}",
            page_start=page(s.page_start_index),
            page_end=page(s.page_end_index) or page(s.page_start_index),
            summary=clip(s.summary, 2000),
        )
        for i, s in enumerate(out.sections[:60], start=1)
    ]
    equations = []
    for i, e in enumerate(out.equations[:60], start=1):
        expression, _ = clean_expression(e.expression)
        if expression:
            error = check_expression(expression)
            if error:
                warnings.append(prompts.msg("invalid_expression", lang, formula=clip(e.label or e.latex, 120), error=error))
                expression = ""
        equations.append(
            PaperEquation(
                id=f"eq{i}",
                label=clip(e.label, 20),
                latex=clip(e.latex, 1000),
                expression=expression,
                context=clip(e.context, 2000),
                variables=_variables(e.variables),
                conditions=clip(e.conditions, 2000),
                missing=[clip(m, 2000) for m in e.missing if str(m).strip()][:10],
                explorable=bool(e.explorable),
                suggestion=e.suggestion,
                algorithm=e.algorithm,
                source_refs=refs(e.cites),
            )
        )
    figures = [
        PaperFigure(id=f"fig{i}", label=clip(f.label, 200), caption=clip(f.caption, 2000), description=clip(f.description, 2000), source_refs=refs(f.cites))
        for i, f in enumerate(out.figures[:60], start=1)
    ]
    tables = [
        PaperTable(
            id=f"tab{i}",
            label=clip(t.label, 200),
            caption=clip(t.caption, 2000),
            columns=[clip(c, 200) for c in t.columns[:20]],
            rows=[[clip(cell, 200) for cell in row[:20]] for row in t.rows[:60]],
            source_refs=refs(t.cites),
        )
        for i, t in enumerate(out.tables[:30], start=1)
    ]
    methods = [
        PaperMethod(id=f"meth{i}", title=clip(m.title, 200) or f"#{i}", summary=clip(m.summary, 12000), source_refs=refs(m.cites))
        for i, m in enumerate(out.methods[:30], start=1)
    ]
    prefix = {"equation": ("eq", len(equations)), "figure": ("fig", len(figures)), "table": ("tab", len(tables)), "method": ("meth", len(methods))}
    candidates = []
    for i, c in enumerate(out.candidates[:30], start=1):
        ref_id = ""
        if c.kind in prefix and c.ref_index and 1 <= c.ref_index <= prefix[c.kind][1]:
            ref_id = f"{prefix[c.kind][0]}{c.ref_index}"
        candidates.append(
            PaperCandidate(id=f"c{i}", kind=c.kind, ref_id=ref_id, title=clip(c.title, 200) or f"#{i}", reason=clip(c.reason, 2000), suggestion=c.suggestion)
        )
    unlocated = count_unlocated(all_refs, materials)
    if unlocated:
        warnings.append(prompts.msg("unlocated_refs", lang, n=unlocated))
    return PaperStructure(
        title=clip(out.title, 200),
        summary=clip(out.summary, 12000),
        sections=sections,
        equations=equations,
        figures=figures,
        tables=tables,
        methods=methods,
        candidates=candidates,
        warnings=([clip(w, 2000) for w in out.warnings if str(w).strip()] + warnings)[:20],
    )


async def paper_structure(db: Session, lab: Lab, actor: Actor, body: PaperStructureIn) -> AnalyzeOut:
    src = load_sources(db, lab, [body.source_id])[0]
    if src.kind != "pdf":
        raise AppError("unsupported_file", 422, "Paper structure needs a PDF source")
    info = snapshot_source(src)
    pages = {src.id: body.pages} if body.pages else None
    materials, warnings = await anyio.to_thread.run_sync(
        lambda: build_materials([info], pages, lab.language, max_pdf_pages=MAX_PAPER_PAGES)
    )
    mode, mode_warnings = choose_mode(lab, people=info.contains_people, deep=body.deep)
    content = [part_text(prompts.lesson_context(lab) + "\n\n" + prompts.sources_overview([m.line for m in materials]))]
    content += material_content(materials)
    content.append(part_text(prompts.PAPER_TASK + "\n\n" + prompts.SAFE_EXPRESSION_SYNTAX))
    messages = [
        {"role": "system", "content": prompts.system_prompt(lab, role="a careful research-reading assistant")},
        {"role": "user", "content": content},
    ]
    db.commit()
    result = await get_ai().chat_json(
        messages=messages,
        ctx=call_ctx("paper-structure", actor, lab),
        model_cls=PaperOutput,
        name="paper_structure",
        mode=mode,
        effort=effort(True),
    )
    paper = await anyio.to_thread.run_sync(lambda: convert_paper(result.data, materials, lab.language))
    extra = mode_warnings + warnings
    if extra:
        paper.warnings = ([clip(w, 2000) for w in extra] + paper.warnings)[:20]

    def mutate(current: dict[str, Any]) -> dict[str, Any]:
        merged = LabAnalysis.model_validate(current or {}).model_dump(mode="json")
        source_ids = list(dict.fromkeys(list(merged.get("source_ids") or []) + [src.id]))
        merged.update(analysis_meta(result.model, mode, source_ids))
        merged["paper"] = paper.model_dump(mode="json")
        return merged

    lab = save_analysis(db, lab, mutate, actor, note="AI paper structure")
    return AnalyzeOut(analysis=LabAnalysis.model_validate(lab.analysis_json), lab=lab_svc.lab_out(db, lab))


# ============================================================================ explore an equation
def _page_text_for(lab: Lab, equation: PaperEquation, limit: int = 6000) -> str:
    """Text of the pages an equation is cited on (helps the model define its symbols)."""
    by_id = {s.id: s for s in lab.sources}
    chunks: list[str] = []
    total = 0
    for ref in equation.source_refs[:3]:
        src = by_id.get(ref.source_id or "")
        if src is None or src.kind != "pdf" or not src.storage_key or not ref.page:
            continue
        try:
            pages = media.pdf_text_pages(src.storage_key, [ref.page], max_chars=limit - total)
        except AppError:
            continue
        for item in pages:
            text = (item.get("text") or "").strip()
            if text:
                chunks.append(f"[page {item['page']}]\n{text}")
                total += len(text)
        if total >= limit:
            break
    return "\n\n".join(chunks)[:limit]


def known_quantities(variables: list[PaperVariable]) -> dict[str, Quantity]:
    """Paper variables as analysis-like quantities so values the paper prints keep their
    'document' provenance when they become sliders."""
    out: dict[str, Quantity] = {}
    for v in variables:
        known = v.known_value is not None and v.provenance in ("document", "user")
        out[v.symbol] = Quantity(
            symbol=v.symbol,
            name=clip(v.meaning, 200),
            unit=v.unit,
            value=v.known_value if known else None,
            provenance=v.provenance if known else "unknown",
        )
    return out


def _simulation_block(spec: Any, equation: PaperEquation, lang: str, variables: dict[str, Quantity]) -> dict[str, Any] | None:
    model = spec.model
    if model not in SIM_MODELS:
        return None
    params = simulation_params(model, spec.params, lang, variables)
    return {
        "id": new_id(),
        "type": "simulation",
        "title": clip(equation.label or equation.latex, 200),
        "description": clip(equation.context, 2000),
        "source_refs": [r.model_dump(mode="json") for r in equation.source_refs[:20]],
        "confirmed": False,
        "ai_generated": True,
        "model": model,
        "params": params,
        "object_asset_id": None,
        "reference_cases": [],
        "active": None,
        "notes": (clip(spec.notes, 11000) + "\n" + prompts.msg("simulation_note", lang)).strip(),
    }


async def explore_equation(db: Session, lab: Lab, actor: Actor, body: ExploreEquationIn) -> ExploreEquationOut:
    analysis = LabAnalysis.model_validate(lab.analysis_json or {})
    equation: PaperEquation | None = None
    if body.equation_id:
        equations = analysis.paper.equations if analysis.paper else []
        equation = next((e for e in equations if e.id == body.equation_id), None)
        if equation is None:
            raise AppError("not_found", 404, "Equation not found")
    elif body.latex and body.latex.strip():
        equation = PaperEquation(id=new_id("eq"), latex=body.latex.strip()[:1000], context=(body.context or "")[:2000])
    else:
        raise AppError("validation_error", 422, "Choose an equation", fields={"equation_id": "required"})
    lang = lab.language
    paper = analysis.paper
    page_text = await anyio.to_thread.run_sync(lambda: _page_text_for(lab, equation))
    context_parts = [prompts.lesson_context(lab)]
    if paper is not None:
        context_parts.append(
            "PAPER (JSON):\n"
            + prompts.as_json(
                {"title": paper.title, "summary": paper.summary, "methods": [{"title": m.title, "summary": m.summary[:800]} for m in paper.methods[:6]]},
                6000,
            )
        )
    context_parts.append("EQUATION (JSON):\n" + prompts.as_json(equation.model_dump(mode="json", exclude={"source_refs"}), 6000))
    if body.context:
        context_parts.append("STUDENT NOTE: " + body.context[:3000])
    if page_text:
        context_parts.append("TEXT AROUND THE EQUATION (from the paper):\n" + page_text)
    context_parts += [prompts.EXPLORE_TASK, prompts.SAFE_EXPRESSION_SYNTAX]
    mode, _ = choose_mode(lab)
    db.commit()
    result = await get_ai().chat_json(
        messages=[
            {"role": "system", "content": prompts.system_prompt(lab, role="a careful research-reading assistant")},
            {"role": "user", "content": "\n\n".join(context_parts)},
        ],
        ctx=call_ctx("explore-equation", actor, lab),
        model_cls=ExploreOutput,
        name="explore_equation",
        mode=mode,
        effort=effort(True),
    )
    out: ExploreOutput = result.data
    notes = [clip(out.notes, 4000)] if out.notes.strip() else []
    block: dict[str, Any] | None = None
    title = clip((equation.label + " " if equation.label else "") + (equation.context or equation.latex), 200)
    refs = equation.source_refs
    variables = _variables(out.variables) or equation.variables
    known_values = known_quantities(list(equation.variables) + list(variables))
    if out.block_kind == "graph" and out.graph is not None:
        block, error = build_graph_block(
            out.graph, title=title, description=equation.context, refs=refs, active=None, variables=known_values
        )
        if block is None:
            notes.append(prompts.msg("graph_invalid", lang, error=error))
    elif out.block_kind == "algorithm" and out.attention is not None:
        block = build_attention_block(out.attention, title=title, description=equation.context, refs=refs, lang=lang)
        if block is None:
            notes.append(prompts.msg("block_invalid", lang, type="algorithm"))
    elif out.block_kind == "simulation" and out.simulation is not None:
        block = _simulation_block(out.simulation, equation, lang, known_values)
    if block is not None:
        try:
            block = validate_block(block)
        except ValidationError:  # an invalid AI block is reported, never returned
            block = None
            notes.append(prompts.msg("block_invalid", lang, type=out.block_kind))
    if block is None:
        notes.append(prompts.msg("explore_not_feasible", lang))
    missing = [clip(m, 2000) for m in out.missing if str(m).strip()][:10] or equation.missing
    updated = equation.model_copy(
        update={
            "variables": variables,
            "missing": missing,
            "explorable": block is not None,
            "suggestion": out.block_kind if block is not None else "diagram",
            "algorithm": "attention" if block is not None and block.get("type") == "algorithm" else equation.algorithm,
        }
    )
    known = [clip(k, 300) for k in out.known if str(k).strip()][:10]
    if known:
        notes.append(prompts.msg("known_values", lang, items="; ".join(known)))
    return ExploreEquationOut(equation=updated, block=block, notes="\n".join(n for n in notes if n)[:4000])
