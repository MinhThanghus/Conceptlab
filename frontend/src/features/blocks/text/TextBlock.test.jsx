import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import TextBlock from './TextBlock.jsx'

const ref1 = { source_id: 's1', page: 1, bbox: [0.1, 0.1, 0.6, 0.2], quote: 'An attention function maps a query', located: 'exact' }
const block = { id: 't1', type: 'text', title: 'Main idea', body: 'The output is a weighted sum of the values [1]. See also [3].', source_refs: [ref1] }

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(cleanup)

describe('TextBlock (learner view)', () => {
  it('turns [n] into a button that opens the n-th source of the part; unknown markers stay text', () => {
    const openSource = vi.fn()
    render(
      <I18nProvider>
        <BlockEnvProvider value={{ language: 'en', openSource, sourceById: (id) => (id === 's1' ? { id: 's1', title: 'Attention excerpt' } : null) }}>
          <TextBlock block={block} mode="view" onChange={vi.fn()} />
        </BlockEnvProvider>
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '[1] Attention excerpt' }))
    expect(openSource).toHaveBeenCalledWith(ref1)
    expect(screen.queryByRole('button', { name: /^\[3\]/ })).toBeNull()
    expect(document.body.textContent).toContain('See also [3].')
  })
})
