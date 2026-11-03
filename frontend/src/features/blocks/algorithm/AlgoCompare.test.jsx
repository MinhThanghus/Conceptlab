import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import AlgorithmBlock from './AlgorithmBlock.jsx'

function renderBlock(block, env = {}) {
  return render(
    <I18nProvider>
      <BlockEnvProvider value={{ language: 'en', ...env }}>
        <AlgorithmBlock block={block} mode="view" onChange={vi.fn()} />
      </BlockEnvProvider>
    </I18nProvider>,
  )
}

const panel = () => document.querySelector('.alg-cmp')
const inPanel = () => within(panel())
const verdict = () => panel().querySelector('.alg-msg').textContent
const lanes = () => [...panel().querySelectorAll('.alg-cmp-lane')].map((el) => el.textContent.replace(/\s+/g, ' '))

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(cleanup)

describe('compare two inputs (spec §10.3)', () => {
  const bubble = { id: 'b1', type: 'algorithm', algorithm: 'bubble_sort', config: { array: [7, 3, 9, 1, 5, 2] } }

  it('runs a sorted and a reversed list side by side with counters and a verdict', () => {
    renderBlock(bubble)
    expect(panel().querySelector('.alg-cmp-stage')).toBeNull()
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    expect(document.activeElement).toBe(panel().querySelector('.alg-cmp-stage'))
    expect(inPanel().getByRole('button', { name: 'Already sorted', pressed: true })).toBeTruthy()
    expect(inPanel().getByRole('button', { name: 'Reversed', pressed: true })).toBeTruthy()
    expect(verdict()).toContain('Press Play')

    fireEvent.click(inPanel().getByRole('button', { name: 'Last step' }))
    expect(verdict()).toBe('Both inputs need the same number of comparisons: 15. Input B needs more swaps than input A: 15 vs 0.')
    const [a, b] = lanes()
    expect(a).toContain('Done after 22 steps')
    expect(a).toContain('Comparisons15')
    expect(a).toContain('Swaps0')
    expect(b).toContain('Done after 37 steps')
    expect(b).toContain('Swaps15')
  })

  it('one shared step index: the shorter run waits on its last frame', () => {
    renderBlock({ ...bubble, config: { array: [2, 1] } })
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    // A = [1, 2] (no swap), B = [2, 1] (one swap frame more)
    fireEvent.keyDown(panel().querySelector('.alg-cmp-stage'), { key: 'End' })
    expect(lanes()[0]).toContain('Done after 4 steps')
    fireEvent.keyDown(panel().querySelector('.alg-cmp-stage'), { key: 'ArrowLeft' })
    expect(lanes()[0]).toContain('Done after 4 steps')
    expect(lanes()[1]).toContain('Step 4/5')
    expect(verdict()).toBe('Input A finished after 4 steps; input B is still running.')
  })

  it('learners can type their own input for a lane and use quick choices', () => {
    renderBlock({ ...bubble, algorithm: 'insertion_sort' })
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    const fieldA = within(panel().querySelectorAll('.alg-cmp-input')[0]).getByLabelText('Numbers (up to 12)')
    fireEvent.change(fieldA, { target: { value: '3, 2, 1' } })
    fireEvent.click(within(panel().querySelectorAll('.alg-cmp-input')[0]).getByRole('button', { name: 'Apply' }))
    expect(lanes()[0]).toContain('3, 2, 1')
    fireEvent.click(inPanel().getByRole('button', { name: 'Last step' }))
    expect(verdict()).toBe('Input B needs more comparisons than input A: 15 vs 3. Input B needs more shifts than input A: 15 vs 3.')
    fireEvent.click(within(panel().querySelectorAll('.alg-cmp-input')[0]).getByRole('button', { name: 'Reversed' }))
    fireEvent.click(inPanel().getByRole('button', { name: 'Last step' }))
    expect(verdict()).toBe('Both inputs need the same number of comparisons: 15. Both inputs need the same number of shifts: 15.')
  })

  it('binary search: middle value vs a value that is not in the list', () => {
    renderBlock({ id: 'b3', type: 'algorithm', algorithm: 'binary_search', config: { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 } })
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    fireEvent.click(inPanel().getByRole('button', { name: 'Last step' }))
    const [a, b] = lanes()
    expect(a).toContain('Found at index 4')
    expect(a).toContain('Comparisons1')
    expect(b).toContain('Not in the list')
    expect(b).toContain('Comparisons4')
    expect(b).toContain('Linear search needs10')
    expect(verdict()).toBe('Input B needs more comparisons than input A: 4 vs 1.')
  })

  it('screen readers hear which cells are compared or swapped, and which cell is the middle probe', () => {
    renderBlock({ ...bubble, config: { array: [2, 1] } })
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    const stage = panel().querySelector('.alg-cmp-stage')
    const said = () => [...panel().querySelectorAll('.alg-cmp-list')].map((el) => el.textContent)
    const seen = new Set()
    for (let i = 0; i < 6; i += 1) {
      said().forEach((text) => seen.add(text))
      fireEvent.keyDown(stage, { key: 'ArrowRight' })
    }
    expect([...seen]).toContain('2 (being compared), 1 (being compared)')
    expect([...seen]).toContain('1 (just swapped), 2 (just swapped)')
    cleanup()

    renderBlock({ id: 'b3', type: 'algorithm', algorithm: 'binary_search', config: { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 } })
    fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
    fireEvent.keyDown(panel().querySelector('.alg-cmp-stage'), { key: 'ArrowRight' })
    const probe = panel().querySelectorAll('.alg-cmp-lane')[1].querySelector('.is-mid')
    expect(probe.textContent).toContain('(middle element)')
  })

  it('shares the comparison with the AI tutor and closes back to the start button', async () => {
    vi.useFakeTimers()
    const reportState = vi.fn()
    try {
      renderBlock(bubble, { reportState })
      fireEvent.click(inPanel().getByRole('button', { name: 'Start comparing' }))
      fireEvent.click(inPanel().getByRole('button', { name: 'Last step' }))
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      const last = reportState.mock.calls.at(-1)
      expect(last[0]).toBe('b1')
      expect(last[1].compare.A).toMatchObject({ input: [1, 2, 3, 5, 7, 9], comparisons: 15, swaps: 0, done: true })
      expect(last[1].compare.B).toMatchObject({ input: [9, 7, 5, 3, 2, 1], swaps: 15, done: true })
      fireEvent.click(inPanel().getByRole('button', { name: 'Close comparison' }))
      expect(document.activeElement.textContent).toBe('Start comparing')
      await act(async () => {
        vi.advanceTimersByTime(400)
      })
      expect(reportState.mock.calls.at(-1)[1].compare).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
