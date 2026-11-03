import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import DiffusionExplorer from './DiffusionExplorer.jsx'

const calls = vi.hoisted(() => ({ last: null }))
vi.mock('../../lib/three/capability.js', () => ({ canRender3D: () => true }))
vi.mock('./VisionRelief.jsx', () => ({ default: (props) => { calls.last = props; return <div role="img" aria-label={props.label} /> } }))
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.last = null })
afterEach(cleanup)

it('feeds display-mapped values to 3D while retaining the actual signed data', async () => {
  render(<I18nProvider><DiffusionExplorer /></I18nProvider>)
  await screen.findByRole('img', { name: /3D relief of xₜ/i })
  expect(calls.last.values).toHaveLength(64)
  expect(calls.last.safeFraming).toBe(true)
  expect(calls.last.values.every((value) => value >= 0 && value <= 1)).toBe(true)
  fireEvent.change(screen.getByLabelText(/Cumulative signal/), { target: { value: '1' } })
  expect(calls.last.values.every((value) => value === 0 || value === 1)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Hide 3D value relief' }))
  expect(screen.queryByRole('img', { name: /3D relief of xₜ/i })).toBeNull()
})
