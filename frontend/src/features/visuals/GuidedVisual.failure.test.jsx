import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import GuidedVisual from './GuidedVisual.jsx'

vi.mock('../geography/WaterCycle3D.jsx', () => ({ default: () => { throw new Error('Model load failed') } }))
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

it('contains a failed scene while preserving lesson text and a recovery action', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  localStorage.setItem('cl.lang', 'en')
  render(<I18nProvider><p>My original lesson and source explanation.</p><GuidedVisual kind="water_cycle" /></I18nProvider>)
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByText('My original lesson and source explanation.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeTruthy()
})
