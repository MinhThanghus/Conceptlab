/**
 * Numbers typed by teachers and students: Vietnamese uses a decimal comma ("9,81"),
 * English a decimal point ("9.81"). Both are accepted everywhere.
 */

/**
 * Parse a user-typed decimal.
 *   '0,25' → 0.25 · '9.81' → 9.81 · '1.234,5' → 1234.5 · '1,234.5' → 1234.5 · '-3' → -3 · '2e-3' → 0.002
 * @returns {number|null} null for empty input, NaN when the text is not a number.
 */
export function parseDecimal(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN
  let s = String(text ?? '')
    .replace(/[\s  ']/g, '')
    .replace(/[−–]/g, '-')
  if (!s) return null
  const commas = (s.match(/,/g) || []).length
  const dots = (s.match(/\./g) || []).length
  if (commas && dots) {
    // the separator that comes last is the decimal one; the other groups thousands
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (commas > 1) {
    s = s.replace(/,/g, '')
  } else if (commas === 1) {
    s = s.replace(',', '.')
  } else if (dots > 1) {
    s = s.replace(/\./g, '')
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/** Value shown inside an input (no thousands grouping; decimal comma in Vietnamese). */
export function formatDecimalInput(value, lang = 'vi') {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  const text = String(n)
  return lang === 'vi' ? text.replace('.', ',') : text
}

/** Round for display without trailing noise (2.0060000001 → 2.006). */
export function roundSig(value, digits = 4) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return n
  return Number(n.toPrecision(digits))
}
