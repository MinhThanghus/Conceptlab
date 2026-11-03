import { describe, expect, it } from 'vitest'
import { filterImage, filterPixel, flowPath, gaussianNoise, KERNELS, neighbours, ORIGINAL, SIZE } from './visionMath.js'

describe('image learning examples', () => {
  it('averages constant images and gives zero horizontal gradient', () => {
    const image = Array(SIZE*SIZE).fill(0.4)
    expect(filterImage(image, KERNELS.mean).every(x => Math.abs(x-0.4)<1e-9)).toBe(true)
    expect(filterImage(image, KERNELS.sobel).every(x => Math.abs(x)<1e-9)).toBe(true)
  })
  it('replicates image borders and computes the selected kernel result', () => {
    const p = Array.from({length:SIZE*SIZE},(_,i)=>i)
    expect(neighbours(p,0,0)).toEqual([0,0,1,0,0,1,8,8,9])
    expect(filterPixel(p,0,0,KERNELS.mean)).toBeCloseTo(3)
    expect(filterPixel(p,0,0,KERNELS.sobel)).toBe(4)
  })
  it('uses one repeatable noise draw and preserves exact linear-path endpoints', () => {
    const noise = gaussianNoise(64, 7)
    expect(noise).toEqual(gaussianNoise(64,7))
    expect(noise).not.toEqual(gaussianNoise(64,8))
    expect(flowPath(ORIGINAL,noise,0)).toEqual(ORIGINAL)
    expect(flowPath(ORIGINAL,noise,1)).toEqual(noise)
    expect(flowPath([1],[3],0.25)).toEqual([1.5])
  })
})
