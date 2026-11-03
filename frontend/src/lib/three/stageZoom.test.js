import { expect, it } from 'vitest'
import { clampStageZoom } from './stage.js'

it('clamps zoom to the camera-safe range and recovers from non-finite input', () => {
  expect(clampStageZoom(.01)).toBe(.75)
  expect(clampStageZoom(1.5)).toBe(1.5)
  expect(clampStageZoom(20)).toBe(3.5)
  expect(clampStageZoom(NaN)).toBe(1)
})
