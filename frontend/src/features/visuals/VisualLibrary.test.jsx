import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import VisualLibrary from './VisualLibrary.jsx'
import { VISUAL_CATALOG, visualName } from './catalog.js'

vi.mock('./GuidedVisual.jsx', () => ({ default: ({ kind }) => <div data-testid="guided">{kind}</div> }))

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  vi.useFakeTimers()
  // jsdom has no layout, so no scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete Element.prototype.scrollIntoView
})

describe('VisualLibrary', () => {
  it('opening a model from the catalog moves focus to its heading, not only the scroll', async () => {
    render(<MemoryRouter initialEntries={['/visuals']}><I18nProvider><VisualLibrary /></I18nProvider></MemoryRouter>)
    const model = VISUAL_CATALOG[0]
    const card = screen.getByRole('button', { name: (name) => name.startsWith(visualName(model, 'en')) })
    card.focus()
    fireEvent.click(card)
    await act(async () => {
      vi.advanceTimersByTime(50)
    })
    const heading = screen.getByRole('heading', { level: 2, name: visualName(model, 'en') })
    expect(document.activeElement).toBe(heading)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  })
})
