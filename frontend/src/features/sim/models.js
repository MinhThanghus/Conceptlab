/**
 * Simulation models — pure functions, no DOM. JavaScript mirror of
 * backend/app/services/simulations.py; both are tested against shared/sim_cases.json.
 *
 *   pendulum           L (m), g (m/s²), theta0 (°), b (1/s)   θ'' = −(g/L)·sin θ − b·θ'
 *   projectile         v0 (m/s), angle (°), g (m/s²), h0 (m ≥ 0) — no air resistance
 *   compound_interest  P (money), r (%/year), n (times/year), t (years)
 *   spring_mass        k (N/m), m (kg) [+ x0 (m), b (kg/s) for the animation only]
 *
 * Reference outputs (what reference cases and the server validator may check):
 *   pendulum: period (2π√(L/g)), frequency, period_numeric (RK4, first two downward zero crossings)
 *   projectile: flight_time, range, max_height
 *   compound_interest: amount, interest, simple_amount
 *   spring_mass: angular_frequency, period, frequency
 * Extra display outputs (UI only): angular_frequency (pendulum), impact_speed,
 * time_to_apex, simple_interest, damping_ratio.
 *
 * simulate*() return { outputs, duration, timeUnit, stateAt(t), plot, values }.
 * Results are model outputs under the stated assumptions — never measurements.
 */

export const SIM_MODEL_IDS = ['pendulum', 'projectile', 'compound_interest', 'spring_mass']

const TAU = 2 * Math.PI
export const deg2rad = (d) => (d * Math.PI) / 180
export const rad2deg = (r) => (r * 180) / Math.PI
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Per model:
 * - params: defaults for a NEW block's sliders (unit = the unit the model computes in;
 *   `unitKey` = localised unit text, sim.units.<key>, where the maths does not depend on it);
 * - inputDefaults: values used when a reference case omits an input (same as the backend);
 *   inputs without a default are required;
 * - reference: outputs a reference case may name (same as the backend);
 * - outputs: everything the UI can display, with unit and symbol;
 * - aliases: common alternative names, only used to SUGGEST a fix in the editor.
 */
export const MODEL_SPECS = {
  pendulum: {
    timeUnit: 's',
    primary: 'period',
    params: [
      { symbol: 'L', unit: 'm', value: 1, min: 0.1, max: 3, step: 0.01, role: 'input', provenance: 'user' },
      { symbol: 'g', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01, role: 'constant', provenance: 'assumption' },
      { symbol: 'theta0', unit: '°', value: 10, min: 1, max: 80, step: 1, role: 'input', provenance: 'user' },
      { symbol: 'b', unit: '1/s', value: 0, min: 0, max: 1, step: 0.01, role: 'input', provenance: 'assumption' },
    ],
    inputDefaults: { g: 9.81, theta0: 10, b: 0 },
    required: ['L'],
    reference: ['period', 'frequency', 'period_numeric'],
    outputs: [
      { key: 'period', unit: 's', symbol: 'T' },
      { key: 'period_numeric', unit: 's', symbol: 'T' },
      { key: 'frequency', unit: 'Hz', symbol: 'f' },
      { key: 'angular_frequency', unit: 'rad/s', symbol: 'ω' },
    ],
    aliases: {
      T: 'period',
      period_small_angle: 'period',
      small_angle_period: 'period',
      period_formula: 'period',
      numeric_period: 'period_numeric',
      period_rk4: 'period_numeric',
      f: 'frequency',
    },
  },
  projectile: {
    timeUnit: 's',
    primary: 'range',
    params: [
      { symbol: 'v0', unit: 'm/s', value: 15, min: 1, max: 50, step: 0.5, role: 'input', provenance: 'user' },
      { symbol: 'angle', unit: '°', value: 45, min: 0, max: 90, step: 1, role: 'input', provenance: 'user' },
      { symbol: 'g', unit: 'm/s²', value: 9.81, min: 1, max: 25, step: 0.01, role: 'constant', provenance: 'assumption' },
      { symbol: 'h0', unit: 'm', value: 0, min: 0, max: 30, step: 0.5, role: 'input', provenance: 'user' },
    ],
    inputDefaults: { g: 9.81, h0: 0 },
    required: ['v0', 'angle'],
    reference: ['flight_time', 'range', 'max_height'],
    outputs: [
      { key: 'flight_time', unit: 's', symbol: 't' },
      { key: 'range', unit: 'm', symbol: 'd' },
      { key: 'max_height', unit: 'm', symbol: 'H' },
      { key: 'impact_speed', unit: 'm/s', symbol: 'v' },
      { key: 'time_to_apex', unit: 's', symbol: 't' },
    ],
    aliases: {
      time_of_flight: 'flight_time',
      flight: 'flight_time',
      t_flight: 'flight_time',
      R: 'range',
      distance: 'range',
      horizontal_range: 'range',
      H: 'max_height',
      h_max: 'max_height',
      apex_height: 'max_height',
    },
  },
  compound_interest: {
    timeUnit: 'year',
    primary: 'amount',
    params: [
      { symbol: 'P', unitKey: 'money', value: 10000000, min: 1000000, max: 100000000, step: 500000, role: 'input', provenance: 'user' },
      { symbol: 'r', unitKey: 'percentPerYear', value: 6, min: 0, max: 20, step: 0.1, role: 'input', provenance: 'user' },
      { symbol: 'n', unitKey: 'timesPerYear', value: 12, min: 1, max: 365, step: 1, role: 'input', provenance: 'user' },
      { symbol: 't', unitKey: 'years', value: 10, min: 1, max: 40, step: 1, role: 'input', provenance: 'user' },
    ],
    inputDefaults: { n: 1 },
    required: ['P', 'r', 't'],
    reference: ['amount', 'interest', 'simple_amount'],
    outputs: [
      { key: 'amount', unit: '@P', symbol: 'A' },
      { key: 'interest', unit: '@P', symbol: 'I' },
      { key: 'simple_amount', unit: '@P', symbol: 'A' },
      { key: 'simple_interest', unit: '@P', symbol: 'I' },
    ],
    aliases: {
      A: 'amount',
      final_amount: 'amount',
      total: 'amount',
      I: 'interest',
      compound_interest: 'interest',
      simple: 'simple_amount',
    },
  },
  spring_mass: {
    timeUnit: 's',
    primary: 'period',
    params: [
      { symbol: 'k', unit: 'N/m', value: 20, min: 1, max: 200, step: 1, role: 'input', provenance: 'user' },
      { symbol: 'm', unit: 'kg', value: 0.5, min: 0.05, max: 5, step: 0.05, role: 'input', provenance: 'user' },
      { symbol: 'x0', unit: 'm', value: 0.1, min: 0.01, max: 0.5, step: 0.01, role: 'input', provenance: 'user' },
      { symbol: 'b', unit: 'kg/s', value: 0, min: 0, max: 5, step: 0.05, role: 'input', provenance: 'assumption' },
    ],
    inputDefaults: { x0: 0.1, b: 0 },
    required: ['k', 'm'],
    reference: ['angular_frequency', 'period', 'frequency'],
    outputs: [
      { key: 'period', unit: 's', symbol: 'T' },
      { key: 'frequency', unit: 'Hz', symbol: 'f' },
      { key: 'angular_frequency', unit: 'rad/s', symbol: 'ω' },
      { key: 'damping_ratio', unit: '', symbol: 'ζ' },
    ],
    aliases: {
      T: 'period',
      f: 'frequency',
      omega: 'angular_frequency',
      w: 'angular_frequency',
    },
  },
}

/** Slider defaults of a new block: { L: 1, g: 9.81, … } */
export function defaultValues(model) {
  const spec = MODEL_SPECS[model]
  return spec ? Object.fromEntries(spec.params.map((p) => [p.symbol, p.value])) : {}
}

/** Symbols a model reads. */
export function paramSymbols(model) {
  return MODEL_SPECS[model]?.params.map((p) => p.symbol) || []
}

/** Output keys a reference case may name (identical to the backend). */
export function referenceOutputs(model) {
  return MODEL_SPECS[model]?.reference || []
}

/** Every output key the UI can display for a model. */
export function outputKeys(model) {
  return MODEL_SPECS[model]?.outputs.map((o) => o.key) || []
}

/** Exact reference output name or null (strict, like the backend's run_case). */
export function resolveOutputKey(model, key) {
  if (key === null || key === undefined) return null
  const raw = String(key).trim()
  return referenceOutputs(model).includes(raw) ? raw : null
}

/** For an invalid output name ("T", "time_of_flight"), the reference output it most likely means. */
export function suggestOutputKey(model, key) {
  const spec = MODEL_SPECS[model]
  if (!spec || key === null || key === undefined) return null
  const raw = String(key).trim()
  const lower = raw.toLowerCase()
  const ref = spec.reference
  if (ref.includes(lower)) return lower
  if (spec.aliases[raw] && ref.includes(spec.aliases[raw])) return spec.aliases[raw]
  const hit = Object.keys(spec.aliases).find((k) => k.toLowerCase() === lower)
  return hit && ref.includes(spec.aliases[hit]) ? spec.aliases[hit] : null
}

const toNum = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v))

/** Merge values over the new-block slider defaults (used by the live simulation). */
export function withDefaults(model, values = {}) {
  const base = defaultValues(model)
  const out = { ...base }
  for (const key of Object.keys(base)) {
    const n = toNum(values[key])
    if (Number.isFinite(n)) out[key] = n
  }
  return out
}

/**
 * Domain checks (same rules as the backend): [{ symbol, code }] with code
 * 'finite' | 'positive' (> 0) | 'nonNegative' (≥ 0) | 'angleRange' | 'rateRange' | 'missing'.
 */
export function validateValues(model, values) {
  const issues = []
  const v = values || {}
  const val = (s) => toNum(v[s])
  const check = (s, ok, code) => {
    const x = val(s)
    if (!Number.isFinite(x)) issues.push({ symbol: s, code: 'finite' })
    else if (!ok(x)) issues.push({ symbol: s, code })
  }
  const pos = (x) => x > 0
  const nonNeg = (x) => x >= 0
  if (model === 'pendulum') {
    check('L', pos, 'positive')
    check('g', pos, 'positive')
    check('theta0', (x) => x > -180 && x < 180, 'angleRange')
    check('b', nonNeg, 'nonNegative')
  } else if (model === 'projectile') {
    check('v0', nonNeg, 'nonNegative')
    check('angle', (x) => x >= -90 && x <= 90, 'angleRange')
    check('g', pos, 'positive')
    check('h0', nonNeg, 'nonNegative')
  } else if (model === 'compound_interest') {
    check('P', nonNeg, 'nonNegative')
    check('r', (x) => x > -100, 'rateRange')
    check('n', pos, 'positive')
    check('t', nonNeg, 'nonNegative')
  } else if (model === 'spring_mass') {
    check('k', pos, 'positive')
    check('m', pos, 'positive')
    check('x0', () => true, 'finite')
    check('b', nonNeg, 'nonNegative')
  }
  return issues
}

// ---------------------------------------------------------------------------- numerics
/** Classic 4th-order Runge–Kutta for y'' = acc(y, y'), sampled every h. */
function rk4Oscillator(acc, y0, v0, h, steps) {
  const ys = new Float64Array(steps + 1)
  const vs = new Float64Array(steps + 1)
  let y = y0
  let v = v0
  ys[0] = y
  vs[0] = v
  const half = h / 2
  for (let i = 1; i <= steps; i += 1) {
    const k1y = v
    const k1v = acc(y, v)
    const k2y = v + half * k1v
    const k2v = acc(y + half * k1y, v + half * k1v)
    const k3y = v + half * k2v
    const k3v = acc(y + half * k2y, v + half * k2v)
    const k4y = v + h * k3v
    const k4v = acc(y + h * k3y, v + h * k3v)
    y += (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)
    ys[i] = y
    vs[i] = v
  }
  return { ys, vs }
}

/** Times where a sampled signal crosses zero (linear interpolation inside the step). */
export function zeroCrossings(values, h) {
  const out = []
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1]
    const b = values[i]
    if ((a > 0 && b <= 0) || (a < 0 && b >= 0)) out.push((i - 1 + a / (a - b)) * h)
  }
  return out
}

function agm(a, b) {
  for (let i = 0; i < 64; i += 1) {
    const na = (a + b) / 2
    const nb = Math.sqrt(a * b)
    a = na
    b = nb
    if (Math.abs(a - b) <= 1e-16 * a) break
  }
  return a
}

/** Exact undamped period T = 4·√(L/g)·K(sin(θ0/2)) (complete elliptic integral via AGM). */
export function pendulumExactPeriod(L, g, theta0Deg) {
  const k = Math.sin(deg2rad(Math.abs(theta0Deg)) / 2)
  const kp = Math.sqrt(Math.max(0, 1 - k * k))
  if (kp === 0) return Infinity
  return (4 * Math.sqrt(L / g) * Math.PI) / (2 * agm(1, kp))
}

/**
 * Period from RK4 integration of θ'' = −(g/L)·sin θ − b·θ' with step T0/4000: the time
 * between the first two downward zero crossings (identical to the backend). θ0 = 0
 * returns the small-angle period; NaN when θ never crosses zero (over-damped).
 */
export function pendulumNumericPeriod(L, g, theta0Deg, b = 0) {
  const t0 = TAU * Math.sqrt(L / g)
  if (theta0Deg === 0) return t0
  let theta = deg2rad(Math.abs(theta0Deg))
  let omega = 0
  const k = g / L
  const dt = t0 / 4000
  let estimate = pendulumExactPeriod(L, g, theta0Deg)
  const gamma = b / 2
  if (gamma > 0) {
    const w0sq = k - gamma * gamma
    estimate *= w0sq > 0 ? Math.sqrt(k / w0sq) : 4
  }
  const horizon = 2 * estimate + 2 * t0
  const maxSteps = Math.min(400000, Math.floor(horizon / dt) + 2)
  const acc = (th, w) => -k * Math.sin(th) - b * w
  const half = 0.5 * dt
  let t = 0
  let first = null
  for (let i = 0; i < maxSteps; i += 1) {
    const k1t = omega
    const k1w = acc(theta, omega)
    const k2t = omega + half * k1w
    const k2w = acc(theta + half * k1t, omega + half * k1w)
    const k3t = omega + half * k2w
    const k3w = acc(theta + half * k2t, omega + half * k2w)
    const k4t = omega + dt * k3w
    const k4w = acc(theta + dt * k3t, omega + dt * k3w)
    const nTheta = theta + (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t)
    const nOmega = omega + (dt / 6) * (k1w + 2 * k2w + 2 * k3w + k4w)
    if (theta > 0 && nTheta <= 0) {
      const crossing = t + (dt * theta) / (theta - nTheta)
      if (first === null) first = crossing
      else return crossing - first
    }
    theta = nTheta
    omega = nOmega
    t += dt
  }
  return NaN
}

function interpolator(arrays, h, n) {
  return (t) => {
    const x = clamp(t / h, 0, n)
    const i = Math.min(n - 1, Math.floor(x))
    const f = x - i
    const out = {}
    for (const [key, arr] of Object.entries(arrays)) out[key] = n === 0 ? arr[0] : arr[i] + (arr[i + 1] - arr[i]) * f
    return out
  }
}

function downsample(n, maxPoints = 600) {
  const stride = Math.max(1, Math.ceil(n / maxPoints))
  const idx = []
  for (let i = 0; i <= n; i += stride) idx.push(i)
  if (idx[idx.length - 1] !== n) idx.push(n)
  return idx
}

/** Default timeline for oscillators: about ten periods, between 15 s and 60 s. */
export function oscillatorDuration(period) {
  return clamp(Number.isFinite(period) ? period * 10 : 20, 15, 60)
}

// ---------------------------------------------------------------------------- pendulum
export function simulatePendulum(values = {}, { duration, dt } = {}) {
  const { L, g, theta0, b } = withDefaults('pendulum', values)
  const period = TAU * Math.sqrt(L / g)
  const total = duration ?? oscillatorDuration(period)
  const h = dt ?? Math.min(0.01, period / 200)
  const steps = Math.max(1, Math.ceil(total / h))
  const w2 = g / L
  const { ys: theta, vs: omega } = rk4Oscillator((th, om) => -w2 * Math.sin(th) - b * om, deg2rad(theta0), 0, h, steps)
  const at = interpolator({ theta, omega }, h, steps)
  const idx = downsample(steps)
  const numeric = pendulumNumericPeriod(L, g, theta0, b)
  return {
    model: 'pendulum',
    outputs: {
      period,
      frequency: 1 / period,
      period_numeric: Number.isFinite(numeric) ? numeric : null,
      angular_frequency: Math.sqrt(w2),
    },
    duration: steps * h,
    timeUnit: 's',
    stateAt: (t) => {
      const s = at(t)
      return { theta: s.theta, omega: s.omega, thetaDeg: rad2deg(s.theta), x: L * Math.sin(s.theta), y: -L * Math.cos(s.theta) }
    },
    plot: { points: idx.map((i) => [i * h, rad2deg(theta[i])]) },
    values: { L, g, theta0, b },
  }
}

// ---------------------------------------------------------------------------- projectile
export function simulateProjectile(values = {}, { samples = 160 } = {}) {
  const { v0, angle, g, h0 } = withDefaults('projectile', values)
  const a = deg2rad(angle)
  const vxRaw = v0 * Math.cos(a)
  const vx = Math.abs(vxRaw) < 1e-12 ? 0 : vxRaw
  const vy = v0 * Math.sin(a)
  const flight = (vy + Math.sqrt(vy * vy + 2 * g * h0)) / g
  const rise = Math.max(vy, 0)
  const vyEnd = vy - g * flight
  const n = Math.max(1, samples)
  const points = []
  for (let i = 0; i <= n; i += 1) {
    const t = (flight * i) / n
    points.push([vx * t, i === n ? 0 : Math.max(0, h0 + vy * t - 0.5 * g * t * t)])
  }
  return {
    model: 'projectile',
    outputs: {
      flight_time: flight,
      range: vx * flight,
      max_height: h0 + (rise * rise) / (2 * g),
      impact_speed: Math.sqrt(vx * vx + vyEnd * vyEnd),
      time_to_apex: rise / g,
    },
    duration: flight,
    timeUnit: 's',
    stateAt: (t) => {
      const tt = clamp(t, 0, flight)
      return { t: tt, x: vx * tt, y: Math.max(0, h0 + vy * tt - 0.5 * g * tt * tt), vx, vy: vy - g * tt }
    },
    plot: { points },
    values: { v0, angle, g, h0 },
  }
}

// ---------------------------------------------------------------------------- compound interest
export function simulateCompoundInterest(values = {}) {
  const { P, r, n, t } = withDefaults('compound_interest', values)
  const rate = r / 100
  const years = Math.max(0, t)
  const amountAt = (tt) => P * Math.pow(1 + rate / n, n * tt)
  const simpleAt = (tt) => P * (1 + rate * tt)
  const marks = []
  for (let y = 0; y <= Math.floor(years + 1e-9); y += 1) marks.push(y)
  if (years - marks[marks.length - 1] > 1e-9) marks.push(years)
  const amount = amountAt(years)
  const simple = simpleAt(years)
  return {
    model: 'compound_interest',
    outputs: { amount, interest: amount - P, simple_amount: simple, simple_interest: simple - P },
    duration: years,
    timeUnit: 'year',
    stateAt: (tt) => {
      const x = clamp(tt, 0, years)
      return { t: x, amount: amountAt(x), simple: simpleAt(x), principal: P }
    },
    yearly: marks.map((y) => ({ year: y, amount: amountAt(y), simple: simpleAt(y) })),
    plot: { points: marks.map((y) => [y, amountAt(y)]), simplePoints: marks.map((y) => [y, simpleAt(y)]) },
    values: { P, r, n, t },
  }
}

// ---------------------------------------------------------------------------- spring–mass
export function simulateSpring(values = {}, { duration, dt } = {}) {
  const { k, m, x0, b } = withDefaults('spring_mass', values)
  const w0 = Math.sqrt(k / m)
  const period = TAU / w0
  const total = duration ?? oscillatorDuration(period)
  const h = dt ?? Math.min(0.01, period / 200)
  const steps = Math.max(1, Math.ceil(total / h))
  const { ys: x, vs: v } = rk4Oscillator((xx, vv) => -(k / m) * xx - (b / m) * vv, x0, 0, h, steps)
  const at = interpolator({ x, v }, h, steps)
  const idx = downsample(steps)
  return {
    model: 'spring_mass',
    outputs: { period, frequency: 1 / period, angular_frequency: w0, damping_ratio: b / (2 * Math.sqrt(k * m)) },
    duration: steps * h,
    timeUnit: 's',
    stateAt: (t) => at(t),
    plot: { points: idx.map((i) => [i * h, x[i]]) },
    values: { k, m, x0, b },
  }
}

const RUNNERS = {
  pendulum: simulatePendulum,
  projectile: simulateProjectile,
  compound_interest: simulateCompoundInterest,
  spring_mass: simulateSpring,
}

/** Run a model with full values. Returns { ok: true, result } or { ok: false, issues }. Never throws. */
export function runModel(model, values = {}, options = {}) {
  const runner = RUNNERS[model]
  if (!runner) return { ok: false, issues: [{ symbol: null, code: 'unknownModel' }] }
  const full = withDefaults(model, values)
  const issues = validateValues(model, full)
  if (issues.length) return { ok: false, issues }
  try {
    return { ok: true, result: runner(full, options) }
  } catch {
    return { ok: false, issues: [{ symbol: null, code: 'failed' }] }
  }
}

/** Natural timeline length for a model (used to run scenario A and B on one clock). */
export function naturalDuration(model, values) {
  const v = withDefaults(model, values)
  if (model === 'pendulum') return oscillatorDuration(TAU * Math.sqrt(v.L / v.g))
  if (model === 'spring_mass') return oscillatorDuration(TAU * Math.sqrt(v.m / v.k))
  if (model === 'projectile') return runModel(model, v).result?.duration ?? 0
  if (model === 'compound_interest') return Math.max(0, v.t)
  return 0
}

/**
 * Inputs a reference case is evaluated with — exactly like the backend's run_case:
 * the case's own inputs plus the model input defaults; required inputs must be present.
 * Returns { values } or { missing: symbol }.
 */
export function referenceInputs(model, inputs = {}) {
  const spec = MODEL_SPECS[model]
  if (!spec) return { missing: null }
  const values = { ...spec.inputDefaults }
  for (const symbol of paramSymbols(model)) {
    const n = toNum(inputs?.[symbol])
    if (inputs && inputs[symbol] !== undefined && inputs[symbol] !== null) values[symbol] = n
  }
  const missing = spec.required.find((s) => values[s] === undefined)
  return missing ? { missing } : { values }
}

/**
 * Check one reference case (spec §11). Relative tolerance (absolute when expected = 0).
 * Returns { status: 'pass'|'fail'|'error', actual, key, code?, symbol? }.
 */
export function checkReferenceCase(model, refCase) {
  const key = resolveOutputKey(model, refCase?.output)
  if (!key) return { status: 'error', code: 'unknownOutput', key: refCase?.output ?? '', suggestion: suggestOutputKey(model, refCase?.output) }
  const prepared = referenceInputs(model, refCase?.inputs)
  if (prepared.missing) return { status: 'error', code: 'missingInput', key, symbol: prepared.missing }
  const issues = validateValues(model, withDefaults(model, prepared.values)).filter((i) => prepared.values[i.symbol] !== undefined)
  if (issues.length) return { status: 'error', code: 'invalidInput', key, symbol: issues[0].symbol }
  const run = runModel(model, prepared.values, { duration: 1 })
  const actual = run.ok ? run.result.outputs[key] : null
  if (actual === null || actual === undefined || !Number.isFinite(actual)) return { status: 'error', code: 'noValue', key, actual: null }
  const expected = Number(refCase?.expected)
  if (!Number.isFinite(expected)) return { status: 'error', code: 'noExpected', key, actual }
  const tol = Math.abs(Number(refCase?.tolerance ?? 0.01))
  const ok = expected === 0 ? Math.abs(actual) <= tol : Math.abs(actual - expected) <= tol * Math.abs(expected)
  return { status: ok ? 'pass' : 'fail', actual, key }
}
