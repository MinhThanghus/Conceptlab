import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'

const h = vi.hoisted(() => ({ get: null, stream: null }))
vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, get: (...args) => h.get(...args), stream: (...args) => h.stream(...args) }
})

const { default: TutorPanel } = await import('./TutorPanel.jsx')

function panel(endpoint) {
  return (
    <I18nProvider>
      <TutorPanel endpoint={endpoint} available keywords={[]} />
    </I18nProvider>
  )
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  h.get = vi.fn(async () => [])
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('TutorPanel', () => {
  it('starts empty when the lesson changes instead of keeping the last lesson’s question', async () => {
    // the answer fails, so the question stays as a local message
    h.stream = async function* () {
      yield { event: 'error', data: { code: 'ai_upstream_error' } }
    }
    const view = render(panel('/api/share/AAA234/chat'))
    await act(async () => {})
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Question about lesson A' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('textbox').closest('form'))
    })
    expect(screen.getByText('Question about lesson A')).toBeTruthy()

    view.rerender(panel('/api/share/BBB234/chat'))
    await act(async () => {})
    expect(h.get).toHaveBeenLastCalledWith('/api/share/BBB234/chat', expect.anything())
    expect(screen.queryByText('Question about lesson A')).toBeNull()
  })
})
