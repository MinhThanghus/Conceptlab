import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import { PageErrorBoundary, isChunkLoadError } from './Layouts.jsx'

function Boom({ error }) {
  throw error
}

function renderBoundary(resetKey, child) {
  return (
    <I18nProvider>
      <MemoryRouter>
        <PageErrorBoundary resetKey={resetKey}>{child}</PageErrorBoundary>
      </MemoryRouter>
    </I18nProvider>
  )
}

beforeEach(() => {
  window.localStorage.setItem('cl.lang', 'en')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('isChunkLoadError', () => {
  it('recognises failed lazy-chunk downloads across browsers', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: http://x/assets/GuidePage.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new ReferenceError('x is not defined'))).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('PageErrorBoundary', () => {
  it('shows a friendly page instead of crashing, with a level-1 heading and next actions', () => {
    render(renderBoundary('/guide', <Boom error={new ReferenceError('oops')} />))
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong on this page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/')
  })

  it('explains a failed download separately and clears the error after navigation', () => {
    const { rerender } = render(renderBoundary('/guide', <Boom error={new TypeError('Failed to fetch dynamically imported module')} />))
    expect(screen.getByRole('heading', { level: 1, name: 'This page could not be loaded' })).toBeTruthy()
    rerender(renderBoundary('/gallery', <p>Gallery content</p>))
    expect(screen.getByText('Gallery content')).toBeTruthy()
  })
})
