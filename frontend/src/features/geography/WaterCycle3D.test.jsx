import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import WaterCycle3D from './WaterCycle3D.jsx'

vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

describe('water cycle without WebGL', () => {
  it('explains the selected process in the 2D fallback', () => {
    render(<I18nProvider><WaterCycle3D /></I18nProvider>)
    expect(screen.getByText(/2D diagram is shown/i)).toBeTruthy()
    // the drawing that replaces the model is named for screen readers too
    expect(screen.getByRole('img', { name: /^2D diagram: water vapor rises from the sea/ })).toBeTruthy()
    const infiltration = screen.getByRole('button', { name: 'Infiltration' })
    fireEvent.click(infiltration)
    expect(infiltration.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(/replenishes groundwater/i)).toBeTruthy()
  })
  it('keeps Vietnamese controls and explanation together', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><WaterCycle3D /></I18nProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Ngưng tụ' }))
    expect(screen.getByText(/nguội đi và ngưng tụ/)).toBeTruthy()
  })
})
