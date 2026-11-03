import { describe, expect, it } from 'vitest'
import { DEFAULT_TOLERANCE, acceptedRange, effectiveTolerance, optionFeedbackOf, scoreAttempt, scoreQuestion, toIndex, toNumber, toOrder } from './quizScoring.js'

const mcq = { id: 'q1', kind: 'mcq', options: ['A', 'B', 'C'], answer_index: 1, explanation: 'B is right', approved: true }
const tf = { id: 'q2', kind: 'truefalse', options: ['Đúng', 'Sai'], answer_index: 1, approved: true }
const order = { id: 'q3', kind: 'order', options: ['x', 'y', 'z'], answer_order: [2, 0, 1], approved: true }
const numeric = { id: 'q4', kind: 'numeric', answer_value: 1.003, tolerance: 0.03, unit: 's', approved: true }

describe('toNumber (mirror of the server parser)', () => {
  it('reads numbers and Vietnamese/English text', () => {
    expect(toNumber(2.5)).toBe(2.5)
    expect(toNumber('2,01')).toBe(2.01)
    expect(toNumber(' 2.01 ')).toBe(2.01)
    expect(toNumber('1.234,5')).toBe(1234.5)
    expect(toNumber('1,234.5')).toBe(1234.5)
    expect(toNumber('1 000,5')).toBe(1000.5)
    expect(toNumber('-3')).toBe(-3)
    expect(toNumber('4e2')).toBe(400)
    expect(toNumber('1_000')).toBe(1000)
  })

  it('rejects what the server rejects', () => {
    expect(toNumber(null)).toBeNull()
    expect(toNumber(undefined)).toBeNull()
    expect(toNumber(true)).toBeNull()
    expect(toNumber('')).toBeNull()
    expect(toNumber('abc')).toBeNull()
    expect(toNumber('0x10')).toBeNull()
    expect(toNumber('inf')).toBeNull()
    expect(toNumber('nan')).toBeNull()
    expect(toNumber(Infinity)).toBeNull()
    expect(toNumber(NaN)).toBeNull()
    expect(toNumber('1.000.000')).toBeNull()
    expect(toNumber('9'.repeat(41))).toBeNull()
    expect(toNumber([1])).toBeNull()
    expect(toNumber({})).toBeNull()
  })

  it('reads indices and orders', () => {
    expect(toIndex(2)).toBe(2)
    expect(toIndex('2')).toBe(2)
    expect(toIndex(2.0)).toBe(2)
    expect(toIndex(2.5)).toBeNull()
    expect(toIndex(10_001)).toBeNull()
    expect(toIndex(false)).toBeNull()
    expect(toOrder([2, '0', 1])).toEqual([2, 0, 1])
    expect(toOrder([0, 'x'])).toBeNull()
    expect(toOrder('0,1')).toBeNull()
    expect(toOrder(Array.from({ length: 51 }, (_, i) => i))).toBeNull()
  })
})

describe('scoreQuestion', () => {
  it('scores multiple choice by index', () => {
    expect(scoreQuestion(mcq, 1)).toEqual({ correct: true, given: 1, expected: 1 })
    expect(scoreQuestion(mcq, '1').correct).toBe(true)
    expect(scoreQuestion(mcq, 0).correct).toBe(false)
    expect(scoreQuestion(mcq, null)).toEqual({ correct: false, given: null, expected: 1 })
    expect(scoreQuestion(mcq, 1.5).correct).toBe(false)
    expect(scoreQuestion({ ...mcq, answer_index: null }, 0).correct).toBe(false)
    expect(scoreQuestion({ ...mcq, kind: undefined }, 1).correct).toBe(true) // kind defaults to mcq
  })

  it('scores true/false (0 = true, 1 = false)', () => {
    expect(scoreQuestion(tf, 1).correct).toBe(true)
    expect(scoreQuestion(tf, 0).correct).toBe(false)
    expect(scoreQuestion(tf, true).correct).toBe(false) // booleans are not indices
  })

  it('scores an order only when every position matches', () => {
    expect(scoreQuestion(order, [2, 0, 1])).toEqual({ correct: true, given: [2, 0, 1], expected: [2, 0, 1] })
    expect(scoreQuestion(order, ['2', '0', '1']).correct).toBe(true)
    expect(scoreQuestion(order, [0, 1, 2]).correct).toBe(false)
    expect(scoreQuestion(order, [2, 0]).correct).toBe(false)
    expect(scoreQuestion(order, null).correct).toBe(false)
    expect(scoreQuestion({ ...order, answer_order: null }, [2, 0, 1]).correct).toBe(false)
  })

  it('scores numbers with a relative tolerance', () => {
    expect(scoreQuestion(numeric, 1.003).correct).toBe(true)
    expect(scoreQuestion(numeric, 1).correct).toBe(true)
    expect(scoreQuestion(numeric, '1,03').correct).toBe(true) // 2.7 % off, tolerance 3 %
    expect(scoreQuestion(numeric, 0.97).correct).toBe(false) // 3.3 % off
    expect(scoreQuestion(numeric, 1.04).correct).toBe(false)
    expect(scoreQuestion(numeric, 'abc')).toEqual({ correct: false, given: null, expected: 1.003 })
    expect(scoreQuestion({ ...numeric, answer_value: null }, 1).correct).toBe(false)
  })

  it('uses the 2 % default when the tolerance is missing or 0', () => {
    const q = { kind: 'numeric', answer_value: 100 }
    expect(effectiveTolerance(q)).toBe(DEFAULT_TOLERANCE)
    expect(effectiveTolerance({ ...q, tolerance: 0 })).toBe(DEFAULT_TOLERANCE)
    expect(effectiveTolerance({ ...q, tolerance: -0.05 })).toBe(0.05)
    expect(scoreQuestion(q, 102).correct).toBe(true)
    expect(scoreQuestion(q, 102.5).correct).toBe(false)
    expect(scoreQuestion({ ...q, tolerance: 0 }, 98).correct).toBe(true)
  })

  it('needs an exact 0 when the expected value is 0', () => {
    const zero = { kind: 'numeric', answer_value: 0, tolerance: 0.5 }
    expect(scoreQuestion(zero, 0).correct).toBe(true)
    expect(scoreQuestion(zero, '0,0').correct).toBe(true)
    expect(scoreQuestion(zero, -0).correct).toBe(true)
    expect(scoreQuestion(zero, 0.001).correct).toBe(false)
    expect(scoreQuestion(zero, 1e-10).correct).toBe(true)
  })

  it('handles negative expected values', () => {
    const q = { kind: 'numeric', answer_value: -9.81, tolerance: 0.01 }
    expect(scoreQuestion(q, -9.8).correct).toBe(true)
    expect(scoreQuestion(q, 9.81).correct).toBe(false)
  })

  it('never accepts unknown kinds', () => {
    expect(scoreQuestion({ kind: 'essay' }, 'x')).toEqual({ correct: false, given: null, expected: null })
  })
})

describe('acceptedRange', () => {
  it('describes the interval learners must hit', () => {
    const range = acceptedRange({ answer_value: 2, tolerance: 0.05 })
    expect(range.min).toBeCloseTo(1.9)
    expect(range.max).toBeCloseTo(2.1)
    expect(range.exact).toBe(false)
    expect(acceptedRange({ answer_value: -10 }).min).toBeCloseTo(-10.2)
    expect(acceptedRange({ answer_value: 0, tolerance: 0.1 })).toEqual({ min: 0, max: 0, expected: 0, tolerance: 0, exact: true })
    expect(acceptedRange({ answer_value: null })).toBeNull()
  })
})

describe('scoreAttempt (same shape as QuizAttemptOut)', () => {
  const questions = [mcq, tf, order, numeric, { id: 'hidden', kind: 'mcq', options: ['a', 'b'], answer_index: 0, approved: false }]

  it('scores answered approved questions in quiz order', () => {
    const out = scoreAttempt(questions, [
      { question_id: 'q4', answer: 1.01 },
      { question_id: 'q1', answer: 0 },
      { question_id: 'q3', answer: [2, 0, 1] },
      { question_id: 'q2', answer: 1 },
    ])
    expect(out.id).toBeNull()
    expect(out.total).toBe(4)
    expect(out.score).toBe(3)
    expect(out.results.map((r) => r.question_id)).toEqual(['q1', 'q2', 'q3', 'q4'])
    expect(out.results[0]).toEqual({ question_id: 'q1', correct: false, correct_answer: 1, explanation: 'B is right', option_feedback: [] })
    expect(out.results[2].correct_answer).toEqual([2, 0, 1])
    expect(out.results[3].correct_answer).toBe(1.003)
  })

  it('ignores unknown and unapproved ids, keeps the first answer, leaves out unanswered', () => {
    const out = scoreAttempt(questions, [
      { question_id: 'q1', answer: 1 },
      { question_id: 'q1', answer: 0 },
      { question_id: 'hidden', answer: 0 },
      { question_id: 'nope', answer: 0 },
    ])
    expect(out.total).toBe(1)
    expect(out.score).toBe(1)
  })

  it('counts a null answer as wrong (unanswered questions sent explicitly)', () => {
    const out = scoreAttempt([mcq, numeric], [
      { question_id: 'q1', answer: null },
      { question_id: 'q4', answer: null },
    ])
    expect(out.total).toBe(2)
    expect(out.score).toBe(0)
  })

  it('treats a missing approved flag as approved, like the server', () => {
    const { approved: _ignored, ...plain } = mcq
    expect(scoreAttempt([plain], [{ question_id: 'q1', answer: 1 }]).score).toBe(1)
  })

  it('returns the feedback per option with the result, like the server marking (C6)', () => {
    const withFeedback = [
      { ...mcq, option_feedback: ['A mixes up mass and length.', 'B is the formula.', 'C forgets the root.'] },
      { ...tf, option_feedback: ['Mass is not in the formula.', 'Right: mass is not in the formula.'] },
      { ...order, id: 'q5' },
      { ...numeric, id: 'q6', option_feedback: ['never for numbers'] },
    ]
    const out = scoreAttempt(withFeedback, [
      { question_id: 'q1', answer: 0 },
      { question_id: 'q2', answer: 1 },
      { question_id: 'q5', answer: [2, 0, 1] },
      { question_id: 'q6', answer: 1 },
    ])
    expect(out.results.map((r) => r.option_feedback)).toEqual([
      ['A mixes up mass and length.', 'B is the formula.', 'C forgets the root.'],
      ['Mass is not in the formula.', 'Right: mass is not in the formula.'],
      [],
      [],
    ])
  })

  it('drops feedback that does not line up with the options', () => {
    expect(optionFeedbackOf({ ...mcq, option_feedback: ['only one line'] })).toEqual([])
    expect(optionFeedbackOf({ ...tf, option_feedback: ['a', 'b', 'c'] })).toEqual([])
    expect(optionFeedbackOf({ ...mcq, option_feedback: null })).toEqual([])
    expect(optionFeedbackOf({ ...mcq, kind: undefined, option_feedback: ['x', 'y', 'z'] })).toEqual(['x', 'y', 'z'])
  })
})
