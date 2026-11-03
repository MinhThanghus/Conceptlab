import { describe, expect, it } from 'vitest'
import { compressImage, compressionPlan, fitWithin, outputName, SMALL_BYTES } from './image.js'

describe('fitWithin', () => {
  it('scales the longest side down to maxSide and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500, scale: 0.5 })
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000, scale: 0.5 })
  })

  it('never scales up', () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800, scale: 1 })
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000, scale: 1 })
  })

  it('rounds to whole pixels and keeps at least 1 px', () => {
    const r = fitWithin(4031, 3023, 2000)
    expect(r.width).toBe(2000)
    expect(r.height).toBe(Math.round(3023 * (2000 / 4031)))
    expect(fitWithin(10000, 3, 100).height).toBe(1)
  })

  it('handles invalid sizes safely', () => {
    expect(fitWithin(0, 100, 2000)).toEqual({ width: 0, height: 0, scale: 1 })
    expect(fitWithin(NaN, 100, 2000)).toEqual({ width: 0, height: 0, scale: 1 })
    expect(fitWithin(100, 50, 0)).toEqual({ width: 100, height: 50, scale: 1 })
  })
})

describe('outputName', () => {
  it('swaps the extension for the output type', () => {
    expect(outputName('IMG_2041.HEIC', 'image/jpeg')).toBe('IMG_2041.jpg')
    expect(outputName('so-do.png', 'image/png')).toBe('so-do.png')
    expect(outputName('trang.sach.64.webp', 'image/jpeg')).toBe('trang.sach.64.jpg')
  })
  it('falls back to a default name', () => {
    expect(outputName('', 'image/jpeg')).toBe('image.jpg')
    expect(outputName(undefined, 'image/png')).toBe('image.png')
  })
})

describe('compressionPlan', () => {
  it('keeps small images that already fit', () => {
    expect(compressionPlan({ type: 'image/jpeg', size: 120_000, width: 1200, height: 900 })).toEqual({ action: 'keep' })
  })

  it('re-encodes big photos as JPEG within maxSide', () => {
    expect(compressionPlan({ type: 'image/jpeg', size: 4_500_000, width: 4032, height: 3024 })).toMatchObject({
      action: 'encode',
      type: 'image/jpeg',
      width: 2000,
      height: 1500,
    })
  })

  it('re-encodes heavy images even when the size already fits', () => {
    expect(compressionPlan({ type: 'image/png', size: SMALL_BYTES + 1, width: 1600, height: 1000 })).toMatchObject({
      action: 'encode',
      type: 'image/jpeg',
      scale: 1,
    })
  })

  it('keeps small transparent PNGs and resizes large ones as PNG', () => {
    expect(compressionPlan({ type: 'image/png', size: 400_000, width: 800, height: 800, hasAlpha: true })).toEqual({ action: 'keep' })
    expect(compressionPlan({ type: 'image/png', size: 9_000_000, width: 3000, height: 3000, hasAlpha: true })).toMatchObject({
      action: 'encode',
      type: 'image/png',
      width: 2000,
      height: 2000,
    })
  })

  it('respects a custom maxSide', () => {
    expect(compressionPlan({ type: 'image/jpeg', size: 900_000, width: 1600, height: 1200 }, { maxSide: 800 })).toMatchObject({
      width: 800,
      height: 600,
    })
  })

  it('keeps images whose size is unknown', () => {
    expect(compressionPlan({ type: 'image/jpeg', size: 10, width: 0, height: 0 })).toEqual({ action: 'keep' })
  })
})

describe('compressImage', () => {
  it('returns the original file when the browser cannot decode images (jsdom)', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', { type: 'image/jpeg' })
    await expect(compressImage(file)).resolves.toBe(file)
  })

  it('returns non-image and undecodable files untouched', async () => {
    const pdf = new File(['%PDF-1.7'], 'bai-bao.pdf', { type: 'application/pdf' })
    const heic = new File(['....ftypheic'], 'IMG.HEIC', { type: 'image/heic' })
    await expect(compressImage(pdf)).resolves.toBe(pdf)
    await expect(compressImage(heic)).resolves.toBe(heic)
    await expect(compressImage(null)).resolves.toBe(null)
  })
})
