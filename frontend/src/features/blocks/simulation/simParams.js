/**
 * Simulation block params ↔ model inputs. The model fixes the symbols and the units it
 * computes in; names/units for missing params come from i18n in the lab's language.
 */
import { MODEL_SPECS, SIM_MODEL_IDS } from '../../sim/models.js'

export const isSimModel = (m) => SIM_MODEL_IDS.includes(m)

/** A Quantity with model defaults; `tl(key)` translates into the lab's content language. */
export function defaultQuantity(model, def, tl) {
  return {
    symbol: def.symbol,
    name: tl(`sim.paramNames.${model}.${def.symbol}`),
    unit: def.unitKey ? tl(`sim.units.${def.unitKey}`) : def.unit,
    value: def.value,
    min: def.min,
    max: def.max,
    step: def.step,
    role: def.role,
    provenance: def.provenance,
    source_ref: null,
    confirmed: true,
  }
}

export function defaultParams(model, tl) {
  return (MODEL_SPECS[model]?.params || []).map((def) => defaultQuantity(model, def, tl))
}

/**
 * Params in model order. Existing params keep everything the teacher/AI set; missing
 * ones are filled from defaults and flagged `added: true` (shown in the editor).
 */
export function modelParams(model, params, tl) {
  const spec = MODEL_SPECS[model]
  if (!spec) return []
  const bySymbol = new Map((Array.isArray(params) ? params : []).filter((p) => p && p.symbol).map((p) => [p.symbol, p]))
  return spec.params.map((def) => {
    const base = defaultQuantity(model, def, tl)
    const existing = bySymbol.get(def.symbol)
    if (!existing) return { ...base, added: true }
    return { ...base, ...existing, unit: existing.unit || base.unit, role: def.role === 'constant' && !existing.role ? 'constant' : existing.role || def.role }
  })
}

/** Params whose symbols the model does not read (e.g. a typo "G"). */
export function unusedParams(model, params) {
  const known = new Set((MODEL_SPECS[model]?.params || []).map((p) => p.symbol))
  return (Array.isArray(params) ? params : []).filter((p) => p && p.symbol && !known.has(p.symbol))
}

// Unit conversions offered when a param uses a different unit than the model computes in.
const CONVERSIONS = {
  m: { cm: 0.01, mm: 0.001, km: 1000, dm: 0.1 },
  kg: { g: 0.001, mg: 1e-6, tấn: 1000, t: 1000 },
  'm/s': { 'km/h': 1 / 3.6, 'cm/s': 0.01 },
  '°': { rad: 180 / Math.PI, độ: 1, deg: 1 },
  'm/s²': { 'm/s^2': 1, 'cm/s²': 0.01, 'cm/s^2': 0.01 },
  'N/m': { 'N/cm': 100 },
}

const norm = (u) => String(u || '').trim().replace(/\s+/g, '')

/**
 * When a param's unit differs from the model's: { expected, factor | null }.
 * null when the unit matches (or the unit is free text, e.g. money).
 */
export function unitMismatch(model, p) {
  const def = MODEL_SPECS[model]?.params.find((d) => d.symbol === p.symbol)
  if (!def || def.unitKey) return null
  const expected = def.unit
  const given = norm(p.unit)
  if (!given || given === norm(expected)) return null
  const table = CONVERSIONS[expected] || {}
  const key = Object.keys(table).find((k) => norm(k).toLowerCase() === given.toLowerCase())
  return { expected, given: p.unit, factor: key ? table[key] : null }
}

/** Convert value/min/max/step of a param into the model unit. */
export function convertParam(p, factor, expected) {
  const conv = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? v : Number((Number(v) * factor).toPrecision(10)))
  return { ...p, unit: expected, value: conv(p.value), min: conv(p.min), max: conv(p.max), step: conv(p.step) }
}

/** Sample reference cases for a model (closed-form values; spec §6.3 for the pendulum). */
export function sampleReferenceCases(model) {
  switch (model) {
    case 'pendulum':
      return [
        { inputs: { L: 1, g: 9.81 }, output: 'period', expected: 2.006, tolerance: 0.01 },
        { inputs: { L: 0.25, g: 9.81 }, output: 'period', expected: 1.003, tolerance: 0.01 },
      ]
    case 'projectile':
      return [{ inputs: { v0: 20, angle: 45, g: 9.81, h0: 0 }, output: 'range', expected: 40.77, tolerance: 0.01 }]
    case 'compound_interest':
      return [{ inputs: { P: 1000, r: 5, n: 12, t: 10 }, output: 'amount', expected: 1647.01, tolerance: 0.001 }]
    case 'spring_mass':
      return [{ inputs: { k: 100, m: 1 }, output: 'period', expected: 0.628, tolerance: 0.01 }]
    default:
      return []
  }
}
