import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { Heatmap } from './Heatmap.jsx'

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

const matrix = [[0.25, 0.75], [1, 0]]
const mount = (props = {}) => render(<I18nProvider><Heatmap matrix={matrix} rowLabels={['a', 'b']} colLabels={['x', 'y']} {...props} /></I18nProvider>)

describe('Heatmap', () => {
  it('reads each cell from its contents: row and column words, then the printed value', () => {
    mount()
    const cell = screen.getByRole('cell', { name: 'a → y: 0.75' })
    expect(cell.hasAttribute('aria-label')).toBe(false)
    // the visible number stays in the accessibility tree
    expect(cell.querySelector('.hm-val').hasAttribute('aria-hidden')).toBe(false)
  })

  it('a caller sentence replaces the row and column words and the printed value', () => {
    mount({ cellLabel: (r, c, v) => `Query ${r + 1}, key ${c + 1}: ${v}` })
    const cell = screen.getByRole('cell', { name: 'Query 2, key 1: 1' })
    expect(cell.hasAttribute('aria-label')).toBe(false)
    // the sentence already holds the value, so the printed number is not read twice
    expect(cell.querySelector('.hm-val').getAttribute('aria-hidden')).toBe('true')
  })
})
