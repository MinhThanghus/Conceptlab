import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'

const h = vi.hoisted(() => ({ post: null }))
vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, post: (...args) => h.post(...args) }
})

const { default: SourceViewer } = await import('./SourceViewer.jsx')

const pdf = (id) => ({ id, kind: 'pdf', status: 'ready', title: `Book ${id}`, page_count: 3, urls: { page: `/api/sources/${id}/pages/{n}.png` } })

function viewer(source, sourceRef) {
  return (
    <I18nProvider>
      <SourceViewer source={source} sourceRef={sourceRef} />
    </I18nProvider>
  )
}

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('SourceViewer locate', () => {
  it('drops a locate answer that arrives after the viewer moved to another source', async () => {
    let answer
    h.post = vi.fn(() => new Promise((resolve) => (answer = resolve)))
    const view = render(viewer(pdf('A'), { source_id: 'A', page: 1, quote: 'pendulum', located: 'none' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find the quote in the PDF' }))
    expect(h.post).toHaveBeenCalledWith('/api/sources/A/locate', { quote: 'pendulum', page: 1 })

    view.rerender(viewer(pdf('B'), { source_id: 'B', page: 2, quote: 'spring', located: 'none' }))
    await act(async () => {
      answer({ located: 'exact', page: 1, rects: [[0.1, 0.1, 0.2, 0.2]] })
    })

    expect(screen.queryByText('The exact quote was found in the document.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Find the quote in the PDF' })).toBeTruthy()
  })
})
