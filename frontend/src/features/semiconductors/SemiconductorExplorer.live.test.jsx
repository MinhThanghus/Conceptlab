import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import SemiconductorExplorer from './SemiconductorExplorer.jsx'

const calls = vi.hoisted(() => ({ stage: null, update: vi.fn(), disposed: vi.fn() }))
vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../lib/three/stage.js', async () => {
  const THREE = await import('three')
  return { createStage(host) {
    const canvas = document.createElement('canvas'); host.appendChild(canvas)
    calls.stage = { canvas, world: new THREE.Group(), invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  } }
})
vi.mock('./semiconductorModels.js', async () => {
  const THREE = await import('three')
  return { createSemiconductorModel: () => ({ group: new THREE.Group(), update: calls.update, dispose: calls.disposed }) }
})
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.stage = null; calls.update.mockClear(); calls.disposed.mockClear() })
afterEach(cleanup)

it('updates the 3D model, rotates and switches to fallback on WebGL loss', async () => {
  const { unmount } = render(<I18nProvider><SemiconductorExplorer /></I18nProvider>)
  await screen.findByRole('button', { name: 'Rotate right' })
  fireEvent.click(screen.getByRole('button', { name: 'Gate high' }))
  expect(calls.update).toHaveBeenLastCalledWith(expect.objectContaining({ gateHigh: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
  expect(calls.stage.world.children[0].rotation.y).toBeGreaterThan(0)
  fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
  expect(screen.getByText(/WebGL is unavailable/i)).toBeTruthy()
  const stage = calls.stage
  unmount()
  expect(stage.dispose).toHaveBeenCalledOnce()
  expect(calls.disposed).toHaveBeenCalledOnce()
})
