import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { I18nProvider } from '../../i18n/index.jsx'
import { Dialog } from './Dialog.jsx'

const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve())))

/** A page that owns the dialog state and re-renders while the dialog is open (inline onClose). */
function Page() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <p>Typed: {text}</p>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit note">
        <label>
          First
          <input />
        </label>
        <label>
          Second
          <input value={text} onChange={(e) => setText(e.target.value)} />
        </label>
      </Dialog>
    </>
  )
}

function renderPage() {
  return render(
    <I18nProvider>
      <Page />
    </I18nProvider>,
  )
}

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('Dialog focus management', () => {
  it('moves focus inside on open and back to the opener on Escape', async () => {
    renderPage()
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    await nextFrame()
    const dialog = screen.getByRole('dialog', { name: 'Edit note' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes only the innermost dialog on Escape', async () => {
    function Nested() {
      const [outer, setOuter] = useState(true)
      const [inner, setInner] = useState(false)
      return (
        <Dialog open={outer} onClose={() => setOuter(false)} title="Outer">
          <button type="button" onClick={() => setInner(true)}>
            Ask
          </button>
          <Dialog open={inner} onClose={() => setInner(false)} title="Inner">
            <p>Sure?</p>
          </Dialog>
        </Dialog>
      )
    }
    render(
      <I18nProvider>
        <Nested />
      </I18nProvider>,
    )
    await nextFrame()
    const ask = screen.getByRole('button', { name: 'Ask' })
    ask.focus()
    fireEvent.click(ask)
    await nextFrame()
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Inner' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeTruthy()
    expect(document.activeElement).toBe(ask)
  })

  it('keeps focus in the field being edited when the page behind re-renders', async () => {
    renderPage()
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    await nextFrame()
    const second = screen.getByLabelText('Second')
    second.focus()
    fireEvent.change(second, { target: { value: 'abc' } })
    await nextFrame()
    expect(screen.getByText('Typed: abc')).toBeTruthy()
    expect(document.activeElement).toBe(second)
  })
})
