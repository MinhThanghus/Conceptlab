import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import Circulation3D from './Circulation3D.jsx'

const calls = vi.hoisted(() => ({ stage: null }))
vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('./AnatomicalHeart3D.jsx', () => ({ default: () => <div>Heart model</div> }))
vi.mock('../../../lib/three/stage.js', () => ({
  createStage(host) {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const world = { children: [], add(item) { this.children.push(item) } }
    calls.stage = { canvas, world, invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  },
}))
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.stage = null })
afterEach(cleanup)

it('builds the 3D nodes and arrows and lets learners select and rotate them', async () => {
  render(<I18nProvider><Circulation3D /></I18nProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Blood flow diagram' }))
  await screen.findByRole('button', { name: 'Reset view' })
  const model = calls.stage.world.children[0]
  expect(model.userData.nodes).toHaveLength(6)
  expect(model.userData.flows).toHaveLength(6)
  fireEvent.click(screen.getByRole('button', { name: /right ventricle/i }))
  expect(model.userData.nodes[2].scale.x).toBeCloseTo(1.12)
  expect(model.userData.flows[2].tube.material.emissiveIntensity).toBeGreaterThan(model.userData.flows[1].tube.material.emissiveIntensity)
  fireEvent.click(screen.getByRole('button', { name: 'Rotate model' }))
  expect(model.rotation.y).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(calls.stage.resetView).toHaveBeenCalled()
  fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
  expect(screen.getByText(/2D diagram is shown/)).toBeTruthy()
  expect(calls.stage.canvas.parentElement.style.visibility).toBe('hidden')
})
