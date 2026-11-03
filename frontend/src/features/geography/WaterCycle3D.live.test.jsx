import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import WaterCycle3D from './WaterCycle3D.jsx'

const calls = vi.hoisted(() => ({ stage: null, disposeModel: vi.fn() }))
vi.mock('../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../lib/three/stage.js', async () => {
  const THREE = await import('three')
  return { createStage(host) {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    calls.stage = { canvas, world: new THREE.Group(), camera: new THREE.PerspectiveCamera(), invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  } }
})
vi.mock('../../lib/three/models/waterCycle.js', async () => {
  const THREE = await import('three')
  return { createWaterCycleDiorama() {
    const group = new THREE.Group()
    const parts = {}
    for (const [i, name] of ['evaporation', 'condensation', 'rain', 'runoff', 'infiltration'].entries()) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
      mesh.position.set(i * 2, i, 0)
      group.add(mesh)
      parts[name] = [mesh]
    }
    return { group, parts, dispose: calls.disposeModel }
  } }
})
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.stage = null; calls.disposeModel.mockClear() })
afterEach(cleanup)

it('locates the selected process, rotates, and handles context loss', async () => {
  const { unmount } = render(<I18nProvider><WaterCycle3D /></I18nProvider>)
  await screen.findByRole('button', { name: 'Rotate right' })
  const marker = calls.stage.world.children[1]
  const initial = marker.position.clone()
  fireEvent.click(screen.getByRole('button', { name: 'Rain' }))
  expect(marker.position.x).not.toBeCloseTo(initial.x)
  fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
  expect(calls.stage.world.rotation.y).toBeGreaterThan(0)
  fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
  expect(screen.getByText(/2D diagram is shown/i)).toBeTruthy()
  const stage = calls.stage
  unmount()
  expect(stage.dispose).toHaveBeenCalledOnce()
  expect(calls.disposeModel).toHaveBeenCalledOnce()
})
