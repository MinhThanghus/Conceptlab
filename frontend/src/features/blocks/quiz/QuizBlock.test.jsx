import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import QuizBlock from './QuizBlock.jsx'

const block = {
  id: 'bq',
  type: 'quiz',
  title: 'Self-check',
  description: '',
  source_refs: [],
  confirmed: true,
  ai_generated: false,
  questions: [
    { id: 'q1', kind: 'mcq', prompt: 'Which one?', options: ['Alpha', 'Beta'], answer_index: 1, explanation: 'Beta is right.', source_refs: [], approved: true },
    { id: 'q2', kind: 'numeric', prompt: 'How long?', options: [], answer_value: 2, tolerance: 0.05, unit: 's', explanation: '', source_refs: [], approved: true },
    { id: 'hidden', kind: 'mcq', prompt: 'Draft question', options: ['x', 'y'], answer_index: 0, source_refs: [], approved: false },
  ],
}

function renderQuiz(env, { quiz = block, mode = 'view', onChange = vi.fn() } = {}) {
  return render(
    <I18nProvider>
      <BlockEnvProvider value={env}>
        <QuizBlock block={quiz} mode={mode} onChange={onChange} />
      </BlockEnvProvider>
    </I18nProvider>,
  )
}

const answerBoth = (numberText) => {
  fireEvent.click(screen.getByRole('radio', { name: /Beta/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
  fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: numberText } })
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.pushState({}, '', '/')
})

describe('QuizBlock learner view', () => {
  it('shows only approved questions and scores the studio preview locally, without any request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderQuiz({ labId: 'lab1' })
    expect(screen.queryByText('Draft question')).toBeNull()
    expect(screen.getByText('Preview')).toBeTruthy()
    answerBoth('2,05') // 2.5 % off with a 5 % tolerance
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/2 of 2 correct/)).toBeTruthy()
    expect(screen.getByText('Preview: this result is not saved.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends every answer to the share endpoint and shows the server’s result', async () => {
    window.history.pushState({}, '', '/s/ABC234?phase=pre')
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => ({
        id: 'att1',
        score: 0,
        total: 2,
        results: [
          { question_id: 'q1', correct: false, correct_answer: 0, explanation: 'Server explanation.' },
          { question_id: 'q2', correct: false, correct_answer: 3, explanation: '' },
        ],
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderQuiz({ shareCode: 'ABC234' })
    answerBoth('2') // correct by the local rules — the server decides
    fireEvent.change(screen.getByLabelText(/Name or nickname/), { target: { value: '  Lan   A ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/0 of 2 correct/)).toBeTruthy()
    expect(screen.getByText('Before-the-lesson check')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/share/ABC234/quiz-attempts')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      block_id: 'bq',
      phase: 'pre',
      display_name: 'Lan A',
      answers: [
        { question_id: 'q1', answer: 1 },
        { question_id: 'q2', answer: 2 },
      ],
    })
    // review of question 1 uses the server's answer key and explanation
    expect(screen.getByText('Correct answer: A. Alpha')).toBeTruthy()
    expect(screen.getByText('Server explanation.')).toBeTruthy()
  })

  it('submits displayed ordering indices for translated questions without exposing the key', async () => {
    const orderQuiz = { ...block, questions: [{ id: 'qorder', kind: 'order', prompt: 'Arrange the steps', options: ['First', 'Second', 'Third'], approved: true }] }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, headers: { get: () => 'application/json' }, json: async () => ({ score: 1, total: 1, results: [{ question_id: 'qorder', correct: true, correct_answer: [0, 1, 2], explanation: 'An English explanation.' }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderQuiz({ shareCode: 'ABC234', translatedLanguage: 'en' }, { quiz: orderQuiz })
    const first = container.querySelector('.qz-order-handle')
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    const expected = [...container.querySelectorAll('.qz-order-handle')].map((el) => orderQuiz.questions[0].options.findIndex((option) => el.textContent.includes(option)))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText('An English explanation.')).toBeTruthy()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/share/ABC234/quiz-attempts?lang=en')
    expect(JSON.parse(init.body).answers[0].answer).toEqual(expected)
  })

  it('lists unanswered questions, then counts them as wrong when checked anyway', async () => {
    renderQuiz({ labId: 'lab1' })
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getByText('2 questions not answered yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check anyway' }))
    expect(await screen.findByText(/0 of 2 correct/)).toBeTruthy()
    expect(screen.getByText('You didn’t answer this question')).toBeTruthy()
  })

  it('keeps unfinished answers when the learner leaves the part and comes back', () => {
    const first = renderQuiz({ labId: 'lab1' })
    fireEvent.click(screen.getByRole('radio', { name: /Beta/ }))
    first.unmount()
    renderQuiz({ labId: 'lab1' })
    expect(screen.getByRole('radio', { name: /Beta/ }).checked).toBe(true)
    expect(screen.getByText('Your unfinished answers are back where you left them.')).toBeTruthy()
  })

  it('explains an empty quiz honestly', () => {
    renderQuiz({ labId: 'lab1' }, { quiz: { ...block, questions: [block.questions[2]] } })
    expect(screen.getByText('No questions to answer yet')).toBeTruthy()
  })
})

const shareResponse = (body) =>
  vi.fn(async () => ({ ok: true, status: 201, headers: { get: () => 'application/json' }, json: async () => body }))

// what a learner gets from GET /api/share/{code}: no answers, no explanation, no feedback (C6)
const learnerQuiz = {
  ...block,
  questions: [
    {
      id: 'p1',
      kind: 'mcq',
      context: 'Lan hangs a bob on a string in the schoolyard.',
      prompt: 'What sets the period of a pendulum?',
      options: ['The mass', 'The length and g', 'The colour'],
      hint: 'Look at formula (12.1) again.',
      cognitive_level: 'apply',
      source_refs: [],
      approved: true,
    },
    { id: 'p2', kind: 'numeric', prompt: 'How long is one swing?', options: [], unit: 's', source_refs: [], approved: true },
  ],
}

describe('QuizBlock learner view: situation, hint and feedback', () => {
  it('shows the situation above the question, the level beside the kind and a hint only on request', () => {
    const { container } = renderQuiz({ shareCode: 'ABC234' }, { quiz: learnerQuiz })
    const context = screen.getByText('Lan hangs a bob on a string in the schoolyard.')
    const prompt = screen.getByText('What sets the period of a pendulum?')
    expect(context.closest('.qz-context')).toBeTruthy()
    expect(context.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('.qz-level').textContent).toContain('Apply')
    expect(container.querySelector('.qz-kind').textContent).toBe('Multiple choice')

    const toggle = screen.getByRole('button', { name: 'Show a hint' })
    const hint = screen.getByText('Look at formula (12.1) again.').closest('.qz-hint')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(hint.id)
    expect(hint.hidden).toBe(true)
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(hint.hidden).toBe(false)
    // said out loud, since the well opens above the button
    expect(container.querySelector('[aria-live="polite"]').textContent).toBe('Hint: Look at formula (12.1) again.')
    fireEvent.click(toggle)
    expect(hint.hidden).toBe(true)
    // a question without a hint offers none
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.queryByRole('button', { name: 'Show a hint' })).toBeNull()
  })

  it('explains the pick and the right option after checking, and the others on request', async () => {
    const fetchMock = shareResponse({
      id: 'att2',
      score: 0,
      total: 2,
      results: [
        {
          question_id: 'p1',
          correct: false,
          correct_answer: 1,
          explanation: 'Only L and g appear in the formula.',
          option_feedback: ['Mass is not in the formula.', 'Right: only L and g are in it.', 'Colour is not a physical quantity.'],
        },
        { question_id: 'p2', correct: false, correct_answer: 1.003, explanation: '', option_feedback: [] },
      ],
    })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderQuiz({ shareCode: 'ABC234' }, { quiz: learnerQuiz })
    fireEvent.click(screen.getByRole('radio', { name: /The mass/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/0 of 2 correct/)).toBeTruthy()

    const why = (text) => screen.getByText(text).closest('.qz-option-why')
    expect(why('Mass is not in the formula.').hidden).toBe(false)
    expect(why('Right: only L and g are in it.').hidden).toBe(false)
    expect(why('Colour is not a physical quantity.').hidden).toBe(true)
    const others = screen.getByRole('button', { name: 'Why the other answer is not right' })
    expect(others.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(others)
    expect(others.getAttribute('aria-expanded')).toBe('true')
    expect(why('Colour is not a physical quantity.').hidden).toBe(false)
    // the verdict keeps the error ink; the right answer is still spelled out
    expect(container.querySelector('.qz-feedback.is-wrong')).toBeTruthy()
    expect(screen.getByText('Correct answer: B. The length and g')).toBeTruthy()
    // no hint once the answers are checked
    expect(screen.queryByRole('button', { name: 'Show a hint' })).toBeNull()
    // the learner payload has no tolerance: no guessed margin is shown for the number
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(screen.getByText('Correct answer: 1.003 s')).toBeTruthy()
    expect(screen.queryByText(/count as correct/)).toBeNull()
  })

  it('shows a right answer in a mint box with its own feedback', async () => {
    const quiz = {
      ...block,
      questions: [{ id: 'm1', kind: 'truefalse', prompt: 'Mass doubles the period.', options: [], answer_index: 1, option_feedback: ['Not quite: mass is not in the formula.', 'Right: mass is not in the formula.'], explanation: '', source_refs: [], approved: true }],
    }
    const { container } = renderQuiz({ labId: 'lab1' }, { quiz })
    fireEvent.click(screen.getByRole('radio', { name: /False/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/1 of 1 correct/)).toBeTruthy()
    expect(container.querySelector('.qz-feedback.is-right .qz-feedback-title').textContent).toBe('Correct!')
    expect(screen.getByText('Right: mass is not in the formula.').closest('.qz-option-why').hidden).toBe(false)
    expect(screen.getByText('Not quite: mass is not in the formula.').closest('.qz-option-why').hidden).toBe(true)
    // nothing was missed: no review button, the whole review is below
    expect(screen.queryByRole('button', { name: 'Review the ones you missed' })).toBeNull()
    expect(screen.getByText('Review each question below.')).toBeTruthy()
  })

  it('jumps from the score to the first question that was missed', async () => {
    renderQuiz({ labId: 'lab1' })
    fireEvent.click(screen.getByRole('radio', { name: /Beta/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByRole('heading', { name: /1 of 2 correct/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Question 1 of 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Review the ones you missed' }))
    const heading = screen.getByRole('heading', { name: 'Question 2 of 2' })
    expect(document.activeElement).toBe(heading)
  })

  it('starts an order question from the server’s order when the payload has no key', () => {
    const quiz = { ...block, questions: [{ id: 'o1', kind: 'order', prompt: 'Order the stages', options: ['Rain', 'Evaporation', 'Condensation'], source_refs: [], approved: true }] }
    const { container } = renderQuiz({ shareCode: 'ABC234' }, { quiz })
    expect([...container.querySelectorAll('.qz-order-handle')].map((el) => el.textContent.replace(/Position \d of \d:\s*/, ''))).toEqual(['Rain', 'Evaporation', 'Condensation'])
  })

  it('sets order items and the right order like options (math and bold rendered) and says them without the marks', async () => {
    const options = ['**Evaporation** of sea water', 'Vapour cools to $T_2$', 'Rain']
    const quiz = { ...block, questions: [{ id: 'o2', kind: 'order', prompt: 'Order the stages', options, source_refs: [], approved: true }] }
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, headers: { get: () => 'application/json' }, json: async () => ({ score: 0, total: 1, results: [{ question_id: 'o2', correct: false, correct_answer: [0, 1, 2], explanation: '' }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    const { container } = renderQuiz({ shareCode: 'ABC234' }, { quiz })
    expect(container.querySelector('.qz-order strong').textContent).toBe('Evaporation')
    expect(container.querySelector('.qz-order').textContent).not.toMatch(/\*\*|\$/)
    fireEvent.click(screen.getByRole('button', { name: 'Move “Vapour cools to T_2” up' }))
    expect(screen.getByText('Moved “Vapour cools to T_2” to position 1 of 3.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    const list = (await screen.findByText('Correct order:')).parentElement.querySelector('.qz-answer-list')
    expect(list.querySelector('strong').textContent).toBe('Evaporation')
    expect(list.textContent).not.toMatch(/\*\*|\$/)
  })

  it('renders the right option’s bold in the verdict, not its marks', async () => {
    const quiz = { ...block, questions: [{ id: 'm1', kind: 'mcq', prompt: 'Which wave?', options: ['Alpha', '**Beta** wave'], answer_index: 1, explanation: '', source_refs: [], approved: true }] }
    const { container } = renderQuiz({ labId: 'lab1' }, { quiz })
    fireEvent.click(screen.getByRole('radio', { name: /Alpha/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    await screen.findByText(/0 of 1 correct/)
    const verdict = container.querySelector('.qz-correct')
    expect(verdict.textContent).toBe('Correct answer: B. Beta wave')
    expect(verdict.querySelector('strong').textContent).toBe('Beta')
  })
})

describe('QuizBlock editor', () => {
  it('keeps the approval switch locked until the question has a correct answer', async () => {
    const onChange = vi.fn()
    const quiz = {
      ...block,
      questions: [{ id: 'q_1a2b3c4d', kind: 'mcq', prompt: 'Pick one', options: ['First', 'Second'], answer_index: null, explanation: '', source_refs: [], approved: false }],
    }
    renderQuiz({ labId: 'lab1', aiAvailable: false }, { quiz, mode: 'edit', onChange })
    const approve = await screen.findByRole('switch', { name: 'Approve so learners see this' })
    expect(approve.disabled).toBe(true)
    expect(screen.getByText('No correct answer is selected.')).toBeTruthy()
    expect(screen.getByText('AI is not switched on for this server. You can still write questions yourself below.')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Mark B as the correct answer' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ questions: [expect.objectContaining({ id: 'q_1a2b3c4d', answer_index: 1, approved: false })] }))
  })

  it('approves only well-formed questions with “approve all”', async () => {
    const onChange = vi.fn()
    const quiz = {
      ...block,
      questions: [
        { id: 'qt_a', kind: 'truefalse', prompt: 'Statement', options: [], answer_index: 0, explanation: '', source_refs: [], approved: false },
        { id: 'qt_b', kind: 'numeric', prompt: 'No value yet', options: [], answer_value: null, explanation: '', source_refs: [], approved: false },
      ],
    }
    renderQuiz({ labId: 'lab1', aiAvailable: false }, { quiz, mode: 'edit', onChange })
    fireEvent.click(await screen.findByRole('button', { name: 'Approve all (1)' }))
    expect(screen.getByText('1 question still has missing details and will stay unapproved.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve 1 question' }))
    const next = onChange.mock.calls.at(-1)[0]
    expect(next.questions.map((q) => [q.id, q.approved])).toEqual([
      ['qt_a', true],
      ['qt_b', false],
    ])
  })

  const feedbackQuiz = {
    ...block,
    questions: [
      {
        id: 'qt_f',
        kind: 'mcq',
        context: '',
        prompt: 'Pick one',
        options: ['First', 'Second', 'Third'],
        answer_index: 2,
        option_feedback: ['Why not first', 'Why not second', 'Why third'],
        hint: '',
        cognitive_level: null,
        explanation: '',
        source_refs: [],
        approved: false,
      },
    ],
  }

  it('removes an option together with its feedback, and keeps the answer on the same option', async () => {
    const onChange = vi.fn()
    renderQuiz({ labId: 'lab1', aiAvailable: false }, { quiz: feedbackQuiz, mode: 'edit', onChange })
    expect((await screen.findByRole('textbox', { name: 'Feedback for option B' })).value).toBe('Why not second')
    fireEvent.click(screen.getByRole('button', { name: 'Delete option A' }))
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ questions: [expect.objectContaining({ options: ['Second', 'Third'], option_feedback: ['Why not second', 'Why third'], answer_index: 1 })] }),
    )
  })

  it('writes one feedback line per option, adds a line with a new option, and edits level, situation and hint', async () => {
    const onChange = vi.fn()
    renderQuiz({ labId: 'lab1', aiAvailable: false }, { quiz: feedbackQuiz, mode: 'edit', onChange })
    const last = () => onChange.mock.calls.at(-1)[0].questions[0]
    fireEvent.change(await screen.findByRole('textbox', { name: 'Feedback for option A' }), { target: { value: 'Mass is not in it' } })
    expect(last().option_feedback).toEqual(['Mass is not in it', 'Why not second', 'Why third'])
    fireEvent.click(screen.getByRole('button', { name: 'Add option' }))
    expect(last()).toMatchObject({ options: ['First', 'Second', 'Third', ''], option_feedback: ['Why not first', 'Why not second', 'Why third', ''] })
    fireEvent.change(screen.getByRole('combobox', { name: /Thinking level/ }), { target: { value: 'extend' } })
    expect(last().cognitive_level).toBe('extend')
    fireEvent.change(screen.getByRole('combobox', { name: /Thinking level/ }), { target: { value: '' } })
    expect(last().cognitive_level).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: /Opening situation/ }), { target: { value: 'At the market' } })
    expect(last().context).toBe('At the market')
    fireEvent.change(screen.getByRole('textbox', { name: /^Hint/ }), { target: { value: 'Use step 2' } })
    expect(last().hint).toBe('Use step 2')
  })

  it('gives true/false questions two feedback lines, for True then False', async () => {
    const onChange = vi.fn()
    const quiz = { ...block, questions: [{ id: 'qt_t', kind: 'truefalse', prompt: 'Mass doubles the period', options: [], answer_index: 1, option_feedback: [], explanation: '', source_refs: [], approved: false }] }
    renderQuiz({ labId: 'lab1', aiAvailable: false }, { quiz, mode: 'edit', onChange })
    fireEvent.change(await screen.findByRole('textbox', { name: 'When a learner answers “False”' }), { target: { value: 'Right: mass is not in it' } })
    expect(onChange.mock.calls.at(-1)[0].questions[0].option_feedback).toEqual(['', 'Right: mass is not in it'])
    expect(screen.getByRole('textbox', { name: 'When a learner answers “True”' })).toBeTruthy()
  })
})
