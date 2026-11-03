import { describe, expect, it } from 'vitest'
import { daylightHours, geographicDirection, solarDeclination, subsolarLongitude, sunAboveHorizon } from './solarMath.js'

describe('daylight teaching model', () => {
  it('gives roughly twelve hours at the equator and on the equinox', () => {
    expect(daylightHours(0, 172)).toBeCloseTo(12, 5)
    expect(daylightHours(50, 80)).toBeCloseTo(12, 5)
    expect(solarDeclination(80)).toBeCloseTo(0, 5)
  })
  it('changes seasons in opposite directions in the two hemispheres', () => {
    expect(daylightHours(51.5, 172)).toBeGreaterThan(16)
    expect(daylightHours(-51.5, 172)).toBeLessThan(8)
    expect(daylightHours(51.5, 355)).toBeLessThan(8)
  })
  it('handles polar day, polar night and solar time', () => {
    expect(daylightHours(90, 172)).toBe(24)
    expect(daylightHours(90, 355)).toBe(0)
    expect(sunAboveHorizon(0, 80, 12)).toBe(true)
    expect(sunAboveHorizon(0, 80, 0)).toBe(false)
    expect(sunAboveHorizon(0, 80, 6)).toBe(null)
    expect(daylightHours(90, 80)).toBe(null)
    expect(sunAboveHorizon(90, 80, 12)).toBe(null)
  })
  it('aligns geographic positions with the map and uses local solar time for the Sun', () => {
    expect(geographicDirection(0, 0)[0]).toBeCloseTo(1)
    expect(geographicDirection(0, 90)[2]).toBeCloseTo(-1)
    expect(geographicDirection(90, 30)[1]).toBeCloseTo(1)
    expect(subsolarLongitude(105, 12)).toBe(105)
    expect(subsolarLongitude(105, 18)).toBe(15)
    expect(subsolarLongitude(170, 0)).toBe(-10)
    for (const lat of [-75, -30, 0, 21, 75]) for (const lon of [-170, -70, 0, 106, 179]) for (const hour of [0, 6, 12, 18]) {
      const pos = geographicDirection(lat, lon)
      const sun = geographicDirection(solarDeclination(172), subsolarLongitude(lon, hour))
      const dot = pos.reduce((sum, v, i) => sum + v * sun[i], 0)
      const state = sunAboveHorizon(lat, 172, hour)
      if (state !== null) expect(dot > 0).toBe(state)
    }
  })
})
