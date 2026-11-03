/**
 * Pure helpers for the quiz block (editor + learner view). No React — see quizModel.test.js.
 *
 * Question shape (backend/app/schemas/spec.py → QuizQuestion):
 *   { id, kind: mcq|truefalse|order|numeric, context, prompt, options[], answer_index, answer_order,
 *     answer_value, tolerance (relative), unit, hint, cognitive_level, option_feedback[],
 *     explanation, source_refs[], approved }
 *
 * `option_feedback` is either empty or one line per option in option order (mcq) or exactly two
 * lines for answering True then False (truefalse). Learners only ever get it back with the
 * marking result, never before they check (it would give the answer away).
 *
 * Editor convention for `order` questions: the teacher types the items in the CORRECT order,
 * so the editor always stores `answer_order = [0, 1, …]`. AI questions arrive shuffled with a
 * permutation; they are normalized to the same convention when added. The learner payload has
 * no answer key and already shows the options in a server-side shuffle, which is kept as is.
 */
import { LIMITS, cut, identity, parseDecimal, shuffledIndices, uniqueId } from '../steps/lessonKit.js'
import { toNumber } from './quizScoring.js'

export const KINDS = ['mcq', 'truefalse', 'order', 'numeric']
export const PHASES = ['practice', 'pre', 'post']
/** Thinking levels, easiest first (vi: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao). */
export const LEVELS = ['recall', 'understand', 'apply', 'extend']
export const MAX_AI_COUNT = 10
/** Longest feedback line for one option (backend: option_feedback items ≤ 400). */
export const FEEDBACK_MAX = 400

/** Ids the AI generator gives questions (backend/app/services/quiz_gen.py: `q_<8 hex>`). */
const AI_ID = /^q_[0-9a-f]{8}$/

const EMPTY = {
  context: '',
  prompt: '',
  options: [],
  answer_index: null,
  answer_order: null,
  answer_value: null,
  tolerance: null,
  unit: '',
  hint: '',
  cognitive_level: null,
  option_feedback: [],
  explanation: '',
  source_refs: [],
  approved: false,
}

const KIND_FIELDS = {
  mcq: ['options', 'answer_index', 'option_feedback'],
  truefalse: ['options', 'answer_index', 'option_feedback'],
  order: ['options', 'answer_order'],
  numeric: ['answer_value', 'tolerance', 'unit'],
}

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
const filled = (text) => Boolean(String(text ?? '').trim())

/** Questions learners may see (the published snapshot only contains these). */
export function approvedQuestions(block) {
  return (block?.questions || []).filter((q) => q && typeof q === 'object' && q.id && q.approved)
}

/** Quiz phase from the page URL: `?phase=pre|post`, anything else is practice. */
export function phaseFromSearch(search) {
  let value = null
  try {
    value = new URLSearchParams(search || '').get('phase')
  } catch {
    value = null
  }
  return value === 'pre' || value === 'post' ? value : 'practice'
}

/** True for questions written by the AI generator (they keep its id pattern). */
export function isAiQuestion(question) {
  return AI_ID.test(String(question?.id ?? ''))
}

function randomHex(bytes) {
  const out = new Uint8Array(bytes)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(out)
  else for (let i = 0; i < bytes; i += 1) out[i] = Math.floor(Math.random() * 256)
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A fresh AI-style id (`q_<8 hex>`) not in `taken`. */
export function aiQuestionId(taken = new Set()) {
  let id = `q_${randomHex(4)}`
  while (taken.has(id)) id = `q_${randomHex(4)}`
  return id
}

/** `answer_order` is a permutation of 0..n-1. */
export function validPermutation(order, n) {
  if (!Array.isArray(order) || order.length !== n) return false
  if (!order.every((v) => Number.isInteger(v))) return false
  return sameList([...order].sort((a, b) => a - b), identity(n))
}

function kindDefaults(kind) {
  switch (kind) {
    case 'truefalse':
      return { options: [], answer_index: null }
    case 'order':
      return { options: ['', '', ''], answer_order: identity(3) }
    case 'numeric':
      return { answer_value: null, tolerance: null, unit: '' }
    case 'mcq':
    default:
      return { options: ['', '', '', ''], answer_index: null }
  }
}

/** A new teacher-written question (id prefix `qt_`, never mistaken for an AI one). */
export function newQuestion(kind = 'mcq', taken = []) {
  const safeKind = KINDS.includes(kind) ? kind : 'mcq'
  return { ...EMPTY, id: uniqueId('qt', taken), kind: safeKind, ...kindDefaults(safeKind) }
}

/** Options of an `order` question listed in the correct order (stored order when the answer is broken). */
export function orderedOptions(question) {
  const options = Array.isArray(question?.options) ? question.options : []
  return validPermutation(question?.answer_order, options.length) ? question.answer_order.map((i) => options[i]) : [...options]
}

/** Store `options` as the correct order (`answer_order = [0, 1, …]`). */
export function setOrderOptions(question, options) {
  return { ...question, options, answer_order: identity(options.length) }
}

/**
 * Switch a question to another kind. What the old kind used is kept in `stash` so switching
 * back restores it; options carry over between multiple choice and ordering.
 * Changing the kind always withdraws the approval (the answer has to be checked again).
 * Returns `{ question, stash }`.
 */
export function changeKind(question, kind, stash = {}) {
  const from = KINDS.includes(question?.kind) ? question.kind : 'mcq'
  if (from === kind || !KINDS.includes(kind)) return { question, stash }
  const saved = { ...stash, [from]: Object.fromEntries(KIND_FIELDS[from].map((key) => [key, question[key] ?? EMPTY[key]])) }
  // option feedback belongs to the old options: it never carries over to another kind
  const cleared = {
    ...question,
    kind,
    options: [],
    answer_index: null,
    answer_order: null,
    answer_value: null,
    tolerance: null,
    unit: '',
    option_feedback: [],
    approved: false,
  }
  let restored = saved[kind]
  if (!restored) {
    const listOptions = from === 'order' ? orderedOptions(question) : question.options || []
    if (kind === 'order' && from === 'mcq' && listOptions.some(filled)) restored = { options: [...listOptions], answer_order: identity(listOptions.length) }
    else if (kind === 'mcq' && from === 'order' && listOptions.some(filled)) restored = { options: [...listOptions], answer_index: null }
    else restored = kindDefaults(kind)
  }
  return { question: { ...cleared, ...restored }, stash: saved }
}

const normKey = (text) => String(text ?? '').trim().toLocaleLowerCase()
const hasDuplicates = (options) => {
  const keys = options.map(normKey).filter(Boolean)
  return new Set(keys).size !== keys.length
}

/**
 * What still blocks approval. Mirrors the publish check `quiz_answers`
 * (backend/app/services/validation.py) plus a duplicate-option check.
 * Codes: empty_prompt, too_few_options, empty_option, duplicate_option, no_answer,
 * truefalse_options, order_invalid, missing_value, bad_tolerance, unknown_kind.
 */
export function questionIssues(question) {
  const issues = []
  const kind = question?.kind || 'mcq'
  const options = Array.isArray(question?.options) ? question.options : []
  if (!filled(question?.prompt)) issues.push('empty_prompt')
  const index = question?.answer_index
  const indexOk = Number.isInteger(index)
  if (kind === 'mcq') {
    if (options.length < 2) issues.push('too_few_options')
    if (options.some((o) => !filled(o))) issues.push('empty_option')
    else if (hasDuplicates(options)) issues.push('duplicate_option')
    if (!indexOk || index < 0 || index >= options.length) issues.push('no_answer')
  } else if (kind === 'truefalse') {
    if (!indexOk || (index !== 0 && index !== 1)) issues.push('no_answer')
    if (options.length && options.length !== 2) issues.push('truefalse_options')
  } else if (kind === 'order') {
    if (options.length < 2) issues.push('too_few_options')
    if (options.some((o) => !filled(o))) issues.push('empty_option')
    else if (hasDuplicates(options)) issues.push('duplicate_option')
    if (!validPermutation(question?.answer_order, options.length)) issues.push('order_invalid')
  } else if (kind === 'numeric') {
    if (toNumber(question?.answer_value) === null) issues.push('missing_value')
    if (question?.tolerance !== null && question?.tolerance !== undefined) {
      const tolerance = toNumber(question.tolerance)
      if (tolerance === null || tolerance < 0) issues.push('bad_tolerance')
    }
  } else {
    issues.push('unknown_kind')
  }
  return issues
}

/** Anything worth confirming before deleting the question. */
export function hasContent(question) {
  const hasValue = question?.answer_value !== null && question?.answer_value !== undefined
  return Boolean(
    filled(question?.prompt) ||
      filled(question?.context) ||
      filled(question?.hint) ||
      filled(question?.explanation) ||
      (question?.options || []).some(filled) ||
      (Array.isArray(question?.option_feedback) ? question.option_feedback : []).some(filled) ||
      hasValue ||
      question?.source_refs?.length,
  )
}

// ------------------------------------------------------------------ option feedback

/** How many feedback lines a question takes: one per option (mcq), two (true/false), else none. */
export function feedbackSlots(question) {
  const kind = question?.kind || 'mcq'
  if (kind === 'mcq') return Array.isArray(question?.options) ? question.options.length : 0
  if (kind === 'truefalse') return 2
  return 0
}

/** Feedback padded or cut to `n` lines (strings), for editing next to the options. */
export function alignFeedback(list, n) {
  const lines = Array.isArray(list) ? list : []
  return Array.from({ length: Math.max(0, n) }, (_, i) => (typeof lines[i] === 'string' ? lines[i] : ''))
}

/** What is stored: nothing when every line is blank, otherwise every line (kept aligned). */
export function compactFeedback(list) {
  const lines = Array.isArray(list) ? list.map((line) => cut(line ?? '', FEEDBACK_MAX)) : []
  return lines.some(filled) ? lines : []
}

/** Patch that sets the feedback line of option `index`. */
export function setFeedbackLine(question, index, text) {
  const lines = alignFeedback(question?.option_feedback, feedbackSlots(question))
  if (index < 0 || index >= lines.length) return {}
  lines[index] = text
  return { option_feedback: compactFeedback(lines) }
}

/** Patch that adds an empty multiple-choice option (its feedback line too, when there is feedback). */
export function addChoiceOption(question) {
  const options = Array.isArray(question?.options) ? question.options : []
  if (options.length >= LIMITS.options) return {}
  const lines = alignFeedback(question?.option_feedback, options.length)
  return { options: [...options, ''], option_feedback: compactFeedback([...lines, '']) }
}

/** Patch that removes option `index` with its feedback line and keeps the answer on the same option. */
export function removeChoiceOption(question, index) {
  const options = Array.isArray(question?.options) ? question.options : []
  if (options.length <= 2 || index < 0 || index >= options.length) return {}
  const answer = Number.isInteger(question?.answer_index) ? question.answer_index : null
  const lines = alignFeedback(question?.option_feedback, options.length)
  return {
    options: options.filter((_, j) => j !== index),
    option_feedback: compactFeedback(lines.filter((_, j) => j !== index)),
    answer_index: answer === null || answer === index ? null : answer > index ? answer - 1 : answer,
  }
}

/**
 * Feedback lines to show after checking, in public option order: the marking result's
 * (the server returns them only then), else the question's own (studio preview). Lines that do
 * not match the options one to one are ignored, they could point at the wrong option.
 */
export function reviewFeedback(question, review) {
  const n = feedbackSlots(question)
  const pick = (list) => (Array.isArray(list) && list.length === n && n > 0 ? list.map((line) => String(line ?? '').trim()) : null)
  return pick(review?.option_feedback) || pick(question?.option_feedback) || []
}

/** The question's thinking level when it is a known one, else null. */
export function questionLevel(question) {
  return LEVELS.includes(question?.cognitive_level) ? question.cognitive_level : null
}

/** Prompt as a one-line title for lists. */
export function questionTitle(question, max = 140) {
  const text = String(question?.prompt ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  let cut = text.slice(0, max - 1)
  // never end inside $math$: the title is rendered with its formulas
  if ((cut.match(/\$/g) || []).length % 2) cut = cut.slice(0, cut.lastIndexOf('$')).trimEnd()
  return `${cut}…`
}

/**
 * Clean a question returned by POST /ai/quiz before it joins the block: schema limits,
 * unique AI-style id, `approved: false`, order items rewritten in the correct order, the
 * context / hint / level kept, and option feedback kept only when it lines up with the options.
 * `taken` (Set of ids) is updated.
 */
export function normalizeGenerated(raw, taken = new Set()) {
  const kind = KINDS.includes(raw?.kind) ? raw.kind : 'mcq'
  const rawId = typeof raw?.id === 'string' ? raw.id : ''
  const id = AI_ID.test(rawId) && !taken.has(rawId) ? rawId : aiQuestionId(taken)
  taken.add(id)
  const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const rawOptions = Array.isArray(raw?.options) ? raw.options : []
  const rawFeedback = Array.isArray(raw?.option_feedback) ? raw.option_feedback : []
  // one line per option, in the same order; anything else could praise the wrong option
  let feedback = []
  if (kind === 'mcq' && rawFeedback.length === rawOptions.length) feedback = rawFeedback.slice(0, LIMITS.options)
  else if (kind === 'truefalse' && rawFeedback.length === 2) feedback = rawFeedback
  let question = {
    ...EMPTY,
    id,
    kind,
    context: cut(raw?.context ?? '', LIMITS.medium),
    prompt: cut(raw?.prompt ?? '', LIMITS.medium),
    options: rawOptions.slice(0, LIMITS.options).map((o) => cut(o ?? '', LIMITS.short)),
    answer_index: Number.isInteger(raw?.answer_index) ? raw.answer_index : null,
    answer_order: Array.isArray(raw?.answer_order) ? raw.answer_order.slice(0, LIMITS.options) : null,
    answer_value: finite(raw?.answer_value),
    tolerance: finite(raw?.tolerance),
    unit: cut(raw?.unit ?? '', LIMITS.unit),
    hint: cut(raw?.hint ?? '', LIMITS.medium),
    cognitive_level: questionLevel(raw),
    option_feedback: compactFeedback(feedback.map((line) => (typeof line === 'string' ? line : ''))),
    explanation: cut(raw?.explanation ?? '', LIMITS.medium),
    source_refs: (Array.isArray(raw?.source_refs) ? raw.source_refs : []).slice(0, LIMITS.questionRefs),
    approved: false,
  }
  if (kind === 'order' && validPermutation(question.answer_order, question.options.length)) {
    question = setOrderOptions(question, orderedOptions(question))
  }
  return question
}

// ------------------------------------------------------------------ learner helpers

/** FNV-1a 32-bit hash (stable seed from a string). */
export function hashSeed(text) {
  let hash = 0x811c9dc5
  const value = String(text ?? '')
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: small deterministic PRNG returning [0, 1). */
export function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The order a learner first sees for an `order` question.
 * - Learner payloads carry no answer key and the server already lists the options in a
 *   deterministic shuffle that is never the solved order: that public order is kept as is.
 * - With the key at hand (studio preview, where options are stored in the solved order): a
 *   shuffle seeded by the question (same on every reload) that is never the correct answer.
 */
export function initialArrangement(question) {
  const options = Array.isArray(question?.options) ? question.options : []
  const n = options.length
  const correct = validPermutation(question?.answer_order, n) ? question.answer_order : null
  if (!correct) return identity(n)
  const rng = seededRandom(hashSeed(`${question?.id ?? ''}|${options.join('␟')}`))
  let order = shuffledIndices(n, rng)
  if (n >= 2 && sameList(order, correct)) order = [...order.slice(1), order[0]]
  return order
}

/**
 * Learner answer state per kind: mcq/truefalse → option index; order → `{ order, moved }`;
 * numeric → the text typed. An order question counts as answered once something was moved.
 */
export function isAnswered(question, value) {
  const kind = question?.kind || 'mcq'
  if (kind === 'mcq' || kind === 'truefalse') return Number.isInteger(value)
  if (kind === 'order') return Boolean(value?.moved)
  if (kind === 'numeric') return parseDecimal(value ?? '') !== null
  return false
}

/** The `answer` sent to the server (or the local scorer) for a learner answer state. */
export function answerPayload(question, value) {
  const kind = question?.kind || 'mcq'
  if (kind === 'mcq' || kind === 'truefalse') return Number.isInteger(value) ? value : null
  if (kind === 'order') return Array.isArray(value?.order) ? [...value.order] : initialArrangement(question)
  if (kind === 'numeric') return parseDecimal(value ?? '')
  return null
}

/**
 * Keep only saved answers that still fit the questions (a restored draft may be stale or
 * edited by hand): option indices in range, orders that are permutations, short number text.
 */
export function sanitizeAnswers(questions, raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const question of questions || []) {
    const value = raw[question?.id]
    const kind = question?.kind || 'mcq'
    const n = Array.isArray(question?.options) ? question.options.length : 0
    if (kind === 'mcq' && Number.isInteger(value) && value >= 0 && value < n) out[question.id] = value
    else if (kind === 'truefalse' && (value === 0 || value === 1)) out[question.id] = value
    else if (kind === 'order' && value && typeof value === 'object' && validPermutation(value.order, n)) {
      out[question.id] = { order: [...value.order], moved: Boolean(value.moved) }
    } else if (kind === 'numeric' && typeof value === 'string' && value.length <= 40) out[question.id] = value
  }
  return out
}

/** Which items of an arrangement sit in their correct place. */
export function positionMarks(arrangement, correct) {
  return (arrangement || []).map((v, i) => Array.isArray(correct) && correct[i] === v)
}

/** Index of the first question the marking says is not correct (unanswered ones included), or -1. */
export function firstMissed(questions, results) {
  const byId = new Map((Array.isArray(results) ? results : []).map((r) => [String(r?.question_id), r]))
  return (questions || []).findIndex((q) => byId.get(String(q?.id))?.correct === false)
}

/**
 * The missed question to review after `current`: the next one further on, else the first one
 * again (so the button walks through every miss), or -1 when nothing was missed.
 */
export function nextMissed(questions, results, current = -1) {
  const byId = new Map((Array.isArray(results) ? results : []).map((r) => [String(r?.question_id), r]))
  const missed = (questions || []).map((q, i) => (byId.get(String(q?.id))?.correct === false ? i : -1)).filter((i) => i >= 0)
  if (!missed.length) return -1
  return missed.find((i) => i > current) ?? missed[0]
}

/**
 * How long a quiz text reads on screen: markdown marks dropped, a formula counted by its source
 * (at most 12 characters), spaces collapsed, Vietnamese letters counted once however they were
 * typed (NFC). Used to pick the slide type size, never to cut text.
 */
export function textLength(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/\$\$?([^$]*)\$\$?/g, (_, math) => math.trim().slice(0, 12))
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim().length
}

/**
 * Lesson slides set a short question a size up (one line at the slide's title size) and short
 * answers a size up too (one line each in two columns), unless the slide is already full: a long
 * situation with long answers (`busy`, all their characters together) keeps the stem at the lead
 * size. Measured in characters (`textLength`).
 */
export const DECK_SHORT = { stem: 52, option: 28, item: 16, busy: 260 }

/** True when every text in the list reads short (an empty list is not short). */
export function allShort(texts, max) {
  const list = Array.isArray(texts) ? texts : []
  return list.length > 0 && list.every((text) => textLength(text) <= max)
}

/** How a lesson slide sets a question: `{ stem, answers }`, each 'short' (a size up) or 'long'. */
export function deckSizes(question) {
  const kind = KINDS.includes(question?.kind) ? question.kind : 'mcq'
  const options = Array.isArray(question?.options) ? question.options : []
  const answers =
    kind === 'truefalse' || (kind === 'mcq' && allShort(options, DECK_SHORT.option)) || (kind === 'order' && allShort(options, DECK_SHORT.item))
  const load = textLength(question?.context) + (kind === 'truefalse' ? 0 : options.reduce((sum, option) => sum + textLength(option), 0))
  const stem = textLength(question?.prompt) <= DECK_SHORT.stem && load <= DECK_SHORT.busy
  return { stem: stem ? 'short' : 'long', answers: answers ? 'short' : 'long' }
}

/** Encouragement band for the final score. */
export function scoreTier(score, total) {
  if (!total) return 'keepGoing'
  const ratio = score / total
  if (ratio >= 1) return 'perfect'
  if (ratio >= 0.7) return 'great'
  if (ratio >= 0.4) return 'good'
  return 'keepGoing'
}

/** A, B, C… for multiple-choice options. */
export function optionLetter(index) {
  return index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}
