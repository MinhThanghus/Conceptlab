import { describe, expect, it } from 'vitest'
import {
  DECK_SHORT,
  addChoiceOption,
  alignFeedback,
  allShort,
  answerPayload,
  approvedQuestions,
  changeKind,
  compactFeedback,
  firstMissed,
  hasContent,
  nextMissed,
  textLength,
  deckSizes,
  initialArrangement,
  isAiQuestion,
  isAnswered,
  newQuestion,
  normalizeGenerated,
  optionLetter,
  orderedOptions,
  phaseFromSearch,
  positionMarks,
  questionIssues,
  questionLevel,
  questionTitle,
  removeChoiceOption,
  reviewFeedback,
  sanitizeAnswers,
  scoreTier,
  setFeedbackLine,
  setOrderOptions,
  validPermutation,
} from './quizModel.js'
import { scoreQuestion } from './quizScoring.js'

const good = {
  mcq: { id: 'a', kind: 'mcq', prompt: 'Q?', options: ['x', 'y'], answer_index: 0 },
  truefalse: { id: 'b', kind: 'truefalse', prompt: 'Q?', options: [], answer_index: 1 },
  order: { id: 'c', kind: 'order', prompt: 'Q?', options: ['1', '2', '3'], answer_order: [0, 1, 2] },
  numeric: { id: 'd', kind: 'numeric', prompt: 'Q?', answer_value: 2, tolerance: null, unit: 's' },
}

describe('reading the quiz', () => {
  it('keeps only approved questions for learners', () => {
    const block = { questions: [{ id: '1', approved: true }, { id: '2', approved: false }, { id: '3' }, null, { approved: true }] }
    expect(approvedQuestions(block).map((q) => q.id)).toEqual(['1'])
    expect(approvedQuestions({})).toEqual([])
  })

  it('reads the phase from the page address', () => {
    expect(phaseFromSearch('?phase=pre')).toBe('pre')
    expect(phaseFromSearch('?x=1&phase=post')).toBe('post')
    expect(phaseFromSearch('?phase=final')).toBe('practice')
    expect(phaseFromSearch('')).toBe('practice')
    expect(phaseFromSearch(undefined)).toBe('practice')
  })

  it('recognises AI-written questions by their id', () => {
    expect(isAiQuestion({ id: 'q_1a2b3c4d' })).toBe(true)
    expect(isAiQuestion({ id: 'q1' })).toBe(false)
    expect(isAiQuestion(newQuestion('mcq'))).toBe(false)
  })
})

describe('editing questions', () => {
  it('creates empty questions of every kind with unique ids', () => {
    const a = newQuestion('mcq')
    const b = newQuestion('order', [a.id])
    expect(a.id).not.toBe(b.id)
    expect(a.id.startsWith('qt_')).toBe(true)
    expect(a.options).toEqual(['', '', '', ''])
    expect(a.approved).toBe(false)
    expect(b.answer_order).toEqual([0, 1, 2])
    expect(newQuestion('truefalse').options).toEqual([])
    expect(newQuestion('numeric').answer_value).toBeNull()
    expect(newQuestion('essay').kind).toBe('mcq')
  })

  it('accepts well-formed questions of every kind', () => {
    for (const q of Object.values(good)) expect(questionIssues(q)).toEqual([])
    expect(questionIssues({ ...good.truefalse, options: ['Đúng', 'Sai'] })).toEqual([])
  })

  it('lists what blocks approval', () => {
    expect(questionIssues({ ...good.mcq, prompt: '  ' })).toEqual(['empty_prompt'])
    expect(questionIssues({ ...good.mcq, options: ['x'] })).toEqual(['too_few_options'])
    expect(questionIssues({ ...good.mcq, options: ['x', ' '] })).toEqual(['empty_option'])
    expect(questionIssues({ ...good.mcq, options: ['x', 'X '] })).toEqual(['duplicate_option'])
    expect(questionIssues({ ...good.mcq, answer_index: null })).toEqual(['no_answer'])
    expect(questionIssues({ ...good.mcq, answer_index: 2 })).toEqual(['no_answer'])
    expect(questionIssues({ ...good.truefalse, answer_index: 2 })).toEqual(['no_answer'])
    expect(questionIssues({ ...good.truefalse, options: ['a', 'b', 'c'] })).toEqual(['truefalse_options'])
    expect(questionIssues({ ...good.order, answer_order: [0, 0, 1] })).toEqual(['order_invalid'])
    expect(questionIssues({ ...good.order, answer_order: [0, 1] })).toEqual(['order_invalid'])
    expect(questionIssues({ ...good.order, options: ['1', ''], answer_order: [0, 1] })).toEqual(['empty_option'])
    expect(questionIssues({ ...good.numeric, answer_value: null })).toEqual(['missing_value'])
    expect(questionIssues({ ...good.numeric, tolerance: -0.1 })).toEqual(['bad_tolerance'])
    expect(questionIssues({ ...good.numeric, answer_value: 0, tolerance: 0 })).toEqual([])
    expect(questionIssues({ ...good.mcq, kind: 'essay' })).toEqual(['unknown_kind'])
  })

  it('shows order items in the correct order and stores them that way', () => {
    const shuffled = { kind: 'order', options: ['b', 'c', 'a'], answer_order: [2, 0, 1] }
    expect(orderedOptions(shuffled)).toEqual(['a', 'b', 'c'])
    expect(orderedOptions({ options: ['b', 'a'], answer_order: [0, 0] })).toEqual(['b', 'a'])
    expect(setOrderOptions(shuffled, ['a', 'b', 'c'])).toMatchObject({ options: ['a', 'b', 'c'], answer_order: [0, 1, 2] })
    expect(validPermutation([1, 0, 2], 3)).toBe(true)
    expect(validPermutation([1, 1, 2], 3)).toBe(false)
    expect(validPermutation([0, 1.5], 2)).toBe(false)
    expect(validPermutation(null, 0)).toBe(false)
  })

  it('switches kinds, withdraws approval and restores what was typed when switching back', () => {
    const start = { ...good.mcq, options: ['Một', 'Hai', 'Ba'], answer_index: 2, approved: true }
    const toNumeric = changeKind(start, 'numeric')
    expect(toNumeric.question).toMatchObject({ kind: 'numeric', options: [], answer_index: null, answer_value: null, approved: false })
    const typed = { ...toNumeric.question, answer_value: 5, unit: 'm' }
    const back = changeKind(typed, 'mcq', toNumeric.stash)
    expect(back.question).toMatchObject({ kind: 'mcq', options: ['Một', 'Hai', 'Ba'], answer_index: 2, answer_value: null, unit: '' })
    const again = changeKind(back.question, 'numeric', back.stash)
    expect(again.question).toMatchObject({ answer_value: 5, unit: 'm' })
  })

  it('carries options between multiple choice and ordering', () => {
    const toOrder = changeKind({ ...good.mcq, options: ['x', 'y', 'z'] }, 'order')
    expect(toOrder.question).toMatchObject({ kind: 'order', options: ['x', 'y', 'z'], answer_order: [0, 1, 2], answer_index: null })
    const fromOrder = changeKind({ ...good.order, options: ['b', 'a'], answer_order: [1, 0] }, 'mcq')
    expect(fromOrder.question).toMatchObject({ kind: 'mcq', options: ['a', 'b'], answer_index: null, answer_order: null })
    const toTf = changeKind(good.mcq, 'truefalse')
    expect(toTf.question).toMatchObject({ kind: 'truefalse', options: [], answer_index: null })
    expect(changeKind(good.mcq, 'mcq').question).toBe(good.mcq)
  })

  it('cleans AI questions: unique AI id, not approved, order rewritten correctly', () => {
    const taken = new Set(['q_aaaaaaaa'])
    const q = normalizeGenerated({ id: 'q_aaaaaaaa', kind: 'order', prompt: 'Order', options: ['c', 'a', 'b'], answer_order: [1, 2, 0], approved: true }, taken)
    expect(q.id).not.toBe('q_aaaaaaaa')
    expect(isAiQuestion(q)).toBe(true)
    expect(taken.has(q.id)).toBe(true)
    expect(q.approved).toBe(false)
    expect(q.options).toEqual(['a', 'b', 'c'])
    expect(q.answer_order).toEqual([0, 1, 2])
    const n = normalizeGenerated({ id: 'q_bbbbbbbb', kind: 'numeric', prompt: 'x'.repeat(3000), answer_value: 2.5, tolerance: 0.05, unit: 'm/s' }, taken)
    expect(n.id).toBe('q_bbbbbbbb')
    expect(n.prompt.length).toBe(2000)
    expect(n).toMatchObject({ answer_value: 2.5, tolerance: 0.05, unit: 'm/s', source_refs: [], options: [] })
    const odd = normalizeGenerated({ kind: 'weird', options: Array.from({ length: 12 }, (_, i) => `o${i}`) }, taken)
    expect(odd.kind).toBe('mcq')
    expect(odd.options.length).toBe(8)
    expect(isAiQuestion(odd)).toBe(true)
  })

  it('keeps the situation, hint, level and feedback of AI questions, aligned with the options', () => {
    const taken = new Set()
    const mcq = normalizeGenerated(
      {
        kind: 'mcq',
        context: 'Lan measures a pendulum in the schoolyard.',
        prompt: 'What sets the period?',
        options: ['Mass', 'Length and g', 'Colour'],
        answer_index: 1,
        hint: 'Look at formula (12.1).',
        cognitive_level: 'understand',
        option_feedback: ['Mass is not in the formula.', 'Right: only L and g.', 'Colour is not a quantity.'],
      },
      taken,
    )
    expect(mcq).toMatchObject({
      context: 'Lan measures a pendulum in the schoolyard.',
      hint: 'Look at formula (12.1).',
      cognitive_level: 'understand',
      option_feedback: ['Mass is not in the formula.', 'Right: only L and g.', 'Colour is not a quantity.'],
    })
    // feedback that does not line up with the options could praise the wrong one: dropped
    expect(normalizeGenerated({ kind: 'mcq', options: ['a', 'b', 'c'], option_feedback: ['x', 'y'] }, taken).option_feedback).toEqual([])
    expect(normalizeGenerated({ kind: 'truefalse', option_feedback: ['no', 'yes'] }, taken).option_feedback).toEqual(['no', 'yes'])
    expect(normalizeGenerated({ kind: 'truefalse', option_feedback: ['no', 'yes', 'maybe'] }, taken).option_feedback).toEqual([])
    expect(normalizeGenerated({ kind: 'numeric', option_feedback: ['x'] }, taken).option_feedback).toEqual([])
    expect(normalizeGenerated({ kind: 'mcq', options: ['a', 'b'], option_feedback: ['', ' '] }, taken).option_feedback).toEqual([])
    // more than 8 options: both lists are cut together
    const many = normalizeGenerated({ kind: 'mcq', options: Array.from({ length: 10 }, (_, i) => `o${i}`), option_feedback: Array.from({ length: 10 }, (_, i) => `f${i}`) }, taken)
    expect(many.options.length).toBe(8)
    expect(many.option_feedback).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'])
    const long = normalizeGenerated({ kind: 'mcq', options: ['a', 'b'], option_feedback: ['x'.repeat(900), 'y'], hint: 'h'.repeat(3000), cognitive_level: 'genius' }, taken)
    expect(long.option_feedback[0].length).toBe(400)
    expect(long.hint.length).toBe(2000)
    expect(long.cognitive_level).toBeNull()
    expect(questionLevel({ cognitive_level: 'extend' })).toBe('extend')
    expect(questionLevel({})).toBeNull()
  })

  it('knows when deleting needs a confirmation', () => {
    expect(hasContent(newQuestion('mcq'))).toBe(false)
    expect(hasContent(newQuestion('numeric'))).toBe(false)
    expect(hasContent({ ...newQuestion('mcq'), prompt: 'Hi' })).toBe(true)
    expect(hasContent({ ...newQuestion('numeric'), answer_value: 0 })).toBe(true)
    expect(hasContent({ ...newQuestion('mcq'), hint: 'Look at step 2' })).toBe(true)
    expect(hasContent({ ...newQuestion('mcq'), context: 'At the market…' })).toBe(true)
    expect(hasContent({ ...newQuestion('mcq'), option_feedback: ['', 'Because…', '', ''] })).toBe(true)
    expect(hasContent({ ...newQuestion('mcq'), hint: '  ', context: '', option_feedback: ['', ''] })).toBe(false)
  })

  it('starts every question with the new optional fields empty', () => {
    expect(newQuestion('mcq')).toMatchObject({ context: '', hint: '', cognitive_level: null, option_feedback: [] })
    expect(newQuestion('order')).toMatchObject({ context: '', hint: '', cognitive_level: null, option_feedback: [] })
  })

  it('never carries option feedback to another kind, and gives it back when switching back', () => {
    const start = { ...good.mcq, options: ['x', 'y', 'z'], answer_index: 1, option_feedback: ['no x', 'yes y', 'no z'], hint: 'Think', cognitive_level: 'apply' }
    const toOrder = changeKind(start, 'order')
    expect(toOrder.question).toMatchObject({ kind: 'order', options: ['x', 'y', 'z'], option_feedback: [], hint: 'Think', cognitive_level: 'apply' })
    const toTf = changeKind(start, 'truefalse')
    expect(toTf.question).toMatchObject({ kind: 'truefalse', options: [], option_feedback: [] })
    const back = changeKind(toTf.question, 'mcq', toTf.stash)
    expect(back.question).toMatchObject({ options: ['x', 'y', 'z'], answer_index: 1, option_feedback: ['no x', 'yes y', 'no z'] })
    const tfWithFeedback = { ...good.truefalse, option_feedback: ['no', 'yes'] }
    const toNumeric = changeKind(tfWithFeedback, 'numeric')
    expect(toNumeric.question.option_feedback).toEqual([])
    expect(changeKind(toNumeric.question, 'truefalse', toNumeric.stash).question.option_feedback).toEqual(['no', 'yes'])
  })

  it('keeps option feedback in step with the options it explains', () => {
    const q = { ...good.mcq, options: ['a', 'b', 'c'], answer_index: 2, option_feedback: ['why a', 'why b', 'why c'] }
    // removing an option removes its feedback line and keeps the answer on the same option
    expect(removeChoiceOption(q, 0)).toEqual({ options: ['b', 'c'], option_feedback: ['why b', 'why c'], answer_index: 1 })
    expect(removeChoiceOption(q, 2)).toEqual({ options: ['a', 'b'], option_feedback: ['why a', 'why b'], answer_index: null })
    expect(removeChoiceOption({ ...q, options: ['a', 'b'], option_feedback: [] }, 0)).toEqual({})
    // adding one adds an empty line, only when there is feedback at all
    expect(addChoiceOption(q)).toEqual({ options: ['a', 'b', 'c', ''], option_feedback: ['why a', 'why b', 'why c', ''] })
    expect(addChoiceOption({ ...q, option_feedback: [] })).toEqual({ options: ['a', 'b', 'c', ''], option_feedback: [] })
    expect(addChoiceOption({ ...q, options: Array.from({ length: 8 }, (_, i) => `o${i}`) })).toEqual({})
    // one line typed under option B of a question without feedback
    expect(setFeedbackLine({ ...q, option_feedback: [] }, 1, 'B is the formula')).toEqual({ option_feedback: ['', 'B is the formula', ''] })
    expect(setFeedbackLine({ ...q, option_feedback: ['', 'x', ''] }, 1, '')).toEqual({ option_feedback: [] })
    expect(setFeedbackLine(good.truefalse, 1, 'Mass is not in the formula')).toEqual({ option_feedback: ['', 'Mass is not in the formula'] })
    expect(setFeedbackLine(good.order, 0, 'x')).toEqual({})
    expect(alignFeedback(['a'], 3)).toEqual(['a', '', ''])
    expect(alignFeedback(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
    expect(compactFeedback(['', ' '])).toEqual([])
    expect(compactFeedback(['x'.repeat(500), ''])[0].length).toBe(400)
  })

  it('makes one-line titles', () => {
    expect(questionTitle({ prompt: '  Một\n  hai  ' })).toBe('Một hai')
    expect(questionTitle({ prompt: 'x'.repeat(200) }, 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

describe('learner helpers', () => {
  const ordered = { id: 'q1', kind: 'order', options: ['a', 'b', 'c', 'd'], answer_order: [0, 1, 2, 3] }

  it('shuffles order questions the same way every time, never solved', () => {
    const first = initialArrangement(ordered)
    expect(initialArrangement({ ...ordered })).toEqual(first)
    expect([...first].sort()).toEqual([0, 1, 2, 3])
    expect(first).not.toEqual([0, 1, 2, 3])
    for (let i = 0; i < 200; i += 1) {
      const q = { id: `q${i}`, kind: 'order', options: ['a', 'b', 'c'], answer_order: [2, 0, 1] }
      expect(initialArrangement(q)).not.toEqual([2, 0, 1])
      const two = { id: `t${i}`, kind: 'order', options: ['a', 'b'], answer_order: [1, 0] }
      expect(initialArrangement(two)).toEqual([0, 1])
    }
    expect(initialArrangement({ id: 'x', options: [] })).toEqual([])
  })

  it('keeps the server’s order when the learner payload has no answer key', () => {
    // the server lists order options in a shuffle that is never solved and strips answer_order
    expect(initialArrangement({ id: 'q9', kind: 'order', options: ['c', 'a', 'd', 'b'] })).toEqual([0, 1, 2, 3])
    expect(initialArrangement({ id: 'q9', kind: 'order', options: ['c', 'a'], answer_order: null })).toEqual([0, 1])
    expect(answerPayload({ id: 'q9', kind: 'order', options: ['c', 'a', 'b'] }, undefined)).toEqual([0, 1, 2])
  })

  it('reads the feedback per option from the marking, else from the question', () => {
    const q = { kind: 'mcq', options: ['a', 'b'], option_feedback: ['own a', 'own b'] }
    expect(reviewFeedback(q, { option_feedback: ['server a', 'server b'] })).toEqual(['server a', 'server b'])
    expect(reviewFeedback(q, { option_feedback: [] })).toEqual(['own a', 'own b'])
    expect(reviewFeedback({ ...q, option_feedback: undefined }, { option_feedback: ['only one'] })).toEqual([])
    expect(reviewFeedback({ kind: 'truefalse' }, { option_feedback: ['no', 'yes'] })).toEqual(['no', 'yes'])
    expect(reviewFeedback({ kind: 'order', options: ['a', 'b'] }, { option_feedback: ['x', 'y'] })).toEqual([])
  })

  it('finds the first question to look at again', () => {
    const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(firstMissed(qs, [{ question_id: 'a', correct: true }, { question_id: 'b', correct: false }, { question_id: 'c', correct: false }])).toBe(1)
    expect(firstMissed(qs, [{ question_id: 'a', correct: true }])).toBe(-1)
    expect(firstMissed(qs, null)).toBe(-1)
  })

  it('walks through the missed questions one after another, then starts again', () => {
    const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const results = [
      { question_id: 'a', correct: false },
      { question_id: 'b', correct: true },
      { question_id: 'c', correct: false },
      { question_id: 'd', correct: true },
    ]
    expect(nextMissed(qs, results)).toBe(0)
    expect(nextMissed(qs, results, 0)).toBe(2)
    expect(nextMissed(qs, results, 1)).toBe(2)
    expect(nextMissed(qs, results, 2)).toBe(0)
    expect(nextMissed(qs, results, 3)).toBe(0)
    // the only miss is the one on screen: stay on it
    expect(nextMissed(qs, [{ question_id: 'b', correct: false }], 1)).toBe(1)
    expect(nextMissed(qs, [{ question_id: 'a', correct: true }], 0)).toBe(-1)
    expect(nextMissed(qs, null, 0)).toBe(-1)
  })

  it('measures how long a text reads without its marks, to pick a slide size', () => {
    // 21 letters, spaces and marks once the runs of spaces collapse
    expect(textLength('  Ngăn tim nào   bơm máu? ')).toBe(21)
    // a letter typed as base + combining marks counts once, like the precomposed one
    expect(textLength('Ngăn tim nào bơm máu?'.normalize('NFD'))).toBe(21)
    expect(textLength('Chiều dài **dây** $L$')).toBe(textLength('Chiều dài dây L'))
    // a long formula counts as a short run of characters, never as nothing
    expect(textLength('$T = 2\\pi\\sqrt{L/g}$')).toBe(12)
    expect(textLength(null)).toBe(0)
    expect(allShort(['Đúng', 'Sai'], DECK_SHORT.option)).toBe(true)
    expect(allShort(['Đúng', 'Chiều dài dây L và gia tốc trọng trường g'], DECK_SHORT.option)).toBe(false)
    expect(allShort([], DECK_SHORT.option)).toBe(false)
  })

  it('sets a short question and short answers a size up on a slide, unless the slide is already full', () => {
    const heart = { kind: 'mcq', context: 'Chạy hết một vòng sân trường, em thấy tim đập thình thịch.', prompt: 'Ngăn tim nào bơm máu đi khắp cơ thể?', options: ['Tâm nhĩ phải', 'Tâm thất phải', 'Tâm nhĩ trái', 'Tâm thất trái'] }
    expect(deckSizes(heart)).toEqual({ stem: 'short', answers: 'short' })
    // a long situation with long answers: the stem stays at the lead size
    const busy = {
      kind: 'mcq',
      context: 'Nhóm 3 đo được L = 0,80 m và bấm giờ 10 dao động hết 18,1 s, tức T ≈ 1,81 s. Mô phỏng với cùng chiều dài dây cho T ≈ 1,79 s.',
      prompt: 'Vì sao hai kết quả chênh nhau một chút?',
      options: ['Sai số khi bấm giờ và các giả định của mô hình (góc nhỏ, bỏ qua lực cản)', 'Công thức trong sách bị sai', 'Khối lượng quả nặng làm chu kỳ tăng', 'Mô phỏng đo trực tiếp từ ảnh nên kém chính xác'],
    }
    expect(deckSizes(busy)).toEqual({ stem: 'long', answers: 'long' })
    expect(deckSizes({ ...busy, context: '' }).stem).toBe('short')
    // true/false answers are always short; numbers have no answer cards; order items by their own limit
    expect(deckSizes({ kind: 'truefalse', prompt: 'Mây được tạo thành từ hơi nước ngưng tụ.', options: [] })).toEqual({ stem: 'short', answers: 'short' })
    expect(deckSizes({ kind: 'numeric', prompt: 'Với L = 0,25 m và g = 9,81 m/s², chu kỳ T của con lắc mới bằng bao nhiêu giây?' })).toEqual({ stem: 'long', answers: 'long' })
    expect(deckSizes({ kind: 'order', prompt: 'Sắp xếp các giai đoạn.', options: ['Bốc hơi', 'Ngưng tụ', 'Mưa'] }).answers).toBe('short')
    expect(deckSizes({ kind: 'order', prompt: 'Sắp xếp.', options: ['Bốc hơi', 'Nước chảy ra biển qua sông suối'] }).answers).toBe('long')
    expect(deckSizes(null)).toEqual({ stem: 'short', answers: 'long' })
  })

  it('knows when a question is answered and what to send', () => {
    expect(isAnswered(good.mcq, 0)).toBe(true)
    expect(isAnswered(good.mcq, undefined)).toBe(false)
    expect(isAnswered(good.truefalse, 1)).toBe(true)
    expect(isAnswered(good.order, { order: [1, 0, 2], moved: false })).toBe(false)
    expect(isAnswered(good.order, { order: [1, 0, 2], moved: true })).toBe(true)
    expect(isAnswered(good.numeric, '2,5')).toBe(true)
    expect(isAnswered(good.numeric, 'hai')).toBe(false)
    expect(isAnswered(good.numeric, '')).toBe(false)
    expect(answerPayload(good.mcq, 1)).toBe(1)
    expect(answerPayload(good.mcq, undefined)).toBeNull()
    expect(answerPayload(good.numeric, '1 000,5')).toBe(1000.5)
    expect(answerPayload(good.numeric, 'abc')).toBeNull()
    expect(answerPayload(ordered, undefined)).toEqual(initialArrangement(ordered))
    expect(answerPayload(ordered, { order: [3, 2, 1, 0], moved: true })).toEqual([3, 2, 1, 0])
  })

  it('sends answers the scorer accepts', () => {
    expect(scoreQuestion(ordered, answerPayload(ordered, { order: [0, 1, 2, 3], moved: true })).correct).toBe(true)
    expect(scoreQuestion(ordered, answerPayload(ordered, undefined)).correct).toBe(false)
    expect(scoreQuestion({ ...good.numeric, tolerance: 0.05 }, answerPayload(good.numeric, '2,05')).correct).toBe(true)
  })

  it('restores only saved answers that still fit the questions', () => {
    const questions = [good.mcq, good.truefalse, good.order, good.numeric]
    const saved = {
      a: 1,
      b: 0,
      c: { order: [2, 0, 1], moved: true },
      d: '9,8',
      gone: 3,
    }
    expect(sanitizeAnswers(questions, saved)).toEqual({ a: 1, b: 0, c: { order: [2, 0, 1], moved: true }, d: '9,8' })
    expect(sanitizeAnswers(questions, { a: 5, b: 2, c: { order: [0, 0, 1] }, d: 7 })).toEqual({})
    expect(sanitizeAnswers(questions, { c: { order: [1, 0] } })).toEqual({})
    expect(sanitizeAnswers(questions, { d: 'x'.repeat(41) })).toEqual({})
    expect(sanitizeAnswers(questions, null)).toEqual({})
    expect(sanitizeAnswers(questions, [1, 2])).toEqual({})
  })

  it('marks positions, picks encouragement and letters', () => {
    expect(positionMarks([0, 2, 1], [0, 1, 2])).toEqual([true, false, false])
    expect(positionMarks([0, 1], null)).toEqual([false, false])
    expect(scoreTier(5, 5)).toBe('perfect')
    expect(scoreTier(4, 5)).toBe('great')
    expect(scoreTier(2, 5)).toBe('good')
    expect(scoreTier(1, 5)).toBe('keepGoing')
    expect(scoreTier(0, 0)).toBe('keepGoing')
    expect(optionLetter(0)).toBe('A')
    expect(optionLetter(3)).toBe('D')
  })
})
