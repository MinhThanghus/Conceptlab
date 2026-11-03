"""Reference implementations of the supported simulation models (spec §5.4, §6.3, §9.5, §11).

These are the "tested computation engine" behind every ``simulation`` block: pure
functions, no I/O, no randomness. Validation (``services/validation.py``) runs reference
cases through :func:`run_case`, and the frontend mirrors the same formulas in JavaScript
(``frontend/src/features/sim``). Both implementations are tested against the shared
vectors in ``shared/sim_cases.json`` (same model, input and output names).

Input names, units and domains (defaults in brackets):

``pendulum``
    ``L`` length (m) > 0 · ``g`` (m/s²) > 0 [9.81] · ``theta0`` release angle (degrees,
    |θ0| < 180) [10] · ``b`` linear damping coefficient (1/s) ≥ 0 [0]

    * ``period`` = 2π·√(L/g) — ideal small-angle period (s), the textbook formula.
    * ``frequency`` = 1 / period (Hz).
    * ``period_numeric`` (s): RK4 integration of θ'' = −(g/L)·sin θ − b·θ' from
      θ(0) = θ0, θ'(0) = 0 with a fixed step dt = T0/4000 (T0 = small-angle period);
      the period is the time between the first two *downward* zero crossings of θ
      (θ goes from + to −), located by linear interpolation inside the step. It grows
      with the amplitude (≈ 2.1529 s for L = 1 m, g = 9.81 m/s², θ0 = 60°) and with
      damping. θ0 = 0 returns the small-angle period (the limit); when the motion never
      crosses zero (over-damped) the result is NaN.

``projectile`` (no air resistance, launch from height ``h0`` above flat ground)
    ``v0`` launch speed (m/s) ≥ 0 · ``angle`` (degrees, −90…90) · ``g`` (m/s²) > 0 [9.81]
    · ``h0`` launch height (m) ≥ 0 [0]

    * ``flight_time`` = (vy + √(vy² + 2·g·h0)) / g  with vy = v0·sin(angle) (s)
    * ``range`` = vx · flight_time  with vx = v0·cos(angle) (m)
    * ``max_height`` = h0 + max(vy, 0)² / (2g) — highest point above the ground (m)

``compound_interest``
    ``P`` principal ≥ 0 · ``r`` interest rate in PERCENT per year > −100 · ``n``
    compounding periods per year > 0 [1] · ``t`` years ≥ 0

    * ``amount`` = P·(1 + r/(100·n))^(n·t)
    * ``interest`` = amount − P
    * ``simple_amount`` = P·(1 + (r/100)·t) — simple interest, for comparison

``spring_mass`` (ideal spring, no friction)
    ``k`` spring constant (N/m) > 0 · ``m`` mass (kg) > 0

    * ``angular_frequency`` ω = √(k/m) (rad/s)
    * ``period`` = 2π/ω (s)
    * ``frequency`` = 1 / period (Hz)

Results are model outputs under the stated assumptions — never measurements.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from ..errors import AppError

# Fixed RK4 step for the pendulum: dt = small-angle period / STEPS_PER_PERIOD.
STEPS_PER_PERIOD = 4000
MAX_PENDULUM_STEPS = 200_000


# ============================================================================ model metadata
@dataclass(frozen=True)
class InputSpec:
    """One model input: unit (SI unless stated), default and valid domain."""

    unit: str
    default: float | None = None  # None → required
    gt: float | None = None  # value must be > gt
    ge: float | None = None  # value must be >= ge
    lt: float | None = None  # value must be < lt
    le: float | None = None  # value must be <= le
    description: str = ""

    def problem(self, value: float) -> str | None:
        """English description of why ``value`` is outside the domain (None when valid)."""
        if not math.isfinite(value):
            return "must be a finite number"
        if self.gt is not None and not value > self.gt:
            return f"must be greater than {self.gt:g}"
        if self.ge is not None and not value >= self.ge:
            return f"must be at least {self.ge:g}"
        if self.lt is not None and not value < self.lt:
            return f"must be less than {self.lt:g}"
        if self.le is not None and not value <= self.le:
            return f"must be at most {self.le:g}"
        return None


@dataclass(frozen=True)
class ModelSpec:
    name: str
    inputs: dict[str, InputSpec]
    outputs: dict[str, str]  # output name → unit
    compute: Callable[[dict[str, float]], dict[str, float]] = field(repr=False)


# ============================================================================ pendulum
def _agm(a: float, b: float) -> float:
    """Arithmetic–geometric mean (converges quadratically)."""
    for _ in range(64):
        a, b = (a + b) / 2.0, math.sqrt(a * b)
        if abs(a - b) <= 1e-16 * a:
            break
    return a


def pendulum_exact_period(L: float, g: float, theta0_deg: float) -> float:
    """Exact period of the undamped pendulum: T = 4·√(L/g)·K(sin(θ0/2)).

    K is the complete elliptic integral of the first kind, K(k) = π / (2·AGM(1, √(1−k²))).
    Used to choose the integration horizon and to compute the shared test vectors.
    """
    k = math.sin(math.radians(abs(theta0_deg)) / 2.0)
    k_prime = math.sqrt(max(0.0, 1.0 - k * k))
    if k_prime == 0.0:
        return math.inf
    return 4.0 * math.sqrt(L / g) * math.pi / (2.0 * _agm(1.0, k_prime))


def pendulum_numeric_period(L: float, g: float, theta0_deg: float, b: float = 0.0) -> float:
    """Period from RK4 integration of θ'' = −(g/L)·sin θ − b·θ' (see module docstring)."""
    t0 = 2.0 * math.pi * math.sqrt(L / g)
    if theta0_deg == 0:
        return t0
    theta = math.radians(abs(theta0_deg))
    omega = 0.0
    k = g / L
    dt = t0 / STEPS_PER_PERIOD
    # Horizon: the exact undamped period, stretched for damping (small-angle estimate).
    estimate = pendulum_exact_period(L, g, theta0_deg)
    gamma = b / 2.0
    if gamma > 0:
        w0_sq = k - gamma * gamma
        estimate = estimate * (math.sqrt(k / w0_sq) if w0_sq > 0 else 4.0)
    horizon = 2.0 * estimate + 2.0 * t0
    max_steps = min(MAX_PENDULUM_STEPS, int(horizon / dt) + 2)

    def acc(th: float, w: float) -> float:
        return -k * math.sin(th) - b * w

    t = 0.0
    crossings: list[float] = []
    half = 0.5 * dt
    for _ in range(max_steps):
        k1t, k1w = omega, acc(theta, omega)
        k2t, k2w = omega + half * k1w, acc(theta + half * k1t, omega + half * k1w)
        k3t, k3w = omega + half * k2w, acc(theta + half * k2t, omega + half * k2w)
        k4t, k4w = omega + dt * k3w, acc(theta + dt * k3t, omega + dt * k3w)
        new_theta = theta + dt / 6.0 * (k1t + 2.0 * k2t + 2.0 * k3t + k4t)
        new_omega = omega + dt / 6.0 * (k1w + 2.0 * k2w + 2.0 * k3w + k4w)
        if theta > 0.0 >= new_theta:  # downward zero crossing inside this step
            crossings.append(t + dt * theta / (theta - new_theta))
            if len(crossings) == 2:
                return crossings[1] - crossings[0]
        theta, omega, t = new_theta, new_omega, t + dt
    return math.nan


def pendulum(L: float, g: float = 9.81, theta0: float = 10.0, b: float = 0.0) -> dict[str, float]:
    period = 2.0 * math.pi * math.sqrt(L / g)
    return {
        "period": period,
        "frequency": 1.0 / period,
        "period_numeric": pendulum_numeric_period(L, g, theta0, b),
    }


# ============================================================================ projectile
def projectile(v0: float, angle: float, g: float = 9.81, h0: float = 0.0) -> dict[str, float]:
    a = math.radians(angle)
    vx = v0 * math.cos(a)
    vy = v0 * math.sin(a)
    flight_time = (vy + math.sqrt(vy * vy + 2.0 * g * h0)) / g
    rise = max(vy, 0.0)
    return {
        "flight_time": flight_time,
        "range": vx * flight_time,
        "max_height": h0 + rise * rise / (2.0 * g),
    }


# ============================================================================ compound interest
def compound_interest(P: float, r: float, n: float, t: float) -> dict[str, float]:
    rate = r / 100.0
    amount = P * (1.0 + rate / n) ** (n * t)
    return {
        "amount": amount,
        "interest": amount - P,
        "simple_amount": P * (1.0 + rate * t),
    }


# ============================================================================ spring–mass
def spring_mass(k: float, m: float) -> dict[str, float]:
    omega = math.sqrt(k / m)
    period = 2.0 * math.pi / omega
    return {"angular_frequency": omega, "period": period, "frequency": 1.0 / period}


# ============================================================================ registry
MODELS: dict[str, ModelSpec] = {
    "pendulum": ModelSpec(
        name="pendulum",
        inputs={
            "L": InputSpec("m", gt=0, description="string length"),
            "g": InputSpec("m/s²", default=9.81, gt=0, description="gravitational acceleration"),
            "theta0": InputSpec("°", default=10.0, gt=-180, lt=180, description="release angle"),
            "b": InputSpec("1/s", default=0.0, ge=0, description="damping coefficient"),
        },
        outputs={"period": "s", "frequency": "Hz", "period_numeric": "s"},
        compute=lambda v: pendulum(v["L"], v["g"], v["theta0"], v["b"]),
    ),
    "projectile": ModelSpec(
        name="projectile",
        inputs={
            "v0": InputSpec("m/s", ge=0, description="launch speed"),
            "angle": InputSpec("°", ge=-90, le=90, description="launch angle"),
            "g": InputSpec("m/s²", default=9.81, gt=0, description="gravitational acceleration"),
            "h0": InputSpec("m", default=0.0, ge=0, description="launch height"),
        },
        outputs={"flight_time": "s", "range": "m", "max_height": "m"},
        compute=lambda v: projectile(v["v0"], v["angle"], v["g"], v["h0"]),
    ),
    "compound_interest": ModelSpec(
        name="compound_interest",
        inputs={
            "P": InputSpec("", ge=0, description="principal"),
            "r": InputSpec("%", gt=-100, description="interest rate per year (percent)"),
            "n": InputSpec("1/year", default=1.0, gt=0, description="compounding periods per year"),
            "t": InputSpec("year", ge=0, description="time in years"),
        },
        outputs={"amount": "", "interest": "", "simple_amount": ""},
        compute=lambda v: compound_interest(v["P"], v["r"], v["n"], v["t"]),
    ),
    "spring_mass": ModelSpec(
        name="spring_mass",
        inputs={
            "k": InputSpec("N/m", gt=0, description="spring constant"),
            "m": InputSpec("kg", gt=0, description="mass"),
        },
        outputs={"angular_frequency": "rad/s", "period": "s", "frequency": "Hz"},
        compute=lambda v: spring_mass(v["k"], v["m"]),
    ),
}


def model_spec(model: str) -> ModelSpec:
    spec = MODELS.get(model)
    if spec is None:
        raise AppError(
            "sim_unknown_model",
            422,
            f"Unknown simulation model '{model}'",
            extra={"model": model, "supported": sorted(MODELS)},
        )
    return spec


def resolve_inputs(model: str, inputs: Mapping[str, Any]) -> dict[str, float]:
    """Model inputs with defaults applied and domains checked.

    Names that are not inputs of the model are ignored here (see :func:`unused_inputs`).
    Raises ``sim_missing_input`` / ``sim_invalid_input`` (422).
    """
    spec = model_spec(model)
    values: dict[str, float] = {}
    for name, info in spec.inputs.items():
        raw = inputs.get(name) if inputs else None
        if raw is None:
            if info.default is None:
                raise AppError(
                    "sim_missing_input", 422, f"The {model} model needs the input '{name}'", extra={"input": name}
                )
            raw = info.default
        if isinstance(raw, bool):
            raise AppError("sim_invalid_input", 422, f"Input '{name}' must be a number", extra={"input": name})
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise AppError(
                "sim_invalid_input", 422, f"Input '{name}' must be a number", extra={"input": name}
            ) from exc
        problem = info.problem(value)
        if problem:
            raise AppError(
                "sim_invalid_input",
                422,
                f"Input '{name}' {problem}",
                extra={"input": name, "value": value if math.isfinite(value) else None},
            )
        values[name] = value
    return values


def unused_inputs(model: str, inputs: Mapping[str, Any]) -> list[str]:
    """Input names a model does not use (typos such as ``G`` instead of ``g``)."""
    known = model_spec(model).inputs
    return sorted(name for name in (inputs or {}) if name not in known)


def simulate(model: str, inputs: Mapping[str, Any]) -> dict[str, float]:
    """Every output of ``model`` for ``inputs`` (defaults applied, domains checked)."""
    spec = model_spec(model)
    return spec.compute(resolve_inputs(model, inputs))


def run_case(model: str, inputs: Mapping[str, Any], output: str) -> float:
    """One output of a model, e.g. ``run_case("pendulum", {"L": 1, "g": 9.81}, "period")``.

    Raises :class:`AppError` for an unknown model (``sim_unknown_model``), an unknown
    output (``sim_unknown_output``), a missing required input (``sim_missing_input``)
    or an input outside the model's domain (``sim_invalid_input``).
    """
    spec = model_spec(model)
    if output not in spec.outputs:
        raise AppError(
            "sim_unknown_output",
            422,
            f"The {model} model has no output '{output}'",
            extra={"output": output, "supported": sorted(spec.outputs)},
        )
    values = resolve_inputs(model, inputs)
    if model == "pendulum" and output != "period_numeric":
        # Skip the (comparatively slow) integration when only closed forms are needed.
        period = 2.0 * math.pi * math.sqrt(values["L"] / values["g"])
        return period if output == "period" else 1.0 / period
    return float(spec.compute(values)[output])


def relative_error(actual: float, expected: float) -> float:
    """|actual − expected| / |expected| (absolute error when ``expected`` is 0)."""
    if not math.isfinite(actual):
        return math.inf
    if expected == 0:
        return abs(actual)
    return abs(actual - expected) / abs(expected)
