import { describe, it, expect } from 'vitest'
import { initialTransport, advanceTransport, siteOccupancy } from './transportMath.js'
const sums = (a) => a.reduce((s, x) => s + x.a + x.b + x.c, 0)
describe('closed illustrative reaction and diffusion', () => {
  it('diffuses while conserving each species and total material at no-flux edges', () => {
    const start = initialTransport(), next = advanceTransport(start, { diffusion: 1, reaction: false }, 200)
    expect(next[20].b).toBeLessThan(start[20].b)
    expect(next[15].b).toBeGreaterThan(0)
    for (const key of ['a', 'b', 'c']) expect(next.reduce((s, x) => s + x[key], 0)).toBeCloseTo(start.reduce((s, x) => s + x[key], 0), 10)
    expect(sums(next)).toBeCloseTo(41, 10)
  })
  it('converts A to B and B to C without producing negative concentrations', () => {
    const next = advanceTransport(initialTransport(), { diffusion: 1, reaction: true, removal: true }, 1000)
    expect(next.some((x) => x.c > 0)).toBe(true)
    expect(next.every((x) => x.a >= 0 && x.b >= 0 && x.c >= 0)).toBe(true)
    expect(sums(next)).toBeCloseTo(41, 10)
  })
  it('does not spread without diffusion', () => {
    const next = advanceTransport(initialTransport(), { diffusion: 0, reaction: true }, 100)
    expect(next[0]).toEqual({ a: 1, b: 0, c: 0 })
  })
})
it('keeps the manually allocated surface sites within capacity', () => {
  expect(siteOccupancy(20, 12)).toEqual({ carbon: 20, moisture: 4, empty: 0, total: 24 })
  expect(siteOccupancy(-5, 8)).toEqual({ carbon: 0, moisture: 8, empty: 16, total: 24 })
})
