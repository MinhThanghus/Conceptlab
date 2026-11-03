import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import EngineeringExplorer from './EngineeringExplorer.jsx'

const calls = vi.hoisted(() => ({ stage: null }))
vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../lib/three/stage.js', async () => {
  const THREE = await import('three')
  return { createStage(host) {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    calls.stage = { canvas, world: new THREE.Group(), invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  } }
})
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.stage = null })
afterEach(cleanup)

it('changes tilt, rotates and falls back on WebGL context loss', async () => {
  const { unmount } = render(<I18nProvider><EngineeringExplorer kind="quadrotor" /></I18nProvider>)
  await screen.findByRole('button', { name: 'Rotate right' })
  fireEvent.change(screen.getByLabelText(/Tilt angle/), { target: { value: '30' } })
  expect(calls.stage.world.getObjectByName('quadrotor-body').rotation.z).toBeCloseTo(-Math.PI / 6)
  fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
  expect(calls.stage.world.children[0].rotation.y).toBeGreaterThan(0)
  fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
  expect(screen.getByText(/2D diagram is shown/i)).toBeTruthy()
  const stage = calls.stage
  unmount()
  expect(stage.dispose).toHaveBeenCalledOnce()
})
