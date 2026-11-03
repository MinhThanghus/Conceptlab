from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.services.expr import ExprError, compile_expr, evaluate, unknown_variables

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "expr_cases.json").read_text(encoding="utf-8")
)["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["expr"] or "<empty>" for c in CASES])
def test_shared_vectors(case):
    if "error" in case:
        with pytest.raises(ExprError) as info:
            evaluate(case["expr"], case["vars"])
        assert info.value.code == case["error"]
        return
    value = evaluate(case["expr"], case["vars"])
    expected = case["expected"]
    if expected == "nan":
        assert math.isnan(value)
    elif expected == "inf":
        assert value == math.inf
    elif expected == "-inf":
        assert value == -math.inf
    else:
        assert math.isclose(value, expected, rel_tol=1e-12, abs_tol=1e-12)


def test_free_variables_and_unknowns():
    compiled = compile_expr("a*x^2 + b*x + c + pi")
    assert compiled.variables == {"a", "b", "c", "x", "pi"}
    assert unknown_variables("a*x^2 + b*x + c + pi", {"a", "b", "x"}) == {"c"}


def test_no_python_eval_escape():
    for src in ["__import__('os')", "().__class__", "x.y", "lambda: 1", "[1]"]:
        with pytest.raises(ExprError):
            evaluate(src, {"x": 1})
