import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider, useT } from '../../i18n/index.jsx'
import { AuthProvider } from '../auth/AuthContext.jsx'
import LiteLab from './LiteLab.jsx'

const lab = {
  share_code: 'ABC234',
  title: 'Pendulum lite',
  subject: 'physics',
  grade: '10',
  language: 'en',
  allow_tutor: false,
  cover_url: null,
  sources: [{ id: 's1', kind: 'image', title: 'Class photo', status: 'ready', urls: { file: '/api/share/ABC234/sources/s1/file' } }],
  assets: [],
  spec: {
    summary: 'A short pendulum lesson.',
    objectives: ['Measure a period'],
    assumptions: [{ id: 'a1', text: 'Small angles only', confirmed: true }],
    glossary: [],
    blocks: [
      {
        id: 'b1',
        type: 'steps',
        title: 'Do it',
        description: '',
        source_refs: [],
        sequence_confirmed: true,
        steps: [{ id: 'st1', title: 'Measure', body: 'Measure the string length.', highlight: { source_id: 's1', located: 'exact' }, source_refs: [] }],
      },
      {
        id: 'b2',
        type: 'quiz',
        title: 'Check',
        description: '',
        source_refs: [],
        questions: [{ id: 'q1', kind: 'mcq', prompt: 'Longer string means?', options: ['Longer period', 'Shorter period'], answer_index: 0, explanation: 'Longer string, longer period.', source_refs: [], approved: true }],
      },
    ],
  },
}

function LanguageToggle() {
  const { setLang } = useT()
  return <><button onClick={() => setLang('vi')}>Switch VI</button><button onClick={() => setLang('en')}>Switch EN</button></>
}

function renderLite(fetchImpl) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  return render(
    <MemoryRouter initialEntries={['/lite/ABC234']}>
      <I18nProvider>
        <LanguageToggle />
        <AuthProvider>
          <Routes>
            <Route path="/lite/:code" element={<LiteLab />} />
          </Routes>
        </AuthProvider>
      </I18nProvider>
    </MemoryRouter>,
  )
}

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => 'application/json' },
  json: async () => body,
  text: async () => JSON.stringify(body),
})

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  window.localStorage.clear()
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LiteLab', () => {
  it('renders steps with their picture, then marks the quiz on the server', async () => {
    const fetchMock = vi.fn(async (url, init) => {
      if (String(url).includes('/api/auth/me')) return jsonResponse({ user: null, csrf_token: '', ai: { configured: false } })
      if (String(url).includes('quiz-attempts')) {
        return jsonResponse({ id: 'a1', score: 1, total: 1, results: [{ question_id: 'q1', correct: true, correct_answer: 0, explanation: 'Longer string, longer period.' }] }, 201)
      }
      return jsonResponse(lab)
    })
    renderLite(fetchMock)
    expect(await screen.findByRole('heading', { name: 'Pendulum lite' })).toBeTruthy()
    expect(screen.getByText('Measure the string length.')).toBeTruthy()
    expect(screen.getByAltText(/Picture for the part/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save for offline reading' })).toBeTruthy()
    expect(window.localStorage.getItem('cl.lite.lab.ABC234')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /Longer period/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/You got 1 of 1 right/)).toBeTruthy()
    const quizCall = fetchMock.mock.calls.find(([url]) => String(url).includes('quiz-attempts'))
    expect(JSON.parse(quizCall[1].body).answers).toEqual([{ question_id: 'q1', answer: 0 }])
  })

  it('translates the lesson and sends the selected language with the quiz', async () => {
    const original = { ...lab, language: 'vi', title: 'Con lắc' }
    const translated = { ...lab, language: 'vi', translated_language: 'en' }
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) return jsonResponse({ user: null, ai: {} })
      if (String(url).includes('/translate')) return jsonResponse(translated)
      if (String(url).includes('quiz-attempts')) return jsonResponse({ score: 1, total: 1, results: [{ question_id: 'q1', correct: true, correct_answer: 0, explanation: 'Longer period.' }] }, 201)
      return jsonResponse(original)
    })
    renderLite(fetchMock)
    expect(await screen.findByRole('heading', { name: 'Pendulum lite' })).toBeTruthy()
    expect(screen.getByText(/AI translation/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Longer period/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/You got 1 of 1 right/)).toBeTruthy()
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('quiz-attempts?lang=en'))).toBe(true)
  })

  it('reads the saved copy when the network fails, and never claims it can submit offline', async () => {
    window.localStorage.setItem('cl.lite.lab.ABC234', JSON.stringify(lab))
    window.localStorage.setItem('cl.lite.meta', JSON.stringify({ ABC234: Date.now() }))
    renderLite(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await screen.findByText('You are offline')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check answers' }).disabled).toBe(true)
  })

  it('gives the situation, a hint on request and, after marking, the feedback and the right answer', async () => {
    // the learner payload: no answer key, no explanation, no feedback; order options already shuffled
    const quizBlock = {
      id: 'b2',
      type: 'quiz',
      title: 'Check',
      description: '',
      source_refs: [],
      questions: [
        { id: 'q1', kind: 'mcq', context: 'Lan swings a bob in the schoolyard.', prompt: 'Longer string means?', options: ['Shorter period', 'Longer period'], hint: 'Look at the square root of L.', source_refs: [], approved: true },
        { id: 'q2', kind: 'order', prompt: 'Order the stages', options: ['Rain', 'Evaporation', 'Condensation'], source_refs: [], approved: true },
      ],
    }
    const learnerLab = { ...lab, spec: { ...lab.spec, blocks: [lab.spec.blocks[0], quizBlock] } }
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) return jsonResponse({ user: null, ai: {} })
      if (String(url).includes('quiz-attempts')) {
        return jsonResponse({
          score: 0,
          total: 2,
          results: [
            { question_id: 'q1', correct: false, correct_answer: 1, explanation: 'T grows with the square root of L.', option_feedback: ['A longer string makes the swing slower, not faster.', 'Right.'] },
            { question_id: 'q2', correct: false, correct_answer: [1, 2, 0], explanation: '', option_feedback: [] },
          ],
        }, 201)
      }
      return jsonResponse(learnerLab)
    })
    renderLite(fetchMock)
    expect(await screen.findByText('Lan swings a bob in the schoolyard.')).toBeTruthy()
    // the hint sits in a native disclosure, closed until asked for
    const hint = screen.getByText('Show a hint').closest('details')
    expect(hint.open).toBe(false)
    expect(hint.textContent).toContain('Look at the square root of L.')
    fireEvent.click(screen.getByText('Show a hint'))
    expect(hint.open).toBe(true)
    // the order question starts from the server's order, not solved
    const selects = screen.getAllByRole('combobox', { name: /Position \d of 3/ })
    expect(selects.map((s) => s.value)).toEqual(['0', '1', '2'])
    fireEvent.change(selects[0], { target: { value: '1' } })
    fireEvent.click(screen.getByRole('radio', { name: /Shorter period/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/You got 0 of 2 right/)).toBeTruthy()
    expect(screen.getByText('A longer string makes the swing slower, not faster.')).toBeTruthy()
    expect(screen.getByText('Longer period', { selector: '.lite-review p' })).toBeTruthy()
    expect(screen.getByText('T grows with the square root of L.')).toBeTruthy()
    const order = screen.getByText('Correct order:').closest('div')
    expect([...order.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Evaporation', 'Condensation', 'Rain'])
    const quizCall = fetchMock.mock.calls.find(([url]) => String(url).includes('quiz-attempts'))
    expect(JSON.parse(quizCall[1].body).answers).toEqual([
      { question_id: 'q1', answer: 0 },
      { question_id: 'q2', answer: [1, 0, 2] },
    ])
  })

  it('gives a missed number with the margin the server marked it with', async () => {
    const quizBlock = {
      id: 'b2',
      type: 'quiz',
      title: 'Check',
      description: '',
      source_refs: [],
      questions: [{ id: 'q1', kind: 'numeric', prompt: 'How long is one swing?', options: [], unit: 's', source_refs: [], approved: true }],
    }
    const learnerLab = { ...lab, spec: { ...lab.spec, blocks: [lab.spec.blocks[0], quizBlock] } }
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/me')) return jsonResponse({ user: null, ai: {} })
      if (String(url).includes('quiz-attempts')) {
        return jsonResponse({ score: 0, total: 1, results: [{ question_id: 'q1', correct: false, correct_answer: 1.003, tolerance: 0.03, explanation: '', option_feedback: [] }] }, 201)
      }
      return jsonResponse(learnerLab)
    })
    renderLite(fetchMock)
    fireEvent.change(await screen.findByLabelText(/Your answer/), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(await screen.findByText(/You got 0 of 1 right/)).toBeTruthy()
    const line = screen.getByText(/answers within 3% count as correct/).closest('p')
    expect(line.textContent).toContain('1.003 s')
  })

  it('does not restore a saved copy after the server says the lesson was withdrawn', async () => {
    window.localStorage.setItem('cl.lite.lab.ABC234', JSON.stringify(lab))
    window.localStorage.setItem('cl.lite.meta', JSON.stringify({ ABC234: Date.now() }))
    renderLite(async (url) => String(url).includes('/api/auth/me') ? jsonResponse({ user: null, ai: {} }) : jsonResponse({}, 404))
    expect(await screen.findByRole('heading', { name: 'Lesson not found' })).toBeTruthy()
    expect(window.localStorage.getItem('cl.lite.lab.ABC234')).toBeNull()
  })
})


it('opens a prepared translation from the localized GET without requesting translation', async () => {
  const fetchMock = vi.fn(async (url) => String(url).includes('/api/auth/me')
    ? jsonResponse({ user: null, ai: {} })
    : jsonResponse({ ...lab, language: 'vi', translated_language: 'en', translation_kind: 'reviewed' }))
  renderLite(fetchMock)
  expect(await screen.findByRole('heading', { name: 'Pendulum lite' })).toBeTruthy()
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/share/ABC234?lang=en'))).toBe(true)
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/translate'))).toBe(false)
})

it('does not translate stale content while the newly selected language is loading', async () => {
  window.localStorage.setItem('cl.lang', 'vi')
  let resolveEnglish
  const fetchMock = vi.fn((url) => {
    if (String(url).includes('/api/auth/me')) return Promise.resolve(jsonResponse({ user: null, ai: {} }))
    if (String(url).endsWith('lang=vi')) return Promise.resolve(jsonResponse({ ...lab, language: 'vi', title: 'Vietnamese original' }))
    if (String(url).endsWith('lang=en')) return new Promise((resolve) => { resolveEnglish = resolve })
    return Promise.resolve(jsonResponse(lab))
  })
  renderLite(fetchMock)
  expect(await screen.findByRole('heading', { name: 'Vietnamese original' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Switch EN' }))
  await waitFor(() => expect(resolveEnglish).toBeTypeOf('function'))
  expect(screen.queryByRole('heading', { name: 'Vietnamese original' })).toBeNull()
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/translate'))).toBe(false)
  await act(async () => resolveEnglish(jsonResponse({ ...lab, language: 'vi', translated_language: 'en', translation_kind: 'reviewed' })))
  expect(await screen.findByRole('heading', { name: 'Pendulum lite' })).toBeTruthy()
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/translate'))).toBe(false)
})

it('ignores a late failure from an aborted language request', async () => {
  window.localStorage.setItem('cl.lang', 'vi')
  let rejectEnglish
  const fetchMock = vi.fn((url) => {
    if (String(url).includes('/api/auth/me')) return Promise.resolve(jsonResponse({ user: null, ai: {} }))
    if (String(url).endsWith('lang=vi')) return Promise.resolve(jsonResponse({ ...lab, language: 'vi', title: 'Vietnamese original' }))
    if (String(url).endsWith('lang=en')) return new Promise((resolve, reject) => { rejectEnglish = reject })
    return Promise.resolve(jsonResponse(lab))
  })
  renderLite(fetchMock)
  expect(await screen.findByRole('heading', { name: 'Vietnamese original' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Switch EN' }))
  await waitFor(() => expect(rejectEnglish).toBeTypeOf('function'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch VI' }))
  expect(await screen.findByRole('heading', { name: 'Vietnamese original' })).toBeTruthy()
  await act(async () => rejectEnglish(new TypeError('late network failure')))
  expect(screen.getByRole('heading', { name: 'Vietnamese original' })).toBeTruthy()
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/translate'))).toBe(false)
})


it('lists sources once before lesson blocks and keeps source files and note links openable', async () => {
  const ref = { source_id: 'note1', located: 'exact' }
  const lesson = {
    ...lab,
    sources: [...lab.sources, { id: 'note1', kind: 'note', title: 'Research reading note', text: 'Original article: https://example.org/paper' }],
    spec: { ...lab.spec, blocks: lab.spec.blocks.map((block) => ({
      ...block, source_refs: [ref],
      ...(block.steps ? { steps: block.steps.map((step) => ({ ...step, source_refs: [ref] })) } : {}),
      ...(block.questions ? { questions: block.questions.map((question) => ({ ...question, source_refs: [ref] })) } : {}),
    })) },
  }
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('/api/auth/me')) return jsonResponse({ user: null, ai: {} })
    if (String(url).includes('quiz-attempts')) return jsonResponse({ score: 1, total: 1, results: [{ question_id: 'q1', correct: true, correct_answer: 0, explanation: 'Correct' }] }, 201)
    return jsonResponse(lesson)
  })
  renderLite(fetchMock)
  expect(await screen.findByRole('heading', { name: 'Pendulum lite' })).toBeTruthy()
  const sourceHeading = screen.getByRole('heading', { name: 'Lesson sources' })
  const lessonHeading = screen.getByRole('heading', { name: /Do it/ })
  expect(sourceHeading.compareDocumentPosition(lessonHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByText(/Research reading note/)).toHaveLength(1)
  expect(screen.getByRole('link', { name: /Class photo/ }).getAttribute('href')).toBe('/api/share/ABC234/sources/s1/file')
  fireEvent.click(screen.getByText(/Research reading note/))
  expect(screen.getByRole('link', { name: 'https://example.org/paper' }).getAttribute('href')).toBe('https://example.org/paper')
  expect(screen.getByAltText(/Picture for the part/)).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: /Longer period/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Check answers' }))
  expect(await screen.findByText(/You got 1 of 1 right/)).toBeTruthy()
  expect(screen.getAllByText(/Research reading note/)).toHaveLength(1)
})

it('reads a board block as its text: crossed-out lines hidden, formulas as text, a link to the redrawn sheet', async () => {
  const boardBlock = {
    id: 'bd1',
    type: 'board',
    title: 'Photosynthesis',
    description: '',
    source_refs: [],
    confirmed: true,
    ai_generated: false,
    image: { source_id: 's1', page: null, asset_id: null },
    surface: 'notebook',
    items: [
      { id: 'b1', kind: 'heading', text: '  photosynthesis ' },
      { id: 'b2', kind: 'equation', text: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', latex: String.raw`6CO_2 + 6H_2O \xrightarrow[\text{chlorophyll}]{\text{light}} C_6H_{12}O_6 + 6O_2` },
      { id: 'b3', kind: 'text', text: 'needs CO2 ~??', struck: true },
      { id: 'b4', kind: 'bullet', text: '• happens in chloroplasts' },
      { id: 'b5', kind: 'bullet', text: 'releases oxygen' },
      { id: 'b6', kind: 'formula', lead: 'Period:', text: '', latex: String.raw`T = 2\pi\sqrt{l/g}` },
      { id: 'b7', kind: 'diagram', text: 'A leaf under the sun', labels: ['CO₂', 'O₂'] },
      { id: 'b8', kind: 'note', text: 'Learn the equation by heart' },
    ],
    unreadable: '',
    visual: { source_id: null, page: null, asset_id: 'as1' },
    visual_proof: { checked: true, ok: false, differences: [{ expected: 'O₂', found: 'O2' }], missing: [], extra: [], attempts: 2 },
    show: 'visual',
  }
  const boardLab = { ...lab, assets: [{ id: 'as1', kind: 'generated', url: '/api/share/ABC234/assets/as1/file' }], spec: { ...lab.spec, blocks: [boardBlock] } }
  renderLite(async (url) => String(url).includes('/api/auth/me') ? jsonResponse({ user: null, ai: {} }) : jsonResponse(boardLab))
  const heading = await screen.findByRole('heading', { name: 'Photosynthesis', level: 2 })
  const card = heading.closest('section')
  // the title is written once, the crossed-out line never shows
  expect(screen.queryByRole('heading', { name: /photosynthesis/i, level: 3 })).toBeNull()
  expect(card.textContent).not.toContain('needs CO2')
  expect(screen.getByText('6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂').className).toBe('lite-formula')
  expect(screen.getByText('Above the arrow: light. Below the arrow: chlorophyll.')).toBeTruthy()
  expect(screen.getByText('Period: T = 2π√(l/g)')).toBeTruthy()
  const bullets = screen.getByText('happens in chloroplasts').closest('ul')
  expect([...bullets.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['happens in chloroplasts', 'releases oxygen'])
  expect(screen.getByText(/A leaf under the sun/).textContent).toBe('Drawing: A leaf under the sun')
  expect(screen.getByText('Words on the drawing: CO₂, O₂')).toBeTruthy()
  expect(screen.getByText(/Learn the equation by heart/).className).toBe('lite-board-note')
  // no picture inline and no KaTeX: the redrawn sheet is a plain link, with a word of caution
  expect(card.querySelector('img, .katex')).toBeNull()
  expect(screen.getByRole('link', { name: 'Open the clean copy (a picture redrawn by AI)' }).getAttribute('href')).toBe('/api/share/ABC234/assets/as1/file')
  expect(screen.getByText(/still differs from the text/)).toBeTruthy()
})

it('shows an unread board honestly and offers no link without a redrawn sheet', async () => {
  const empty = { id: 'bd2', type: 'board', title: '', description: '', source_refs: [], image: { source_id: 's1', page: null, asset_id: null }, surface: 'other', items: [{ id: 'b1', kind: 'text', text: 'gone', struck: true }], unreadable: '', visual: null, visual_proof: null, show: 'visual' }
  renderLite(async (url) => String(url).includes('/api/auth/me') ? jsonResponse({ user: null, ai: {} }) : jsonResponse({ ...lab, spec: { ...lab.spec, blocks: [empty] } }))
  expect(await screen.findByText('This part has no text yet. Open the full version or ask your teacher.')).toBeTruthy()
  expect(screen.queryByText('gone')).toBeNull()
  expect(screen.queryByRole('link', { name: /clean copy/ })).toBeNull()
})
