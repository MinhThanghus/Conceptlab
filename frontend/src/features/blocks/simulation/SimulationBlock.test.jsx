import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import SimulationBlock from './SimulationBlock.jsx'

const pendulum = {
  id: 'b2',
  type: 'simulation',
  title: 'Pendulum',
  model: 'pendulum',
  params: [
    { symbol: 'L', name: 'String length', unit: 'm', value: 0.8, min: 0.1, max: 2.5, step: 0.01, role: 'input', provenance: 'user', confirmed: true },
    { symbol: 'g', name: 'Gravity', unit: 'm/s²', value: 9.81, min: 1.6, max: 24.8, step: 0.01, role: 'constant', provenance: 'document', confirmed: true },
    { symbol: 'theta0', name: 'Starting angle', unit: '°', value: 8, min: 2, max: 60, step: 1, role: 'input', provenance: 'assumption', confirmed: true },
  ],
  object_asset_id: 'a1',
  reference_cases: [
    { inputs: { L: 1, g: 9.81 }, output: 'period', expected: 2.006, tolerance: 0.01 },
    { inputs: { L: 0.25, g: 9.81 }, output: 'period', expected: 1.2, tolerance: 0.01 },
  ],
  active: null,
  notes: 'Measured by group 3.',
}

const cutout = { id: 'a1', kind: 'cutout', url: '/api/share/X/assets/a1/file', meta: { phrase: 'red ball' } }

function renderBlock(block, { mode = 'view', env = {}, onChange = vi.fn() } = {}) {
  const utils = render(
    <I18nProvider>
      <BlockEnvProvider value={{ assets: [cutout], assetById: (id) => (id === 'a1' ? cutout : null), language: 'en', ...env }}>
        <SimulationBlock block={block} mode={mode} onChange={onChange} />
      </BlockEnvProvider>
    </I18nProvider>,
  )
  return { ...utils, onChange }
}

const text = () => document.body.textContent.replace(/\s+/g, ' ')

// the editor is lazy-loaded (learners never download it): wait until it is on screen
async function renderEditor(block) {
  const utils = renderBlock(block, { mode: 'edit' })
  await screen.findByLabelText(/Simulation type/)
  return utils
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SimulationBlock (learner view)', () => {
  it('shows computed results, reference checks, assumptions and the honest note', () => {
    renderBlock(pendulum)
    const all = text()
    expect(all).toContain('1.794') // small-angle period for L = 0.8 m
    expect(all).toContain('Small-angle formula')
    expect(all).toMatch(/Numerical, θ₀ = 8°: 0\.12% longer than the formula/)
    expect(all).toContain('Matches')
    expect(all).toContain('No match')
    expect(all).toContain('not a measurement taken from the photo')
    expect(all).toContain('Air resistance is ignored')
    expect(all).toContain('Values the lesson does not set use the model defaults: b = 0 1/s.')
    expect(all).toContain('Measured by group 3.')
    expect(screen.getByRole('img', { name: 'Animation: Simple pendulum' })).toBeTruthy()
  })

  it('describes the scene in words that follow the values, and offers no 3D view without WebGL', () => {
    renderBlock(pendulum)
    const scene = screen.getByRole('img', { name: 'Animation: Simple pendulum' })
    const desc = document.getElementById(scene.getAttribute('aria-describedby'))
    expect(desc.textContent).toMatch(/0\.8 m pendulum released from 8°, period 1\.79 s/)
    // jsdom has no WebGL: the 2D scene is the whole stage and no view switch is offered
    expect(screen.queryByRole('radiogroup', { name: 'View' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep as A to compare' }))
    fireEvent.change(document.getElementById('s-b2-L'), { target: { value: '2' } })
    expect(document.getElementById(scene.getAttribute('aria-describedby')).textContent).toMatch(/Scenario A: .*0\.8 m.*Scenario B: .*2 m pendulum/)
  })

  it('steps the clock and compares two scenarios', () => {
    renderBlock(pendulum)
    const timeValue = () => document.querySelector('.sim-time-value').textContent
    expect(timeValue()).toBe('0 s')
    fireEvent.click(screen.getByRole('button', { name: 'Step forward' }))
    expect(timeValue()).not.toBe('0 s')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the start' }))
    expect(timeValue()).toBe('0 s')

    fireEvent.click(screen.getByRole('button', { name: 'Keep as A to compare' }))
    expect(screen.getByRole('button', { name: 'Stop comparing' })).toBeTruthy()
    const slider = document.getElementById('s-b2-L')
    fireEvent.change(slider, { target: { value: '2' } })
    expect(screen.getByText('Comparison of scenarios A and B')).toBeTruthy()
    expect(text()).toContain('Values right now (scenario B)')
    fireEvent.click(screen.getByRole('button', { name: 'Stop comparing' }))
    expect(screen.queryByText('Comparison of scenarios A and B')).toBeNull()
  })

  it('reports the live state to the AI tutor', () => {
    vi.useFakeTimers()
    const reportState = vi.fn()
    renderBlock(pendulum, { env: { reportState } })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(reportState).toHaveBeenCalledWith('b2', expect.objectContaining({ type: 'simulation', model: 'pendulum', params: { L: 0.8, g: 9.81, theta0: 8 } }))
    const state = reportState.mock.calls.at(-1)[1]
    expect(state.outputs.period).toBeCloseTo(1.7943, 3)
    expect(state.reference_checks).toEqual(['pass', 'fail'])
  })

  it('runs the teacher’s active-learning challenge and applies the change as A → B', () => {
    renderBlock({ ...pendulum, active: { enabled: true, question: 'Make L four times longer?', param: 'L', from_value: 0.25, to_value: 1, observe: 'period', options: ['×4', '×2'], correct_option: 1, explanation: 'T ∝ √L' } })
    expect(text()).toContain('Make L four times longer?')
    fireEvent.click(screen.getByLabelText('×2'))
    fireEvent.click(screen.getByRole('button', { name: /Lock in my prediction/ }))
    fireEvent.click(screen.getByRole('button', { name: /Apply the change/ }))
    expect(screen.getByText('Comparison of scenarios A and B')).toBeTruthy()
    expect(text()).toContain('1.003') // T at L = 0.25 m
    expect(text()).toContain('2.006') // T at L = 1 m
  })

  it('puts the challenge before the simulation (predict first) and manages focus', () => {
    renderBlock({ ...pendulum, active: { enabled: true, question: 'Make L four times longer?', param: 'L', from_value: 0.25, to_value: 1, observe: 'period', options: ['×4', '×2'], correct_option: 1 } })
    const challenge = document.querySelector('.ix-al')
    const stage = document.querySelector('.ix-layout')
    expect(challenge.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // opened by the lesson on load: focus stays where it was
    expect(document.activeElement).toBe(document.body)
    const toggle = screen.getByRole('button', { name: 'Prediction challenge' })
    fireEvent.click(screen.getByRole('button', { name: 'Close the challenge' }))
    expect(document.querySelector('.ix-al')).toBeNull()
    fireEvent.click(toggle)
    // opened by the learner: focus moves into the challenge
    expect(document.querySelector('.ix-al').contains(document.activeElement)).toBe(true)
  })

  it('says which value is wrong instead of drawing nonsense', () => {
    renderBlock({ ...pendulum, params: [{ ...pendulum.params[0], value: 0, min: 0 }, pendulum.params[1]] })
    expect(text()).toContain('The simulation can’t run with these values')
    expect(text()).toContain('String length (L) must be greater than 0.')
    expect(screen.getByRole('button', { name: 'Play' }).disabled).toBe(true)
  })

  it('explains an unsupported model honestly', () => {
    renderBlock({ ...pendulum, model: 'rocket' })
    expect(text()).toContain('Model not supported')
  })
})

describe('SimulationBlock (editor)', () => {
  const draft = {
    ...pendulum,
    params: [
      { symbol: 'L', name: 'String length', unit: 'cm', value: 80, min: 10, max: 250, step: 1, role: 'input', provenance: 'user', confirmed: true },
      { symbol: 'G', name: 'Typo', unit: '', value: 1, role: 'input', provenance: 'unknown', confirmed: false },
    ],
    reference_cases: [{ inputs: { L: 0.25, g: 9.81 }, output: 'T', expected: 1.003, tolerance: 0.01 }],
  }

  it('converts a parameter given in cm into the model unit', async () => {
    const { onChange } = await renderEditor(draft)
    fireEvent.click(screen.getByRole('button', { name: 'Convert values to m' }))
    const next = onChange.mock.calls.at(-1)[0]
    const L = next.params.find((p) => p.symbol === 'L')
    expect(L.unit).toBe('m')
    expect(L.value).toBeCloseTo(0.8, 12)
    expect(L.max).toBeCloseTo(2.5, 12)
  })

  it('suggests the right output name and removes unused parameters', async () => {
    const { onChange } = await renderEditor(draft)
    fireEvent.click(screen.getByRole('button', { name: 'Use “Period”' }))
    expect(onChange.mock.calls.at(-1)[0].reference_cases[0].output).toBe('period')
    fireEvent.click(screen.getByRole('button', { name: 'Remove unused parameters' }))
    expect(onChange.mock.calls.at(-1)[0].params.map((p) => p.symbol)).toEqual(['L'])
  })

  it('offers missing model parameters and the photo cut-outs', async () => {
    const { onChange } = await renderEditor(draft)
    expect(screen.getByLabelText('red ball')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Add Starting angle \(θ₀\) = 10/ }))
    expect(onChange.mock.calls.at(-1)[0].params.map((p) => p.symbol)).toContain('theta0')
  })

  it('compound interest: edits the money unit and has no object picker', async () => {
    const savings = {
      id: 's1',
      type: 'simulation',
      model: 'compound_interest',
      params: [{ symbol: 'P', name: 'Principal', unit: 'thousand dong', value: 10000, min: 1000, max: 100000, step: 500, role: 'input', provenance: 'user', confirmed: true }],
      reference_cases: [{ inputs: { P: 1000, r: 5, n: 12, t: 10 }, output: 'amount', expected: 1647.01, tolerance: 0.001 }],
    }
    const { onChange } = await renderEditor(savings)
    expect(screen.queryByText('Object from the photo')).toBeNull()
    expect(text()).toContain('Matches')
    fireEvent.change(screen.getByLabelText('Money unit'), { target: { value: 'USD' } })
    expect(onChange.mock.calls.at(-1)[0].params[0].unit).toBe('USD')
  })

  it('asks before switching the model and then loads sensible defaults', async () => {
    const { onChange } = await renderEditor(pendulum)
    fireEvent.change(screen.getByLabelText(/Simulation type/), { target: { value: 'projectile' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Change model' }))
    const next = onChange.mock.calls.at(-1)[0]
    expect(next.model).toBe('projectile')
    expect(next.params.map((p) => p.symbol)).toEqual(['v0', 'angle', 'g', 'h0'])
    expect(next.reference_cases[0].output).toBe('range')
    expect(next.active).toBeNull()
  })
})
