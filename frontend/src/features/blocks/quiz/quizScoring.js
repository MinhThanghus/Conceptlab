/**
 * Quiz scoring — a faithful port of `score_question` / `submit_attempt` in
 * backend/app/services/share.py.
 *
 * Shared labs are ALWAYS scored on the server (POST /api/share/{code}/quiz-attempts) and the
 * learner view shows the server's QuizAttemptOut. These helpers score the studio preview
 * (no share code) locally with exactly the same rules, and return the same shape, so the
 * preview behaves like the real thing:
 *
 *   { id, score, total, results: [{ question_id, correct, correct_answer, explanation, option_feedback }] }
 *
 * `option_feedback` comes from the question itself: one line per option (mcq) or two lines for
 * True then False (truefalse), only when it lines up with the options; otherwise empty.
 *
 * Answer formats (QuizAnswerIn.answer): mcq / truefalse → option index (truefalse: 0 = true,
 * 1 = false); order → list of option indices from top to bottom; numeric → number.
 * Numeric tolerance is RELATIVE (0.03 = ±3 %); missing or 0 means the server default 2 %;
 * an expected value of 0 needs an exact 0.
 */

export const DEFAULT_TOLERANCE = 0.02

// Python float() syntax (digits may be grouped with "_"); inf/nan are rejected later anyway.
const PY_FLOAT = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/

/** Number from a JSON value or typed text ("2,01", "1.234,5", "1,234.5"); null when not a finite number. */
export function toNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null
  let number
  if (typeof value === 'number') {
    number = value
  } else if (typeof value === 'string') {
    let text = value.trim().replace(/[   ]/g, '')
    if (text.includes(',') && text.includes('.')) {
      // the last separator is the decimal one
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) text = text.replace(/\./g, '').replace(/,/g, '.')
      else text = text.replace(/,/g, '')
    } else if (text.includes(',')) {
      text = text.replace(/,/g, '.') // Vietnamese decimal comma: "2,01"
    }
    if (!text || text.length > 40 || !PY_FLOAT.test(text)) return null
    number = Number(text.replace(/_/g, ''))
  } else {
    return null
  }
  return Number.isFinite(number) ? number : null
}

/** Whole-number index (|n| ≤ 10 000) or null. */
export function toIndex(value) {
  const number = toNumber(value)
  if (number === null || !Number.isInteger(number) || Math.abs(number) > 10_000) return null
  return number
}

/** List of indices (≤ 50 items) or null when any item is not an index. */
export function toOrder(value) {
  if (!Array.isArray(value) || value.length > 50) return null
  const out = value.map(toIndex)
  return out.some((v) => v === null) ? null : out
}

/** Relative tolerance the server applies to a numeric question (missing / 0 → 2 %). */
export function effectiveTolerance(question) {
  return Math.abs(toNumber(question?.tolerance) || DEFAULT_TOLERANCE)
}

/**
 * Accepted interval for a numeric question, or null without a valid answer value.
 * `{ min, max, expected, tolerance, exact }` — `exact` when the expected value is 0.
 */
export function acceptedRange(question) {
  const expected = toNumber(question?.answer_value)
  if (expected === null) return null
  if (expected === 0) return { min: 0, max: 0, expected, tolerance: 0, exact: true }
  const tolerance = effectiveTolerance(question)
  const delta = tolerance * Math.abs(expected)
  return { min: expected - delta, max: expected + delta, expected, tolerance, exact: false }
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/** Feedback lines the marking returns with a question (like the server: only when they line up). */
export function optionFeedbackOf(question) {
  const kind = question?.kind || 'mcq'
  const lines = Array.isArray(question?.option_feedback) ? question.option_feedback.map((line) => String(line ?? '')) : []
  if (kind === 'mcq') return lines.length && lines.length === (Array.isArray(question?.options) ? question.options.length : 0) ? lines : []
  if (kind === 'truefalse') return lines.length === 2 ? lines : []
  return []
}

/** Score one answer → `{ correct, given, expected }` (given = normalized answer, expected = answer to reveal). */
export function scoreQuestion(question, answer) {
  const kind = question?.kind || 'mcq'
  if (kind === 'mcq' || kind === 'truefalse') {
    const given = toIndex(answer)
    const expected = question.answer_index ?? null
    return { correct: given !== null && given === expected, given, expected }
  }
  if (kind === 'order') {
    const given = toOrder(answer)
    const expected = question.answer_order ?? null
    return { correct: given !== null && Array.isArray(expected) && sameList(given, expected), given, expected }
  }
  if (kind === 'numeric') {
    const given = toNumber(answer)
    const expected = toNumber(question.answer_value)
    if (given === null || expected === null) return { correct: false, given, expected }
    if (expected === 0) return { correct: Math.abs(given) <= 1e-9, given, expected }
    return { correct: Math.abs(given - expected) <= effectiveTolerance(question) * Math.abs(expected), given, expected }
  }
  return { correct: false, given: null, expected: null }
}

/**
 * Score a whole attempt like the server does: only questions that are approved (missing flag
 * counts as approved, as on the server), in quiz order, first answer per question wins,
 * questions without an answer entry are left out of the total.
 * `answers` is the request payload: [{ question_id, answer }].
 */
export function scoreAttempt(questions, answers) {
  const byId = new Map()
  for (const q of questions || []) {
    if (q && typeof q === 'object' && (q.approved ?? true)) byId.set(String(q.id), q)
  }
  const given = new Map()
  for (const item of answers || []) {
    const id = String(item?.question_id ?? '')
    if (byId.has(id) && !given.has(id)) given.set(id, item.answer ?? null)
  }
  const results = []
  for (const [id, question] of byId) {
    if (!given.has(id)) continue
    const { correct, expected } = scoreQuestion(question, given.get(id))
    results.push({ question_id: id, correct, correct_answer: expected, explanation: question.explanation || '', option_feedback: optionFeedbackOf(question) })
  }
  return { id: null, score: results.filter((r) => r.correct).length, total: results.length, results }
}
