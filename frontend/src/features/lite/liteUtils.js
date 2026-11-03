/**
 * Pure helpers for ConceptLab Lite (no React, no network, no Three.js).
 * Everything here is unit-tested in liteUtils.test.js.
 */
import { checkCode, normalizeCode } from '../public/classCode.js'

export { checkCode, normalizeCode }

export const LITE_CACHE_PREFIX = 'cl.lite.lab.'
export const LITE_META_KEY = 'cl.lite.meta'
export const PROJECTOR_KEY = 'cl.lite.projector'

/** Normalised class code for Lite routes, or '' when unusable. */
export function liteCode(raw) {
  const code = normalizeCode(raw)
  return checkCode(code).ok ? code : ''
}

/** /lite/:code path for a raw code, or /lite when the code is unusable. */
export function litePath(raw) {
  const code = liteCode(raw)
  return code ? `/lite/${encodeURIComponent(code)}` : '/lite'
}

/** /s/:code path (full version) for the same lab. */
export function fullPath(raw) {
  const code = normalizeCode(raw)
  return code ? `/s/${encodeURIComponent(code)}` : '/s'
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim())

const TEX_SYMBOLS = {
  pi: 'π', approx: '≈', times: '×', cdot: '·', div: '÷', pm: '±', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  infty: '∞', to: '→', rightarrow: '→', degree: '°', circ: '°', Delta: 'Δ', delta: 'δ', theta: 'θ', alpha: 'α', beta: 'β',
  gamma: 'γ', omega: 'ω', Omega: 'Ω', lambda: 'λ', mu: 'μ', rho: 'ρ', sigma: 'σ', Sigma: 'Σ', phi: 'φ', varphi: 'φ', tau: 'τ',
}
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻', '+': '⁺' }
const SUBSCRIPT = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' }
const group = (inner) => (/^[\p{L}\p{N}.,]+$/u.test(inner) ? inner : `(${inner})`)

/**
 * A formula written in TeX, as readable text for Lite (which has no KaTeX): `2\pi\sqrt{L/g}`
 * reads `2π√(L/g)`, `0{,}25` reads `0,25`, `b^2` reads `b²`. Unknown commands keep their name.
 */
export function mathText(tex) {
  let out = String(tex || '').replace(/\{,\}/g, ',')
  out = out.replace(/\\(?:text|mathrm|mathbf|operatorname|textrm)\{([^{}]*)\}/g, '$1')
  for (let i = 0; i < 6; i += 1) {
    const before = out
    out = out
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `${group(a.trim())}/${group(b.trim())}`)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a) => `√${group(a.trim())}`)
    if (out === before) break
  }
  return out
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\^\{([-+]?\d+)\}|\^([-+]?\d)/g, (_, a, b) => [...(a ?? b)].map((c) => SUPERSCRIPT[c] ?? c).join(''))
    .replace(/_\{(\d+)\}|_(\d)/g, (_, a, b) => [...(a ?? b)].map((c) => SUBSCRIPT[c] ?? c).join(''))
    .replace(/\\(left|right)\b/g, '')
    .replace(/\\([A-Za-z]+)/g, (_, name) => TEX_SYMBOLS[name] ?? name)
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Plain-text paragraphs from markdown-lite source: markers removed, formulas kept as readable text. */
export function plainParagraphs(source) {
  return String(source || '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((chunk) =>
      chunk
        .split('\n')
        .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+|#{1,4}\s+)/, ''))
        .join(' ')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*\s][^*]*)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\$\$?([^$]+)\$\$?/g, (_, tex) => mathText(tex))
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)
}

/** First non-empty formula-like field of a block (graph expression or quantity formulas). */
export function keyFormula(block) {
  if (!block) return ''
  if (text(block.expression)) return text(block.expression)
  const params = Array.isArray(block.params) ? block.params : []
  const withFormula = params.find((p) => text(p?.formula))
  return withFormula ? text(withFormula.formula) : ''
}

/** Quantities of a graph/simulation block, normalised for a simple table. */
export function blockParams(block) {
  const params = Array.isArray(block?.params) ? block.params : []
  return params
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      symbol: text(p.symbol),
      name: text(p.name),
      unit: text(p.unit),
      value: p.value === null || p.value === undefined || p.value === '' ? '' : String(p.value),
      provenance: ['document', 'user', 'assumption', 'unknown'].includes(p.provenance) ? p.provenance : 'unknown',
    }))
    .filter((p) => p.symbol || p.name || p.value)
}

/** Approved quiz questions only (the published snapshot already filters; this is defence in depth). */
export function liteQuestions(block) {
  return (Array.isArray(block?.questions) ? block.questions : []).filter((q) => q && q.id && q.approved)
}

/** Server payload for POST /api/share/{code}/quiz-attempts. Unanswered questions are sent as null. */
export function quizPayload(block, answers) {
  const questions = liteQuestions(block)
  return {
    block_id: block.id,
    answers: questions.map((q) => ({ question_id: q.id, answer: answerValue(q, answers?.[q.id]) })),
  }
}

function answerValue(question, raw) {
  if (question.kind === 'numeric') {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null
    const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  if (question.kind === 'order') {
    const count = Array.isArray(question.options) ? question.options.length : 0
    return count > 0 && Array.isArray(raw) && raw.length === count && new Set(raw).size === count && raw.every((n) => Number.isInteger(n) && n >= 0 && n < count) ? raw : null
  }
  // mcq / truefalse: index or null
  return Number.isInteger(raw) ? raw : null
}

/** True when every approved question has an answer (used to enable the Check button honestly). */
export function allAnswered(block, answers) {
  const questions = liteQuestions(block)
  return questions.length > 0 && questions.every((q) => answerValue(q, answers?.[q.id]) !== null)
}

/**
 * Where an order question starts: the server's own order (learner payloads list the options in a
 * shuffle and carry no key). An older payload that still lists them solved, with its key, starts
 * one step rotated, so the answer is never shown before the learner has worked on it.
 */
export function liteOrderStart(question) {
  const n = Array.isArray(question?.options) ? question.options.length : 0
  const start = Array.from({ length: n }, (_, i) => i)
  const key = question?.answer_order
  const solved = Array.isArray(key) && key.length === n && key.every((v, i) => v === i)
  return solved && n >= 2 ? [...start.slice(1), start[0]] : start
}

/**
 * What to show under a marked question, from the server's result (never from the question,
 * which learners get without answers): the feedback for the option the learner chose, and the
 * right answer in words (an option, the items in order, or a number with its unit). For a number,
 * `margin` is the relative tolerance the server marked with when the result says so (never a
 * guess), and `exact` is true when the right answer is 0 (no margin around it).
 */
export function liteReview(question, review, given, { trueLabel = 'True', falseLabel = 'False' } = {}) {
  if (!review) return null
  const kind = question?.kind || 'mcq'
  const out = { correct: Boolean(review.correct), chosenFeedback: '', correctText: '', correctOrder: [], correctValue: null, margin: null, exact: false }
  const answer = review.correct_answer
  if (kind === 'mcq' || kind === 'truefalse') {
    const labels = kind === 'truefalse' ? [trueLabel, falseLabel] : (Array.isArray(question?.options) ? question.options : []).map(text)
    const feedback = Array.isArray(review.option_feedback) ? review.option_feedback : []
    if (Number.isInteger(given) && feedback.length === labels.length) out.chosenFeedback = text(feedback[given])
    if (Number.isInteger(answer) && answer >= 0 && answer < labels.length) out.correctText = text(labels[answer])
  } else if (kind === 'order' && Array.isArray(answer)) {
    out.correctOrder = answer.map((i) => text(question?.options?.[i])).filter(Boolean)
  } else if (kind === 'numeric' && typeof answer === 'number' && Number.isFinite(answer)) {
    out.correctValue = answer
    const margin = review.tolerance === null || review.tolerance === undefined || review.tolerance === '' ? NaN : Math.abs(Number(review.tolerance))
    if (answer === 0) out.exact = true
    else if (Number.isFinite(margin) && margin > 0) out.margin = margin
  }
  return out
}

/** Display labels for one question in Lite (true/false uses fixed wording via i18n keys by caller). */
export function optionLabels(question, trueLabel, falseLabel) {
  if (question?.kind === 'truefalse') return [trueLabel, falseLabel]
  return Array.isArray(question?.options) ? question.options.map((o) => text(o)) : []
}

/** Sequential sections for the Lite reading order: one entry per block, in spec order. */
export function buildSections(lab) {
  const blocks = Array.isArray(lab?.spec?.blocks) ? lab.spec.blocks : []
  return blocks
    .filter((b) => b && b.id && b.type)
    .map((block, i) => ({
      index: i + 1,
      id: block.id,
      type: block.type,
      title: text(block.title),
      description: text(block.description),
      block,
    }))
}

/** Image URLs worth caching for offline reading (source files, page renders, assets, cover). */
export function collectImageUrls(lab) {
  const urls = new Set()
  const code = text(lab?.share_code).toUpperCase()
  const add = (u) => {
    if (typeof u === 'string' && code && u.startsWith(`/api/share/${encodeURIComponent(code)}/`)) urls.add(u)
  }
  add(lab?.cover_url)
  for (const asset of lab?.assets || []) add(asset?.url)
  for (const source of lab?.sources || []) {
    if (source?.kind === 'image') add(source?.urls?.file)
    if (source?.kind === 'video') add(source?.urls?.poster)
  }
  // Highlighted step/diagram pictures resolve through the share-scoped source routes.
  if (code) {
    const byId = new Map((lab?.sources || []).map((s) => [s.id, s]))
    const visit = (node) => {
      if (Array.isArray(node)) node.forEach(visit)
      else if (node && typeof node === 'object') {
        const sid = node.source_id
        const src = sid ? byId.get(sid) : null
        if (src?.kind === 'image') add(src.urls?.file)
        if (src?.kind === 'pdf' && Number.isInteger(node.page) && src.urls?.page) {
          add(src.urls.page.replace('{n}', String(node.page)))
        }
        Object.values(node).forEach(visit)
      }
    }
    visit(lab?.spec?.blocks || [])
  }
  return [...urls]
}

/** Share-scoped URL of a source file or PDF page, using the lab's own source record. */
export function sourceImageUrl(lab, ref) {
  if (!ref) return ''
  if (ref.asset_id) return (lab?.assets || []).find((a) => a.id === ref.asset_id)?.url || ''
  if (!ref.source_id) return ''
  const source = (lab?.sources || []).find((s) => s.id === ref.source_id)
  if (!source) return ''
  if (source.kind === 'pdf' && Number.isInteger(ref.page) && source.urls?.page) {
    return source.urls.page.replace('{n}', String(ref.page))
  }
  return source.urls?.file || ''
}

/** Human list of sources for the Lite sources section. */
export function liteSources(lab) {
  return (lab?.sources || [])
    .filter((s) => s && s.id)
    .map((s) => ({ id: s.id, kind: s.kind || 'note', title: text(s.title) || s.id, pageCount: s.page_count || null, url: s.urls?.file || '', note: s.kind === 'note' ? text(s.text) : '' }))
}

/** Cache key for one lab code. */
export function cacheKeyFor(code) {
  return `${LITE_CACHE_PREFIX}${String(code || '').toUpperCase()}`
}
