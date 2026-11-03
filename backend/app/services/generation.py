"""Generate lesson blocks from the reviewed analysis, and the AI cover image.

``generate`` makes one structured Muse call per requested block type (type-specific output
models in ``ai/outputs.py``), concurrently (semaphore 4). Diagram, video, field, quiz and
widget blocks reuse their dedicated services (SAM refinement, video markers, ...). Every
block is checked against ``schemas.spec`` and dropped with a warning when invalid; blocks
are marked ``ai_generated: true, confirmed: false`` for the teacher's review.

The builders here (graph, simulation, attention, active learning) are shared with
Paper2Explorer's explore-equation endpoint.
"""

from __future__ import annotations

import asyncio
import copy
import math
import re
import secrets
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

import anyio
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.orm import Session

from .. import storage
from ..ai import prompts
from ..ai.client import get_ai
from ..ai.cover_prompt import PROMPT_VERSION as COVER_PROMPT_VERSION
from ..ai.cover_prompt import build_cover_prompt
from ..ai.outputs import (
    AIActive,
    AIAttentionSpec,
    AIGraphSpec,
    GenAlgorithm,
    GenFlow,
    GenGraph,
    GenLessonMeta,
    GenSimulation,
    GenSteps,
    GenText,
    clip,
)
from ..config import get_settings
from ..errors import AppError
from ..models import Asset, Lab
from ..schemas.analysis import LabAnalysis
from ..schemas.api import AssetOut, CoverIn, GenerateIn, GenerateOut
from ..schemas.spec import BLOCK_TYPES, TEACHER_ONLY_BLOCK_TYPES, ActiveLearning, Block, LabSpec, Quantity, SourceRef
from ..security import Actor
from . import labs as lab_svc
from . import media, simulations
from .analysis import (
    SourceInfo,
    call_ctx,
    check_expression,
    choose_mode,
    clean_expression,
    data_rows,
    effort,
    save_lab_json,
    snapshot_source,
)
from .expr import CONSTANTS, ExprError, compile_expr
from .visuals import suggest_visual, visual_task

BLOCK_ADAPTER: TypeAdapter = TypeAdapter(Block)
MAX_BLOCKS = 40
CONCURRENCY = 4

# Canonical parameters of the tested simulation models (symbol, vi name, en name, unit,
# default, min, max, step, role), the outputs a reference case / prediction may name (the
# first one is the model's primary output) and common alternative names. Symbols and
# outputs must match the engine (services/simulations.py ≡ frontend features/sim/models.js);
# only real model inputs become sliders, so every slider changes the simulation.
# A unit may be a {lang: text} map when it is a word rather than a symbol.
SIM_MODELS: dict[str, dict[str, Any]] = {
    "pendulum": {
        "params": [
            ("L", "Chiều dài dây", "String length", "m", 1.0, 0.1, 3.0, 0.01, "input"),
            ("g", "Gia tốc trọng trường", "Gravitational acceleration", "m/s²", 9.81, 1.0, 25.0, 0.01, "constant"),
            ("theta0", "Góc lệch ban đầu", "Initial angle", "°", 10.0, 1.0, 80.0, 1.0, "input"),
        ],
        "outputs": ["period", "frequency", "period_numeric"],
        "aliases": {"l": "L", "length": "L", "θ0": "theta0", "θ": "theta0", "theta": "theta0", "alpha": "theta0",
                    "α": "theta0", "alpha0": "theta0", "α0": "theta0", "a0": "theta0"},
        "output_aliases": {"t": "period", "chu kỳ": "period", "f": "frequency", "tần số": "frequency"},
    },
    "projectile": {
        "params": [
            ("v0", "Vận tốc ban đầu", "Initial speed", "m/s", 15.0, 1.0, 60.0, 0.5, "input"),
            ("angle", "Góc ném", "Launch angle", "°", 45.0, 0.0, 90.0, 1.0, "input"),
            ("g", "Gia tốc trọng trường", "Gravitational acceleration", "m/s²", 9.81, 1.0, 25.0, 0.01, "constant"),
            ("h0", "Độ cao ban đầu", "Initial height", "m", 0.0, 0.0, 50.0, 0.5, "input"),
        ],
        "outputs": ["range", "max_height", "flight_time"],
        "aliases": {"v": "v0", "u": "v0", "theta": "angle", "θ": "angle", "alpha": "angle", "α": "angle",
                    "theta0": "angle", "h": "h0"},
        "output_aliases": {"r": "range", "l": "range", "d": "range", "distance": "range", "tầm xa": "range",
                           "h": "max_height", "h_max": "max_height", "hmax": "max_height", "độ cao cực đại": "max_height",
                           "t": "flight_time", "time_of_flight": "flight_time", "thời gian bay": "flight_time"},
    },
    "compound_interest": {
        "params": [
            ("P", "Số tiền gốc", "Principal", "", 1000.0, 0.0, 1000000.0, 10.0, "input"),
            ("r", "Lãi suất mỗi năm", "Yearly interest rate", "%", 5.0, 0.0, 30.0, 0.1, "input"),
            ("n", "Số kỳ ghép lãi mỗi năm", "Compounding periods per year", {"vi": "lần/năm", "en": "times/year"},
             12.0, 1.0, 365.0, 1.0, "input"),
            ("t", "Thời gian", "Time", {"vi": "năm", "en": "years"}, 10.0, 0.0, 50.0, 1.0, "input"),
        ],
        "outputs": ["amount", "interest", "simple_amount"],
        "aliases": {"p": "P", "a0": "P", "rate": "r", "R": "r", "N": "n", "T": "t", "years": "t"},
        "output_aliases": {"a": "amount", "total": "amount", "final_amount": "amount", "số tiền": "amount",
                           "i": "interest", "tiền lãi": "interest"},
    },
    "spring_mass": {
        "params": [
            ("k", "Độ cứng lò xo", "Spring constant", "N/m", 20.0, 1.0, 500.0, 1.0, "input"),
            ("m", "Khối lượng vật", "Mass", "kg", 0.5, 0.05, 10.0, 0.01, "input"),
        ],
        "outputs": ["period", "frequency", "angular_frequency"],
        "aliases": {"M": "m", "K": "k"},
        "output_aliases": {"t": "period", "chu kỳ": "period", "f": "frequency", "tần số": "frequency",
                           "omega": "angular_frequency", "ω": "angular_frequency"},
    },
}

# Features of a curve the graph block can measure for "predict then check"
# (frontend features/blocks/graph/graphMath.js OBSERVE_KEYS).
GRAPH_OBSERVE_KEYS = ("y_vertex", "x_vertex", "y_intercept", "root_count", "discriminant", "slope", "y_max", "y_min")
GRAPH_DEFAULT_OBSERVE = "y_max"


# ============================================================================ small helpers
def new_id(prefix: str = "b") -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def num(value: Any, default: float | None = None) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return default
    return out if math.isfinite(out) else default


def nice_step(raw: float) -> float:
    if raw <= 0 or not math.isfinite(raw):
        return 0.1
    power = 10 ** math.floor(math.log10(raw))
    for factor in (1, 2, 5, 10):
        if raw <= factor * power:
            return round(factor * power, 10)
    return round(10 * power, 10)


def fix_range(value: Any, lo: Any, hi: Any, step: Any) -> tuple[float, float, float, float]:
    """Sane (value, min, max, step) for a slider: min < max, value inside, step > 0."""
    v, a, b, s = num(value), num(lo), num(hi), num(step)
    if a is None or b is None or a == b:
        base = v if v is not None else 1.0
        if base > 0:
            a, b = base / 10, base * 3
        elif base < 0:
            a, b = base * 3, base / 10
        else:
            a, b = -1.0, 1.0
    if a > b:
        a, b = b, a
    if v is None:
        v = (a + b) / 2
    v = min(max(v, a), b)
    if s is None or s <= 0 or s > (b - a):
        s = nice_step((b - a) / 100)
    return round(v, 6), round(a, 6), round(b, 6), s


def dedupe_refs(refs: list[SourceRef], limit: int) -> list[SourceRef]:
    out, seen = [], set()
    for ref in refs:
        key = (ref.source_id, ref.page, tuple(ref.bbox or ()), ref.time, ref.quote)
        if key in seen:
            continue
        seen.add(key)
        out.append(ref)
        if len(out) >= limit:
            break
    return out


def validate_block(block: dict[str, Any]) -> dict[str, Any]:
    """Validate against the spec union; returns the normalised JSON (raises ValidationError)."""
    return BLOCK_ADAPTER.validate_python(block).model_dump(mode="json")


# ============================================================================ lesson basis
@dataclass
class LessonBasis:
    """What generation calls see: a compact digest of the reviewed analysis + ref lookup."""

    analysis: LabAnalysis
    digest: dict[str, Any]
    refs: dict[str, list[SourceRef]] = field(default_factory=dict)
    variables: dict[str, Quantity] = field(default_factory=dict)
    sources: list[SourceInfo] = field(default_factory=list)

    def refs_for(self, ids: list[str] | None, limit: int = 10) -> list[SourceRef]:
        found: list[SourceRef] = []
        for item_id in ids or []:
            key = str(item_id).strip()
            found.extend(self.refs.get(key) or self.refs.get(key.lower()) or [])
        return dedupe_refs(found, limit)

    def all_refs(self, prefix: str, limit: int = 10) -> list[SourceRef]:
        found: list[SourceRef] = []
        for key, refs in self.refs.items():
            if key.startswith(prefix):
                found.extend(refs)
        return dedupe_refs(found, limit)


def _quotes(refs: list[SourceRef], n: int = 2) -> list[str]:
    return [r.quote[:240] for r in refs if r.quote][:n]


def build_basis(lab: Lab, analysis: LabAnalysis) -> LessonBasis:
    basis = LessonBasis(analysis=analysis, digest={}, sources=[snapshot_source(s) for s in lab.sources])
    digest: dict[str, Any] = {}
    result = analysis.result
    if result is not None:
        digest.update({"topic": result.topic, "summary": result.summary, "sequence_clear": result.sequence_clear})
        digest["objects"] = []
        for o in result.objects:
            basis.refs[o.id] = o.source_refs
            digest["objects"].append({"id": o.id, "name": o.name, "description": o.description, "has_cutout": bool(o.asset_id)})
        digest["formulas"] = []
        for f in result.formulas:
            basis.refs[f.id] = f.source_refs
            digest["formulas"].append(
                {"id": f.id, "latex": f.latex, "expression": f.expression, "output_symbol": f.output_symbol,
                 "variables": f.variables, "description": f.description, "quotes": _quotes(f.source_refs)}
            )
        digest["variables"] = []
        for v in result.variables:
            basis.variables[v.symbol] = v
            basis.refs[f"v:{v.symbol}"] = [v.source_ref] if v.source_ref else []
            digest["variables"].append(
                {"id": f"v:{v.symbol}", "symbol": v.symbol, "name": v.name, "unit": v.unit, "value": v.value,
                 "provenance": v.provenance, "role": v.role}
            )
        digest["steps"] = []
        for s in result.steps:
            basis.refs[s.id] = s.source_refs
            digest["steps"].append({"id": s.id, "title": s.title, "description": s.description, "quotes": _quotes(s.source_refs, 1)})
        digest["relations"] = []
        for r in result.relations:
            basis.refs[r.id] = r.source_refs
            digest["relations"].append({"id": r.id, "source": r.source, "target": r.target, "description": r.description})
        digest["assumptions"] = [{"id": a.id, "text": a.text, "confirmed": a.confirmed} for a in result.assumptions]
        digest["missing_info"] = [{"text": m.text, "symbol": m.symbol, "resolved": m.resolved} for m in result.missing_info]
    paper = analysis.paper
    if paper is not None:
        for eq in paper.equations:
            basis.refs[eq.id] = eq.source_refs
        for item in list(paper.figures) + list(paper.tables) + list(paper.methods):
            basis.refs[item.id] = item.source_refs
        digest["paper"] = {
            "title": paper.title,
            "summary": paper.summary,
            "equations": [
                {"id": e.id, "label": e.label, "latex": e.latex, "expression": e.expression, "context": e.context,
                 "variables": [v.model_dump() for v in e.variables][:12], "suggestion": e.suggestion, "algorithm": e.algorithm}
                for e in paper.equations[:20]
            ],
            "methods": [{"id": m.id, "title": m.title, "summary": m.summary[:1200]} for m in paper.methods[:10]],
            "figures": [{"id": f.id, "label": f.label, "caption": f.caption} for f in paper.figures[:12]],
        }
    measurements = []
    for src in basis.sources:
        if src.kind == "data":
            measurements.extend(data_rows(src.data))
    if measurements:
        digest["user_measurements"] = measurements
    basis.digest = digest
    return basis


async def gen_call(lab: Lab, actor: Actor | None, basis: LessonBasis, *, kind: str, model_cls: type, task: str, mode: str) -> Any:
    content = "\n\n".join(
        [
            prompts.lesson_context(lab),
            "REVIEWED ANALYSIS (JSON):\n" + prompts.as_json(basis.digest, 24000),
            prompts.GEN_COMMON,
            "TASK\n" + task,
            prompts.SAFE_EXPRESSION_SYNTAX if kind in ("graph", "simulation") else "",
        ]
    ).strip()
    result = await get_ai().chat_json(
        messages=[{"role": "system", "content": prompts.system_prompt(lab)}, {"role": "user", "content": content}],
        ctx=call_ctx(f"generate:{kind}", actor, lab),
        model_cls=model_cls,
        name=f"block_{kind}",
        mode=mode,
        effort=effort(True),
    )
    return result.data


# ============================================================================ builders
def base_block(kind: str, title: str, description: str, refs: list[SourceRef]) -> dict[str, Any]:
    return {
        "id": new_id(),
        "type": kind,
        "title": clip(title, 200),
        "description": clip(description, 2000),
        "source_refs": [r.model_dump(mode="json") for r in dedupe_refs(refs, 20)],
        "confirmed": False,
        "ai_generated": True,
    }


def build_active(
    active: AIActive | None,
    params: list[dict[str, Any]],
    observe_keys: tuple[str, ...] | list[str],
    observe_aliases: dict[str, str] | None = None,
    default_observe: str | None = None,
) -> dict[str, Any] | None:
    """Predict-then-check settings the block can actually run: a real slider, start/end values
    inside its range, and an ``observe`` key the block knows how to measure."""
    if active is None or not str(active.question or "").strip():
        return None
    raw = [clip(o, 200) for o in active.options]
    answer = active.correct_option
    correct_text = raw[answer] if answer is not None and 0 <= answer < len(raw) else ""
    # Blank and repeated options are dropped, then the answer is found again by its text:
    # filtering must never move it onto another option.
    options = list(dict.fromkeys(o for o in raw if o))[:6]
    if len(options) < 2:
        options = []
    correct = options.index(correct_text) if correct_text and correct_text in options else None
    by_symbol = {p["symbol"]: p for p in params}
    param = active.param if active.param in by_symbol else ""
    from_value, to_value = num(active.from_value), num(active.to_value)
    if param:
        lo, hi = by_symbol[param]["min"], by_symbol[param]["max"]
        from_value = None if from_value is None else min(max(from_value, lo), hi)
        to_value = None if to_value is None else min(max(to_value, lo), hi)
        if from_value is not None and from_value == to_value:
            to_value = None  # nothing would change: let the learner pick the new value
    else:
        from_value = to_value = None
    observe = clip(active.observe, 200).strip()
    if observe not in observe_keys:
        aliases = observe_aliases or {}
        observe = aliases.get(observe) or aliases.get(observe.lower()) or default_observe or observe_keys[0]
    return ActiveLearning(
        enabled=True,
        question=clip(active.question, 2000),
        param=param,
        from_value=from_value,
        to_value=to_value,
        observe=observe,
        options=options,
        correct_option=correct,
        explanation=clip(active.explanation, 2000),
    ).model_dump(mode="json")


def build_steps_block(out: GenSteps, basis: LessonBasis) -> dict[str, Any]:
    steps, all_refs = [], []
    for step in out.steps[:40]:
        title, body = clip(step.title, 200), clip(step.body, 12000)
        if not title and not body:
            continue  # an empty step would leave a gap in the numbering learners see
        i = len(steps) + 1
        refs = basis.refs_for(step.ref_ids, 10)
        all_refs.extend(refs)
        highlight = next((r for r in refs if r.bbox), refs[0] if refs else None)
        check = clip(step.check_question, 2000)
        if check.lower() in ("null", "none", "n/a", "-") or (check and " ".join(check.split()).casefold() in " ".join(body.split()).casefold()):
            check = ""  # no question, or one copied from the body: nothing to think about
        steps.append(
            {
                "id": f"s{i}",
                "title": title or str(i),
                "body": body,
                "source_refs": [r.model_dump(mode="json") for r in refs],
                "highlight": highlight.model_dump(mode="json") if highlight else None,
                "check_question": check or None,
            }
        )
    block = base_block("steps", out.title, out.description, all_refs)
    sequence_clear = bool(basis.analysis.result and basis.analysis.result.sequence_clear)
    block.update({"steps": steps, "sequence_confirmed": sequence_clear, "autoplay_seconds": 6})
    return block


def build_flow_block(out: GenFlow, basis: LessonBasis) -> dict[str, Any]:
    nodes, key_to_id, all_refs = [], {}, []
    for node in out.nodes[:30]:
        key = str(node.key).strip()
        if not key or key in key_to_id or not str(node.label).strip():
            continue
        node_id = f"n{len(nodes) + 1}"
        key_to_id[key] = node_id
        refs = basis.refs_for(node.ref_ids, 10)
        all_refs.extend(refs)
        nodes.append(
            {"id": node_id, "label": clip(node.label, 200), "description": clip(node.description, 2000),
             "source_refs": [r.model_dump(mode="json") for r in refs]}
        )
    edges = []
    for edge in out.edges:
        src, dst = key_to_id.get(str(edge.source_key).strip()), key_to_id.get(str(edge.target_key).strip())
        if not src or not dst or src == dst or len(edges) >= 60:
            continue
        edges.append(
            {"id": f"e{len(edges) + 1}", "source": src, "target": dst, "label": clip(edge.label, 200),
             "description": clip(edge.description, 2000)}
        )
    block = base_block("flow", out.title, out.description, all_refs)
    block.update({"layout": out.layout, "nodes": nodes, "edges": edges})
    return block


def _quantity_from(symbol: str, name: str, unit: str, value: float, lo: float, hi: float, step: float, role: str,
                   provenance: str, analysis_var: Quantity | None) -> dict[str, Any]:
    """Parameter with provenance carried over from the reviewed analysis when it knows the symbol."""
    source_ref = None
    if analysis_var is not None:
        unit = unit or analysis_var.unit
        if analysis_var.provenance in ("user", "document") and analysis_var.value is not None:
            provenance = analysis_var.provenance
            value = float(analysis_var.value)
            lo, hi = min(lo, value), max(hi, value)
        source_ref = analysis_var.source_ref
    q = Quantity(
        symbol=clip(symbol, 200),
        name=clip(name or (analysis_var.name if analysis_var else "") or symbol, 200),
        unit=clip(unit, 40),
        value=value,
        min=lo,
        max=hi,
        step=step,
        role=role if role in ("input", "output", "constant") else "input",
        provenance=provenance,
        source_ref=source_ref,
        confirmed=False,
    )
    return q.model_dump(mode="json")


def graph_params_needed(expression: str, x_var: str, param_symbols: set[str]) -> set[str]:
    compiled = compile_expr(expression)
    return {v for v in compiled.variables if v != x_var and (v not in CONSTANTS or v in param_symbols)}


def build_graph_block(
    spec: AIGraphSpec,
    *,
    title: str,
    description: str,
    refs: list[SourceRef],
    active: AIActive | None,
    variables: dict[str, Quantity],
) -> tuple[dict[str, Any] | None, str | None]:
    """Validated graph block, or (None, error) when the expression cannot be evaluated."""
    expression, _ = clean_expression(spec.expression)
    error = check_expression(expression)
    if error:
        return None, error
    x_var = re.sub(r"[^\w]", "", spec.x_var or "") or "x"
    compiled = compile_expr(expression)
    if x_var not in compiled.variables:
        return None, f"'{x_var}' does not appear in {expression}"
    given = {p.symbol: p for p in spec.params if str(p.symbol).strip()}
    needed = graph_params_needed(expression, x_var, set(given))
    params: list[dict[str, Any]] = []
    for symbol in sorted(needed, key=lambda s: list(given).index(s) if s in given else 99):
        p = given.get(symbol)
        if p is not None:
            value, lo, hi, step = fix_range(p.value, p.min, p.max, p.step)
            params.append(_quantity_from(symbol, p.name, p.unit, value, lo, hi, step, p.role, p.provenance, variables.get(symbol)))
        else:  # the model forgot a parameter: placeholder the teacher must review
            var = variables.get(symbol)
            base = var.value if var is not None and var.value is not None else 1.0
            value, lo, hi, step = fix_range(base, None, None, None)
            params.append(_quantity_from(symbol, "", "", value, lo, hi, step, "input", "assumption", var))
    if len(params) > 12:
        return None, "too many parameters"
    x_min, x_max = num(spec.x_min, -10.0), num(spec.x_max, 10.0)
    if x_min == x_max:
        x_min, x_max = x_min - 1, x_max + 1
    if x_min > x_max:
        x_min, x_max = x_max, x_min
    env = {p["symbol"]: float(p["value"]) for p in params}
    finite = 0
    for i in range(41):
        env[x_var] = x_min + (x_max - x_min) * i / 40
        try:
            y = compiled.evaluate(env)
        except ExprError as exc:
            return None, str(exc)[:160]
        if math.isfinite(y):
            finite += 1
    if finite < 5:
        return None, "the expression gives no finite values in the chosen range"
    y_min, y_max = num(spec.y_min), num(spec.y_max)
    if y_min is None or y_max is None or y_min >= y_max:
        y_min = y_max = None
    block = base_block("graph", title, description, refs)
    block.update(
        {
            "expression": expression,
            "x_var": x_var,
            "x_min": round(x_min, 6),
            "x_max": round(x_max, 6),
            "y_min": y_min,
            "y_max": y_max,
            "x_label": clip(spec.x_label, 200) or x_var,
            "y_label": clip(spec.y_label, 200),
            "params": params,
            "explanation": clip(spec.explanation, 12000),
            "active": build_active(active, params, GRAPH_OBSERVE_KEYS, default_observe=GRAPH_DEFAULT_OBSERVE),
        }
    )
    return block, None


def canonical_symbol(model: str, symbol: str) -> str | None:
    table = SIM_MODELS[model]
    names = {p[0] for p in table["params"]}
    symbol = str(symbol or "").strip()
    if symbol in names:
        return symbol
    alias = table["aliases"].get(symbol) or table["aliases"].get(symbol.lower())
    if alias:
        return alias
    for name in names:
        if name.lower() == symbol.lower():
            return name
    return None


def unit_text(unit: str | dict[str, str], lang: str) -> str:
    if isinstance(unit, dict):
        return unit.get(lang) or unit.get("en") or ""
    return unit


def fit_domain(model: str, param: dict[str, Any], default: float, lo: float, hi: float) -> dict[str, Any]:
    """Keep a simulation slider inside the engine's domain (e.g. pendulum L > 0), so the
    generated block passes ``param_ranges`` validation and never feeds the model bad input."""
    info = simulations.MODELS[model].inputs.get(param["symbol"])
    if info is None:
        return param
    if info.problem(param["value"]):
        param.update(value=default, provenance="assumption", source_ref=None)
    if info.problem(param["min"]):
        param["min"] = lo
    if info.problem(param["max"]):
        param["max"] = hi
    if param["min"] >= param["max"]:
        param["min"], param["max"] = lo, hi
    param["min"], param["max"] = min(param["min"], param["value"]), max(param["max"], param["value"])
    if not param.get("step") or param["step"] <= 0 or param["step"] > param["max"] - param["min"]:
        param["step"] = nice_step((param["max"] - param["min"]) / 100)
    return param


def simulation_params(
    model: str, raw_params: list[Any], lang: str, variables: dict[str, Quantity] | None = None
) -> list[dict[str, Any]]:
    """Every input of a tested model as a slider: AI values when given (canonical symbols),
    reviewed analysis values (document/user) win, defaults otherwise — all inside the domain.

    Provenance stays honest: 'document'/'user' only when the reviewed analysis has that value
    with that provenance; any other value the AI proposes is an 'assumption'."""
    variables = variables or {}
    given: dict[str, Any] = {}
    for p in raw_params:
        sym = canonical_symbol(model, p.symbol)
        if sym and sym not in given:
            given[sym] = p
    params = []
    for sym, name_vi, name_en, unit, default, lo, hi, step, role in SIM_MODELS[model]["params"]:
        p = given.get(sym)
        analysis_var = variables.get(sym) or next((v for s, v in variables.items() if canonical_symbol(model, s) == sym), None)
        name = name_vi if lang == "vi" else name_en
        if p is not None:
            value, a, b, s = fix_range(p.value, p.min, p.max, p.step)
            ai_name = str(getattr(p, "name", "") or "").strip()
            name = ai_name or name
            known = analysis_var.provenance if analysis_var is not None and analysis_var.value is not None else None
            provenance = p.provenance if p.provenance in ("user", "document") and p.provenance == known else "assumption"
        else:
            value, a, b, s = default, lo, hi, step
            provenance = "assumption"
        param = _quantity_from(sym, name, unit_text(unit, lang), value, a, b, s, role, provenance, analysis_var)
        params.append(fit_domain(model, param, default, lo, hi))
    return params


def reference_cases(model: str, raw_cases: list[Any], values: dict[str, float]) -> tuple[list[dict[str, Any]], int]:
    """Worked examples printed in the sources, kept only when the tested engine reproduces them
    within their tolerance (so ``sim_reference`` validation passes); returns (cases, dropped)."""
    outputs = SIM_MODELS[model]["outputs"]
    cases: list[dict[str, Any]] = []
    dropped = 0
    for case in raw_cases[:10]:
        inputs: dict[str, float] = {}
        ok = bool(str(case.quote or "").strip()) and case.output in outputs and num(case.expected) is not None
        for item in case.inputs if ok else []:
            sym = canonical_symbol(model, item.symbol)
            if sym is None or num(item.value) is None:
                ok = False
                break
            inputs[sym] = float(item.value)
        if not ok or not inputs:
            dropped += 1
            continue
        full = {**values, **inputs}
        expected = float(case.expected)
        tolerance = min(max(num(case.tolerance, 0.02) or 0.02, 0.001), 0.2)
        try:
            actual = simulations.run_case(model, full, case.output)
        except AppError:
            dropped += 1
            continue
        if simulations.relative_error(actual, expected) > tolerance:  # misread or other assumptions
            dropped += 1
            continue
        cases.append({"inputs": full, "output": case.output, "expected": expected, "tolerance": tolerance})
    return cases, dropped


def simulation_active(active: AIActive | None, model: str, params: list[dict[str, Any]]) -> dict[str, Any] | None:
    table = SIM_MODELS[model]
    return build_active(active, params, table["outputs"], table.get("output_aliases"))


def build_simulation_block(out: GenSimulation, model: str, basis: LessonBasis, lang: str) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    params = simulation_params(model, out.params, lang, basis.variables)
    cases, dropped = reference_cases(model, out.reference_cases, {p["symbol"]: p["value"] for p in params})
    if dropped:
        warnings.append(prompts.msg("reference_dropped", lang, n=dropped))
    refs = basis.refs_for(out.ref_ids, 20) or basis.all_refs("f", 10)
    notes = clip(out.notes, 11000)
    sim_note = prompts.msg("simulation_note", lang)
    if sim_note.split(",")[0].lower() not in notes.lower():
        notes = (notes + "\n" + sim_note).strip()
    object_asset = next((o.asset_id for o in (basis.analysis.result.objects if basis.analysis.result else []) if o.asset_id), None)
    block = base_block("simulation", out.title, out.description, refs)
    block.update(
        {
            "model": model,
            "params": params,
            "object_asset_id": object_asset,
            "reference_cases": cases,
            "active": simulation_active(out.active, model, params),
            "notes": notes,
        }
    )
    return block, warnings


def _matrix(rows: list[list[float]], n: int, max_cols: int) -> list[list[float]] | None:
    if len(rows) < n:
        return None
    out = []
    for row in rows[:n]:
        vals = [num(v) for v in row[:max_cols]]
        if not vals or any(v is None for v in vals):
            return None
        out.append([round(max(-5.0, min(5.0, v)), 2) for v in vals])
    width = min(len(r) for r in out)
    if width < 1:
        return None
    return [r[:width] for r in out]


def attention_config(tokens: list[str], q: list[list[float]], k: list[list[float]], v: list[list[float]]) -> dict[str, Any] | None:
    tokens = [clip(t, 20) for t in tokens if str(t).strip()][:4]
    n = len(tokens)
    if n < 2:
        return None
    Q, K, V = _matrix(q, n, 4), _matrix(k, n, 4), _matrix(v, n, 4)
    if Q is None or K is None or V is None:
        return None
    d_k = min(len(Q[0]), len(K[0]))
    if d_k < 2 or len(V[0]) < 2:  # the explorer shows 2-4 dimensions (features/blocks/algorithm)
        return None
    return {"tokens": tokens, "Q": [r[:d_k] for r in Q], "K": [r[:d_k] for r in K], "V": V}


def build_attention_block(spec: AIAttentionSpec, *, title: str, description: str, refs: list[SourceRef], lang: str) -> dict[str, Any] | None:
    config = attention_config(spec.tokens, spec.Q, spec.K, spec.V)
    if config is None:
        return None
    block = base_block("algorithm", title, description, refs)
    explanation = clip(spec.explanation, 11000)
    block.update({"algorithm": "attention", "config": config, "explanation": (explanation + "\n" + prompts.msg("attention_note", lang)).strip()})
    return block


def build_algorithm_block(out: GenAlgorithm, kind: str, basis: LessonBasis, lang: str) -> dict[str, Any] | None:
    refs = basis.refs_for(out.ref_ids, 20)
    if kind == "attention":
        spec = AIAttentionSpec(tokens=out.tokens, d_k=0, Q=out.Q, K=out.K, V=out.V, explanation=out.explanation)
        return build_attention_block(spec, title=out.title, description=out.description, refs=refs, lang=lang)
    array = [num(x) for x in out.array]
    array = [int(x) if float(x).is_integer() else round(x, 3) for x in array if x is not None][:12]
    if kind in ("counting_sort", "radix_sort"):
        if any(not isinstance(x, int) or abs(x) > 1_000_000 for x in array):
            return None
        if kind == "counting_sort" and array and max(array) - min(array) + 1 > 100:
            return None
    if kind == "bucket_sort" and any(abs(x) > 1_000_000 for x in array):
        return None
    if kind == "binary_search":
        array = sorted(dict.fromkeys(array))  # a sorted list without repeats
    if len(array) < 3:
        return None
    config: dict[str, Any] = {"array": array}
    if kind in ("binary_search", "linear_search"):
        target = num(out.target)
        if target is None:
            target = array[len(array) // 2]
        config = {"array": array, "target": int(target) if float(target).is_integer() else target}
    block = base_block("algorithm", out.title, out.description, refs)
    note = prompts.msg("algorithm_note", lang)
    block.update({"algorithm": kind, "config": config, "explanation": (clip(out.explanation, 11000) + "\n" + note).strip()})
    return block


# ============================================================================ type planning
SPORT_WORDS = {
    "football": ("bóng đá", "football", "soccer"),
    "futsal": ("futsal",),
    "volleyball": ("bóng chuyền", "volleyball"),
    "basketball": ("bóng rổ", "basketball"),
    "badminton": ("cầu lông", "badminton"),
}


def guess_sport(lab: Lab, analysis: LabAnalysis) -> str:
    text = " ".join(
        [lab.title or "", lab.topic or "", analysis.result.topic if analysis.result else "", analysis.result.summary if analysis.result else ""]
    ).lower()
    for sport, words in SPORT_WORDS.items():
        if any(w in text for w in words):
            return sport
    return "football"


# Topic words that identify a tested simulation model / algorithm when the analysis did not
# suggest one but the teacher asked for that block type (checked in this order).
MODEL_WORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("spring_mass", ("con lắc lò xo", "lò xo", "spring-mass", "spring mass", "mass on a spring", "hooke")),
    ("pendulum", ("con lắc đơn", "con lắc", "pendulum")),
    ("projectile", ("ném xiên", "ném ngang", "chuyển động ném", "projectile", "launch angle")),
    ("compound_interest", ("lãi kép", "compound interest", "lãi suất")),
)
ALGORITHM_WORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("attention", ("attention", "self-attention", "softmax(qk", "cơ chế chú ý")),
    ("binary_search", ("binary search", "tìm kiếm nhị phân")),
    ("linear_search", ("linear search", "sequential search", "tìm kiếm tuần tự", "tìm kiếm tuyến tính")),
    ("quick_sort", ("quick sort", "quicksort", "sắp xếp nhanh")),
    ("merge_sort", ("merge sort", "mergesort", "sắp xếp trộn")),
    ("heap_sort", ("heap sort", "heapsort", "sắp xếp vun đống")),
    ("counting_sort", ("counting sort", "sắp xếp đếm")),
    ("radix_sort", ("radix sort", "sắp xếp cơ số")),
    ("bucket_sort", ("bucket sort", "sắp xếp theo thùng", "sắp xếp xô")),
    ("bubble_sort", ("bubble sort", "sắp xếp nổi bọt")),
    ("selection_sort", ("selection sort", "sắp xếp chọn")),
    ("insertion_sort", ("insertion sort", "sắp xếp chèn")),
)


def topic_text(analysis: LabAnalysis, lab: Lab | None = None) -> str:
    parts = [lab.title or "", lab.topic or ""] if lab is not None else []
    if analysis.result is not None:
        parts += [analysis.result.topic, analysis.result.summary]
        parts += [f"{f.latex} {f.expression} {f.description}" for f in analysis.result.formulas]
    if analysis.paper is not None:
        parts += [analysis.paper.title, analysis.paper.summary] + [m.title for m in analysis.paper.methods]
        parts += [e.latex for e in analysis.paper.equations]
    return " ".join(p for p in parts if p).lower()


def guess_from_topic(table: tuple[tuple[str, tuple[str, ...]], ...], text: str) -> str | None:
    return next((name for name, words in table if any(w in text for w in words)), None)


def plan_types(
    body: GenerateIn, analysis: LabAnalysis, lang: str, lab: Lab | None = None
) -> tuple[list[tuple[str, dict[str, Any]]], list[str]]:
    warnings: list[str] = []
    suggestions = analysis.result.suggested_blocks if analysis.result else []
    paper_algorithms = [e.algorithm for e in (analysis.paper.equations if analysis.paper else []) if e.algorithm]
    if body.block_types:
        unknown = [t for t in body.block_types if t not in BLOCK_TYPES]
        if unknown:
            raise AppError("validation_error", 422, "Unknown block type", fields={"block_types": ", ".join(unknown)[:200]})
        teacher_only = [t for t in body.block_types if t in TEACHER_ONLY_BLOCK_TYPES]
        if teacher_only:  # a board is made from the teacher's photo in the editor, never generated empty
            raise AppError("validation_error", 422, "This block type is made by the teacher, not generated",
                           fields={"block_types": ", ".join(dict.fromkeys(teacher_only))[:200]})
        wanted = list(dict.fromkeys(body.block_types))
    else:
        wanted = [s.type for s in suggestions if s.feasibility != "not_supported" and s.type != "widget"]
        wanted = list(dict.fromkeys(wanted))
        if not wanted:
            has_steps = bool(analysis.result and analysis.result.steps)
            wanted = ["steps" if has_steps or not analysis.paper else "flow", "quiz"]
            warnings.append(prompts.msg("no_suggestions", lang))
    selected_formulas = None
    if body.formula_ids is not None:
        if not body.formula_ids or len(set(body.formula_ids)) != len(body.formula_ids) or "graph" not in wanted:
            raise AppError("validation_error", 422, "Select distinct formulas and include graph", fields={"formula_ids": "invalid"})
        formulas = analysis.result.formulas if analysis.result else []
        by_id = {formula.id: formula for formula in formulas}
        if len(by_id) != len(formulas):
            raise AppError("validation_error", 422, "Formula identifiers must be unique", fields={"formula_ids": "invalid"})
        selected_formulas = []
        for formula_id in body.formula_ids:
            formula = by_id.get(formula_id)
            if formula is None or not formula.confirmed:
                raise AppError("validation_error", 422, "Selected formula must exist and be confirmed", fields={"formula_ids": "invalid"})
            expression, _ = clean_expression(formula.expression, formula.output_symbol)
            error = check_expression(expression)
            symbols = set(compile_expr(expression).variables) if not error else set()
            if error or not (symbols - set(CONSTANTS) or symbols.intersection(formula.variables)):
                raise AppError("validation_error", 422, "Selected formula needs a computable expression with an input variable", fields={"formula_ids": "invalid"})
            selected_formulas.append(formula_id)
        warnings.append(prompts.msg("formula_graph_review", lang))
    plan: list[tuple[str, dict[str, Any]]] = []
    text = topic_text(analysis, lab)
    for kind in wanted:
        if kind == "simulation":
            models = [s.model for s in suggestions if s.type == "simulation" and s.model]
            model = models[0] if models else guess_from_topic(MODEL_WORDS, text)
            if model is None:
                warnings.append(prompts.msg("simulation_unsupported", lang))
                continue
            plan.append((kind, {"model": model}))
        elif kind == "algorithm":
            algos = [s.algorithm for s in suggestions if s.type == "algorithm" and s.algorithm] + paper_algorithms
            algorithm = algos[0] if algos else guess_from_topic(ALGORITHM_WORDS, text)
            if algorithm is None:
                warnings.append(prompts.msg("algorithm_unsupported", lang))
                continue
            plan.append((kind, {"algorithm": algorithm}))
        elif kind == "graph" and selected_formulas is not None:
            plan.extend((kind, {"formula_id": formula_id}) for formula_id in selected_formulas)
        else:
            plan.append((kind, {}))
    if body.visual3d:
        if body.visual3d == "auto" and any(kind == "field" or (kind == "simulation" and extra.get("model") in {"pendulum", "projectile", "spring_mass"}) for kind, extra in plan):
            return plan, warnings  # these blocks already provide matching, parameter-driven 3D
        visual = suggest_visual(text) if body.visual3d == "auto" else body.visual3d
        if (visual and body.visual3d == "auto" and not body.replace and lab is not None
                and any(b.get("visual3d") == visual for b in (lab.spec_json or {}).get("blocks", []))):
            # Appending another batch of formula graphs must not duplicate the same scene.
            return plan, warnings
        if visual:
            # Use the existing text introduction, or append a focused guided scene.
            plain = next((i for i, (kind, _) in enumerate(plan) if kind == "text"), None)
            if plain is None:
                plan.append(("text", {"visual3d": visual}))
            else:
                plan[plain] = ("text", {"visual3d": visual})
        else:
            warnings.append("Chưa xác định được mô hình 3D phù hợp từ phân tích. Chọn mô hình trong phần tạo bài hoặc tiếp tục với sơ đồ 2D."
                            if lang == "vi" else "No single suitable 3D model was identified from the analysis. Choose a model in the build panel or continue with a 2D diagram.")
    return plan, warnings


# ============================================================================ generation
@dataclass
class GenResult:
    blocks: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    error: AppError | None = None


def _pick_image(lab: Lab, analysis: LabAnalysis) -> tuple[SourceInfo | None, int | None]:
    order = (analysis.source_ids or []) + [s.id for s in lab.sources]
    by_id = {s.id: s for s in lab.sources}
    seen = []
    for sid in order:
        if sid in by_id and sid not in seen:
            seen.append(sid)
    for sid in seen:
        src = by_id[sid]
        if src.kind == "image" and src.status == "ready":
            return snapshot_source(src), None
    for sid in seen:
        src = by_id[sid]
        if src.kind == "pdf" and src.status == "ready":
            pages = Counter()
            if analysis.result:
                for item in list(analysis.result.objects) + list(analysis.result.steps):
                    for ref in item.source_refs:
                        if ref.source_id == sid and ref.page:
                            pages[ref.page] += 1
            page = pages.most_common(1)[0][0] if pages else 1
            return snapshot_source(src), page
    return None, None


def _pick_video(lab: Lab, analysis: LabAnalysis) -> SourceInfo | None:
    order = (analysis.source_ids or []) + [s.id for s in lab.sources]
    by_id = {s.id: s for s in lab.sources}
    for sid in order:
        src = by_id.get(sid)
        if src is not None and src.kind == "video" and src.status == "ready" and (src.meta_json or {}).get("ai_key"):
            return snapshot_source(src)
    return None


async def _generate_one(
    kind: str, extra: dict[str, Any], lab: Lab, actor: Actor | None, basis: LessonBasis, mode: str
) -> GenResult:
    from . import learning, quiz_gen, segmentation, video_ai, widgets  # local: avoid import cycles

    lang = lab.language
    res = GenResult()
    if kind == "steps":
        out = await gen_call(lab, actor, basis, kind=kind, model_cls=GenSteps, task=prompts.GEN_TASKS["steps"], mode=mode)
        res.blocks.append(build_steps_block(out, basis))
    elif kind == "flow":
        out = await gen_call(lab, actor, basis, kind=kind, model_cls=GenFlow, task=prompts.GEN_TASKS["flow"], mode=mode)
        res.blocks.append(build_flow_block(out, basis))
    elif kind == "graph":
        formula_id = extra.get("formula_id")
        formula = next((f for f in basis.analysis.result.formulas if f.id == formula_id), None) if formula_id and basis.analysis.result else None
        graph_basis = basis
        task = prompts.GEN_TASKS["graph"]
        if formula is not None:
            graph_basis = copy.copy(basis)
            graph_basis.digest = copy.deepcopy(basis.digest)
            graph_basis.digest["formulas"] = [f for f in graph_basis.digest.get("formulas", []) if f["id"] == formula_id]
            task += ("\nUse ONLY the selected formula in the analysis. Return its exact expression unchanged, "
                     "choose x_var from its input symbols, cite its id, and do not infer missing measurements or conditions. "
                     "Clearly identify illustrative values as assumptions requiring teacher review.")
        out = await gen_call(lab, actor, graph_basis, kind=kind, model_cls=GenGraph, task=task, mode=mode)
        if formula is not None:
            expected, _ = clean_expression(formula.expression, formula.output_symbol)
            proposed, _ = clean_expression(out.graph.expression)
            if re.sub(r"\s+", "", expected) != re.sub(r"\s+", "", proposed):
                res.warnings.append(prompts.msg("formula_graph_mismatch", lang, formula=formula.id))
                return res
            out.graph.expression = expected
            # Axis units must come from reviewed analysis rather than the model's guess.
            x_symbol = re.sub(r"[^\w]", "", out.graph.x_var or "")
            x_var = basis.variables.get(x_symbol)
            y_var = basis.variables.get(formula.output_symbol)
            out.graph.x_label = f"{x_symbol} ({x_var.unit})" if x_var and x_var.unit else x_symbol
            out.graph.y_label = f"{formula.output_symbol} ({y_var.unit})" if y_var and y_var.unit else formula.output_symbol
            refs = basis.refs_for([formula.id], 20)
        else:
            refs = basis.refs_for(out.ref_ids, 20) or basis.all_refs("f", 10)
        block, error = build_graph_block(
            out.graph, title=out.title, description=out.description, refs=refs, active=out.active, variables=basis.variables
        )
        if block is None:
            if formula is not None:
                res.warnings.append(prompts.msg("formula_graph_invalid", lang, formula=formula.id, error=error))
            else:
                res.warnings.append(prompts.msg("graph_invalid", lang, error=error))
        else:
            if formula is not None:
                # Model-proposed values are assumptions unless corroborated by reviewed data.
                for param in block["params"]:
                    var = basis.variables.get(param["symbol"])
                    if (var is None or var.provenance not in ("document", "user") or var.value is None
                            or (var.provenance == "document" and var.source_ref is None)):
                        param["provenance"] = "assumption"
                    # Units are taken from the reviewed analysis, not invented by the model.
                    param["unit"] = var.unit if var else ""
                caution = prompts.msg("formula_graph_review", lang)
                block["description"] = clip((caution + " " + block.get("description", "")).strip(), 2000)
            res.blocks.append(block)
    elif kind == "simulation":
        model = extra["model"]
        names = ", ".join(f"{p[0]} ({unit_text(p[3], lang) or '-'})" for p in SIM_MODELS[model]["params"])
        task = prompts.GEN_TASKS["simulation"].format(model=model, params=names, outputs=", ".join(SIM_MODELS[model]["outputs"]))
        out = await gen_call(lab, actor, basis, kind=kind, model_cls=GenSimulation, task=task, mode=mode)
        block, warns = build_simulation_block(out, model, basis, lang)
        res.blocks.append(block)
        res.warnings.extend(warns)
    elif kind == "algorithm":
        algorithm = extra["algorithm"]
        task = prompts.GEN_TASKS["algorithm"].format(algorithm=algorithm)
        out = await gen_call(lab, actor, basis, kind=kind, model_cls=GenAlgorithm, task=task, mode=mode)
        block = build_algorithm_block(out, algorithm, basis, lang)
        if block is None:
            res.warnings.append(prompts.msg("block_invalid", lang, type=kind))
        else:
            res.blocks.append(block)
    elif kind == "text":
        visual = extra.get("visual3d")
        task = prompts.GEN_TASKS["text"] + (visual_task(visual, lang) if visual else "")
        out = await gen_call(lab, actor, basis, kind=kind, model_cls=GenText, task=task, mode=mode)
        refs = dedupe_refs([ref for item in basis.refs.values() for ref in item], 10)
        block = base_block("text", out.title, "", refs)
        block["body"] = clip(out.body, 12000)
        if visual:
            block["visual3d"] = visual
        res.blocks.append(block)
    elif kind == "quiz":
        # Kinds follow the material (numeric needs a valued formula, order a stated sequence);
        # LESSON CONTENT is the batch's other blocks and the lesson goals (see `generate`).
        draft = await quiz_gen.generate_questions(
            lab, actor, basis=basis, count=5, kinds=quiz_gen.material_kinds(basis),
            extra_context=extra.get("lesson_content", ""), avoid=extra.get("avoid"), mode=mode,
        )
        res.warnings.extend(draft.warnings)
        if draft.questions:
            block = base_block("quiz", draft.title or prompts.msg("title_quiz", lang), draft.intro, [])
            block["questions"] = [q.model_dump(mode="json") for q in draft.questions]
            res.blocks.append(block)
    elif kind == "diagram":
        info, page = _pick_image(lab, basis.analysis)
        if info is None:
            res.warnings.append(prompts.msg("diagram_needs_image", lang))
        else:
            out = await segmentation.propose_diagram(lab, actor, info, page, refine=True)
            if out.hotspots:
                block = base_block("diagram", prompts.msg("title_diagram", lang), prompts.msg("desc_diagram", lang), [])
                block.update(
                    {
                        "image": out.image.model_dump(mode="json"),
                        "hotspots": [h.model_dump(mode="json") for h in out.hotspots],
                        "relations": [r.model_dump(mode="json") for r in out.relations],
                    }
                )
                res.blocks.append(block)
            else:
                res.warnings.append(prompts.msg("block_invalid", lang, type=kind))
    elif kind == "video":
        info = _pick_video(lab, basis.analysis)
        if info is None:
            res.warnings.append(prompts.msg("video_needs_source", lang))
        else:
            steps = [s.title for s in (basis.analysis.result.steps if basis.analysis.result else [])]
            markers, limits, _notes, warns = await video_ai.suggest_markers(lab, actor, info, steps)
            res.warnings.extend(warns)
            compare_info, compare_page = _pick_image(lab, basis.analysis)
            block = base_block("video", prompts.msg("title_video", lang), prompts.msg("desc_video", lang), [])
            block.update(
                {
                    "source_id": info.id,
                    "markers": [m.model_dump(mode="json") for m in markers],
                    "compare": {"source_id": compare_info.id, "page": compare_page, "asset_id": None} if compare_info else None,
                    "tracks": [],
                    "limits_note": clip(limits, 2000),
                }
            )
            res.blocks.append(block)
    elif kind == "field":
        sport = guess_sport(lab, basis.analysis)
        topic = basis.analysis.result.topic if basis.analysis.result else lab.title
        description = (topic or lab.title) + ". " + (basis.analysis.result.summary if basis.analysis.result else "")
        out = await learning.make_field_scenario(lab, actor, sport, description[:1800], mode=mode)
        block = base_block("field", prompts.msg("title_field", lang), "", basis.all_refs("s", 6))
        block.update({"sport": sport, "prompt": clip(out.prompt, 2000), "frames": [f.model_dump(mode="json") for f in out.frames], "solution_frames": []})
        res.blocks.append(block)
    elif kind == "widget":
        result = basis.analysis.result
        description = (result.summary if result else "") or lab.title
        out = await widgets.generate_widget(lab, actor, description[:2500], None)
        block = base_block("widget", prompts.msg("title_widget", lang), "", [])
        block.update(
            {"prompt": clip(description, 2000), "html": out.html, "status": out.status,
             "validation": {"checks": [c.model_dump() for c in out.checks]}, "approved": False}
        )
        res.blocks.append(block)
    return res


async def _lesson_meta(lab: Lab, actor: Actor | None, basis: LessonBasis, mode: str) -> GenLessonMeta | None:
    try:
        return await gen_call(lab, actor, basis, kind="lesson_meta", model_cls=GenLessonMeta, task=prompts.GEN_TASKS["lesson_meta"], mode=mode)
    except AppError:
        return None


def merge_lesson_header(spec: dict[str, Any], meta: GenLessonMeta | None, analysis: LabAnalysis, replace: bool) -> dict[str, Any]:
    if meta is not None:
        if replace or not spec.get("summary"):
            spec["summary"] = clip(meta.summary, 12000)
        objectives = [clip(o, 2000) for o in meta.objectives if str(o).strip()][:12]
        if objectives and (replace or not spec.get("objectives")):
            spec["objectives"] = objectives
        glossary = list(spec.get("glossary") or [])
        seen = {(str(g.get("vi", "")).lower(), str(g.get("en", "")).lower()) for g in glossary}
        ids = {g.get("id") for g in glossary}
        for term in meta.glossary:
            key = (term.vi.strip().lower(), term.en.strip().lower())
            if not key[0] or not key[1] or key in seen or len(glossary) >= 120:
                continue
            seen.add(key)
            gid = f"g{len(glossary) + 1}"
            while gid in ids:
                gid = new_id("g")
            ids.add(gid)
            glossary.append({"id": gid, "vi": clip(term.vi, 200), "en": clip(term.en, 200), "note": clip(term.note, 2000)})
        spec["glossary"] = glossary
    if analysis.result is not None:
        assumptions = list(spec.get("assumptions") or [])
        texts = {str(a.get("text", "")).strip().lower() for a in assumptions}
        ids = {a.get("id") for a in assumptions}
        for a in analysis.result.assumptions:
            if a.text.strip().lower() in texts or len(assumptions) >= 40:
                continue
            aid = a.id if a.id not in ids else new_id("a")
            ids.add(aid)
            texts.add(a.text.strip().lower())
            assumptions.append({"id": aid, "text": a.text, "confirmed": a.confirmed})
        spec["assumptions"] = assumptions
    return spec


async def generate(db: Session, lab: Lab, actor: Actor, body: GenerateIn) -> GenerateOut:
    analysis = LabAnalysis.model_validate(lab.analysis_json or {})
    if analysis.result is None and analysis.paper is None:
        raise AppError("analysis_required", 409, "Analyse the sources before generating blocks")
    lang = lab.language
    plan, warnings = plan_types(body, analysis, lang, lab)
    if not plan:  # e.g. only an unsupported simulation was asked for: never empty the lesson
        clean = list(dict.fromkeys(clip(w, 2000) for w in warnings if w))
        return GenerateOut(lab=lab_svc.lab_out(db, lab), generated_block_ids=[], generated_formula_ids=[], warnings=clean)
    basis = build_basis(lab, analysis)
    mode, mode_warnings = choose_mode(lab)  # text-only calls; media calls apply the privacy rule themselves
    warnings += mode_warnings
    db.commit()
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def guarded(coro_factory):
        async with semaphore:
            return await coro_factory()

    def make(kind: str, extra: dict[str, Any]):
        async def run() -> GenResult:
            try:
                return await _generate_one(kind, extra, lab, actor, basis, mode)
            except AppError as exc:
                res = GenResult(error=exc)
                if kind == "graph" and extra.get("formula_id"):
                    res.warnings.append(prompts.msg("formula_graph_failed", lang, formula=extra["formula_id"], error=prompts.error_text(exc.code, lang)))
                else:
                    res.warnings.append(prompts.msg("block_failed", lang, type=kind, error=prompts.error_text(exc.code, lang)))
                return res

        return run

    meta_job = asyncio.ensure_future(guarded(lambda: _lesson_meta(lab, actor, basis, mode)))
    results: list[GenResult] = [GenResult() for _ in plan]
    first = [i for i, (kind, _extra) in enumerate(plan) if kind != "quiz"]
    later = [i for i, (kind, _extra) in enumerate(plan) if kind == "quiz"]
    for i, res in zip(first, await asyncio.gather(*(guarded(make(*plan[i])) for i in first))):
        results[i] = res
    if later:
        # The quiz is written last, from this batch's blocks, the blocks the lab keeps and the
        # lesson goals, so its questions can point at the lesson's own steps and interactives.
        from . import quiz_gen  # local: avoid import cycles

        header = await meta_job
        kept = [] if body.replace else list((lab.spec_json or {}).get("blocks") or [])
        goals = (header.objectives if header is not None else []) or (lab.spec_json or {}).get("objectives") or []
        made = []
        for block in (b for i in first for b in results[i].blocks):
            try:
                made.append(validate_block(block))  # an invalid block is dropped below: never quiz on it
            except ValidationError:
                continue
        content = quiz_gen.lesson_content(made + kept, goals)
        quiz_extra = {"lesson_content": content, "avoid": quiz_gen.existing_prompts(kept)}
        quiz_runs = [guarded(make(plan[i][0], {**plan[i][1], **quiz_extra})) for i in later]
        for i, res in zip(later, await asyncio.gather(*quiz_runs)):
            results[i] = res
    meta: GenLessonMeta | None = await meta_job
    blocks: list[tuple[dict[str, Any], str | None]] = []
    errors: list[AppError] = []
    for (_kind, extra), res in zip(plan, results):
        warnings.extend(res.warnings)
        if res.error is not None:
            errors.append(res.error)
        for block in res.blocks:
            try:
                blocks.append((validate_block(block), extra.get("formula_id")))
            except ValidationError:
                warnings.append(prompts.msg("block_invalid", lang, type=block.get("type", "?")))
    if not blocks and errors and len(errors) == len(plan):
        raise errors[0]

    added: list[str] = []
    added_formulas: list[str] = []
    replace = body.replace and bool(blocks)  # nothing usable came back: keep the lesson as it is

    def mutate(current: dict[str, Any]) -> dict[str, Any]:
        spec = LabSpec.model_validate(current or {}).model_dump(mode="json")
        existing = [] if replace else list(spec.get("blocks") or [])
        taken = {b["id"] for b in existing}
        room = max(0, MAX_BLOCKS - len(existing))
        new_blocks = []
        added_formulas.clear()
        for block, formula_id in blocks[:room]:
            block = copy.deepcopy(block)
            while block["id"] in taken:
                block["id"] = new_id()
            taken.add(block["id"])
            new_blocks.append(block)
            if formula_id is not None:
                added_formulas.append(formula_id)
        added.clear()
        added.extend(b["id"] for b in new_blocks)
        spec["blocks"] = existing + new_blocks
        return merge_lesson_header(spec, meta, analysis, replace)

    lab = save_lab_json(db, lab, "spec_json", mutate, lab_svc.validate_spec, actor, note="AI blocks")
    if len(blocks) > len(added):
        warnings.append(prompts.msg("too_many_blocks", lang, n=len(blocks) - len(added)))
    clean = list(dict.fromkeys(clip(w, 2000) for w in warnings if w))
    return GenerateOut(lab=lab_svc.lab_out(db, lab), generated_block_ids=added, generated_formula_ids=added_formulas, warnings=clean)


# ============================================================================ cover image (Muse Image)
async def generate_cover(db: Session, lab: Lab, actor: Actor, body: CoverIn) -> AssetOut:
    settings = get_settings()
    idea = (body.prompt or "").strip()
    # House style + the chosen medium + the lesson's own facts (spec and analysis read defensively)
    prompt, style = build_cover_prompt(lab, body.style, idea or None)
    db.commit()
    raw, _mime = await get_ai().generate_image(prompt=prompt, ctx=call_ctx("cover", actor, lab), size="1536x1024")
    data, mime, width, height = await anyio.to_thread.run_sync(lambda: media.normalize_image_bytes(raw, 1280))
    key = storage.save_bytes(lab.id, data, "png" if mime == "image/png" else "jpg")
    try:
        db.refresh(lab)
        asset = Asset(
            lab_id=lab.id,
            kind="cover",
            storage_key=key,
            mime=mime,
            width=width,
            height=height,
            ai_generated=True,
            # what reproduces the picture: the medium, the prompt system's version, the teacher's idea
            meta_json={"model": settings.image_model, "style": style, "prompt_version": COVER_PROMPT_VERSION, "prompt": idea[:600]},
        )
        db.add(asset)
        db.flush()
        lab.cover_asset_id = asset.id
        if lab.status == "published":
            # Learners see the published snapshot, which does not include the new cover yet: count
            # it as a change, so the Publish step offers "Publish changes" to share it.
            lab.version += 1
        db.commit()
        db.refresh(asset)
    except Exception:
        db.rollback()
        storage.delete_key(key)
        raise
    return lab_svc.asset_out(asset)


__all__ = [
    "SIM_MODELS",
    "build_attention_block",
    "build_graph_block",
    "build_simulation_block",
    "generate",
    "generate_cover",
]
