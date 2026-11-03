import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ResearchVisual3D from './ResearchVisual3D.jsx'
import { I18nProvider } from '../../../i18n/index.jsx'

vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => false }))
afterEach(cleanup)

describe('research illustration fallback', () => {
  it('keeps the enzyme example usable without WebGL', () => {
    window.localStorage.setItem('cl.lang', 'en')
    render(<I18nProvider><ResearchVisual3D kind="enzyme_binding" /></I18nProvider>)
    expect(screen.getByRole('img', { name: /enzyme and 5 substrate symbols/i })).toBeTruthy()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } })
    expect(screen.getByRole('img', { name: /enzyme and 2 substrate symbols/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Binding/ }))
    expect(screen.getByText(/shown bound to the enzyme/)).toBeTruthy()
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } })
    expect(screen.getByText(/Add at least one substrate/)).toBeTruthy()
    expect(screen.getByText(/2D view shown/)).toBeTruthy()
  })
  it('explains the invented grid and lets the reader change display scale', () => {
    window.localStorage.setItem('cl.lang', 'en')
    const { container } = render(<I18nProvider><ResearchVisual3D kind="population_grid" /></I18nProvider>)
    const before = Number(container.querySelector('[data-cell="12"]').getAttribute('height'))
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    expect(screen.getByText('4')).toBeTruthy()
    expect(Number(container.querySelector('[data-cell="12"]').getAttribute('height'))).toBeGreaterThan(before)
    expect(screen.getByText(/does not change the values/)).toBeTruthy()
  })
  it('uses Vietnamese labels in the Vietnamese interface', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><ResearchVisual3D kind="enzyme_binding" /></I18nProvider>)
    expect(screen.getByLabelText(/Số cơ chất minh họa/)).toBeTruthy()
    expect(screen.getByText(/không phải cấu trúc phân tử/)).toBeTruthy()
  })
})
