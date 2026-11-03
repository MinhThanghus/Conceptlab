import { describe, expect, it } from 'vitest'
import { createQuadrotorModel, createSolarCellModel } from './engineeringModels.js'
import { thrustComponents } from './engineeringMath.js'

describe('engineering teaching models', () => {
  it('decomposes total thrust consistently for left and right tilt', () => {
    expect(thrustComponents(8, 0).vertical).toBeCloseTo(8)
    expect(thrustComponents(8, 0).horizontal).toBeCloseTo(0)
    expect(thrustComponents(10, 30).vertical).toBeCloseTo(8.660254)
    expect(thrustComponents(10, -30).horizontal).toBeCloseTo(-5)
  })
  it('tilts the quadrotor and updates the vector visibility', () => {
    const model = createQuadrotorModel()
    model.update({ tilt: 0, force: 8 })
    expect(model.group.getObjectByName('horizontal-component').visible).toBe(false)
    model.update({ tilt: 30, force: 8 })
    expect(model.group.getObjectByName('quadrotor-body').rotation.z).toBeCloseTo(-Math.PI / 6)
    expect(model.group.getObjectByName('horizontal-component').visible).toBe(true)
    expect(model.group.getObjectByName('quadrotor-body').children.filter((c) => c.name === 'motor-and-rotor')).toHaveLength(4)
    model.dispose()
  })
  it('separates layers and shows an illustrative crack without computing output power', () => {
    const model = createSolarCellModel()
    const cover = model.group.getObjectByName('glass')
    model.update({ separation: 0, cracked: false, light: 0 })
    const closed = cover.position.y
    expect(model.group.getObjectByName('illustrative-crack').visible).toBe(false)
    expect(model.group.getObjectByName('illustrative-sunlight').visible).toBe(false)
    model.update({ separation: 100, cracked: true, light: 70 })
    expect(cover.position.y).toBeGreaterThan(closed)
    expect(model.group.getObjectByName('illustrative-crack').visible).toBe(true)
    expect(model.group.getObjectByName('illustrative-sunlight').visible).toBe(true)
    model.dispose()
  })
})
