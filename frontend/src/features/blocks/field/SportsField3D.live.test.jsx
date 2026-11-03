import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import SportsField3D from './SportsField3D.jsx'

const calls = vi.hoisted(() => ({ stage: null, update: vi.fn() }))
vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../../lib/three/models/sportsField.js', () => ({ buildSportsVenue: () => ({}), disposeSports: vi.fn(), updateSportsFrame: calls.update, sportsCoordinates: (_sport, x, y) => ({ x, z: y }) }))
vi.mock('../../../lib/three/stage.js', () => ({ createStage(host) {
  const canvas = document.createElement('canvas'); host.appendChild(canvas)
  calls.stage = { canvas, world: { add() {}, rotation: { y: 0 } }, invalidate: vi.fn(), setFit: vi.fn(), setView: vi.fn(), setZoom: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
  return calls.stage
} }))
afterEach(() => { cleanup(); window.localStorage.clear(); calls.update.mockClear() })

describe('sports 3D playback', () => {
  it('uses the displayed frame and ghost, updates them in place, and handles lost WebGL', async () => {
    window.localStorage.setItem('cl.lang', 'en')
    const frame = { players: [{ id: 'p1', team: 'A', x: .2, y: .4 }] }, ghost = { players: [] }
    const view = (shown) => <I18nProvider><SportsField3D sport="football" frame={shown} ghost={ghost} /></I18nProvider>
    const { rerender } = render(view(frame))
    await screen.findByRole('button', { name: 'Rotate field' })
    expect(calls.update).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'football', frame, ghost)
    const next = { players: [{ ...frame.players[0], x: .7 }] }
    rerender(view(next))
    await waitFor(() => expect(calls.update).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'football', next, ghost))
    fireEvent.click(screen.getByRole('button', { name: 'Focus on first player' }))
    expect(screen.getByRole('button', { name: 'Show whole court' }).getAttribute('aria-pressed')).toBe('true')
    expect(calls.stage.setZoom).toHaveBeenLastCalledWith(2.5)
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(calls.stage.setZoom).toHaveBeenLastCalledWith(2.5)
    fireEvent.click(screen.getByRole('button', { name: 'Show whole court' }))
    expect(calls.stage.setZoom).toHaveBeenLastCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate field' }))
    expect(calls.stage.world.rotation.y).toBeGreaterThan(0)
    fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
    expect(screen.getByText(/2D board above remains available/)).toBeTruthy()
    expect(calls.stage.canvas.parentElement.style.visibility).toBe('hidden')
  })
})
