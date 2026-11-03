import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import { ToastProvider } from '../../components/ui/index.js'

const h = vi.hoisted(() => ({ lab: null, post: null, calls: { addBlock: [], updateAnalysis: [], replaceLab: [] } }))

vi.mock('../lab/LabContext.jsx', () => ({
  useLab: () => ({
    lab: h.lab,
    flush: async () => h.lab,
    replaceLab: (lab) => h.calls.replaceLab.push(lab),
    updateAnalysis: (fn) => h.calls.updateAnalysis.push(fn),
    addBlock: (block) => h.calls.addBlock.push(block),
  }),
}))
vi.mock('../studio/LabStudioLayout.jsx', () => ({ useStudio: () => ({ openSource: () => {} }) }))
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    ai: { configured: true, deep_enabled: true, models: { contributor: 'muse-spark-1.3-contributor', standard: 'muse-spark-1.3', deep: 'muse-wonder-1.0' } },
  }),
}))
vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, post: (...args) => h.post(...args) }
})

const { default: PaperStep } = await import('./PaperStep.jsx')

const source = {
  id: 'src1',
  kind: 'pdf',
  title: 'attention_paper.pdf',
  status: 'ready',
  page_count: 2,
  size_bytes: 2476,
  toc: [],
  urls: { page: '/api/sources/src1/pages/{n}.png', file: '/api/sources/src1/file' },
}

const paper = {
  title: 'Attention Is All You Need (excerpt)',
  summary: 'An attention function maps a query and key-value pairs to an output.',
  sections: [{ id: 's1', title: '3.2 Attention', page_start: 1, page_end: 2, summary: 'Defines attention.' }],
  equations: [
    {
      id: 'eq1',
      label: '(1)',
      latex: '\\mathrm{Attention}(Q,K,V)=\\mathrm{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V',
      expression: '',
      context: 'Scaled dot-product attention.',
      variables: [
        { symbol: 'd_k', meaning: 'dimension of the keys', unit: '', known_value: 64, provenance: 'document' },
        { symbol: 'Q', meaning: 'matrix of queries', unit: '', known_value: null, provenance: 'document' },
      ],
      conditions: '',
      missing: ['Concrete Q, K, V values'],
      explorable: true,
      suggestion: 'algorithm',
      algorithm: 'attention',
      source_refs: [{ source_id: 'src1', page: 1, bbox: [0.1, 0.5, 0.9, 0.55], quote: 'Attention(Q, K, V)', located: 'exact' }],
    },
  ],
  figures: [{ id: 'f2', label: 'Figure 2', caption: 'Scaled Dot-Product Attention.', description: '', source_refs: [{ source_id: 'src1', page: 2, located: 'none' }] }],
  tables: [],
  methods: [],
  candidates: [{ id: 'c1', kind: 'algorithm', ref_id: 'eq1', title: 'Scaled dot-product attention', reason: 'Small matrices', suggestion: 'algorithm' }],
  warnings: [],
}

function makeLab(id, withPaper) {
  return {
    id,
    title: 'Attention',
    language: 'en',
    ai_mode: 'contributor',
    space: 'paper2explorer',
    sources: [source],
    assets: [],
    spec: { blocks: [] },
    analysis: withPaper
      ? { status: 'done', model: 'muse-spark-1.3-contributor', mode: 'contributor', created_at: '2026-10-28T00:00:00Z', source_ids: ['src1'], result: null, paper }
      : { status: 'none', source_ids: [], result: null, paper: null },
  }
}

function renderStep(lab, path = `/app/labs/${lab.id}/paper`) {
  h.lab = lab
  return render(
    <I18nProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <PaperStep />
        </MemoryRouter>
      </ToastProvider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  h.calls = { addBlock: [], updateAnalysis: [], replaceLab: [] }
  h.post = vi.fn()
  window.matchMedia =
    window.matchMedia ||
    ((query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => cleanup())

describe('PaperStep setup', () => {
  it('validates the page range and starts the structure analysis with the contract body', async () => {
    let resolve
    h.post.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderStep(makeLab('labsetup', false))
    expect(screen.getByRole('radio', { name: /attention_paper\.pdf/ })).toBeTruthy()
    const pages = screen.getByLabelText('Pages to analyze')
    expect(pages.value).toBe('1-2')

    fireEvent.change(pages, { target: { value: '1-5' } })
    expect(screen.getByText('There is no page 5 in this file (it has 2 pages).')).toBeTruthy()
    const run = screen.getByRole('button', { name: 'Analyze the paper' })
    expect(run.disabled).toBe(true)

    fireEvent.change(pages, { target: { value: '2' } })
    expect(run.disabled).toBe(false)
    fireEvent.click(run)
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post).toHaveBeenCalledWith('/api/labs/labsetup/ai/paper-structure', { source_id: 'src1', pages: [2], deep: false }, expect.objectContaining({ signal: expect.anything() }))
    expect(await screen.findByText('The AI is reading the paper…')).toBeTruthy()

    const done = makeLab('labsetup', true)
    await act(async () => {
      resolve({ analysis: done.analysis, lab: done })
    })
    expect(h.calls.replaceLab).toEqual([done])
  })
})

describe('PaperStep cancel', () => {
  it('lets the teacher stop a long structure analysis and says what happened', async () => {
    let reject
    h.post.mockImplementation(() => new Promise((_, r) => (reject = r)))
    renderStep(makeLab('labcancel', false))
    fireEvent.click(screen.getByRole('button', { name: 'Analyze the paper' }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    const { signal } = h.post.mock.calls[0][2]
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel analysis' }))
    expect(signal.aborted).toBe(true)
    await act(async () => {
      reject(new DOMException('Aborted', 'AbortError'))
    })
    expect(await screen.findByText('Paper analysis canceled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Analyze the paper' })).toBeTruthy()
    expect(h.calls.replaceLab).toEqual([])
  })
})

describe('PaperStep workspace', () => {
  it('shows the equation with its variables, page link and honest caption', async () => {
    renderStep(makeLab('labws', true))
    expect(screen.getByRole('tab', { name: /Equations/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Equation (1)' })).toBeTruthy()
    expect(screen.getByText('dimension of the keys')).toBeTruthy()
    expect(screen.getByText('Concrete Q, K, V values')).toBeTruthy()
    expect(screen.getAllByText(/partial illustration on small data/).length).toBeGreaterThan(0)
    const img = screen.getByAltText('Page 1 of “attention_paper.pdf”')
    expect(img.getAttribute('src')).toBe('/api/sources/src1/pages/1.png')
    fireEvent.load(img)
    expect(document.querySelector('.paper-highlight')).not.toBeNull()
    expect(screen.getByText('The highlighted region matches the quoted text in the PDF.')).toBeTruthy()
  })

  it('explores an equation and adds the returned block for review', async () => {
    const block = { id: 'blk_att', type: 'algorithm', title: 'Attention', algorithm: 'attention', config: {}, confirmed: true, ai_generated: false }
    h.post.mockResolvedValue({ equation: paper.equations[0], block, notes: 'Uses a 3-token example.' })
    renderStep(makeLab('labexp', true))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Control variable d_k' }))
    fireEvent.click(screen.getByRole('button', { name: 'Explore the equation' }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(1))
    expect(h.post.mock.calls[0][0]).toBe('/api/labs/labexp/ai/explore-equation')
    expect(h.post.mock.calls[0][1]).toEqual({ equation_id: 'eq1', context: 'The learner wants to control these variables with sliders: d_k.' })
    expect(await screen.findByText('Uses a 3-token example.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to Lab' }))
    expect(h.calls.addBlock).toHaveLength(1)
    expect(h.calls.addBlock[0]).toMatchObject({ id: 'blk_att', type: 'algorithm', confirmed: false, ai_generated: true })
    expect(await screen.findByText('Added to the Lab')).toBeTruthy()
  })

  it('offers the explanatory diagram when no model can be built', async () => {
    h.post.mockImplementation(async (url) => {
      if (url.endsWith('/explore-equation')) return { equation: { ...paper.equations[0], missing: ['Initial conditions'] }, block: null, notes: '' }
      const lab = { ...makeLab('labflow', true), spec: { blocks: [{ id: 'g1', type: 'flow', title: 'How attention flows' }] } }
      return { lab, generated_block_ids: ['g1'], warnings: [] }
    })
    renderStep(makeLab('labflow', true))
    fireEvent.click(screen.getByRole('button', { name: 'Explore the equation' }))
    expect(await screen.findByText('Not enough information to build an interactive model')).toBeTruthy()
    expect(screen.getByText('Initial conditions')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Create an explanatory diagram' }))
    await waitFor(() => expect(h.post).toHaveBeenCalledTimes(2))
    expect(h.post.mock.calls[1]).toEqual(['/api/labs/labflow/ai/generate', { block_types: ['flow'], replace: false }, expect.objectContaining({ signal: expect.anything() })])
    expect(await screen.findByText('How attention flows')).toBeTruthy()
    expect(h.calls.replaceLab).toHaveLength(1)
  })

  it('lets the teacher cancel exploring an equation', async () => {
    h.post.mockImplementation(
      (url, body, opts) => new Promise((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    )
    renderStep(makeLab('labstop', true))
    fireEvent.click(screen.getByRole('button', { name: 'Explore the equation' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Canceled. Press “Explore the equation” to try again when you are ready.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Explore the equation' })).toBeTruthy()
  })

  it('adds the ready-made attention block from a candidate and explains chart data limits on figures', async () => {
    renderStep(makeLab('labcand', true), '/app/labs/labcand/paper?tab=candidates')
    fireEvent.click(screen.getByRole('button', { name: 'Add an attention algorithm block' }))
    expect(h.calls.addBlock).toHaveLength(1)
    expect(h.calls.addBlock[0]).toMatchObject({ type: 'algorithm', algorithm: 'attention', confirmed: false })
    expect(h.calls.addBlock[0].config.tokens).toEqual(['I', 'love', 'cats'])
    expect(h.calls.addBlock[0].source_refs[0].page).toBe(1)

    fireEvent.click(screen.getByRole('tab', { name: /Figures/ }))
    expect(await screen.findByText('A chart image does not contain the original data')).toBeTruthy()
    expect(screen.getByText('This item is on page 2, but its exact region on the page could not be determined.')).toBeTruthy()
  })
})
