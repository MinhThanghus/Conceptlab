import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../../../i18n/index.jsx'

const mocks = vi.hoisted(() => ({ lab: null, post: vi.fn(), replaceLab: vi.fn() }))
vi.mock('../../../lab/LabContext.jsx', () => ({ useLab: () => ({ lab: mocks.lab, flush: async () => mocks.lab, replaceLab: mocks.replaceLab }) }))
vi.mock('../../../auth/AuthContext.jsx', () => ({ useAuth: () => ({ ai: { configured: true } }) }))
vi.mock('../../../../lib/api.js', () => ({ post: (...args) => mocks.post(...args) }))

const { GeneratePanel } = await import('./GeneratePanel.jsx')

beforeEach(() => {
  localStorage.setItem('cl.lang', 'en')
  mocks.post.mockReset()
  mocks.post.mockResolvedValue({ generated_block_ids: [] })
  mocks.lab = {
    id: `formula-lab-${Math.random()}`, space: 'school2lab', spec: { blocks: [] },
    analysis: { status: 'done', created_at: '2026-01-01', result: {
      formulas: [
        { id: 'f1', expression: 'm/M', latex: 'n=m/M', description: 'Amount from mass', confirmed: true },
        { id: 'f2', expression: 'C*V', latex: 'n=CV', description: 'Amount from concentration', confirmed: true },
        { id: 'f3', expression: 'm/0', latex: 'n=m/0', description: 'Needs review', confirmed: false },
        { id: 'f4', expression: '', latex: '', description: 'Missing expression', confirmed: true },
      ],
      suggested_blocks: [{ type: 'graph', feasibility: 'ready' }],
    } },
  }
})
afterEach(() => { cleanup(); localStorage.clear() })

function showPanel() {
  return render(<I18nProvider><MemoryRouter><GeneratePanel blockCount={mocks.lab.spec.blocks.length} /></MemoryRouter></I18nProvider>)
}

describe('part types offered for generation', () => {
  it('never offers a board, which the teacher makes from a photo', () => {
    showPanel()
    expect(document.getElementById('gen-graph')).not.toBeNull()
    expect(document.getElementById('gen-board')).toBeNull()
  })
})

describe('pre-checked part types', () => {
  const panel = () => <I18nProvider><MemoryRouter><GeneratePanel blockCount={0} /></MemoryRouter></I18nProvider>

  it('pre-checks the suggestions of an analysis that finishes while the panel is open', () => {
    const done = mocks.lab.analysis
    done.result.suggested_blocks.push({ type: 'steps', feasibility: 'ready' })
    mocks.lab = { ...mocks.lab, analysis: { status: 'running', created_at: '2026-01-01' } }
    const view = render(panel())
    expect(screen.queryByRole('checkbox', { name: /Step-by-step lesson/, checked: true })).toBeNull()
    mocks.lab = { ...mocks.lab, analysis: done }
    view.rerender(panel())
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Interactive graph/ }).checked).toBe(true)
  })

  it('keeps the teacher’s choice for the same analysis and resets it for a new one', () => {
    mocks.lab.analysis.result.suggested_blocks.push({ type: 'steps', feasibility: 'ready' })
    const view = render(panel())
    fireEvent.click(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }))
    mocks.lab = { ...mocks.lab, analysis: { ...mocks.lab.analysis, result: { ...mocks.lab.analysis.result } } }
    view.rerender(panel())
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(false)
    mocks.lab = { ...mocks.lab, analysis: { ...mocks.lab.analysis, created_at: '2026-02-01' } }
    view.rerender(panel())
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(true)
  })
})

describe('generate graphs for multiple reviewed formulas', () => {
  it('can generate a guided model alone and submits its allowlisted identity', async () => {
    showPanel()
    fireEvent.click(screen.getByRole('checkbox', { name: /Interactive graph/ }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Guided 2D / 3D model' }), { target: { value: 'water_cycle' } })
    fireEvent.click(screen.getByRole('button', { name: /Create 1/ }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    expect(mocks.post.mock.calls[0][1]).toEqual({ block_types: ['text'], visual3d: 'water_cycle', replace: false })
  })

  it('shows eligibility and sends only the formulas selected by the teacher', async () => {
    showPanel()
    const one = screen.getByRole('checkbox', { name: /Formula 1:/ })
    const two = screen.getByRole('checkbox', { name: /Formula 2:/ })
    expect(one.checked).toBe(true)
    expect(two.checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 3:/ }).disabled).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 4:/ }).disabled).toBe(true)
    fireEvent.click(one)
    fireEvent.click(screen.getByRole('button', { name: 'Create selected parts' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalled())
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ block_types: ['graph'], formula_ids: ['f2'], replace: false })
  })

  it('requires a formula if graph creation is selected and supports select all', async () => {
    showPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create selected parts' }))
    expect(screen.getByRole('alert').textContent).toMatch(/Choose at least one confirmed formula/)
    expect(mocks.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Select eligible formulas, including existing graphs' }))
    expect(screen.getByRole('checkbox', { name: /Formula 1:/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 2:/ }).checked).toBe(true)
  })

  it('limits each run to eight and allows other formulas after deselecting one', () => {
    mocks.lab.analysis.result.formulas = Array.from({ length: 10 }, (_, index) => ({
      id: `f${index + 1}`, expression: `m/${index + 1}`, latex: `m/${index + 1}`, confirmed: true,
    }))
    showPanel()
    expect(screen.getByRole('checkbox', { name: /Formula 8:/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 9:/ }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Formula 1:/ }))
    const ninth = screen.getByRole('checkbox', { name: /Formula 9:/ })
    expect(ninth.disabled).toBe(false)
    fireEvent.click(ninth)
    expect(ninth.checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 10:/ }).disabled).toBe(true)
  })

  it('selects the remaining formulas after a successful batch and appends without repeating other parts', async () => {
    mocks.lab.analysis.result.formulas = Array.from({ length: 12 }, (_, index) => ({
      id: `f${index + 1}`, expression: `m/${index + 1}`, latex: `m/${index + 1}`, confirmed: true,
    }))
    mocks.lab.analysis.result.suggested_blocks.push({ type: 'steps', feasibility: 'ready' })
    mocks.post.mockResolvedValueOnce({ generated_block_ids: ['b1', 'b2'], generated_formula_ids: Array.from({ length: 8 }, (_, i) => `f${i + 1}`) })
    showPanel()
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Create selected parts' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Formula 9:/ }).checked).toBe(true))
    expect(screen.getByRole('checkbox', { name: /Formula 1:/ }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: /Formula 12:/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Create selected parts' }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2))
    expect(mocks.post.mock.calls[1][1]).toMatchObject({ block_types: ['graph'], formula_ids: ['f9', 'f10', 'f11', 'f12'], replace: false })
  })

  it('retains failed formulas in the next selection when a batch only partially succeeds', async () => {
    mocks.post.mockResolvedValueOnce({ generated_block_ids: ['b1'], generated_formula_ids: ['f1'] })
    showPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Create selected parts' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Formula 2:/ }).checked).toBe(true))
    expect(screen.getByRole('checkbox', { name: /Formula 1:/ }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: /Formula 2:/ }).checked).toBe(true)
  })

  it('does not reselect an existing graph with a matching expression and source, but permits it explicitly', () => {
    const source = { source_id: 'source-1', page: null, bbox: [0.06, 0.16, 0.28, 0.23], quote: null }
    mocks.lab.analysis.result.formulas[0].source_refs = [source]
    mocks.lab.spec.blocks = [{ id: 'existing', type: 'graph', expression: 'm / M', source_refs: [{ source_id: 'other' }, source] }]
    showPanel()
    const first = screen.getByRole('checkbox', { name: /Formula 1:/ })
    const second = screen.getByRole('checkbox', { name: /Formula 2:/ })
    expect(first.checked).toBe(false)
    expect(second.checked).toBe(true)
    expect(screen.getByText('A matching graph already exists')).toBeTruthy()
    fireEvent.click(first)
    expect(first.checked).toBe(true)
  })

  it('does not infer a match from a source file alone or a different location', () => {
    mocks.lab.analysis.result.formulas[0].source_refs = [{ source_id: 'source-1' }]
    mocks.lab.spec.blocks = [{ id: 'existing', type: 'graph', expression: 'm/M', source_refs: [{ source_id: 'source-1' }] }]
    showPanel()
    expect(screen.getByRole('checkbox', { name: /Formula 1:/ }).checked).toBe(true)
    expect(screen.queryByText('A matching graph already exists')).toBeNull()
  })

  it('keeps the existing f1 graph and advances from f2–f9 to f10–f12', async () => {
    const source = { source_id: 'source-1', page: null, bbox: [0.06, 0.16, 0.28, 0.23], quote: null }
    mocks.lab.analysis.result.formulas = Array.from({ length: 12 }, (_, index) => ({
      id: `f${index + 1}`, expression: `m/${index + 1}`, latex: `m/${index + 1}`, confirmed: true, source_refs: [source],
    }))
    mocks.lab.spec.blocks = [{ id: 'existing', type: 'graph', expression: 'm/1', source_refs: [source] }, { id: 'steps', type: 'steps' }]
    mocks.lab.analysis.result.suggested_blocks.push({ type: 'steps', feasibility: 'ready' })
    mocks.post.mockResolvedValueOnce({ generated_block_ids: ['b2'], generated_formula_ids: Array.from({ length: 8 }, (_, i) => `f${i + 2}`) })
    showPanel()
    expect(screen.getByRole('checkbox', { name: /Formula 1:/ }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: /Formula 2:/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Formula 9:/ }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: /Step-by-step lesson/ }).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Create 8/ }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Formula 10:/ }).checked).toBe(true))
    expect(screen.getByRole('checkbox', { name: /Formula 12:/ }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Create 3/ }))
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2))
    expect(mocks.post.mock.calls[1][1]).toMatchObject({ block_types: ['graph'], formula_ids: ['f10', 'f11', 'f12'], replace: false })
  })
})
