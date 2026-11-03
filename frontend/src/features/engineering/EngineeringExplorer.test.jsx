import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import EngineeringExplorer from './EngineeringExplorer.jsx'

vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

it('updates the real components of an illustrative force in 2D fallback', () => {
  render(<I18nProvider><EngineeringExplorer kind="quadrotor" /></I18nProvider>)
  expect(screen.getByText(/2D diagram is shown/i)).toBeTruthy()
  expect(screen.getByRole('img', { name: /^2D diagram of the quadrotor: a gold arrow for total thrust/ })).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/Tilt angle/), { target: { value: '0' } })
  expect(screen.getByText('Vertical component').nextElementSibling.textContent).toBe('8 N')
  expect(screen.getByText('Horizontal component').nextElementSibling.textContent).toBe('0 N')
  expect(screen.getByText(/not a flight simulation/i)).toBeTruthy()
})

it('shows an illustrative crack without promising a quantitative prediction', () => {
  render(<I18nProvider><EngineeringExplorer kind="solar_cell" /></I18nProvider>)
  const checkbox = screen.getByRole('checkbox', { name: 'Show illustrative crack' })
  fireEvent.click(checkbox)
  expect(checkbox.checked).toBe(true)
  expect(screen.getByText(/does not predict power or temperature/i)).toBeTruthy()
})

it('keeps the solar controls and limitations in Vietnamese', () => {
  window.localStorage.setItem('cl.lang', 'vi')
  render(<I18nProvider><EngineeringExplorer kind="solar_cell" /></I18nProvider>)
  expect(screen.getByLabelText(/Tách lớp/)).toBeTruthy()
  expect(screen.getByRole('img', { name: /^Sơ đồ 2D tấm pin mặt trời/ })).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Hiện vết nứt minh họa' })).toBeTruthy()
  expect(screen.getByText(/không dự đoán công suất hay nhiệt độ/i)).toBeTruthy()
})
