import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import { BlockEnvProvider } from '../BlockEnv.jsx'
const api = vi.hoisted(() => ({ post: null }))
vi.mock('../../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, post: (...args) => api.post(...args) }
})

import WidgetBlock from './WidgetBlock.jsx'
import { hashString } from './widgetUtils.js'

const checks = [
  { code: 'no_network', status: 'pass', message: 'No network access' },
  { code: 'no_storage', status: 'pass', message: 'No storage access' },
]

function renderBlock(block, { mode = 'view', env = {}, onChange = vi.fn() } = {}) {
  const utils = render(
    <I18nProvider>
      <BlockEnvProvider value={{ labId: 'lab1', aiAvailable: true, aiPath: (n) => `/api/labs/lab1/ai/${n}`, ...env }}>
        <WidgetBlock block={block} mode={mode} onChange={onChange} />
      </BlockEnvProvider>
    </I18nProvider>,
  )
  return { ...utils, onChange }
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('WidgetBlock (learner view)', () => {
  it('shows a neutral notice and no iframe until the widget is approved and validated', () => {
    renderBlock({ id: 'w1', type: 'widget', title: 'Softmax', html: '<p>x</p>', status: 'validated', approved: false, validation: {} })
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText('Interface not ready yet')).toBeTruthy()
  })

  it('loads the share render route in an allow-scripts-only sandbox', () => {
    const html = '<p>softmax</p>'
    renderBlock(
      { id: 'w1', type: 'widget', title: 'Softmax', html, status: 'validated', approved: true, validation: { checks } },
      { env: { shareCode: 'ABC234', labId: null } },
    )
    const frame = document.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.getAttribute('loading')).toBe('lazy')
    expect(frame.getAttribute('title')).toContain('Softmax')
    expect(frame.getAttribute('src')).toBe(`/api/share/ABC234/widgets/w1/render?v=${hashString(html)}`)
    // the generated HTML never enters the app DOM
    expect(document.body.innerHTML).not.toContain('<p>softmax</p>')
  })
})

describe('WidgetBlock (editor)', () => {
  it('cannot be approved before it is validated', () => {
    renderBlock(
      { id: 'w1', type: 'widget', title: 'Softmax', prompt: 'slider', html: '<p>x</p>', status: 'draft', approved: false, validation: { checks } },
      { mode: 'edit' },
    )
    const approve = screen.getByRole('switch')
    expect(approve.disabled).toBe(true)
    expect(screen.getByText('Checks not finished')).toBeTruthy()
  })

  it('marks the widget validated when static checks pass and the sandbox reports ready', () => {
    vi.useFakeTimers()
    const block = { id: 'w1', type: 'widget', title: 'Softmax', prompt: 'slider', html: '<p>x</p>', status: 'draft', approved: false, validation: { checks } }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    const frame = document.querySelector('iframe')
    expect(frame).not.toBeNull()
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('src')).toBe(`/api/labs/lab1/widgets/w1/render?v=${hashString('<p>x</p>')}`)

    // a message from another window is ignored
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'cl-widget', status: 'ready' }, source: window }))
      vi.advanceTimersByTime(2000)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'cl-widget', status: 'ready', height: 420 }, source: frame.contentWindow }))
    })
    expect(frame.style.blockSize).toBe('420px')
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.status).toBe('validated')
    expect(next.validation.runtime.ok).toBe(true)
    expect(next.validation.checks).toEqual(checks)
  })

  it('fails the widget and offers an AI repair when the sandbox reports an error', () => {
    vi.useFakeTimers()
    const block = { id: 'w1', type: 'widget', title: 'Softmax', prompt: 'slider', html: '<p>y</p>', status: 'draft', approved: false, validation: { checks } }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    const frame = document.querySelector('iframe')
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'cl-widget', status: 'error', errors: ['ReferenceError: x is not defined'] }, source: frame.contentWindow }),
      )
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.status).toBe('failed')
    expect(next.approved).toBe(false)
    expect(next.validation.runtime).toMatchObject({ ok: false, errors: ['ReferenceError: x is not defined'] })
    expect(screen.getByText('ReferenceError: x is not defined')).toBeTruthy()
  })

  it('asks for a longer description before calling the AI', () => {
    renderBlock({ id: 'w1', type: 'widget', title: '', prompt: 'abc', html: '', status: 'draft', approved: false, validation: {} }, { mode: 'edit' })
    fireEvent.click(screen.getByRole('button', { name: 'Build interface with AI' }))
    expect(screen.getByText('Please describe the interface in at least a few words.')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
  })
})

describe('WidgetBlock (AI generation)', () => {
  it('shows elapsed time, can be canceled and keeps the current code', async () => {
    api.post = vi.fn((url, body, opts) => new Promise((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    const block = { id: 'w1', type: 'widget', title: 'Softmax', prompt: 'A temperature slider for softmax', html: '', status: 'draft', approved: false, validation: {} }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    fireEvent.click(screen.getByRole('button', { name: 'Build interface with AI' }))
    expect(await screen.findByText(/so far/)).toBeTruthy()
    expect(api.post).toHaveBeenCalledWith('/api/labs/lab1/ai/widget', { description: 'A temperature slider for softmax', block_id: 'w1' }, expect.objectContaining({ signal: expect.anything() }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText(/^Canceled\./)).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the current widget when the AI returns no code', async () => {
    api.post = vi.fn(async () => ({ html: '   ', checks: [] }))
    const block = { id: 'w1', type: 'widget', title: 'Softmax', prompt: 'A temperature slider for softmax', html: '<p>x</p>', status: 'validated', approved: true, validation: { checks } }
    const { onChange } = renderBlock(block, { mode: 'edit' })
    fireEvent.click(screen.getByRole('button', { name: 'Rebuild with AI' }))
    expect(await screen.findByText(/^The AI returned no interface code\./)).toBeTruthy()
    expect(onChange.mock.calls.some(([next]) => next.html !== '<p>x</p>' || next.approved === false)).toBe(false)
  })
})
