import { describe, expect, it } from 'vitest'
import {
  allAnswered,
  blockParams,
  buildSections,
  collectImageUrls,
  fullPath,
  keyFormula,
  liteCode,
  litePath,
  liteOrderStart,
  liteQuestions,
  liteReview,
  mathText,
  plainParagraphs,
  quizPayload,
  sourceImageUrl,
} from './liteUtils.js'

const lab = {
  share_code: 'ABC234',
  cover_url: '/api/share/ABC234/assets/cov/file',
  sources: [
    { id: 's1', kind: 'image', title: 'Pendulum photo', urls: { file: '/api/share/ABC234/sources/s1/file' } },
    { id: 's2', kind: 'pdf', title: 'Textbook', page_count: 3, urls: { file: '/api/share/ABC234/sources/s2/file', page: '/api/share/ABC234/sources/s2/pages/{n}.png' } },
  ],
  assets: [{ id: 'a1', kind: 'cutout', url: '/api/share/ABC234/assets/a1/file' }],
  spec: {
    summary: 'About **pendulums** and $T=2\\pi$',
    blocks: [
      { id: 'b1', type: 'steps', title: 'Try it', steps: [{ id: 'st1', title: 'Measure', body: 'Measure the string.', highlight: { source_id: 's1', located: 'exact' } }] },
      { id: 'b2', type: 'graph', title: 'Graph', expression: '2*pi*sqrt(L/g)', params: [{ symbol: 'L', name: 'Length', unit: 'm', value: 1, provenance: 'user' }] },
      {
        id: 'b3',
        type: 'quiz',
        title: 'Check',
        questions: [
          { id: 'q1', kind: 'mcq', prompt: 'Pick?', options: ['A', 'B'], answer_index: 1, approved: true },
          { id: 'q2', kind: 'numeric', prompt: 'Period?', answer_value: 2, approved: true },
          { id: 'q3', kind: 'mcq', prompt: 'Draft?', options: ['x'], approved: false },
        ],
      },
    ],
  },
}

describe('lite code and paths', () => {
  it('accepts a pasted share link and rejects look-alike characters', () => {
    expect(liteCode('https://example.test/s/abc234')).toBe('ABC234')
    expect(liteCode('ABO234')).toBe('')
    expect(litePath('abc234')).toBe('/lite/ABC234')
    expect(fullPath('abc234')).toBe('/s/ABC234')
  })
})

describe('plainParagraphs', () => {
  it('keeps formulas as readable text and drops markdown markers', () => {
    expect(plainParagraphs('About **pendulums** and $T=2x$\n\n- First step')).toEqual(['About pendulums and T=2x', 'First step'])
  })

  it('reads TeX formulas as text, since Lite has no KaTeX', () => {
    expect(plainParagraphs('$T = 2\\pi\\sqrt{0{,}25/9{,}81} \\approx 1{,}00$ s')).toEqual(['T = 2π√(0,25/9,81) ≈ 1,00 s'])
    expect(mathText('T = 2\\pi\\sqrt{L/g}')).toBe('T = 2π√(L/g)')
    expect(mathText('\\sqrt{4} = 2')).toBe('√4 = 2')
    expect(mathText('\\Delta = b^2 - 4ac')).toBe('Δ = b² - 4ac')
    expect(mathText('\\frac{L}{g} + \\frac{a+b}{2}')).toBe('L/g + (a+b)/2')
    expect(mathText('\\sqrt{\\frac{L}{g}}')).toBe('√(L/g)')
    expect(mathText('v_0 = 10\\,\\text{m/s}, 30^\\circ, 10^{-3}')).toBe('v₀ = 10 m/s, 30°, 10⁻³')
    expect(mathText('\\unknown{x}')).toBe('unknownx')
  })
})

describe('lite sections, formula and params', () => {
  it('keeps spec order and exposes the key formula with provenance', () => {
    const sections = buildSections(lab)
    expect(sections.map((s) => s.id)).toEqual(['b1', 'b2', 'b3'])
    expect(keyFormula(sections[1].block)).toBe('2*pi*sqrt(L/g)')
    expect(blockParams(sections[1].block)).toEqual([{ symbol: 'L', name: 'Length', unit: 'm', value: '1', provenance: 'user' }])
  })

  it('collects only share-scoped image urls, capped and de-duplicated', () => {
    const urls = collectImageUrls(lab)
    expect(urls).toContain('/api/share/ABC234/sources/s1/file')
    expect(urls).toContain('/api/share/ABC234/assets/a1/file')
    expect(new Set(urls).size).toBe(urls.length)
    expect(sourceImageUrl(lab, { source_id: 's2', page: 2 })).toBe('/api/share/ABC234/sources/s2/pages/2.png')
  })
})

describe('lite quiz payload (server still marks)', () => {
  it('sends only approved questions and null for unanswered ones', () => {
    const quiz = lab.spec.blocks[2]
    expect(liteQuestions(quiz).map((q) => q.id)).toEqual(['q1', 'q2'])
    expect(quizPayload(quiz, { q1: 1 })).toEqual({
      block_id: 'b3',
      answers: [
        { question_id: 'q1', answer: 1 },
        { question_id: 'q2', answer: null },
      ],
    })
    expect(allAnswered(quiz, { q1: 1 })).toBe(false)
    expect(allAnswered(quiz, { q1: 1, q2: '2,0' })).toBe(true)
    expect(quizPayload(quiz, { q1: 0, q2: '2,0' }).answers[1].answer).toBe(2)
  })
  it('only accepts complete permutations for order questions', () => {
    const quiz = { id: 'b', questions: [{ id: 'q', kind: 'order', options: ['A', 'B', 'C'], approved: true }] }
    expect(allAnswered(quiz, { q: [0, 0, 2] })).toBe(false)
    expect(allAnswered(quiz, { q: [2, 0] })).toBe(false)
    expect(allAnswered(quiz, { q: [2, 0, 1] })).toBe(true)
    expect(quizPayload(quiz, { q: [2, 0, 1] }).answers[0].answer).toEqual([2, 0, 1])
  })

  it('starts order questions from the server’s order, never already solved', () => {
    // learner payloads: shuffled by the server, no key
    expect(liteOrderStart({ kind: 'order', options: ['Rain', 'Sea', 'Cloud'] })).toEqual([0, 1, 2])
    // an older payload listed in the solved order with its key: start one step rotated
    expect(liteOrderStart({ kind: 'order', options: ['Sea', 'Cloud', 'Rain'], answer_order: [0, 1, 2] })).toEqual([1, 2, 0])
    expect(liteOrderStart({ kind: 'order', options: ['b', 'a'], answer_order: [1, 0] })).toEqual([0, 1])
    expect(liteOrderStart({ kind: 'order', options: [] })).toEqual([])
  })
})

describe('lite review after marking (from the server result only)', () => {
  const mcq = { id: 'q1', kind: 'mcq', options: ['Mass', 'Length and g', 'Colour'] }
  const labels = { trueLabel: 'True', falseLabel: 'False' }

  it('gives the feedback for the chosen option and the right option in words', () => {
    const review = { question_id: 'q1', correct: false, correct_answer: 1, option_feedback: ['Mass is not in it.', 'Right.', 'Not a quantity.'] }
    expect(liteReview(mcq, review, 0, labels)).toEqual({ correct: false, chosenFeedback: 'Mass is not in it.', correctText: 'Length and g', correctOrder: [], correctValue: null, margin: null, exact: false })
    expect(liteReview(mcq, { ...review, option_feedback: ['only one'] }, 0, labels).chosenFeedback).toBe('')
    expect(liteReview(mcq, review, null, labels).chosenFeedback).toBe('')
    expect(liteReview(mcq, null, 0, labels)).toBeNull()
  })

  it('handles true/false, order and number answers', () => {
    const tf = { id: 'q2', kind: 'truefalse', options: [] }
    expect(liteReview(tf, { correct: true, correct_answer: 1, option_feedback: ['No.', 'Yes: mass is not in it.'] }, 1, labels)).toMatchObject({ chosenFeedback: 'Yes: mass is not in it.', correctText: 'False' })
    const order = { id: 'q3', kind: 'order', options: ['Rain', 'Sea', 'Cloud'] }
    expect(liteReview(order, { correct: false, correct_answer: [1, 2, 0] }, [0, 1, 2], labels).correctOrder).toEqual(['Sea', 'Cloud', 'Rain'])
    const numeric = { id: 'q4', kind: 'numeric', unit: 's' }
    expect(liteReview(numeric, { correct: false, correct_answer: 1.003 }, 2, labels).correctValue).toBe(1.003)
  })

  it('reads the margin of a number from the marking result, and never guesses it', () => {
    const numeric = { id: 'q4', kind: 'numeric', unit: 's' }
    expect(liteReview(numeric, { correct: false, correct_answer: 1.003, tolerance: 0.03 }, 2, labels)).toMatchObject({ correctValue: 1.003, margin: 0.03, exact: false })
    // an older server sends no tolerance: no margin is shown
    expect(liteReview(numeric, { correct: false, correct_answer: 1.003 }, 2, labels).margin).toBeNull()
    expect(liteReview(numeric, { correct: false, correct_answer: 1.003, tolerance: null }, 2, labels).margin).toBeNull()
    // a right answer of 0 is marked exactly
    expect(liteReview(numeric, { correct: false, correct_answer: 0, tolerance: 0.02 }, 2, labels)).toMatchObject({ margin: null, exact: true })
  })
})
