import { afterEach, expect, it, vi } from 'vitest'
import { createSemiconductorModel } from './semiconductorModels.js'

const ctx = { clearRect() {}, roundRect() {}, rect() {}, fill() {}, fillText() {} }
afterEach(() => vi.restoreAllMocks())
const labels = { source: 'Source', gate: 'Gate', drain: 'Drain', oxide: 'Oxide', substrate: 'p substrate', pmos: 'pMOS', nmos: 'nMOS', input: 'In', output: 'Out' }

it('shows an n-channel only when the gate is high', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  const model = createSemiconductorModel('device', labels)
  const channel = model.group.getObjectByName('induced-channel')
  model.update({ gateHigh: false })
  expect(channel.visible).toBe(false)
  model.update({ gateHigh: true })
  expect(channel.visible).toBe(true)
  model.dispose()
})

it('reveals only the correct conducting transistor channel for an input', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  const model = createSemiconductorModel('cmos', labels)
  const p = model.group.getObjectByName('pmos-channel')
  const n = model.group.getObjectByName('nmos-channel')
  model.update({ input: 0, revealed: false })
  expect([p.visible, n.visible]).toEqual([false, false])
  model.update({ input: 0, revealed: true })
  expect([p.visible, n.visible]).toEqual([true, false])
  model.update({ input: 1, revealed: true })
  expect([p.visible, n.visible]).toEqual([false, true])
  model.dispose()
})

it('moves interconnect layers apart without modifying the substrate', () => {
  const model = createSemiconductorModel('stack', labels)
  const upper = model.group.getObjectByName('upper-interconnect')
  const substrate = model.group.getObjectByName('silicon-and-devices')
  model.update({ separation: 0 })
  const initialY = upper.position.y
  model.update({ separation: 100 })
  expect(upper.position.y).toBeGreaterThan(initialY)
  expect(substrate.position.y).toBe(0)
  model.dispose()
})
