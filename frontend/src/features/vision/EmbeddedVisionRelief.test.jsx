import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import EmbeddedVisionRelief from './EmbeddedVisionRelief.jsx'

vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('embedded image example', () => {
  it('identifies its sample and keeps the filter and pixel selection usable without 3D', () => {
    render(<I18nProvider><EmbeddedVisionRelief /></I18nProvider>)
    expect(screen.getByText(/not an image or data extracted/)).toBeTruthy()
    expect(screen.getByText(/3D model is unavailable/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Row 2, column 4: 1' }))
    expect(screen.getByText(/Row 2, column 4.*Value: 1/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'After the mean filter' }))
    expect(screen.getByText(/Filtered value:/)).toBeTruthy()
  })
})
