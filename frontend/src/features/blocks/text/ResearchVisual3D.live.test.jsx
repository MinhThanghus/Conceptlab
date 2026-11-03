import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResearchVisual3D from './ResearchVisual3D.jsx'
import { I18nProvider } from '../../../i18n/index.jsx'

const calls = vi.hoisted(() => ({ stage: null }))
vi.mock('../../../components/lab3d/support.js', () => ({ can3D: () => true }))
vi.mock('../../../lib/three/stage.js', () => ({
  createStage(host) {
    const canvas = document.createElement('canvas')
    host.appendChild(canvas)
    const world = {
      children: [],
      add(item) { this.children.push(item) },
      remove(item) { this.children = this.children.filter((v) => v !== item) },
    }
    calls.stage = { canvas, world, invalidate: vi.fn(), resetView: vi.fn(), dispose: vi.fn(() => canvas.remove()) }
    return calls.stage
  },
}))

beforeEach(() => { calls.stage = null; window.localStorage.setItem('cl.lang', 'en') })
afterEach(cleanup)

describe('research 3D scene', () => {
  it('builds Three.js meshes and rebuilds the enzyme scene when the slider changes', async () => {
    render(<I18nProvider><ResearchVisual3D kind="enzyme_binding" /></I18nProvider>)
    await screen.findByRole('button', { name: 'Reset view' })
    expect(calls.stage.world.children[0].children).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: /Binding/ }))
    await waitFor(() => expect(calls.stage.world.children[0].userData.phase).toBe('binding'))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate' }))
    expect(calls.stage.world.children[0].rotation.y).toBeGreaterThan(0)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } })
    await waitFor(() => expect(calls.stage.world.children[0].children).toHaveLength(4))
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(calls.stage.resetView).toHaveBeenCalled()
  })
  it('creates a 25-cell grid and changes its display height', async () => {
    render(<I18nProvider><ResearchVisual3D kind="population_grid" /></I18nProvider>)
    await screen.findByRole('button', { name: 'Reset view' })
    const before = calls.stage.world.children[0].userData.cells[12].geometry.parameters.height
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } })
    await waitFor(() => expect(calls.stage.world.children[0].userData.cells[12].geometry.parameters.height).toBeGreaterThan(before))
    expect(calls.stage.world.children[0].userData.cells).toHaveLength(25)
  })
})
