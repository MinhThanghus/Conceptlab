import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'

const h = vi.hoisted(() => ({ stream: null }))
vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, stream: (...args) => h.stream(...args) }
})
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ ai: { configured: true } }) }))

const { default: LiteAsk } = await import('./LiteAsk.jsx')

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    fn(0)
    return 0
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('LiteAsk', () => {
  it('announces only the finished answer and keeps the Send button focusable', async () => {
    h.stream = async function* () {
      yield { event: 'delta', data: 'The period ' }
      yield { event: 'delta', data: 'is 2 s.' }
      yield { event: 'done', data: { content: 'The period is 2 s.', citations: [] } }
    }
    const { container } = render(
      <I18nProvider>
        <LiteAsk code="ABC234" lab={{ allow_tutor: true, spec: {} }} />
      </I18nProvider>,
    )
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'What is the period?' } })
    const send = screen.getByRole('button', { name: 'Send question' })
    send.focus()
    await act(async () => {
      fireEvent.click(send)
    })

    expect(container.querySelector('.lite-chat-log').hasAttribute('aria-live')).toBe(false)
    const live = container.querySelector('[aria-live="polite"]')
    expect(live.textContent).toBe('The AI answered: The period is 2 s.')
    const after = screen.getByRole('button', { name: 'Send question' })
    expect(after.disabled).toBe(false)
    expect(after.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(after)
  })
})
