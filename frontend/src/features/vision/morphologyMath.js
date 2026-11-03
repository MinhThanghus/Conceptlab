import { filterImage, KERNELS, ORIGINAL, SIZE } from './visionMath.js'

// A small grayscale image with intermediate intensities, made from the same
// teaching pattern by a mean filter. No external image or model is involved.
// Clamp rounding noise such as 1.0000000000000002 from summing nine 1/9 values.
export const GRAYSCALE = filterImage(ORIGINAL, KERNELS.mean).map((value) => Math.max(0, Math.min(1, value)))

/** Strict binary threshold: values equal to the threshold become background. */
export function binaryThreshold(pixels, threshold) {
  return pixels.map((value) => value > threshold ? 1 : 0)
}

/** Nine values centred on a pixel; outside the 8×8 image is background (0). */
export function binaryNeighbours(mask, row, column) {
  const values = []
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const r = row + dy, c = column + dx
    values.push(r < 0 || c < 0 || r >= SIZE || c >= SIZE ? 0 : mask[r * SIZE + c])
  }
  return values
}

/** One 3×3 all-ones step: erosion is AND, dilation is OR. */
export function morphologyPixel(mask, row, column, mode) {
  const values = binaryNeighbours(mask, row, column)
  return mode === 'erode' ? Number(values.every((value) => value === 1)) : Number(values.some((value) => value === 1))
}

export function morphologyImage(mask, mode) {
  return mask.map((_, index) => morphologyPixel(mask, Math.floor(index / SIZE), index % SIZE, mode))
}

/** Ten bins: [0,.1), …, [.9,1], including 1 in the final bin. */
export function brightnessHistogram(pixels) {
  const bins = Array(10).fill(0)
  for (const value of pixels) bins[Math.min(9, Math.max(0, Math.floor(value * 10)))]++
  return bins
}
