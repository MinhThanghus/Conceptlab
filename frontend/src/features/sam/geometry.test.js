import { describe, expect, it } from 'vitest'
import { boxFromPoints, boxIsUsable, boxToPercent, clientToImage, moveCursor, pointToPercent, rankObjects, scaleBox, scalePoint } from './geometry.js'

const rect = { left: 100, top: 50, width: 400, height: 300 }

describe('clientToImage', () => {
  it('maps a click on the displayed image to natural pixels', () => {
    expect(clientToImage(300, 200, rect, 1600, 1200)).toEqual({ x: 800, y: 600 })
    expect(clientToImage(100, 50, rect, 1600, 1200)).toEqual({ x: 0, y: 0 })
  })
  it('clamps clicks outside the image', () => {
    expect(clientToImage(900, 900, rect, 1600, 1200)).toEqual({ x: 1599, y: 1199 })
    expect(clientToImage(0, 0, rect, 1600, 1200)).toEqual({ x: 0, y: 0 })
  })
  it('returns null without a size', () => {
    expect(clientToImage(1, 1, { ...rect, width: 0 }, 10, 10)).toBeNull()
    expect(clientToImage(1, 1, rect, 0, 10)).toBeNull()
  })
})

describe('boxes', () => {
  it('orders the corners of a dragged box', () => {
    expect(boxFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual([10, 20, 50, 80])
    expect(boxFromPoints(null, { x: 1, y: 1 })).toBeNull()
  })
  it('rejects tiny boxes', () => {
    expect(boxIsUsable([0, 0, 3, 50])).toBe(false)
    expect(boxIsUsable([0, 0, 30, 50])).toBe(true)
    expect(boxIsUsable(null)).toBe(false)
  })
  it('converts boxes and points to CSS percentages', () => {
    expect(boxToPercent([0, 0, 99, 49], 200, 100)).toEqual({ left: 0, top: 0, width: 50, height: 50 })
    expect(pointToPercent({ x: 50, y: 25 }, 200, 100)).toEqual({ left: 25, top: 25 })
  })
})

describe('moveCursor', () => {
  it('moves by 2% (10% with Shift) and stays inside the image', () => {
    expect(moveCursor({ x: 500, y: 500 }, 'ArrowRight', 1000, 1000)).toEqual({ x: 520, y: 500 })
    expect(moveCursor({ x: 500, y: 500 }, 'ArrowUp', 1000, 1000, true)).toEqual({ x: 500, y: 400 })
    expect(moveCursor({ x: 5, y: 5 }, 'ArrowLeft', 1000, 1000)).toEqual({ x: 0, y: 5 })
  })
  it('starts from the centre and ignores other keys', () => {
    expect(moveCursor(null, 'ArrowDown', 1000, 800)).toEqual({ x: 500, y: 416 })
    expect(moveCursor({ x: 1, y: 1 }, 'Enter', 100, 100)).toBeNull()
  })
})

describe('scaling between pixel spaces', () => {
  it('scales points and boxes', () => {
    expect(scalePoint({ x: 100, y: 50, negative: true }, { width: 200, height: 100 }, { width: 1000, height: 500 })).toEqual({ x: 500, y: 250, negative: true })
    expect(scaleBox([10, 10, 100, 50], { width: 200, height: 100 }, { width: 400, height: 200 })).toEqual([20, 20, 200, 100])
  })
  it('passes values through when a size is unknown', () => {
    const p = { x: 1, y: 2 }
    expect(scalePoint(p, null, { width: 1, height: 1 })).toBe(p)
  })
})

describe('rankObjects', () => {
  it('puts confident and large objects first', () => {
    const ranked = rankObjects([
      { id: 'a', box: [0, 0, 9, 9], confidence: 0.5 },
      { id: 'b', box: [0, 0, 99, 99], confidence: null },
      { id: 'c', box: [0, 0, 9, 9], confidence: 0.9 },
      { id: 'd', box: [0, 0, 199, 199] },
    ])
    expect(ranked.map((o) => o.id)).toEqual(['c', 'a', 'd', 'b'])
  })
})
