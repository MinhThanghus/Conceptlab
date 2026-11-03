import { describe, expect, it } from 'vitest'
import { binaryNeighbours, binaryThreshold, brightnessHistogram, GRAYSCALE, morphologyImage, morphologyPixel } from './morphologyMath.js'

describe('binary image morphology', () => {
  it('uses a strict threshold, including equality and both endpoints', () => {
    expect(binaryThreshold([0, 0.5, 0.51, 1], 0.5)).toEqual([0, 0, 1, 1])
    expect(binaryThreshold([0, 1], 0)).toEqual([0, 1])
    expect(binaryThreshold([0, 1], 1)).toEqual([0, 0])
    expect(binaryThreshold(GRAYSCALE, 1).reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('grows and erodes a single white pixel correctly', () => {
    const image = Array(64).fill(0)
    image[3 * 8 + 3] = 1
    expect(morphologyImage(image, 'dilate').reduce((a, b) => a + b, 0)).toBe(9)
    expect(morphologyImage(image, 'erode').reduce((a, b) => a + b, 0)).toBe(0)
  })
  it('uses zero background beyond the image border', () => {
    const white = Array(64).fill(1)
    expect(binaryNeighbours(white, 0, 0)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 1])
    expect(morphologyPixel(white, 0, 0, 'erode')).toBe(0)
    expect(morphologyPixel(white, 1, 1, 'erode')).toBe(1)
    expect(morphologyImage(white, 'erode').reduce((a, b) => a + b, 0)).toBe(36)
  })
  it('accounts for every sample and includes 1 in the last histogram bin', () => {
    expect(brightnessHistogram([0, 0.09, 0.1, 0.9, 1])).toEqual([2, 1, 0, 0, 0, 0, 0, 0, 0, 2])
    expect(brightnessHistogram(GRAYSCALE).reduce((a, b) => a + b, 0)).toBe(64)
  })
})
