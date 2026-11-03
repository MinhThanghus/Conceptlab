import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Tree3D from './Tree3D.jsx'

const mock = vi.hoisted(() => ({ stage: null, labels: [] }))
vi.mock('../../lib/three/stage.js', () => ({ createStage(host) {
  const canvas = document.createElement('canvas'); host.appendChild(canvas)
  mock.stage = { canvas, world: { children: [], add(node) { this.children.push(node) } }, invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn() }
  return mock.stage
} }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); mock.labels = [] })

it('renders each value as a label and updates the active traversal node', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    strokeText() {}, fillText(value) { mock.labels.push(value) },
  }))
  const values = [8, -3, 10]
  const failure = vi.fn()
  const { rerender } = render(<Tree3D values={values} frame={{ current: null, visited: [] }} lang="en" label="Tree" onFailure={failure} />)
  await waitFor(() => expect(mock.stage.world.children.length).toBe(1))
  expect(mock.labels).toEqual(['8', '-3', '10'])
  const group = mock.stage.world.children[0]
  expect(group.children.filter((node) => node.isSprite)).toHaveLength(3)
  const nodes = group.children.filter((node) => node.isMesh && node.geometry.type === 'SphereGeometry')
  rerender(<Tree3D values={values} frame={{ current: 1, visited: [0, 1] }} lang="en" label="Tree" onFailure={failure} />)
  // the 2D tree's inks: the current node pear, visited nodes mint (tokens.css in sRGB)
  expect(nodes[1].material.color.getHexString()).toBe('f7d21a')
  expect(nodes[0].material.color.getHexString()).toBe('70e093')
  fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
  expect(group.rotation.y).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(group.rotation.y).toBe(0)
  expect(failure).not.toHaveBeenCalled()
})
