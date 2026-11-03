import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import SemiconductorExplorer from './SemiconductorExplorer.jsx'

vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => false }))
beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(cleanup)

it('uses an accessible 2D transistor diagram and explains the gate action', () => {
  render(<I18nProvider><SemiconductorExplorer /></I18nProvider>)
  expect(screen.getByText(/WebGL is unavailable/i)).toBeTruthy()
  expect(screen.getByRole('img', { name: /MOSFET cross-section/i })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Gate high' }))
  expect(screen.getByText(/also requires an appropriate voltage/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Gate low' }))
  expect(screen.getByText(/subthreshold behavior are omitted/i)).toBeTruthy()
})

it('requires a prediction before revealing the inverter state and resets on input change', () => {
  render(<I18nProvider><SemiconductorExplorer initialMode="cmos" /></I18nProvider>)
  const check = screen.getByRole('button', { name: 'Check prediction' })
  expect(check.disabled).toBe(true)
  const predictions = screen.getByRole('group', { name: 'Predict the output' })
  fireEvent.click(within(predictions).getByRole('button', { name: '1' }))
  fireEvent.click(check)
  expect(screen.getByText(/Correct\. Input 0: pMOS is on/i)).toBeTruthy()
  const inputs = screen.getByRole('group', { name: 'Input' })
  fireEvent.click(within(inputs).getByRole('button', { name: '1' }))
  expect(check.disabled).toBe(true)
  fireEvent.click(within(predictions).getByRole('button', { name: '1' }))
  fireEvent.click(check)
  expect(screen.getByText(/Not quite\. Input 1: pMOS is off/i)).toBeTruthy()
  expect(screen.getByText('Ideal truth table')).toBeTruthy()
  expect(screen.getByRole('table')).toBeTruthy()
})

it('lets learners separate the stack and keeps a Vietnamese explanation', () => {
  window.localStorage.setItem('cl.lang', 'vi')
  render(<I18nProvider><SemiconductorExplorer initialMode="stack" /></I18nProvider>)
  const slider = screen.getByLabelText(/Khoảng tách để quan sát/)
  fireEvent.change(slider, { target: { value: '100' } })
  expect(slider.value).toBe('100')
  expect(screen.getByText(/không phải quy trình chế tạo đầy đủ/i)).toBeTruthy()
  expect(screen.getByText(/không tái hiện hình học/i)).toBeTruthy()
})
it('compares gate-around geometries without claiming research fidelity', () => {
  render(<I18nProvider><SemiconductorExplorer initialGeometry="nanowire" /></I18nProvider>)
  const geometry = screen.getByRole('group', { name: 'Device geometry' })
  expect(within(geometry).getByRole('button', { name: 'Vertical nanowire' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(within(geometry).getByRole('button', { name: 'Nanosheets' }))
  expect(within(geometry).getByRole('button', { name: 'Nanosheets' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText(/do not compare performance or reproduce/i)).toBeTruthy()
})

it('retains its resistance through READ and changes state with SET and RESET', () => {
  render(<I18nProvider><SemiconductorExplorer initialMode="memristor" /></I18nProvider>)
  const memory = screen.getByRole('group', { name: 'Memory operations' })
  expect(screen.getByText('High resistance.')).toBeTruthy()
  fireEvent.click(within(memory).getByRole('button', { name: 'SET' }))
  expect(screen.getByText('Low resistance.')).toBeTruthy()
  fireEvent.click(within(memory).getByRole('button', { name: 'READ' }))
  expect(screen.getByText('Low resistance.')).toBeTruthy()
  fireEvent.click(within(memory).getByRole('button', { name: 'RESET' }))
  fireEvent.click(within(memory).getByRole('button', { name: 'READ' }))
  expect(screen.getByText('High resistance.')).toBeTruthy()
  expect(screen.getByText(/does not depict a filament/i)).toBeTruthy()
})
