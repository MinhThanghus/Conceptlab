import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import AlgorithmBlock from './AlgorithmBlock.jsx'
import { configFor } from './AlgorithmEditor.jsx'

function renderBlock(block, { mode = 'view', env = {}, onChange = vi.fn() } = {}) {
  const utils = render(
    <I18nProvider>
      <BlockEnvProvider value={{ language: 'vi', ...env }}>
        <AlgorithmBlock block={block} mode={mode} onChange={onChange} />
      </BlockEnvProvider>
    </I18nProvider>,
  )
  return { ...utils, onChange }
}

const msg = () => document.querySelector('.alg-msg').textContent
const text = () => document.body.textContent.replace(/\s+/g, ' ')

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(cleanup)

describe('sorting', () => {
  const block = { id: 'b2', type: 'algorithm', title: 'Bubble', algorithm: 'bubble_sort', config: { array: [7, 3, 9, 1, 5, 2] }, explanation: 'Swaps count up.' }

  it('steps through comparisons and swaps with counters and pseudo-code', () => {
    renderBlock(block)
    expect(msg()).toBe('Start with a list of 6 elements.')
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(msg()).toBe('Compare 7 and 3: 7 > 3, so they need to swap.')
    expect(document.querySelector('.alg-line.current').textContent).toContain('if a[j] > a[j + 1]:')
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(msg()).toBe('Swapped: 7 moves right, 3 moves left.')
    fireEvent.click(screen.getByRole('button', { name: 'Last step' }))
    expect(msg()).toBe('Done! The list is sorted after 15 comparisons.')
    expect(text()).toContain('Comparisons15')
    expect(text()).toContain('Swaps10')
    expect(text()).toContain('Swaps count up.')
  })

  it('lets learners type their own list, and explains bad input', () => {
    renderBlock(block)
    const field = screen.getByLabelText('Numbers (up to 12)')
    fireEvent.change(field, { target: { value: '3, x' } })
    expect(text()).toContain('Could not read: x.')
    expect(screen.getByRole('button', { name: 'Apply' }).disabled).toBe(true)
    fireEvent.change(field, { target: { value: '3 1 2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(msg()).toBe('Start with a list of 3 elements.')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the lesson example' }))
    expect(msg()).toBe('Start with a list of 6 elements.')
  })

  it('keyboard: arrow keys step on the stage', () => {
    renderBlock({ ...block, algorithm: 'insertion_sort' })
    const stage = document.querySelector('.alg-stage')
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(msg()).toBe('Take 3 out to insert it into the sorted part on the left.')
    fireEvent.keyDown(stage, { key: 'End' })
    expect(msg()).toMatch(/^Done!/)
    fireEvent.keyDown(stage, { key: 'Home' })
    expect(msg()).toBe('Start with a list of 6 elements.')
  })

  it('localizes the insertion value label', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    renderBlock({ ...block, algorithm: 'insertion_sort' })
    fireEvent.keyDown(document.querySelector('.alg-stage'), { key: 'ArrowRight' })
    expect(screen.getByText('Giá trị đang chèn')).toBeTruthy()
  })
})

describe('binary search', () => {
  const block = { id: 'b3', type: 'algorithm', title: 'Search', algorithm: 'binary_search', config: { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 } }

  it('narrows low/mid/high until the target is found', () => {
    renderBlock(block)
    expect(msg()).toBe('Look for 23 between position 0 and position 9.')
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(msg()).toBe('The middle of [0, 9] is position 4, with value 16.')
    fireEvent.click(screen.getByRole('button', { name: 'Last step' }))
    expect(msg()).toBe('Found 23 at position 5!')
    expect(text()).toContain('needs 6 comparisons for this number; binary search needs 3.')
  })

  it('sorts an unordered list before searching and says so', () => {
    renderBlock(block)
    fireEvent.change(screen.getByLabelText('Numbers (up to 16)'), { target: { value: '9 4 15 1 7' } })
    fireEvent.change(screen.getByLabelText(/Number to find/), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(text()).toContain('Your list was not in order')
    fireEvent.click(screen.getByRole('button', { name: 'Last step' }))
    expect(msg()).toBe('8 is not in the list (2 comparisons made).') // [1, 4, 7, 9, 15]: 7 < 8, then 9 > 8
  })
})

describe('attention', () => {
  const block = {
    id: 'b4',
    type: 'algorithm',
    algorithm: 'attention',
    title: 'Attention',
    config: { tokens: ['token 1', 'token 2', 'token 3'], Q: [[1, 0], [0, 1], [1, 1]], K: [[1, 0], [0, 1], [1, 1]], V: [[1, 0], [0, 1], [0.5, 0.5]] },
  }

  it('walks from scores to the softmax heatmap and the output, with honest caption', () => {
    renderBlock(block)
    expect(text()).toContain('partial illustration of the algorithm on small data')
    fireEvent.click(screen.getByRole('button', { name: /Similarity scores/ }))
    expect(screen.getByText('Scores S = Q·Kᵀ')).toBeTruthy()
    expect(text()).toContain('S = q1 · k1 = 1×1 + 0×0 = 1')
    fireEvent.click(screen.getByRole('button', { name: /Softmax → weights/ }))
    expect(screen.getByText('Attention weights A (each row adds up to 1)')).toBeTruthy()
    expect(text()).toContain('“token 1” attends most to “token 1” and “token 3”, with equal weights (0.4).')
    expect(screen.getByRole('cell', { name: 'Query token 3, key token 3: 0.5' })).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: /Divide the scores by √dₖ/ }) || screen.getByLabelText(/Divide the scores by √dₖ/))
    expect(text()).toContain('Without dividing by √dₖ the largest weight is')
    fireEvent.click(screen.getByRole('button', { name: /Combine with V/ }))
    expect(text()).toContain('o1 = ')
  })

  it('editing an input matrix recomputes the scores', () => {
    renderBlock(block)
    const cell = screen.getByLabelText('Q, token 1, dimension 2')
    fireEvent.change(cell, { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /Similarity scores/ }))
    expect(text()).toContain('S = q1 · k1 = 1×1 + 3×0 = 1')
  })
})

describe('editor', () => {
  it('keeps the array when switching between sorts and asks before replacing data', async () => {
    const block = { id: 'b9', type: 'algorithm', algorithm: 'bubble_sort', config: { array: [4, 2, 7] }, explanation: '' }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    await screen.findByLabelText('Algorithm type') // the editor is lazy-loaded
    fireEvent.change(screen.getByLabelText('Algorithm type'), { target: { value: 'selection_sort' } })
    expect(onChange.mock.calls.at(-1)[0]).toMatchObject({ algorithm: 'selection_sort', config: { array: [4, 2, 7] } })
    onChange.mockClear()
    fireEvent.change(screen.getByLabelText('Algorithm type'), { target: { value: 'attention' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Change algorithm' }))
    const next = onChange.mock.calls.at(-1)[0]
    expect(next.algorithm).toBe('attention')
    expect(next.config.tokens).toEqual(['mèo', 'ngồi', 'trên', 'thảm']) // the lab's language (vi)
  })

  it('commits only valid number lists', async () => {
    const block = { id: 'b9', type: 'algorithm', algorithm: 'insertion_sort', config: { array: [4, 2, 7] }, explanation: '' }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    await screen.findByLabelText('Algorithm type') // the editor is lazy-loaded
    const field = screen.getByLabelText('Numbers (up to 12)')
    fireEvent.change(field, { target: { value: '4, 2, x' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: '8 6 4 2' } })
    expect(onChange.mock.calls.at(-1)[0].config.array).toEqual([8, 6, 4, 2])
  })

  it('configFor keeps sensible data per algorithm', () => {
    expect(configFor('binary_search', { array: [9, 1, 5] })).toEqual({ array: [1, 5, 9], target: 5 })
    expect(configFor('insertion_sort', {})).toEqual({ array: [5, 2, 9, 1, 6] })
    expect(configFor('attention', {}, ['a', 'b', 'c', 'd']).tokens).toEqual(['a', 'b', 'c', 'd'])
  })
})
