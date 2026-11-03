"""Reference simulation engine (services/simulations.py) against shared/sim_cases.json."""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from app.errors import AppError
from app.services import simulations as sim

CASES_FILE = Path(__file__).resolve().parents[2] / "shared" / "sim_cases.json"
DOC = json.loads(CASES_FILE.read_text(encoding="utf-8"))
CASES = DOC["cases"]
INPUT_NAMES = {"L", "g", "theta0", "b", "v0", "angle", "h0", "P", "r", "n", "t", "k", "m"}


def _case_id(case: dict) -> str:
    inputs = ",".join(f"{k}={v}" for k, v in case["inputs"].items())
    return f"{case['model']}.{case['output']}({inputs})"


@pytest.mark.parametrize("case", CASES, ids=[_case_id(c) for c in CASES])
def test_shared_reference_cases(case):
    actual = sim.run_case(case["model"], case["inputs"], case["output"])
    assert sim.relative_error(actual, case["expected"]) <= case["tolerance"], (actual, case)


def test_case_file_shape_and_required_examples():
    assert isinstance(DOC["description"], str) and DOC["description"]
    assert len(CASES) >= 16
    for case in CASES:
        assert set(case) >= {"model", "inputs", "output", "expected", "tolerance"}
        assert case["model"] in sim.MODELS
        assert case["output"] in sim.MODELS[case["model"]].outputs
        assert set(case["inputs"]) <= INPUT_NAMES
        assert set(case["inputs"]) <= set(sim.MODELS[case["model"]].inputs)
        assert case["tolerance"] > 0 and math.isfinite(case["expected"])

    def find(model, output, **inputs):
        for case in CASES:
            if case["model"] == model and case["output"] == output and case["inputs"] == inputs:
                return case["expected"]
        raise AssertionError(f"missing case {model} {output} {inputs}")

    # The numbers quoted by the product spec (§6.3) and the build plan.
    assert find("pendulum", "period", L=1, g=9.81) == pytest.approx(2.0060666807, abs=1e-9)
    assert find("pendulum", "period", L=0.25, g=9.81) == pytest.approx(1.0030333404, abs=1e-9)
    assert find("pendulum", "period_numeric", L=1, g=9.81, theta0=60) == pytest.approx(2.1529, abs=1e-4)
    assert find("projectile", "range", v0=20, angle=45, g=9.81, h0=0) == pytest.approx(40.7747197, abs=1e-6)
    assert find("projectile", "max_height", v0=20, angle=45, g=9.81, h0=0) == pytest.approx(10.1936799, abs=1e-6)
    assert find("projectile", "flight_time", v0=20, angle=45, g=9.81, h0=0) == pytest.approx(2.8832, abs=1e-4)
    find("projectile", "range", v0=20, angle=45, g=9.81, h0=10)
    assert find("compound_interest", "amount", P=1000, r=5, n=12, t=10) == pytest.approx(1647.0094977, abs=1e-6)
    assert find("compound_interest", "amount", P=1000, r=5, n=1, t=10) == pytest.approx(1628.8946268, abs=1e-6)
    assert find("spring_mass", "period", k=100, m=1) == pytest.approx(0.6283185, abs=1e-7)


@pytest.mark.parametrize("theta0", [1, 5, 15, 30, 45, 60, 90, 120, 150, 170])
def test_pendulum_rk4_matches_exact_elliptic_period(theta0):
    numeric = sim.pendulum_numeric_period(1.0, 9.81, theta0)
    exact = sim.pendulum_exact_period(1.0, 9.81, theta0)
    assert numeric == pytest.approx(exact, rel=1e-8)
    assert numeric > 2 * math.pi * math.sqrt(1 / 9.81)  # larger swings take longer


def test_pendulum_limits_and_damping():
    small = 2 * math.pi * math.sqrt(0.5 / 9.81)
    assert sim.pendulum_numeric_period(0.5, 9.81, 0) == pytest.approx(small)
    assert sim.pendulum_numeric_period(0.5, 9.81, -20) == pytest.approx(sim.pendulum_numeric_period(0.5, 9.81, 20))
    undamped = sim.pendulum_numeric_period(1, 9.81, 10)
    damped = sim.pendulum_numeric_period(1, 9.81, 10, b=1.0)
    assert damped > undamped
    # Linear theory for the damped oscillator: T = 2π / √(g/L − b²/4)
    assert sim.pendulum_numeric_period(1, 9.81, 0.5, b=2.0) == pytest.approx(2 * math.pi / math.sqrt(9.81 - 1), rel=1e-4)
    # Over-damped: it never swings through the bottom.
    assert math.isnan(sim.pendulum_numeric_period(1, 9.81, 30, b=20.0))
    outputs = sim.pendulum(1, 9.81)
    assert outputs["frequency"] == pytest.approx(1 / outputs["period"])


def test_projectile_edge_cases():
    flat = sim.projectile(10, 0, 9.81, 0)
    assert flat == {"flight_time": 0.0, "range": 0.0, "max_height": 0.0}
    down = sim.projectile(5, -30, 9.81, 20)
    assert down["max_height"] == pytest.approx(20)  # thrown downwards: never above the launch point
    assert down["flight_time"] > 0 and down["range"] > 0
    straight_up = sim.projectile(10, 90, 9.81, 0)
    assert straight_up["range"] == pytest.approx(0, abs=1e-12)
    assert straight_up["max_height"] == pytest.approx(100 / (2 * 9.81))


def test_compound_interest_and_spring():
    assert sim.compound_interest(500, 0, 12, 7)["amount"] == pytest.approx(500)
    out = sim.compound_interest(1000, 10, 1, 2)
    assert out["amount"] == pytest.approx(1210) and out["interest"] == pytest.approx(210)
    assert out["simple_amount"] == pytest.approx(1200)
    spring = sim.spring_mass(4, 1)
    assert spring["angular_frequency"] == pytest.approx(2)
    assert spring["period"] == pytest.approx(math.pi)
    assert spring["frequency"] * spring["period"] == pytest.approx(1)


def test_defaults_are_applied():
    assert sim.run_case("pendulum", {"L": 1}, "period") == pytest.approx(2.0060666807, abs=1e-9)
    assert sim.run_case("projectile", {"v0": 20, "angle": 45}, "range") == pytest.approx(40.7747197, abs=1e-6)
    assert sim.run_case("compound_interest", {"P": 1000, "r": 5, "t": 10}, "amount") == pytest.approx(1628.8946268, abs=1e-6)


@pytest.mark.parametrize(
    ("model", "inputs", "output", "code"),
    [
        ("rocket", {}, "period", "sim_unknown_model"),
        ("pendulum", {"L": 1}, "speed", "sim_unknown_output"),
        ("pendulum", {"g": 9.81}, "period", "sim_missing_input"),
        ("spring_mass", {"k": 10}, "period", "sim_missing_input"),
        ("pendulum", {"L": 0}, "period", "sim_invalid_input"),
        ("pendulum", {"L": -1}, "period", "sim_invalid_input"),
        ("pendulum", {"L": 1, "g": 0}, "period", "sim_invalid_input"),
        ("pendulum", {"L": 1, "theta0": 180}, "period_numeric", "sim_invalid_input"),
        ("pendulum", {"L": 1, "b": -0.1}, "period_numeric", "sim_invalid_input"),
        ("projectile", {"v0": -1, "angle": 30}, "range", "sim_invalid_input"),
        ("projectile", {"v0": 10, "angle": 95}, "range", "sim_invalid_input"),
        ("projectile", {"v0": 10, "angle": 30, "h0": -2}, "range", "sim_invalid_input"),
        ("compound_interest", {"P": 100, "r": 5, "n": 0, "t": 1}, "amount", "sim_invalid_input"),
        ("compound_interest", {"P": 100, "r": -100, "t": 1}, "amount", "sim_invalid_input"),
        ("spring_mass", {"k": 0, "m": 1}, "period", "sim_invalid_input"),
        ("spring_mass", {"k": 10, "m": True}, "period", "sim_invalid_input"),
        ("spring_mass", {"k": 10, "m": "heavy"}, "period", "sim_invalid_input"),
        ("spring_mass", {"k": float("inf"), "m": 1}, "period", "sim_invalid_input"),
    ],
)
def test_errors_are_app_errors_with_stable_codes(model, inputs, output, code):
    with pytest.raises(AppError) as info:
        sim.run_case(model, inputs, output)
    assert info.value.code == code and info.value.status == 422


def test_unused_inputs_report_typos():
    assert sim.unused_inputs("pendulum", {"L": 1, "G": 9.8, "m": 0.2}) == ["G", "m"]
    assert sim.unused_inputs("spring_mass", {"k": 1, "m": 1}) == []


def test_relative_error():
    assert sim.relative_error(1.01, 1.0) == pytest.approx(0.01)
    assert sim.relative_error(1e-6, 0) == pytest.approx(1e-6)
    assert sim.relative_error(float("nan"), 1) == math.inf
