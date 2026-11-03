/**
 * Display helpers for the simulation block (pure, no DOM): textbook symbols, formulas,
 * which results to show, clock settings, unit conversion into the model's units and the
 * choice of the observed output for an automatic active-learning challenge.
 */
import { MODEL_SPECS, outputKeys } from '../../sim/models.js'
import { direction } from '../../sim/paramUtils.js'
import { unitMismatch } from './simParams.js'

export const SPEEDS = [0.25, 0.5, 1, 2]
export const OSCILLATORS = ['pendulum', 'spring_mass']

/** Models whose moving object can be drawn with a SAM cut-out from a photo. */
export const HAS_OBJECT = { pendulum: true, projectile: true, spring_mass: true, compound_interest: false }

/** Code symbols → the way textbooks write them. */
const DISPLAY_SYMBOLS = { theta0: 'θ₀', angle: 'α', v0: 'v₀', h0: 'h₀', x0: 'x₀' }
export const displaySymbol = (symbol) => DISPLAY_SYMBOLS[symbol] || String(symbol ?? '')

/** "Chiều dài dây (L)", "Góc ném (α)"; just the symbol when there is no name. */
export function simParamLabel(p) {
  if (!p) return ''
  const symbol = displaySymbol(p.symbol)
  const name = String(p.name || '').trim()
  if (!name || name === p.symbol || name === symbol) return symbol
  return `${name} (${symbol})`
}

/** KaTeX of the model's main formula (spec §6.3 for the pendulum), as chunks that never break inside. */
export const FORMULA_TEX = {
  pendulum: ['T = 2\\pi\\sqrt{\\dfrac{L}{g}}'],
  projectile: ['x = v_0\\cos\\alpha \\cdot t', 'y = h_0 + v_0\\sin\\alpha \\cdot t - \\tfrac{1}{2}\\,g\\,t^{2}'],
  compound_interest: ['A = P\\left(1 + \\dfrac{r}{n}\\right)^{n\\,t}'],
  spring_mass: ['T = 2\\pi\\sqrt{\\dfrac{m}{k}}'],
}

/** Keys of the model's built-in assumptions (text in sim.assume.<model>.<key>). */
export const MODEL_ASSUMPTIONS = {
  pendulum: ['pointMass', 'noDrag', 'smallAngle', 'gConstant'],
  projectile: ['noDrag', 'gConstant', 'flatGround', 'pointObject'],
  compound_interest: ['fixedRate', 'noFlows', 'rateUnit'],
  spring_mass: ['hooke', 'masslessSpring', 'noFriction', 'fromRest'],
}

/** Computed results shown for each model (the first one is highlighted). */
export const RESULT_KEYS = {
  pendulum: ['period', 'period_numeric', 'frequency'],
  projectile: ['range', 'flight_time', 'max_height', 'impact_speed'],
  compound_interest: ['amount', 'interest', 'simple_amount'],
  spring_mass: ['period', 'frequency', 'angular_frequency'],
}

/** Output symbol (T, f, ω…) or ''. */
export function outputSymbol(model, key) {
  return MODEL_SPECS[model]?.outputs.find((o) => o.key === key)?.symbol || ''
}

/** Output unit; money outputs ('@P') use the unit of the principal P. */
export function outputUnit(model, key, moneyUnit = '') {
  const o = MODEL_SPECS[model]?.outputs.find((x) => x.key === key)
  if (!o) return ''
  return o.unit === '@P' ? moneyUnit : o.unit
}

/** Unit the model computes a parameter in; `tUnit(key)` translates unit keys (money, years…). */
export function modelUnit(model, symbol, tUnit = (k) => k, moneyUnit = '') {
  const def = MODEL_SPECS[model]?.params.find((p) => p.symbol === symbol)
  if (!def) return ''
  if (def.unitKey === 'money') return moneyUnit || tUnit('money')
  return def.unitKey ? tUnit(def.unitKey) : def.unit
}

/** Fraction digits for a readable number of that size. */
export function digitsFor(value, small = 3) {
  const a = Math.abs(Number(value))
  if (!Number.isFinite(a)) return 0
  if (a >= 1000) return 0
  if (a >= 100) return 1
  if (a >= 10) return 2
  return small
}

/**
 * Factor that converts each slider value into the model unit (1 when units match or the
 * unit is free text). Unknown units are left alone; the editor warns about them.
 */
export function unitFactors(model, params = []) {
  const out = {}
  for (const p of params) {
    if (!p || !p.symbol) continue
    const mismatch = unitMismatch(model, p)
    out[p.symbol] = mismatch && Number.isFinite(mismatch.factor) ? mismatch.factor : 1
  }
  return out
}

export function toModelValues(values = {}, factors = {}) {
  const out = {}
  for (const [symbol, v] of Object.entries(values)) {
    const f = factors[symbol] ?? 1
    out[symbol] = Number.isFinite(v) ? v * f : v
  }
  return out
}

/** Clock settings: `rate` = model time per real second at 1×, `step` = one press of Step. */
export function clockSettings(model, duration, outputs = {}) {
  if (model === 'compound_interest') return { rate: Math.max(0.25, duration / 8), step: 1 }
  if (model === 'projectile') return { rate: 1, step: Math.max(0.01, duration / 20) }
  const period = outputs.period_numeric || outputs.period
  return { rate: 1, step: Number.isFinite(period) && period > 0 ? Math.max(0.01, period / 16) : 0.05 }
}

/**
 * The output to observe for an automatic challenge: the model's primary output, unless it
 * does not change for this parameter (e.g. the pendulum period does not depend on θ₀ in
 * the small-angle formula) — then the first output that does change.
 * `at(value, key)` evaluates an output for the changed parameter.
 */
export function pickObserve(model, from, to, at) {
  const spec = MODEL_SPECS[model]
  if (!spec) return null
  const keys = [spec.primary, ...outputKeys(model).filter((k) => k !== spec.primary)]
  let fallback = null
  for (const key of keys) {
    const a = at(from, key)
    const b = at(to, key)
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (!fallback) fallback = key
    if (direction(a, b) !== 'same') return key
  }
  return fallback || spec.primary
}

/** Round outputs for the AI tutor context (keeps the payload small and stable). */
export function roundOutputs(outputs = {}) {
  const out = {}
  for (const [k, v] of Object.entries(outputs)) out[k] = Number.isFinite(v) ? Number(v.toPrecision(5)) : null
  return out
}
