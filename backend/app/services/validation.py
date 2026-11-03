"""Pre-publication checks for a Lab (spec §11 "Kiểm tra trước khi trình bày").

``validate_lab`` returns a :class:`ValidationReport`: a list of checks, each with a stable
``code``, a ``status`` (``pass`` · ``warn`` · ``fail`` · ``skip``), the ``block_id`` it is
about (``None`` for lab-level checks), an English ``message`` (the frontend translates
the code and may use ``detail``) and a JSON-safe ``detail`` dict. ``ok`` is false when any
check fails — publishing is refused until those are fixed. Warnings never block.

Lab-level checks
* ``blocks_present``  (fail) — at least one block learners will see after publishing
  (unapproved quizzes and widgets are removed from the published copy).
* ``consent``         (fail) — every photo/video marked as showing students has consent.
* ``block_ids_unique`` (fail, only reported when broken) — block ids must be unique.

Per-block checks (``block_id`` set)
* ``expression_parses``  graph (fail) — the formula compiles with ``services/expr.py``.
* ``expression_vars``    graph (fail) — every free variable is a parameter, the x variable
  or a constant (pi, π, e, deg).
* ``param_ranges``       graph/simulation (fail; some warnings) — min < max, value inside
  [min, max], step > 0, finite numbers, unique symbols, x/y ranges, model input domains
  (e.g. pendulum L > 0).
* ``expression_finite``  graph (fail/warn) — 60 x samples at the default values and with
  each parameter at its min and max: fail when a setting gives no finite value (empty
  graph), warn when fewer than half the samples are finite.
* ``slider_effect``      graph/simulation (warn) — moving each slider from min to max
  changes the graph / at least one model output.
* ``units_consistent``   simulation (warn) — units match what the model calculates with
  (pendulum L m, g m/s², θ0 °; projectile v0 m/s, angle °, h0 m, g m/s²; spring k N/m,
  m kg; compound interest r %).
* ``sim_reference``      simulation (fail) — the block's reference cases and the built-in
  cases from ``shared/sim_cases.json`` match ``services/simulations.py``.
* ``quiz_answers``       quiz (fail/warn) — approved questions are well formed (answer
  index in range, order is a permutation, numeric answer present…); warn when no question
  is approved (the quiz stays hidden).
* ``widget_status``      widget (warn) — hidden until validated and approved.
* ``media_available``    diagram/video/simulation (fail; warn for optional media) — the
  image, video or cut-out a block shows still exists and is ready.
* ``active_learning``    graph/simulation (warn) — predict-then-check settings refer to
  real parameters/outputs and stay inside the slider range.
* ``sources_cited``      (warn) — blocks/steps cite a source, or their values are marked
  as document / user / assumption; citations point to sources that still exist.
* ``sequence_confirmed`` steps (warn) — an AI-proposed step order was confirmed by a human.
* ``markers_confirmed``  video (warn) — AI-suggested markers are confirmed (unconfirmed
  ones are hidden from learners).
* ``board_text``         board (fail/warn) — the handwriting was read and at least one line is
  left that is not crossed out; warn while words are still flagged as unsure.
* ``board_visual``       board (warn) — a clean redrawn sheet exists (otherwise learners get the
  Text view) and its proofreading found no difference with the transcription.
  (``media_available`` also covers the board's photo.)

These checks help find errors; they do not prove a model correct in all conditions.
Content used in class or research still needs review by a qualified person.
"""

from __future__ import annotations

import json
import math
from collections.abc import Iterable
from functools import lru_cache
from typing import Any

from sqlalchemy.orm import Session

from ..config import PROJECT_DIR
from ..db import utcnow
from ..errors import AppError
from ..models import Lab
from ..schemas.api import ValidationCheck, ValidationReport
from . import simulations
from .expr import CONSTANTS, ExprError, compile_expr, to_jsonable
from .labs import public_spec

GRAPH_SAMPLES = 60
SIM_CASES_PATH = PROJECT_DIR / "shared" / "sim_cases.json"

CHECK_CODES = (
    "blocks_present",
    "consent",
    "block_ids_unique",
    "expression_parses",
    "expression_vars",
    "param_ranges",
    "expression_finite",
    "slider_effect",
    "units_consistent",
    "sim_reference",
    "quiz_answers",
    "widget_status",
    "media_available",
    "active_learning",
    "sources_cited",
    "sequence_confirmed",
    "markers_confirmed",
    "board_text",
    "board_visual",
)

# Units each simulation model calculates with (normalized spellings that are accepted).
_DEG = {"°", "deg", "degree", "degrees", "độ", "do"}
_M = {"m", "mét", "met", "meter", "meters", "metre", "metres"}
_MS = {"m/s", "ms^-1", "ms-1", "ms⁻¹", "m.s^-1", "m.s-1", "m.s⁻¹"}
_MS2 = {"m/s²", "m/s2", "m/s^2", "ms^-2", "ms-2", "ms⁻²", "m.s^-2", "m.s-2", "m.s⁻²"}
_NM = {"n/m", "nm^-1", "nm-1", "nm⁻¹", "n.m^-1", "n.m-1", "n.m⁻¹"}
_KG = {"kg", "kilogram", "kilograms", "kilôgam"}
_PERCENT = "%"
EXPECTED_UNITS: dict[str, dict[str, tuple[str, set[str] | str]]] = {
    # model → input → (display unit, accepted normalized spellings | "%" prefix)
    "pendulum": {"L": ("m", _M), "g": ("m/s²", _MS2), "theta0": ("°", _DEG)},
    "projectile": {"v0": ("m/s", _MS), "angle": ("°", _DEG), "h0": ("m", _M), "g": ("m/s²", _MS2)},
    "spring_mass": {"k": ("N/m", _NM), "m": ("kg", _KG)},
    "compound_interest": {"r": ("%", _PERCENT)},
}


# ============================================================================ helpers
def _check(
    code: str,
    status: str,
    message: str,
    block_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> ValidationCheck:
    return ValidationCheck(code=code, status=status, block_id=block_id, message=message, detail=_jsonable(detail or {}))


def _jsonable(value: Any) -> Any:
    """Make details JSON-safe (NaN/inf → "nan"/"inf"; responses forbid NaN)."""
    if isinstance(value, float):
        return to_jsonable(value)
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    return value


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _num(value: Any) -> float | None:
    """A JSON number from the spec as float (None when absent or not a number)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _label(block: dict[str, Any]) -> str:
    title = (block.get("title") or "").strip()
    return f"“{title}”" if title else f"this {block.get('type', 'block')} block"


def _plural(n: int, word: str, plural: str | None = None) -> str:
    return f"{n} {word if n == 1 else (plural or word + 's')}"


def _join(items: Iterable[str]) -> str:
    return ", ".join(str(i) for i in items)


def _norm_unit(unit: str) -> str:
    return (
        (unit or "")
        .strip()
        .lower()
        .replace(" ", "")
        .replace("·", "")
        .replace("⋅", "")
        .replace("*", "")
        .replace("−", "-")
    )


def _param_value(param: dict[str, Any]) -> float:
    """Mirror of the frontend ``paramValues``: value, else min, else 0."""
    for key in ("value", "min"):
        value = _num(param.get(key))
        if value is not None:
            return value
    return 0.0


def _params(block: dict[str, Any]) -> list[dict[str, Any]]:
    return [p for p in block.get("params") or [] if isinstance(p, dict)]


def _slider_bounds(param: dict[str, Any]) -> tuple[float, float] | None:
    lo, hi = _num(param.get("min")), _num(param.get("max"))
    value = _param_value(param)
    if lo is None and hi is None:
        lo, hi = value - 1.0, value + 1.0
    elif lo is None:
        lo = min(value, hi) - 1.0
    elif hi is None:
        hi = max(value, lo) + 1.0
    if not (_finite(lo) and _finite(hi)) or lo >= hi:
        return None
    return lo, hi


def _same(a: float, b: float) -> bool:
    if math.isnan(a) and math.isnan(b):
        return True
    if math.isinf(a) or math.isinf(b):
        return a == b
    if math.isnan(a) or math.isnan(b):
        return False
    return abs(a - b) <= 1e-12 * max(1.0, abs(a), abs(b))


def _iter_refs(node: Any) -> Iterable[dict[str, Any]]:
    """Every SourceRef-like dict ({source_id, ...}) inside a block."""
    if isinstance(node, dict):
        # SourceRefs always carry ``located`` (ImageRef pointers to a picture do not).
        if "source_id" in node and "located" in node:
            yield node
        for value in node.values():
            yield from _iter_refs(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_refs(item)


class _Ctx:
    def __init__(self, lab: Lab) -> None:
        self.lab = lab
        self.sources = {s.id: s for s in lab.sources}
        self.assets = {a.id: a for a in lab.assets}


# ============================================================================ lab-level
def _lab_checks(lab: Lab, spec: dict[str, Any], blocks: list[dict[str, Any]]) -> list[ValidationCheck]:
    checks: list[ValidationCheck] = []
    visible = public_spec(spec).get("blocks") or []
    if visible:
        checks.append(
            _check(
                "blocks_present",
                "pass",
                f"Learners will see {_plural(len(visible), 'block')}.",
                detail={"blocks": len(blocks), "visible_blocks": len(visible)},
            )
        )
    elif blocks:
        checks.append(
            _check(
                "blocks_present",
                "fail",
                "Learners would see nothing: unapproved quizzes and widgets are hidden. "
                "Approve at least one question or add another block.",
                detail={"blocks": len(blocks), "visible_blocks": 0},
            )
        )
    else:
        checks.append(
            _check(
                "blocks_present",
                "fail",
                "Add at least one interactive block before publishing.",
                detail={"blocks": 0, "visible_blocks": 0},
            )
        )

    missing = [s for s in lab.sources if s.contains_people and not s.consent_confirmed]
    if missing:
        checks.append(
            _check(
                "consent",
                "fail",
                f"Confirm consent for {_plural(len(missing), 'photo or video', 'photos or videos')} "
                "showing students before sharing.",
                detail={"source_ids": [s.id for s in missing], "titles": [s.title for s in missing]},
            )
        )
    else:
        with_people = sum(1 for s in lab.sources if s.contains_people)
        checks.append(
            _check(
                "consent",
                "pass",
                "Consent is confirmed for media showing students." if with_people else "No media is marked as showing students.",
                detail={"source_ids": [], "with_people": with_people},
            )
        )

    seen: set[str] = set()
    duplicates: list[str] = []
    for block in blocks:
        bid = str(block.get("id") or "")
        if bid in seen and bid not in duplicates:
            duplicates.append(bid)
        seen.add(bid)
    if duplicates:
        checks.append(
            _check(
                "block_ids_unique",
                "fail",
                f"Several blocks share the id {_join(duplicates)}. Remove or re-create the duplicates.",
                detail={"duplicates": duplicates},
            )
        )
    return checks


# ============================================================================ parameters
def _param_range_issues(block: dict[str, Any]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    seen: set[str] = set()
    for param in _params(block):
        symbol = str(param.get("symbol") or "").strip()
        if not symbol:
            issues.append({"symbol": "", "issue": "empty_symbol", "level": "fail"})
            continue
        if symbol in seen:
            issues.append({"symbol": symbol, "issue": "duplicate_symbol", "level": "fail"})
        seen.add(symbol)
        values = {key: _num(param.get(key)) for key in ("value", "min", "max", "step")}
        bad = [key for key, value in values.items() if value is not None and not math.isfinite(value)]
        if bad:
            issues.append({"symbol": symbol, "issue": "not_finite", "fields": bad, "level": "fail"})
            continue
        lo, hi, value, step = values["min"], values["max"], values["value"], values["step"]
        if lo is not None and hi is not None and lo >= hi:
            issues.append({"symbol": symbol, "issue": "min_not_less_than_max", "min": lo, "max": hi, "level": "fail"})
        elif value is not None and ((lo is not None and value < lo) or (hi is not None and value > hi)):
            issues.append(
                {"symbol": symbol, "issue": "value_out_of_range", "value": value, "min": lo, "max": hi, "level": "fail"}
            )
        if step is not None and step <= 0:
            issues.append({"symbol": symbol, "issue": "step_not_positive", "step": step, "level": "fail"})
    return issues


_ISSUE_TEXT = {
    "empty_symbol": "a parameter has no symbol",
    "duplicate_symbol": "{symbol} is defined twice",
    "not_finite": "{symbol} has a value that is not a number",
    "min_not_less_than_max": "{symbol}: the minimum must be smaller than the maximum",
    "value_out_of_range": "{symbol}: the starting value is outside the slider range",
    "step_not_positive": "{symbol}: the slider step must be greater than 0",
    "x_range": "the x axis minimum must be smaller than the maximum",
    "y_range": "the y axis minimum must be smaller than the maximum",
    "conflicts_with_x": "{symbol} has the same name as the x variable",
    "domain": "{symbol}: the value {problem}",
    "domain_slider": "{symbol}: the slider can reach values the model cannot use ({problem})",
    "missing_input": "the model needs {symbol} — add it as a parameter",
}


def _param_ranges_check(block: dict[str, Any], issues: list[dict[str, Any]]) -> ValidationCheck:
    bid = block.get("id")
    fails = [i for i in issues if i["level"] == "fail"]
    warns = [i for i in issues if i["level"] == "warn"]
    if not issues:
        count = len(_params(block))
        return _check(
            "param_ranges",
            "pass",
            f"{_plural(count, 'parameter')} with valid ranges." if count else "No parameters to check.",
            bid,
            {"issues": []},
        )
    texts = [_ISSUE_TEXT.get(i["issue"], i["issue"]).format(**{"symbol": i.get("symbol", ""), "problem": i.get("problem", "")}) for i in (fails or warns)]
    status = "fail" if fails else "warn"
    lead = "Fix the slider settings" if fails else "Check the slider settings"
    return _check("param_ranges", status, f"{lead} in {_label(block)}: {'; '.join(texts)}.", bid, {"issues": issues})


# ============================================================================ graph
def _linspace(lo: float, hi: float, n: int) -> list[float]:
    if n == 1:
        return [lo]
    step = (hi - lo) / (n - 1)
    return [lo + i * step for i in range(n)]


def _evaluate_series(compiled, env: dict[str, float], x_var: str, xs: list[float]) -> list[float]:
    out: list[float] = []
    scope = dict(env)
    for x in xs:
        scope[x_var] = x
        try:
            out.append(float(compiled.evaluate(scope)))
        except (ExprError, ArithmeticError, ValueError, TypeError, RecursionError):
            out.append(math.nan)
    return out


def _graph_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    checks: list[ValidationCheck] = []
    expression = (block.get("expression") or "").strip()
    x_var = (block.get("x_var") or "x").strip() or "x"
    params = _params(block)
    symbols = [str(p.get("symbol") or "").strip() for p in params]

    # -- ranges (computed first; reported after the formula checks)
    issues = _param_range_issues(block)
    x_min, x_max = _num(block.get("x_min")), _num(block.get("x_max"))
    if x_min is None or x_max is None or not (math.isfinite(x_min) and math.isfinite(x_max)) or x_min >= x_max:
        issues.append({"symbol": x_var, "issue": "x_range", "min": x_min, "max": x_max, "level": "fail"})
    y_min, y_max = _num(block.get("y_min")), _num(block.get("y_max"))
    if y_min is not None and y_max is not None and y_min >= y_max:
        issues.append({"symbol": "y", "issue": "y_range", "min": y_min, "max": y_max, "level": "fail"})
    if x_var in symbols:
        issues.append({"symbol": x_var, "issue": "conflicts_with_x", "level": "fail"})

    # -- expression_parses
    compiled = None
    if not expression:
        checks.append(_check("expression_parses", "fail", f"Add a formula to {_label(block)}.", bid, {"error": "empty"}))
    else:
        try:
            compiled = compile_expr(expression)
            checks.append(_check("expression_parses", "pass", "The formula can be read.", bid, {"expression": expression}))
        except ExprError as exc:
            checks.append(
                _check(
                    "expression_parses",
                    "fail",
                    f"The formula in {_label(block)} cannot be read: {exc}. "
                    "Use * for multiplication and ^ for powers, e.g. a*x^2 + b*x + c.",
                    bid,
                    {"expression": expression, "error": exc.code, "position": exc.position},
                )
            )

    # -- expression_vars
    vars_ok = False
    if compiled is None:
        checks.append(_check("expression_vars", "skip", "Fix the formula first.", bid))
    else:
        known = {s for s in symbols if s} | {x_var}
        unknown = sorted(v for v in compiled.variables if v not in known and v not in CONSTANTS)
        if unknown:
            checks.append(
                _check(
                    "expression_vars",
                    "fail",
                    f"The formula uses {_join(unknown)} but {'it is' if len(unknown) == 1 else 'they are'} "
                    f"not a parameter or the x variable ({x_var}). Add a slider for "
                    f"{'it' if len(unknown) == 1 else 'them'} or correct the formula.",
                    bid,
                    {"unknown": unknown, "x_var": x_var},
                )
            )
        else:
            vars_ok = True
            checks.append(_check("expression_vars", "pass", "Every variable in the formula has a value.", bid, {"unknown": []}))

    checks.append(_param_ranges_check(block, issues))
    ranges_ok = not any(i["level"] == "fail" for i in issues)

    # -- expression_finite & slider_effect
    if not (vars_ok and ranges_ok):
        reason = "Fix the formula first." if not vars_ok else "Fix the slider settings first."
        checks.append(_check("expression_finite", "skip", reason, bid))
        checks.append(_check("slider_effect", "skip", reason, bid))
    else:
        xs = _linspace(x_min, x_max, GRAPH_SAMPLES)
        env = {s: _param_value(p) for s, p in zip(symbols, params) if s}
        configs: list[dict[str, Any]] = [{"param": None, "at": None, "values": env}]
        sliders = [(s, p) for s, p in zip(symbols, params) if s and p.get("role") != "output"]
        for symbol, param in sliders:
            for end in ("min", "max"):
                bound = _num(param.get(end))
                if bound is not None:
                    configs.append({"param": symbol, "at": end, "value": bound, "values": {**env, symbol: bound}})
        results = []
        for config in configs:
            series = _evaluate_series(compiled, config["values"], x_var, xs)
            ratio = sum(1 for y in series if math.isfinite(y)) / len(series)
            results.append({"param": config["param"], "at": config["at"], "value": config.get("value"), "finite_ratio": round(ratio, 3)})
        empty = [r for r in results if r["finite_ratio"] == 0]
        sparse = [r for r in results if 0 < r["finite_ratio"] < 0.5]
        detail = {"samples": GRAPH_SAMPLES, "settings": results}
        if empty:
            first = empty[0]
            where = "with the starting values" if first["param"] is None else f"when {first['param']} = {first['value']:g}"
            checks.append(
                _check(
                    "expression_finite",
                    "fail",
                    f"The graph has no points {where} (the formula gives no real number for x from "
                    f"{x_min:g} to {x_max:g}). Change the x range or the slider limits.",
                    bid,
                    detail,
                )
            )
        elif sparse:
            first = sparse[0]
            where = "with the starting values" if first["param"] is None else f"when {first['param']} = {first['value']:g}"
            checks.append(
                _check(
                    "expression_finite",
                    "warn",
                    f"Most of the graph is missing {where}: the formula has no real value for much of the x range.",
                    bid,
                    detail,
                )
            )
        else:
            checks.append(_check("expression_finite", "pass", "The formula gives numbers across the x range.", bid, detail))

        no_effect: list[str] = []
        for symbol, param in sliders:
            bounds = _slider_bounds(param)
            if bounds is None:
                continue
            low = _evaluate_series(compiled, {**env, symbol: bounds[0]}, x_var, xs)
            high = _evaluate_series(compiled, {**env, symbol: bounds[1]}, x_var, xs)
            if all(_same(a, b) for a, b in zip(low, high)):
                no_effect.append(symbol)
        if no_effect:
            checks.append(
                _check(
                    "slider_effect",
                    "warn",
                    f"Moving {_join(no_effect)} does not change the graph. Check that the formula uses "
                    f"{'this parameter' if len(no_effect) == 1 else 'these parameters'}.",
                    bid,
                    {"no_effect": no_effect},
                )
            )
        else:
            checks.append(
                _check(
                    "slider_effect",
                    "pass",
                    "Every slider changes the graph." if sliders else "No sliders to check.",
                    bid,
                    {"no_effect": []},
                )
            )

    active = _active_check(block, symbols, None)
    if active:
        checks.append(active)
    checks.append(_sources_check(block, ctx))
    return checks


# ============================================================================ simulation
@lru_cache(maxsize=1)
def _builtin_cases() -> dict[str, list[dict[str, Any]]]:
    try:
        data = json.loads(SIM_CASES_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for case in data.get("cases") or []:
        if isinstance(case, dict) and case.get("model") in simulations.MODELS:
            grouped.setdefault(case["model"], []).append(case)
    return grouped


def _run_reference(model: str, case: dict[str, Any]) -> dict[str, Any]:
    inputs = case.get("inputs") or {}
    output = str(case.get("output") or "")
    expected = _num(case.get("expected"))
    tolerance = abs(_num(case.get("tolerance")) or 0.0)
    tolerance = max(tolerance, 1e-12)
    row: dict[str, Any] = {"inputs": inputs, "output": output, "expected": expected, "tolerance": tolerance}
    if expected is None or not math.isfinite(expected):
        return {**row, "ok": False, "error": "missing_expected"}
    try:
        actual = simulations.run_case(model, inputs, output)
    except AppError as exc:
        return {**row, "ok": False, "error": exc.code, "message": exc.message}
    error = simulations.relative_error(actual, expected)
    row.update({"actual": actual, "error_rel": error, "ok": error <= tolerance})
    unused = simulations.unused_inputs(model, inputs)
    if unused:
        row["unused_inputs"] = unused
    return row


def _simulation_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    model = block.get("model") or "pendulum"
    checks: list[ValidationCheck] = []
    try:
        spec = simulations.model_spec(model)
    except AppError:
        return [_check("sim_reference", "fail", f"The simulation model '{model}' is not supported.", bid, {"model": model})]
    params = _params(block)
    by_symbol = {str(p.get("symbol") or "").strip(): p for p in params}

    # -- param_ranges (+ model domains)
    issues = _param_range_issues(block)
    for name, info in spec.inputs.items():
        param = by_symbol.get(name)
        if param is None:
            if info.default is None:
                issues.append({"symbol": name, "issue": "missing_input", "level": "warn"})
            continue
        value = _param_value(param)
        problem = info.problem(value)
        if problem and math.isfinite(value):
            issues.append({"symbol": name, "issue": "domain", "value": value, "problem": problem, "level": "fail"})
            continue
        for end in ("min", "max"):
            bound = _num(param.get(end))
            if bound is not None and math.isfinite(bound):
                slider_problem = info.problem(bound)
                if slider_problem:
                    issues.append(
                        {"symbol": name, "issue": "domain_slider", end: bound, "problem": slider_problem, "level": "warn"}
                    )
                    break
    checks.append(_param_ranges_check(block, issues))

    # -- units_consistent
    mismatches: list[dict[str, Any]] = []
    for name, (display, accepted) in EXPECTED_UNITS.get(model, {}).items():
        param = by_symbol.get(name)
        if param is None:
            continue
        unit = str(param.get("unit") or "")
        norm = _norm_unit(unit)
        ok = norm.startswith(_PERCENT) if accepted == _PERCENT else (norm in accepted)
        if not ok:
            mismatches.append({"symbol": name, "unit": unit, "expected": display})
    if mismatches:
        parts = [
            f"{m['symbol']} has no unit (the model uses {m['expected']})"
            if not m["unit"].strip()
            else f"{m['symbol']} is in {m['unit']} but the model uses {m['expected']}"
            for m in mismatches
        ]
        checks.append(
            _check(
                "units_consistent",
                "warn",
                f"Check the units in {_label(block)}: {'; '.join(parts)}. Convert the values or fix the unit.",
                bid,
                {"mismatches": mismatches, "model": model},
            )
        )
    elif EXPECTED_UNITS.get(model):
        checks.append(_check("units_consistent", "pass", "Units match the model.", bid, {"mismatches": [], "model": model}))

    # -- sim_reference
    block_rows = [_run_reference(model, c) for c in block.get("reference_cases") or [] if isinstance(c, dict)]
    builtin_rows = [_run_reference(model, c) for c in _builtin_cases().get(model, [])]
    failed = [r for r in block_rows if not r["ok"]]
    builtin_failed = [r for r in builtin_rows if not r["ok"]]
    detail = {
        "model": model,
        "cases": block_rows,
        "builtin_cases": len(builtin_rows),
        "builtin_failed": builtin_failed,
        "failed": len(failed) + len(builtin_failed),
    }
    if failed or builtin_failed:
        row = (failed or builtin_failed)[0]
        if row.get("error") and row.get("error") != "missing_expected":
            why = row.get("message") or row["error"]
        elif row.get("error") == "missing_expected":
            why = "the expected value is missing"
        else:
            why = f"expected {row['expected']:g}, the model gives {row['actual']:.6g}"
        origin = "reference case" if failed else "built-in reference case"
        checks.append(
            _check(
                "sim_reference",
                "fail",
                f"A {origin} for {row['output'] or 'the output'} does not match ({why}). "
                "Check the inputs, units and expected value.",
                bid,
                detail,
            )
        )
    elif block_rows:
        checks.append(
            _check(
                "sim_reference",
                "pass",
                f"{_plural(len(block_rows), 'reference case')} {'matches' if len(block_rows) == 1 else 'match'} the model"
                + (f" (plus {len(builtin_rows)} built-in cases)." if builtin_rows else "."),
                bid,
                detail,
            )
        )
    else:
        checks.append(
            _check(
                "sim_reference",
                "pass",
                f"The {model.replace('_', ' ')} model passes {_plural(len(builtin_rows), 'built-in reference case')}. "
                "Add a case from your textbook to check this lab too.",
                bid,
                detail,
            )
        )

    # -- slider_effect
    base = {name: _param_value(p) for name, p in by_symbol.items() if name}
    try:
        base_outputs = simulations.simulate(model, base)
    except AppError:
        base_outputs = None
    if base_outputs is None:
        checks.append(_check("slider_effect", "skip", "Fix the parameter values first.", bid))
    else:
        no_effect: list[str] = []
        not_input: list[str] = []
        sliders = [(s, p) for s, p in by_symbol.items() if s and p.get("role") != "output"]
        for symbol, param in sliders:
            if symbol not in spec.inputs:
                not_input.append(symbol)
                continue
            bounds = _slider_bounds(param)
            if bounds is None:
                continue
            try:
                low = simulations.simulate(model, {**base, symbol: bounds[0]})
                high = simulations.simulate(model, {**base, symbol: bounds[1]})
            except AppError:
                continue  # an invalid end of the slider is reported by param_ranges
            if all(_same(low[k], high[k]) for k in spec.outputs):
                no_effect.append(symbol)
        quiet = no_effect + not_input
        if quiet:
            checks.append(
                _check(
                    "slider_effect",
                    "warn",
                    f"Moving {_join(quiet)} does not change any result of the {model.replace('_', ' ')} model. "
                    "This can be intended (for example to show that mass does not change a pendulum's period).",
                    bid,
                    {"no_effect": quiet, "not_model_inputs": not_input},
                )
            )
        else:
            checks.append(
                _check(
                    "slider_effect",
                    "pass",
                    "Every slider changes the simulation." if sliders else "No sliders to check.",
                    bid,
                    {"no_effect": []},
                )
            )

    asset_id = block.get("object_asset_id")
    if asset_id:
        if asset_id in ctx.assets:
            checks.append(_check("media_available", "pass", "The object picture is available.", bid, {"asset_id": asset_id}))
        else:
            checks.append(
                _check(
                    "media_available",
                    "warn",
                    "The cut-out picture of the object was deleted; a simple shape will be drawn instead.",
                    bid,
                    {"asset_id": asset_id, "issue": "asset_missing"},
                )
            )

    active = _active_check(block, list(by_symbol), spec)
    if active:
        checks.append(active)
    checks.append(_sources_check(block, ctx))
    return checks


# ============================================================================ active learning
def _active_check(block: dict[str, Any], symbols: list[str], spec: simulations.ModelSpec | None) -> ValidationCheck | None:
    active = block.get("active")
    if not isinstance(active, dict) or not active.get("enabled", True):
        return None
    bid = block.get("id")
    problems: list[str] = []
    issues: list[str] = []
    if not (active.get("question") or "").strip():
        issues.append("no_question")
        problems.append("the prediction question is empty")
    param = (active.get("param") or "").strip()
    if param and param not in symbols:
        issues.append("unknown_param")
        problems.append(f"{param} is not one of the sliders")
    elif param:
        source = next((p for p in _params(block) if str(p.get("symbol") or "").strip() == param), {})
        lo, hi = _num(source.get("min")), _num(source.get("max"))
        for key in ("from_value", "to_value"):
            value = _num(active.get(key))
            if value is not None and ((lo is not None and value < lo) or (hi is not None and value > hi)):
                issues.append(f"{key}_out_of_range")
                problems.append(f"the value {value:g} is outside the slider range of {param}")
                break
    observe = (active.get("observe") or "").strip()
    if spec is not None and observe and observe not in spec.outputs:
        issues.append("unknown_output")
        problems.append(f"'{observe}' is not a result of this model (use {_join(sorted(spec.outputs))})")
    options = active.get("options") or []
    correct = active.get("correct_option")
    if options and (not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct < len(options)):
        issues.append("correct_option_out_of_range")
        problems.append("no correct answer is selected among the options")
    if problems:
        return _check(
            "active_learning",
            "warn",
            f"Check the “predict then test” activity: {'; '.join(problems)}.",
            bid,
            {"issues": issues},
        )
    return _check("active_learning", "pass", "The “predict then test” activity is ready.", bid, {"issues": []})


# ============================================================================ quiz
def _question_issues(q: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    kind = q.get("kind") or "mcq"
    options = q.get("options") or []
    if not (q.get("prompt") or "").strip():
        issues.append("empty_prompt")
    index = q.get("answer_index")
    index_ok = isinstance(index, int) and not isinstance(index, bool)
    if kind == "mcq":
        if len(options) < 2:
            issues.append("too_few_options")
        if any(not str(o).strip() for o in options):
            issues.append("empty_option")
        if not index_ok or not 0 <= index < len(options):
            issues.append("answer_out_of_range")
    elif kind == "truefalse":
        if not index_ok or index not in (0, 1):
            issues.append("answer_out_of_range")
        if options and len(options) != 2:
            issues.append("truefalse_options")
    elif kind == "order":
        order = q.get("answer_order")
        if len(options) < 2:
            issues.append("too_few_options")
        ints = isinstance(order, list) and all(isinstance(i, int) and not isinstance(i, bool) for i in order)
        if not ints or sorted(order) != list(range(len(options))):
            issues.append("order_not_permutation")
    elif kind == "numeric":
        value = _num(q.get("answer_value"))
        if value is None or not math.isfinite(value):
            issues.append("missing_value")
        tolerance = q.get("tolerance")
        if tolerance is not None and (_num(tolerance) is None or not math.isfinite(_num(tolerance)) or _num(tolerance) < 0):
            issues.append("bad_tolerance")
    else:
        issues.append("unknown_kind")
    return issues


_QUESTION_TEXT = {
    "empty_prompt": "the question text is empty",
    "too_few_options": "it needs at least two options",
    "empty_option": "an option is empty",
    "answer_out_of_range": "no valid correct answer is selected",
    "truefalse_options": "a true/false question needs exactly two options",
    "order_not_permutation": "the correct order must use every option exactly once",
    "missing_value": "the correct number is missing",
    "bad_tolerance": "the tolerance must be 0 or more",
    "unknown_kind": "the question type is not supported",
    "duplicate_id": "two questions share the same id",
}


def _quiz_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    questions = [q for q in block.get("questions") or [] if isinstance(q, dict)]
    approved = [q for q in questions if q.get("approved")]
    problems: list[dict[str, Any]] = []
    seen: set[str] = set()
    for q in approved:  # learners only receive approved questions; ids must identify them
        qid = str(q.get("id") or "")
        if qid in seen:
            problems.append({"question_id": qid, "issues": ["duplicate_id"]})
        seen.add(qid)
    for position, q in enumerate(approved, start=1):
        issues = _question_issues(q)
        if issues:
            problems.append({"question_id": q.get("id"), "number": position, "issues": issues})
    detail = {"approved": len(approved), "total": len(questions), "problems": problems}
    checks: list[ValidationCheck] = []
    if problems:
        first = problems[0]
        where = f"Question {first['number']}" if first.get("number") else "A question"
        texts = [_QUESTION_TEXT.get(i, i) for i in first["issues"]]
        more = f" ({len(problems) - 1} more question{'s' if len(problems) > 2 else ''} need attention.)" if len(problems) > 1 else ""
        checks.append(
            _check(
                "quiz_answers",
                "fail",
                f"{where} in {_label(block)} is approved but {'; '.join(texts)}. Fix it or remove the approval.{more}",
                bid,
                detail,
            )
        )
    elif not approved:
        checks.append(
            _check(
                "quiz_answers",
                "warn",
                f"No question in {_label(block)} is approved yet, so learners will not see this quiz.",
                bid,
                detail,
            )
        )
    else:
        pending = len(questions) - len(approved)
        tail = f" {_plural(pending, 'question')} waiting for approval stay hidden." if pending else ""
        checks.append(
            _check("quiz_answers", "pass", f"{_plural(len(approved), 'approved question')} ready.{tail}", bid, detail)
        )
    checks.append(_sources_check(block, ctx))
    return checks


# ============================================================================ media
def _image_status(ctx: _Ctx, image: dict[str, Any] | None) -> tuple[str, str]:
    """('ok'|'none'|'missing'|'processing'|'failed'|'bad_page', kind of reference)."""
    image = image or {}
    asset_id, source_id = image.get("asset_id"), image.get("source_id")
    if asset_id:
        return ("ok" if asset_id in ctx.assets else "missing"), "asset"
    if source_id:
        src = ctx.sources.get(source_id)
        if src is None:
            return "missing", "source"
        if src.status == "processing":
            return "processing", "source"
        if src.status != "ready":
            return "failed", "source"
        page = image.get("page")
        if src.kind == "pdf" and page is not None and src.page_count and not 1 <= int(page) <= src.page_count:
            return "bad_page", "source"
        return "ok", "source"
    return "none", ""


def _diagram_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    status, _kind = _image_status(ctx, block.get("image"))
    messages = {
        "ok": ("pass", "The diagram picture is available."),
        "none": ("fail", f"Choose a picture or PDF page for {_label(block)}."),
        "missing": ("fail", f"The picture used by {_label(block)} was deleted. Choose another picture."),
        "processing": ("fail", "The picture is still being processed. Try again in a moment."),
        "failed": ("fail", f"The picture used by {_label(block)} could not be processed. Upload it again."),
        "bad_page": ("fail", f"{_label(block).capitalize()} points to a page that is not in the PDF."),
    }
    level, message = messages[status]
    checks = [_check("media_available", level, message, bid, {"issue": status})]
    checks.append(_sources_check(block, ctx))
    return checks


def _board_line_visible(item: dict[str, Any]) -> bool:
    """Mirrors services/board.is_visible: not crossed out and with something to show."""
    if item.get("struck"):
        return False
    if item.get("kind") == "diagram":
        return bool(str(item.get("text") or "").strip() or any(str(x).strip() for x in item.get("labels") or []))
    return bool(str(item.get("text") or "").strip() or str(item.get("latex") or "").strip())


def _board_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    status, _kind = _image_status(ctx, block.get("image"))
    messages = {
        "ok": ("pass", "The photo of the handwriting is available."),
        "none": ("fail", f"Choose a photo or PDF page for {_label(block)}."),
        "missing": ("fail", f"The photo used by {_label(block)} was deleted. Choose another photo."),
        "processing": ("fail", "The photo is still being processed. Try again in a moment."),
        "failed": ("fail", f"The photo used by {_label(block)} could not be processed. Upload it again."),
        "bad_page": ("fail", f"{_label(block).capitalize()} points to a page that is not in the PDF."),
    }
    level, message = messages[status]
    checks = [_check("media_available", level, message, bid, {"issue": status})]

    items = [i for i in block.get("items") or [] if isinstance(i, dict)]
    visible = [i for i in items if _board_line_visible(i)]
    unsure = sum(len([w for w in i.get("uncertain") or [] if str(w).strip()]) for i in visible)
    if not items:
        checks.append(_check("board_text", "fail", f"Read the handwriting in {_label(block)} before publishing.", bid,
                             {"issue": "not_read", "items": 0}))
    elif not visible:
        checks.append(_check("board_text", "fail", f"Every line of {_label(block)} is empty or crossed out. Keep at least one line.",
                             bid, {"issue": "no_visible_item", "items": 0}))
    elif unsure:
        checks.append(_check(
            "board_text", "warn",
            f"{_plural(unsure, 'word')} in {_label(block)} {'is' if unsure == 1 else 'are'} still marked as unsure. "
            "Compare them with the photo and correct or confirm them.",
            bid, {"issue": "uncertain", "uncertain": unsure, "items": len(visible)},
        ))
    else:
        checks.append(_check("board_text", "pass", "No word of the transcription is marked as unsure.", bid,
                             {"uncertain": 0, "items": len(visible)}))

    visual = block.get("visual")
    proof = block.get("visual_proof") if isinstance(block.get("visual_proof"), dict) else {}
    visual_status = _image_status(ctx, visual)[0] if isinstance(visual, dict) else "none"
    if visual_status == "none":
        checks.append(_check("board_visual", "warn", f"{_label(block).capitalize()} has no clean redrawn sheet yet: learners get the Text view.",
                             bid, {"issue": "none"}))
    elif visual_status != "ok":
        checks.append(_check("board_visual", "warn", f"The clean sheet of {_label(block)} is not available any more: learners get "
                             "the Text view. Draw it again.", bid, {"issue": "missing"}))
    elif not proof.get("checked"):
        checks.append(_check("board_visual", "warn", f"The words on the clean sheet of {_label(block)} were not checked against the "
                             "transcription. Compare it with the Text view.", bid, {"issue": "unchecked"}))
    elif not proof.get("ok"):
        count = sum(len(proof.get(key) or []) for key in ("differences", "missing", "extra"))
        checks.append(_check(
            "board_visual", "warn",
            f"The clean sheet of {_label(block)} differs from the transcription in {_plural(max(1, count), 'place')}. "
            "Redraw it, or let learners see the Text view first.",
            bid, {"issue": "differences", "count": count},
        ))
    else:
        checks.append(_check("board_visual", "pass", "The clean sheet matches the transcription.", bid, {"count": 0}))
    checks.append(_sources_check(block, ctx))
    return checks


def _video_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    checks: list[ValidationCheck] = []
    source_id = block.get("source_id")
    src = ctx.sources.get(source_id) if source_id else None
    if not source_id:
        checks.append(_check("media_available", "fail", f"Choose a video for {_label(block)}.", bid, {"issue": "none"}))
    elif src is None or src.kind != "video":
        checks.append(
            _check(
                "media_available",
                "fail",
                f"The video used by {_label(block)} was deleted. Choose another video.",
                bid,
                {"issue": "missing", "source_id": source_id},
            )
        )
    elif src.status == "processing":
        checks.append(
            _check(
                "media_available",
                "fail",
                "The video is still being prepared for the web. Publish when it is ready.",
                bid,
                {"issue": "processing", "source_id": source_id},
            )
        )
    elif src.status != "ready":
        checks.append(
            _check(
                "media_available",
                "fail",
                "The video could not be processed. Upload a shorter MP4, MOV or WebM file.",
                bid,
                {"issue": "failed", "source_id": source_id, "error_code": src.error_code},
            )
        )
    else:
        compare = block.get("compare")
        compare_status = _image_status(ctx, compare)[0] if isinstance(compare, dict) else "none"
        if compare_status not in ("ok", "none"):
            checks.append(
                _check(
                    "media_available",
                    "warn",
                    "The video is ready, but the page shown next to it is not available any more.",
                    bid,
                    {"issue": f"compare_{compare_status}", "source_id": source_id},
                )
            )
        else:
            checks.append(_check("media_available", "pass", "The video is ready.", bid, {"source_id": source_id}))

    markers = [m for m in block.get("markers") or [] if isinstance(m, dict)]
    waiting = [m for m in markers if m.get("ai_suggested") and not m.get("confirmed")]
    if waiting:
        checks.append(
            _check(
                "markers_confirmed",
                "warn",
                f"{_plural(len(waiting), 'AI-suggested moment')} {'is' if len(waiting) == 1 else 'are'} not confirmed "
                "and will be hidden from learners. Watch them and confirm the ones that are right.",
                bid,
                {"unconfirmed": len(waiting), "markers": len(markers)},
            )
        )
    else:
        checks.append(
            _check(
                "markers_confirmed",
                "pass",
                "All video moments are confirmed." if markers else "No video moments to confirm.",
                bid,
                {"unconfirmed": 0, "markers": len(markers)},
            )
        )
    return checks


# ============================================================================ other blocks
def _steps_checks(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    bid = block.get("id")
    if block.get("ai_generated") and not block.get("sequence_confirmed"):
        sequence = _check(
            "sequence_confirmed",
            "warn",
            f"The order of the steps in {_label(block)} was proposed by AI. Check it and mark it as confirmed; "
            "until then learners see a note that the order is not confirmed.",
            bid,
            {"ai_generated": True},
        )
    else:
        sequence = _check(
            "sequence_confirmed",
            "pass",
            "The order of the steps is confirmed.",
            bid,
            {"ai_generated": bool(block.get("ai_generated"))},
        )
    return [sequence, _sources_check(block, ctx)]


def _widget_checks(block: dict[str, Any], _ctx: _Ctx) -> list[ValidationCheck]:
    from .widgets import passes_checks  # local import: widgets → analysis → labs

    bid = block.get("id")
    status, approved = block.get("status") or "draft", bool(block.get("approved"))
    if status == "validated" and not passes_checks(block.get("html")):
        status = "failed"  # the stored status is the editor's claim: the server checks the HTML again
    if status == "validated" and approved:
        return [_check("widget_status", "pass", "The interactive widget passed the safety check and is approved.", bid, {"status": status, "approved": True})]
    if status == "failed":
        message = "The interactive widget failed the safety check and will be hidden. Repair it or remove it."
    elif status != "validated":
        message = "The interactive widget has not passed the safety check yet and will be hidden from learners."
    else:
        message = "The interactive widget is waiting for your approval and will be hidden until you approve it."
    return [_check("widget_status", "warn", message, bid, {"status": status, "approved": approved})]


def _cited_only(block: dict[str, Any], ctx: _Ctx) -> list[ValidationCheck]:
    return [_sources_check(block, ctx)]


# ============================================================================ sources_cited
def _has_refs(item: dict[str, Any]) -> bool:
    return bool(item.get("source_refs")) or bool(item.get("source_ref")) or bool(item.get("highlight"))


def _sources_check(block: dict[str, Any], ctx: _Ctx) -> ValidationCheck:
    bid = block.get("id")
    kind = block.get("type")
    block_cited = bool(block.get("source_refs"))
    uncited: list[str] = []
    message = ""
    if kind == "steps":
        if not block_cited:
            uncited = [str(s.get("id")) for s in block.get("steps") or [] if isinstance(s, dict) and not _has_refs(s)]
            total = len(block.get("steps") or [])
            if uncited:
                message = f"{len(uncited)} of {_plural(total, 'step')} in {_label(block)} have no source reference."
    elif kind in ("graph", "simulation"):
        if not block_cited:
            uncited = [
                str(p.get("symbol"))
                for p in _params(block)
                if p.get("role") != "output" and p.get("provenance", "unknown") == "unknown" and not p.get("source_ref")
            ]
            if uncited:
                message = (
                    f"Where {'does' if len(uncited) == 1 else 'do'} {_join(uncited)} come from? Mark each value as "
                    "from the document, entered by a user or an assumption."
                )
    elif kind == "flow":
        items = [n for n in block.get("nodes") or [] if isinstance(n, dict)] + [
            e for e in block.get("edges") or [] if isinstance(e, dict)
        ]
        if not block_cited and items and not any(_has_refs(i) for i in items):
            uncited = [str(block.get("id"))]
            message = f"{_label(block).capitalize()} does not cite any page or picture of your sources."
    elif kind == "diagram":
        image = block.get("image") or {}
        hotspots = [h for h in block.get("hotspots") or [] if isinstance(h, dict)]
        if not block_cited and not image.get("source_id") and not any(_has_refs(h) for h in hotspots):
            uncited = [str(block.get("id"))]
            message = f"{_label(block).capitalize()} does not cite any source."
    elif kind == "quiz":
        approved = [q for q in block.get("questions") or [] if isinstance(q, dict) and q.get("approved")]
        if not block_cited and approved and not any(_has_refs(q) for q in approved):
            uncited = [str(block.get("id"))]
            message = "No question explanation cites a page of your sources."
    elif kind == "algorithm":
        if not block_cited:
            uncited = [str(block.get("id"))]
            message = f"{_label(block).capitalize()} does not cite the part of the paper it illustrates."

    missing = sorted({r.get("source_id") for r in _iter_refs(block) if r.get("source_id") and r.get("source_id") not in ctx.sources})
    if missing:
        extra = f"{_plural(len(missing), 'citation')} point{'s' if len(missing) == 1 else ''} to a source that was removed."
        message = f"{message} {extra}".strip()
    detail = {"uncited": uncited, "missing_sources": missing}
    if uncited or missing:
        return _check("sources_cited", "warn", message, bid, detail)
    return _check("sources_cited", "pass", "Content is linked to its sources.", bid, detail)


BLOCK_CHECKS = {
    "graph": _graph_checks,
    "simulation": _simulation_checks,
    "quiz": _quiz_checks,
    "steps": _steps_checks,
    "flow": _cited_only,
    "diagram": _diagram_checks,
    "algorithm": _cited_only,
    "video": _video_checks,
    "widget": _widget_checks,
    "board": _board_checks,
}


# ============================================================================ entry point
def validate_lab(db: Session, lab: Lab) -> ValidationReport:
    """Run every check on the lab's current (draft) spec. ``db`` is unused but kept for
    symmetry with other services (sources/assets are read through ``lab``)."""
    spec = lab.spec_json or {}
    blocks = [b for b in spec.get("blocks") or [] if isinstance(b, dict)]
    ctx = _Ctx(lab)
    checks = _lab_checks(lab, spec, blocks)
    for block in blocks:
        handler = BLOCK_CHECKS.get(block.get("type"))
        if handler is None:
            continue
        try:
            checks.extend(handler(block, ctx))
        except Exception as exc:  # a malformed block must never crash publishing  # pragma: no cover
            checks.append(
                _check(
                    "block_valid",
                    "fail",
                    f"{_label(block).capitalize()} could not be checked. Open it in the editor and save it again.",
                    block.get("id"),
                    {"error": type(exc).__name__},
                )
            )
    return ValidationReport(ok=all(c.status != "fail" for c in checks), checked_at=utcnow(), checks=checks)
