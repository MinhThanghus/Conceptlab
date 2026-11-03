import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../../i18n/index.jsx'
import AnatomicalHeart3D from './AnatomicalHeart3D.jsx'

const calls = vi.hoisted(() => ({ stage: null }))
vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../../lib/three/stage.js', async () => {
  const THREE = await import('three')
  return { createStage(host) {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    calls.stage = { canvas, world: new THREE.Group(), invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  } }
})
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const THREE = await import('three')
  return { GLTFLoader: class {
    async loadAsync() {
      const scene = new THREE.Group()
      for (const name of ['right-ventricle', 'left-ventricle', 'ascending-aorta', 'ventricular-wall']) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
        mesh.name = name
        scene.add(mesh)
      }
      return { scene }
    }
  } }
})
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); calls.stage = null })
afterEach(cleanup)

it('loads a local model, isolates cavities and vessels, rotates, resets, and handles WebGL loss', async () => {
  const { unmount } = render(<I18nProvider><AnatomicalHeart3D /></I18nProvider>)
  await screen.findByRole('img', { name: /3D model of a human heart/i })
  const model = calls.stage.world.children[0]
  fireEvent.click(screen.getByRole('button', { name: /ventricular cavities/i }))
  expect(model.children.find((mesh) => mesh.name === 'right-ventricle').visible).toBe(true)
  expect(model.children.find((mesh) => mesh.name === 'ascending-aorta').visible).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: /major vessels/i }))
  expect(model.children.find((mesh) => mesh.name === 'right-ventricle').visible).toBe(false)
  expect(model.children.find((mesh) => mesh.name === 'ascending-aorta').visible).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: /rotate right/i }))
  expect(calls.stage.world.rotation.y).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))
  expect(calls.stage.world.rotation.y).toBe(0)
  expect(model.children.every((mesh) => mesh.visible)).toBe(true)
  fireEvent(calls.stage.canvas, new Event('webglcontextlost', { cancelable: true }))
  expect(screen.getByRole('status').textContent).toMatch(/could not be opened/i)
  const stage = calls.stage
  unmount()
  expect(stage.dispose).toHaveBeenCalledOnce()
})
