import { describe, expect, it } from 'vitest'
import { DIFFUSION_SAMPLE, diffusionDisplay, diffusionMarginal, diffusionNoise } from './diffusionMath.js'

describe('DDPM closed-form forward marginal', () => {
  it('returns the exact sample and noise at the ideal endpoints', () => {
    const noise = diffusionNoise(61)
    expect(diffusionMarginal(DIFFUSION_SAMPLE, noise, 1)).toEqual(DIFFUSION_SAMPLE)
    expect(diffusionMarginal(DIFFUSION_SAMPLE, noise, 0)).toEqual(noise)
  })
  it('uses square-root coefficients, keeps signed raw values, and clips only for display', () => {
    const output = diffusionMarginal([-1, 1], [2, -2], .25)
    expect(output[0]).toBeCloseTo(-.5 + Math.sqrt(.75) * 2)
    expect(output[1]).toBeCloseTo(.5 - Math.sqrt(.75) * 2)
    expect(output[0]).toBeGreaterThan(1)
    expect(diffusionDisplay(output[0])).toBe(1)
    expect(diffusionDisplay(-2)).toBe(0)
    expect(diffusionDisplay(0)).toBe(.5)
  })
  it('holds the noise fixed for a seed and rejects invalid alpha or array lengths', () => {
    expect(diffusionNoise(61)).toEqual(diffusionNoise(61))
    expect(diffusionNoise(61)).not.toEqual(diffusionNoise(62))
    expect(() => diffusionMarginal([1], [0], -0.1)).toThrow(RangeError)
    expect(() => diffusionMarginal([1], [], .5)).toThrow(RangeError)
  })
})
