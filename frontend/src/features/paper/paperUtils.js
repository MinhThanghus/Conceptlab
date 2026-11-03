/**
 * Pure helpers for the Paper2Explorer workspace (no React, no network).
 * Contract: backend/app/schemas/analysis.py (PaperStructure) and docs/LAB_SPEC.md.
 * Tested in paperUtils.test.js.
 */
import { BLOCK_TYPES, newId } from '../lab/specUtils.js'

/** Pages analysed by default ("first 15 pages", spec §9.1). */
export const DEFAULT_PAGE_COUNT = 15
/** Upper bound for one structure run, so long papers stay fast and within the model's budget. */
export const MAX_PAGES_PER_RUN = 30
/** Workspace tabs, in the order of spec §9.1. */
export const ITEM_KINDS = ['sections', 'equations', 'figures', 'tables', 'methods', 'candidates']

/** "1-15" for a long paper, "1-3" for a 3-page excerpt, "1" for a single page. */
export function defaultPageText(pageCount) {
  const n = Math.max(1, Math.min(DEFAULT_PAGE_COUNT, Number(pageCount) || DEFAULT_PAGE_COUNT))
  return n === 1 ? '1' : `1-${n}`
}

/**
 * Parse a page selection such as "1-5, 8, 10–12" into sorted, unique 1-based pages.
 * Returns `{ pages, error }`; `error` is null or
 * `{ code: 'empty' | 'syntax' | 'range' | 'tooMany', token?, page?, count?, max? }`.
 */
export function parsePageRanges(text, pageCount, max = MAX_PAGES_PER_RUN) {
  const normalized = String(text ?? '')
    .replace(/[‒-―−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .trim()
  if (!normalized) return { pages: [], error: { code: 'empty' } }
  const total = Number(pageCount) > 0 ? Number(pageCount) : null
  const pages = new Set()
  for (const token of normalized.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(token)
    if (!match) return { pages: [], error: { code: 'syntax', token: token.slice(0, 20) } }
    let from = Number(match[1])
    let to = match[2] === undefined ? from : Number(match[2])
    if (from > to) [from, to] = [to, from]
    if (from < 1) return { pages: [], error: { code: 'range', page: from, count: total } }
    if (total !== null && to > total) return { pages: [], error: { code: 'range', page: to, count: total } }
    to = Math.min(to, from + 10000)
    for (let p = from; p <= to; p += 1) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  if (sorted.length > max) return { pages: [], error: { code: 'tooMany', count: sorted.length, max } }
  return { pages: sorted, error: null }
}

/** [1, 2, 3, 5, 7, 8] → "1-3, 5, 7-8" (use `dash: '–'` for display text). */
export function formatPageRanges(pages, { dash = '-', sep = ', ' } = {}) {
  const sorted = [...new Set((pages || []).map(Number))].filter((p) => Number.isInteger(p) && p > 0).sort((a, b) => a - b)
  const out = []
  let start = null
  let prev = null
  const push = () => out.push(start === prev ? `${start}` : `${start}${dash}${prev}`)
  for (const p of sorted) {
    if (start === null) {
      start = p
      prev = p
    } else if (p === prev + 1) {
      prev = p
    } else {
      push()
      start = p
      prev = p
    }
  }
  if (start !== null) push()
  return out.join(sep)
}

/** Page ranges of the PDF outline's top-level entries → [{ title, from, to }]. */
export function tocRanges(toc, pageCount) {
  const entries = (Array.isArray(toc) ? toc : []).filter((e) => e && String(e.title || '').trim() && Number(e.page) >= 1)
  if (!entries.length) return []
  const top = Math.min(...entries.map((e) => Number(e.level) || 1))
  const tops = entries.filter((e) => (Number(e.level) || 1) === top)
  const total = Number(pageCount) > 0 ? Number(pageCount) : Math.max(...entries.map((e) => Number(e.page)))
  return tops
    .map((e, i) => {
      const from = Math.min(Number(e.page), total)
      const next = tops[i + 1]
      const to = next ? Math.max(from, Math.min(Number(next.page) - 1, total)) : total
      return { title: String(e.title).trim().slice(0, 120), from, to }
    })
    .filter((r) => r.from >= 1)
}

export function listItems(paper, kind) {
  const list = paper?.[kind]
  return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object') : []
}

export function findItem(paper, kind, id) {
  if (!id) return null
  return listItems(paper, kind).find((item) => item.id === id) || null
}

export function hasPaperContent(paper) {
  return ITEM_KINDS.some((kind) => listItems(paper, kind).length > 0)
}

/** Best citation of an item: the first SourceRef with a page, else the first one. */
export function firstRef(item) {
  const refs = Array.isArray(item?.source_refs) ? item.source_refs.filter(Boolean) : []
  return refs.find((r) => Number(r.page) >= 1) || refs[0] || null
}

/** Page where an item lives (sections use page_start), or null when unknown. */
export function itemPage(kind, item) {
  if (!item) return null
  if (kind === 'sections') return Number(item.page_start) >= 1 ? Number(item.page_start) : null
  const ref = firstRef(item)
  return Number(ref?.page) >= 1 ? Number(ref.page) : null
}

/** Where a "candidate for exploration" points: `{ kind, item }` or null. */
export function candidateTarget(paper, candidate) {
  if (!candidate?.ref_id) return null
  const order =
    {
      equation: ['equations'],
      figure: ['figures'],
      table: ['tables'],
      method: ['methods'],
      algorithm: ['equations', 'methods', 'figures'],
    }[candidate.kind] || ['equations', 'figures', 'tables', 'methods', 'sections']
  for (const kind of order) {
    const item = findItem(paper, kind, candidate.ref_id)
    if (item) return { kind, item }
  }
  return null
}

/** Other items cited on the same page of the same source (honest "also on this page" links). */
export function samePageItems(paper, sourceId, page, exclude = null) {
  if (!(Number(page) >= 1)) return []
  const out = []
  for (const kind of ['equations', 'figures', 'tables', 'methods']) {
    for (const item of listItems(paper, kind)) {
      if (exclude && exclude.kind === kind && exclude.id === item.id) continue
      const refs = Array.isArray(item.source_refs) ? item.source_refs : []
      const hit = refs.some((r) => r && Number(r.page) === Number(page) && (!sourceId || !r.source_id || r.source_id === sourceId))
      if (hit) out.push({ kind, item })
    }
  }
  return out
}

/** Is an equation / candidate / method about (scaled dot-product) attention? */
export function isAttentionRelated(...items) {
  return items.some((item) => {
    if (!item || typeof item !== 'object') return false
    if (item.algorithm === 'attention') return true
    const text = [item.title, item.label, item.reason, item.context, item.caption].filter(Boolean).join(' ')
    if (/attention|chú ý/i.test(text)) return true
    return /Q\s*K\s*\^\s*\{?\s*(T|\\top)/.test(String(item.latex || ''))
  })
}

/**
 * Ready-made small attention example (spec §9.3: Q, K, V → scores → softmax heatmap → weighted V).
 * Values are illustrative, chosen so the heatmap shows clear differences between tokens.
 */
export function attentionExampleBlock({ title = '', description = '', explanation = '', refs = [], language = 'vi' } = {}) {
  return {
    id: newId('b'),
    type: 'algorithm',
    title: String(title).slice(0, 200),
    description: String(description).slice(0, 2000),
    source_refs: (Array.isArray(refs) ? refs : []).filter(Boolean).slice(0, 20),
    confirmed: false,
    ai_generated: false,
    algorithm: 'attention',
    config: {
      tokens: language === 'en' ? ['I', 'love', 'cats'] : ['Tôi', 'yêu', 'mèo'],
      Q: [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      K: [
        [1, 0],
        [0, 1],
        [1, 1],
      ],
      V: [
        [1, 0],
        [0, 1],
        [0.5, 0.5],
      ],
    },
    explanation: String(explanation).slice(0, 12000),
  }
}

/**
 * Prepare an AI-proposed block (e.g. from explore-equation) for insertion into the Lab:
 * known type, unique id, review flags (AI-generated, not yet confirmed). Returns null if unusable.
 */
export function prepareBlockForLab(block, existingBlocks = []) {
  if (!block || typeof block !== 'object' || !BLOCK_TYPES.includes(block.type)) return null
  const taken = new Set((existingBlocks || []).map((b) => b?.id))
  const validId = typeof block.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(block.id)
  return {
    ...block,
    id: validId && !taken.has(block.id) ? block.id : newId('b'),
    title: typeof block.title === 'string' ? block.title.slice(0, 200) : '',
    description: typeof block.description === 'string' ? block.description.slice(0, 2000) : '',
    source_refs: Array.isArray(block.source_refs) ? block.source_refs.filter(Boolean).slice(0, 20) : [],
    confirmed: false,
    ai_generated: true,
  }
}

/**
 * The explore endpoint titles a block "(1) <whole context sentence>", which is far too long
 * for the lesson outline (the sentence is already the description). Keep short titles; else
 * use `named(label)` (e.g. "Khám phá phương trình (1)") or cut the text at a word boundary.
 */
export function conciseBlockTitle(title, label, named, max = 70) {
  const text = String(title || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  const cleanLabel = String(label || '').trim()
  if (cleanLabel && typeof named === 'function') return named(cleanLabel)
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}

/** Human name of a Meta model id ("muse-spark-1.3-contributor" → "Muse Spark 1.3 Contributor"). */
export function modelLabel(id) {
  const text = String(id || '').trim()
  if (!text) return ''
  if (/wonder/i.test(text)) return 'Muse Wonder'
  const spark = /muse-spark-(\d+(?:\.\d+)?)(-contributor)?/i.exec(text)
  if (spark) return `Muse Spark ${spark[1]}${spark[2] ? ' Contributor' : ''}`
  return text
}

/** Text sent to the tutor as the "selection" for an item (ChatContext.selection ≤ 2000 chars). */
export function selectionText(kind, item) {
  if (!item) return ''
  let text = ''
  if (kind === 'equations') text = [item.label, item.latex].filter(Boolean).join(' ')
  else if (kind === 'figures') text = [item.label, item.caption].filter(Boolean).join(': ')
  else if (kind === 'tables') text = [item.label, item.caption, (item.columns || []).join(' | ')].filter(Boolean).join(': ')
  else if (kind === 'methods') text = [item.title, item.summary].filter(Boolean).join(': ')
  else text = [item.title, item.summary].filter(Boolean).join(': ')
  return text.slice(0, 2000)
}

/** Variables with a value already stated (or entered), and those still missing a value. */
export function splitVariables(equation) {
  const vars = Array.isArray(equation?.variables) ? equation.variables.filter(Boolean) : []
  const known = vars.filter((v) => v.known_value !== null && v.known_value !== undefined && Number.isFinite(Number(v.known_value)))
  const unknown = vars.filter((v) => !known.includes(v))
  return { known, unknown }
}

/**
 * Parse a number typed by a learner. Vietnamese uses a decimal comma ("0,5"); English uses
 * commas as thousands separators ("1,000"). Returns null for empty input and NaN when invalid.
 */
export function parseNumberInput(text, lang = 'vi') {
  let s = String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/−/g, '-')
  if (!s) return null
  if (lang === 'vi') {
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number.NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

/** "m:ss" for an elapsed duration in milliseconds. */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** Clean an edited equation before saving it into analysis.paper (schema limits of PaperEquation). */
export function sanitizeEquation(eq) {
  const str = (v, max) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).slice(0, max)
  const provenance = ['document', 'user', 'assumption', 'unknown']
  return {
    ...eq,
    label: str(eq.label, 20),
    latex: str(eq.latex, 1000),
    expression: str(eq.expression, 400),
    context: str(eq.context, 2000),
    conditions: str(eq.conditions, 2000),
    variables: (Array.isArray(eq.variables) ? eq.variables : [])
      .filter((v) => v && String(v.symbol || '').trim())
      .slice(0, 30)
      .map((v) => {
        const value = v.known_value === '' || v.known_value === null || v.known_value === undefined ? null : Number(v.known_value)
        return {
          symbol: str(v.symbol, 200).trim(),
          meaning: str(v.meaning, 2000),
          unit: str(v.unit, 40),
          known_value: Number.isFinite(value) ? value : null,
          provenance: provenance.includes(v.provenance) ? v.provenance : 'unknown',
        }
      }),
    missing: (Array.isArray(eq.missing) ? eq.missing : [])
      .map((m) => str(m, 2000).trim())
      .filter(Boolean)
      .slice(0, 10),
  }
}
