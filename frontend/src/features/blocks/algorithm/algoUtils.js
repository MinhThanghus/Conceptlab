/**
 * Small helpers for the algorithm block (pure): parsing a typed number list and
 * formatting it back for editing.
 */
import { parseLocaleNumber } from '../../sim/paramUtils.js'

const PLAIN = /^[-+]?(\d+\.?\d*|\.\d+)$/

/**
 * "7, 3, 9, 1" · "7 3 9 1" · "2,5; 1; 4" (Vietnamese decimal commas need ";" between numbers)
 * → { values: number[], invalid: string[] }.
 */
export function parseNumberList(text) {
  const s = String(text ?? '').replace(/−/g, '-').trim()
  if (!s) return { values: [], invalid: [] }
  const semicolons = s.includes(';')
  const tokens = semicolons ? s.split(';') : s.split(/[\s,]+/)
  const values = []
  const invalid = []
  for (const raw of tokens) {
    const tok = raw.trim()
    if (!tok) continue
    const n = semicolons ? parseLocaleNumber(tok) : PLAIN.test(tok) ? Number(tok) : NaN
    if (Number.isFinite(n)) values.push(n)
    else invalid.push(tok)
  }
  return { values, invalid }
}

/** Editable text for a list: "7, 3, 9" — or "2,5; 1; 4" in Vietnamese when there are decimals. */
export function formatNumberList(values = [], lang = 'vi') {
  const list = values.filter((v) => Number.isFinite(Number(v))).map(Number)
  if (lang === 'vi' && list.some((v) => !Number.isInteger(v))) return list.map((v) => String(v).replace('.', ',')).join('; ')
  return list.join(', ')
}

/** Validation of a list for an algorithm: null when fine, else { code, vars }. */
export function listIssue(parsed, { min = 2, max = 12 } = {}) {
  if (parsed.invalid.length) return { code: 'invalid', vars: { list: parsed.invalid.slice(0, 3).join(', ') } }
  if (parsed.values.length < min) return { code: 'tooFew', vars: { min } }
  if (parsed.values.length > max) return { code: 'tooMany', vars: { max } }
  return null
}
