/**
 * Pure helpers for the Review step (lab.analysis.result, schema: backend/app/schemas/analysis.py).
 * Every function returns new objects (immutable updates) and is unit-tested.
 */

/** List sections whose items carry a `confirmed` flag. */
export const ITEM_SECTIONS = ['formulas', 'variables', 'objects', 'steps', 'relations', 'assumptions']
const ARRAY_KEYS = [...ITEM_SECTIONS, 'missing_info', 'suggested_blocks', 'warnings']

export function emptyResult() {
  return {
    topic: '',
    summary: '',
    objects: [],
    formulas: [],
    variables: [],
    steps: [],
    sequence_clear: false,
    relations: [],
    suggested_blocks: [],
    missing_info: [],
    assumptions: [],
    warnings: [],
  }
}

/** Fill missing keys so editors never crash on partial AI output. */
export function normalizeResult(result) {
  const r = { ...emptyResult(), ...(result || {}) }
  for (const key of ARRAY_KEYS) if (!Array.isArray(r[key])) r[key] = []
  r.topic = r.topic || ''
  r.summary = r.summary || ''
  r.sequence_clear = Boolean(r.sequence_clear)
  return r
}

/**
 * Checklist progress shown as "Đã kiểm tra X/Y mục".
 * - topic & summary: one item (when present), confirmed via `topicConfirmed`
 * - every formula, variable, object, step, relation, assumption: one item each
 * - the order of steps (when there are ≥ 2 steps): one item (`sequence_clear`)
 * - every missing-info entry: one item (resolved)
 */
export function reviewProgress(result, { topicConfirmed = false } = {}) {
  const r = normalizeResult(result)
  const sections = {}
  const hasTopic = Boolean(r.topic.trim() || r.summary.trim())
  sections.topic = { done: hasTopic && topicConfirmed ? 1 : 0, total: hasTopic ? 1 : 0 }
  for (const key of ITEM_SECTIONS) {
    const list = r[key]
    sections[key] = { done: list.filter((item) => item && item.confirmed).length, total: list.length }
  }
  sections.sequence = r.steps.length >= 2 ? { done: r.sequence_clear ? 1 : 0, total: 1 } : { done: 0, total: 0 }
  sections.missing_info = { done: r.missing_info.filter((m) => m && m.resolved).length, total: r.missing_info.length }
  let done = 0
  let total = 0
  for (const value of Object.values(sections)) {
    done += value.done
    total += value.total
  }
  return { done, total, sections, complete: total > 0 && done === total }
}

/**
 * "Confirm all": marks every item with a `confirmed` flag. The order of steps and the
 * missing information are NOT confirmed here — they need an explicit decision each.
 */
export function confirmAll(result) {
  const r = normalizeResult(result)
  const out = { ...r }
  for (const key of ITEM_SECTIONS) out[key] = r[key].map((item) => ({ ...item, confirmed: true }))
  return out
}

export function replaceAt(list, index, item) {
  const next = [...(list || [])]
  if (index < 0 || index >= next.length) return next
  next[index] = item
  return next
}

export function removeAt(list, index) {
  return (list || []).filter((_, i) => i !== index)
}

/** Move an element; out-of-range moves return an unchanged copy. */
export function moveInList(list, from, to) {
  const next = [...(list || [])]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Stable React keys from item ids; duplicate or missing ids get a positional suffix. */
export function itemKeys(list, prefix = 'k') {
  const seen = new Map()
  return (list || []).map((item, i) => {
    const base = item && item.id ? String(item.id) : `${prefix}${i}`
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    return count ? `${base}~${i}` : base
  })
}

export function knownSymbols(result) {
  return normalizeResult(result)
    .variables.map((v) => (v && v.symbol ? String(v.symbol).trim() : ''))
    .filter(Boolean)
}

/** Insert or update a variable by symbol (case-sensitive: "m" ≠ "M"). */
export function upsertVariable(variables, quantity) {
  const list = [...(variables || [])]
  const i = list.findIndex((v) => v && v.symbol === quantity.symbol)
  if (i >= 0) list[i] = { ...list[i], ...quantity }
  else list.push(quantity)
  return list
}

/** New variable with safe defaults (unknown provenance until the teacher says otherwise). */
export function blankVariable(symbol = '', extra = {}) {
  return {
    symbol,
    name: '',
    unit: '',
    value: null,
    min: null,
    max: null,
    step: null,
    role: 'input',
    provenance: 'unknown',
    source_ref: null,
    confirmed: false,
    ...extra,
  }
}

/** Add symbols that are used by a formula but missing from the variables table. */
export function addMissingVariables(result, symbols) {
  const r = normalizeResult(result)
  const known = new Set(knownSymbols(r))
  const extra = (symbols || []).filter((s) => s && !known.has(s)).map((s) => blankVariable(s))
  return extra.length ? { ...r, variables: [...r.variables, ...extra] } : r
}

/**
 * Resolve a missing-information entry. With a symbol and a finite value, the value becomes
 * a variable provided by the user (spec §6.2: "người dùng cung cấp"); the entry is marked
 * resolved either way.
 */
export function resolveMissing(result, index, { symbol, value, unit, name } = {}) {
  const r = normalizeResult(result)
  const item = r.missing_info[index]
  if (!item) return r
  const sym = String(symbol ?? item.symbol ?? '').trim()
  let variables = r.variables
  if (sym && typeof value === 'number' && Number.isFinite(value)) {
    const existing = variables.find((v) => v && v.symbol === sym)
    variables = upsertVariable(variables, {
      ...(existing || blankVariable(sym)),
      symbol: sym,
      name: (name ?? existing?.name ?? '') || String(item.text || '').slice(0, 200),
      unit: unit !== undefined && unit !== null && unit !== '' ? String(unit).slice(0, 40) : existing?.unit || '',
      value,
      provenance: 'user',
      source_ref: null,
      confirmed: true,
    })
  }
  const missing = replaceAt(r.missing_info, index, { ...item, symbol: sym || item.symbol || null, resolved: true })
  return { ...r, variables, missing_info: missing }
}

export function reopenMissing(result, index) {
  const r = normalizeResult(result)
  const item = r.missing_info[index]
  if (!item) return r
  return { ...r, missing_info: replaceAt(r.missing_info, index, { ...item, resolved: false }) }
}

/** "L, g" ← "L, g ,, L" (unique, trimmed, ≤ 20 items of ≤ 200 chars). */
export function parseSymbolList(text) {
  const out = []
  for (const part of String(text || '').split(/[,;\s]+/)) {
    const s = part.trim().slice(0, 200)
    if (s && !out.includes(s)) out.push(s)
    if (out.length >= 20) break
  }
  return out
}

/** Summary numbers for the Analyze step. */
export function analysisCounts(result) {
  const r = normalizeResult(result)
  return {
    formulas: r.formulas.length,
    variables: r.variables.length,
    steps: r.steps.length,
    objects: r.objects.length,
    missing: r.missing_info.filter((m) => !m.resolved).length,
    relations: r.relations.length,
    assumptions: r.assumptions.length,
  }
}

/**
 * The analysis prompt numbers the sources "[1]", "[2]"… in the order of
 * `analysis.source_ids`, and the model sometimes cites them that way in warnings or
 * missing-info notes. Teachers never see that numbering, so replace "[2]" (or "[1, 2]")
 * with the source titles. Unknown numbers are left untouched.
 */
export function nameSourceRefs(text, titles) {
  const value = String(text ?? '')
  if (!value || !Array.isArray(titles) || !titles.length) return value
  return value.replace(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\]/g, (match, list) => {
    const names = list.split(/[,;]/).map((n) => titles[Number(n.trim()) - 1])
    if (names.some((name) => !name)) return match
    return names.map((name) => `“${name}”`).join(', ')
  })
}
