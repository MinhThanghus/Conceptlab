/**
 * Helpers for Quantity parameters (spec Quantity: symbol, name, unit, value, min, max, step,
 * role, provenance, source_ref, confirmed) shared by the graph and simulation blocks.
 */
import { decimalsFor, niceNum } from '../../components/charts/scale.js'

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))

/**
 * Slider range that always works: fills a missing/invalid min/max around the value,
 * widens the range to include the value, and picks a nice step (≈ 1/100 of the range).
 */
export function effectiveRange(p = {}) {
  let value = isNum(p.value) ? Number(p.value) : isNum(p.min) ? Number(p.min) : 0
  let min = isNum(p.min) ? Number(p.min) : null
  let max = isNum(p.max) ? Number(p.max) : null
  if (min === null || max === null || !(max > min)) {
    const span = Math.abs(value) > 0 ? Math.abs(value) * 2 : 10
    if (min === null || !(max > min)) min = value - span
    if (max === null || !(max > min)) max = value + span
  }
  if (value < min) min = value
  if (value > max) max = value
  let step = isNum(p.step) && Number(p.step) > 0 ? Number(p.step) : niceNum((max - min) / 100, true)
  if (step > max - min) step = niceNum((max - min) / 10, true)
  return { value, min, max, step, digits: Math.min(6, decimalsFor(step) + 1) }
}

/** "Chiều dài dây (L)" or just "L". */
export function paramLabel(p) {
  if (!p) return ''
  const name = String(p.name || '').trim()
  const symbol = String(p.symbol || '').trim()
  if (!name || name === symbol) return symbol
  return `${name} (${symbol})`
}

/** { symbol: number } using each param's current value (or a safe default). */
export function valuesOf(params = []) {
  const out = {}
  for (const p of params) if (p && p.symbol) out[p.symbol] = effectiveRange(p).value
  return out
}

export function sameValues(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (Math.abs(Number(a[k]) - Number(b[k])) > 1e-12 || !Object.hasOwn(a, k) || !Object.hasOwn(b, k)) return false
  return true
}

/** Parse "2,5" (vi) or "2.5" (en), "1.234,5", "−3" → number (NaN when invalid/empty). */
export function parseLocaleNumber(text) {
  let s = String(text ?? '')
    .trim()
    .replace(/−/g, '-')
    .replace(/[\s ]/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = (s.match(/,/g) || []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN
  return Number(s)
}

/** Plain editable text for a number: no grouping, locale decimal mark. */
export function plainNumber(value, lang = 'vi') {
  if (!isNum(value)) return ''
  const s = String(Number(value))
  return lang === 'vi' ? s.replace('.', ',') : s
}

/** A valid expression identifier (letters/digits/underscore, not starting with a digit). */
export function isIdentifier(s) {
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(String(s || '')) && !/π/.test(String(s))
}

/**
 * Problems of one param for the editor: [{ field, code }] with code in
 * symbolRequired | symbolInvalid | symbolDuplicate | rangeOrder | valueOutside | stepPositive.
 */
export function paramIssues(p, all = []) {
  const issues = []
  const symbol = String(p.symbol || '').trim()
  if (!symbol) issues.push({ field: 'symbol', code: 'symbolRequired' })
  else if (!isIdentifier(symbol)) issues.push({ field: 'symbol', code: 'symbolInvalid' })
  else if (all.filter((q) => String(q.symbol || '').trim() === symbol).length > 1) issues.push({ field: 'symbol', code: 'symbolDuplicate' })
  if (isNum(p.min) && isNum(p.max) && !(Number(p.max) > Number(p.min))) issues.push({ field: 'max', code: 'rangeOrder' })
  if (isNum(p.value) && isNum(p.min) && isNum(p.max) && Number(p.max) > Number(p.min) && (Number(p.value) < Number(p.min) || Number(p.value) > Number(p.max))) {
    issues.push({ field: 'value', code: 'valueOutside' })
  }
  if (isNum(p.step) && !(Number(p.step) > 0)) issues.push({ field: 'step', code: 'stepPositive' })
  return issues
}

/** Change of an observed number in words: 'up' | 'down' | 'same' (relative tolerance). */
export function direction(before, after, tol = 1e-9) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  const scale = Math.max(Math.abs(before), Math.abs(after), 1e-12)
  if (Math.abs(after - before) <= tol * scale) return 'same'
  return after > before ? 'up' : 'down'
}

/** Relative change in percent, or null when not meaningful. */
export function percentChange(before, after) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || Math.abs(before) < 1e-12) return null
  return ((after - before) / Math.abs(before)) * 100
}

/**
 * A sensible "change" for an automatic active-learning challenge: move the param from
 * its current value towards the farther end of its range by about half the span.
 */
export function suggestChange(p) {
  const r = effectiveRange(p)
  const roundTo = (v) => Number((Math.round(v / r.step) * r.step).toFixed(Math.min(10, r.digits + 1)))
  const towardsMax = r.max - r.value >= r.value - r.min
  const target = towardsMax ? r.value + (r.max - r.value) * 0.6 : r.value - (r.value - r.min) * 0.6
  let to = roundTo(target)
  if (Math.abs(to - r.value) < r.step / 2) to = roundTo(towardsMax ? r.max : r.min)
  return { from: r.value, to }
}
