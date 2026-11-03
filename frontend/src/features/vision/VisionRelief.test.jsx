import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import VisionRelief from './VisionRelief.jsx'

const mock = vi.hoisted(() => ({ stage: null }))
vi.mock('../../lib/three/stage.js', () => ({ createStage(host) {
  const canvas = document.createElement('canvas'); host.appendChild(canvas)
  mock.stage = { canvas, world: { children: [], add(node) { this.children.push(node) } }, invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn() }
  return mock.stage
} }))
afterEach(cleanup)

it('renders 64 pixel heights and moves the selected marker with the pixel', async () => {
  const data = Array(64).fill(0); data[1] = 1
  const failure = vi.fn()
  const { rerender } = render(<VisionRelief values={data} selected={0} neighborhood lang="en" label="Pixels" onFailure={failure} />)
  await waitFor(() => expect(mock.stage.world.children.length).toBe(1))
  const group = mock.stage.world.children[0]
  const cells = group.children.filter((node) => node.isMesh && node.geometry.type === 'BoxGeometry' && node.children.length)
  expect(cells).toHaveLength(64)
  expect(cells[1].scale.y).toBeCloseTo(1.4)
  const marker = group.children.find((node) => node.isMesh && node.geometry.type === 'SphereGeometry')
  const before = marker.position.x
  rerender(<VisionRelief values={data} selected={1} neighborhood lang="en" label="Pixels" onFailure={failure} />)
  expect(marker.position.x).toBeGreaterThan(before)
  // the selected pixel is the scene's one coral detail (tokens.css in sRGB)
  expect(cells[1].children[0].material.color.getHexString()).toBe('ff5e63')
  fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
  expect(group.rotation.y).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(group.rotation.y).toBe(0)
  expect(failure).not.toHaveBeenCalled()
})
