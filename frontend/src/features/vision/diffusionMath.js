import { ORIGINAL, gaussianNoise } from './visionMath.js'

// Fully synthetic 8 × 8 sample, transformed from display brightness [0, 1] to
// the DDPM data range [-1, 1]. No uploaded or paper image is used.
export const DIFFUSION_SAMPLE = ORIGINAL.map((value) => value * 2 - 1)
export const diffusionNoise = (seed) => gaussianNoise(DIFFUSION_SAMPLE.length, seed)

/** One closed-form marginal q(x_t | x_0), not a sampled Markov trajectory. */
export function diffusionMarginal(data, noise, alphaBar) {
  const alpha = Number(alphaBar)
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1 || data.length !== noise.length) {
    throw new RangeError('Expected matching arrays and alphaBar between 0 and 1')
  }
  const signalWeight = Math.sqrt(alpha)
  const noiseWeight = Math.sqrt(1 - alpha)
  return data.map((value, index) => signalWeight * value + noiseWeight * noise[index])
}

/** Only for rendering: map [-1, 1] to [0, 1] and clip outside the range. */
export const diffusionDisplay = (value) => Math.max(0, Math.min(1, (value + 1) / 2))
