// Small, fully inspectable teaching examples. Values in the original picture are in [0,1].
export const SIZE = 8
export const ORIGINAL = [
  0,0,0,0,0,0,0,0,
  0,0,0,1,1,0,0,0,
  0,0,1,1,1,1,0,0,
  0,1,1,0,0,1,1,0,
  0,1,1,0,0,1,1,0,
  0,0,1,1,1,1,0,0,
  0,0,0,1,1,0,0,0,
  0,0,0,0,0,0,0,0,
]
export const KERNELS = {
  mean: [1/9,1/9,1/9,1/9,1/9,1/9,1/9,1/9,1/9],
  sobel: [-1,0,1,-2,0,2,-1,0,1],
}
const clampIndex = (v) => Math.max(0, Math.min(SIZE - 1, v))
export function neighbours(pixels, row, col) {
  const values = []
  for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
    values.push(pixels[clampIndex(row+dy)*SIZE+clampIndex(col+dx)])
  }
  return values
}
// Cross-correlation, as used by common image-filter APIs: no kernel flip.
export function filterPixel(pixels, row, col, kernel) {
  const values = neighbours(pixels, row, col)
  return values.reduce((sum, value, i) => sum + value * kernel[i], 0)
}
export function filterImage(pixels, kernel) {
  return pixels.map((_, i) => filterPixel(pixels, Math.floor(i/SIZE), i%SIZE, kernel))
}
// Deterministic pseudo-random Gaussian noise keeps the same epsilon while t moves.
export function gaussianNoise(count, seed=61) {
  let state = seed >>> 0
  const uniform = () => { state = (Math.imul(state,1664525)+1013904223) >>> 0; return (state+1)/4294967297 }
  const result = []
  while (result.length<count) {
    const r = Math.sqrt(-2*Math.log(uniform())), a = 2*Math.PI*uniform()
    result.push(r*Math.cos(a))
    if(result.length<count) result.push(r*Math.sin(a))
  }
  return result
}
export function flowPath(data, noise, t) {
  const time = Math.min(1, Math.max(0, t))
  return data.map((x,i) => (1-time)*x + time*noise[i])
}
export function visibleValue(value) { return Math.max(0, Math.min(1, value)) }
