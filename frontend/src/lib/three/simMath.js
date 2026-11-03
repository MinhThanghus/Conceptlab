/**
 * Pure helpers for the 3D simulation labs: no Three.js and no DOM, so they are tested on their
 * own (simMath.test.js). The spring's helix and the tube around it, the projectile field's
 * scale and distance marks, the spring track's ruler, and the design tokens' OKLCH colours as
 * sRGB hex for the materials.
 */

export const TAU = Math.PI * 2

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const tidy = (v) => Number(v.toPrecision(10))

/** A tick step of 1, 2, 2.5 or 5 × 10^k that splits `span` into about `count` parts. */
export function niceStep(span, count = 5) {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const raw = span / Math.max(1, count)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return tidy(nice * pow)
}

/** The smallest round length at or above `v`: 1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 × 10^k. */
export function niceCeil(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 1
  const pow = 10 ** Math.floor(Math.log10(v))
  const f = v / pow
  const hit = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s >= f - 1e-9) ?? 10
  return tidy(hit * pow)
}

/** Marks from `from` to `to` every `step`, rounded so 0.30000000000000004 reads 0.3. */
export function ticks(from, to, step) {
  if (!(step > 0) || !(to >= from)) return []
  const out = []
  const first = Math.ceil(from / step - 1e-9)
  for (let k = first; k * step <= to + 1e-9 && out.length < 400; k += 1) out.push(tidy(k * step))
  return out
}

// ----------------------------------------------------------------------------- spring helix
/**
 * A point on a helix that runs along +x from the support (u = 0, x = 0) to the mass
 * (u = 1, x = length), winding `coils` times at `radius` around the axis.
 */
export function helixPoint(u, { length, radius, coils }) {
  const a = TAU * coils * u
  return [length * u, radius * Math.cos(a), radius * Math.sin(a)]
}

/** `count + 1` points along the helix, support to mass. */
export function helixPoints(count, opts) {
  const n = Math.max(1, Math.floor(count))
  return Array.from({ length: n + 1 }, (_, i) => helixPoint(i / n, opts))
}

/**
 * The helix's own frame at `u`: tangent T, normal N (pointing at the axis) and B = T × N.
 * Analytic, so it never flips the way Frenet frames of a sampled curve can.
 */
export function helixFrame(u, { length, radius, coils }) {
  const w = TAU * coils
  const a = w * u
  const t = [length, -radius * w * Math.sin(a), radius * w * Math.cos(a)]
  const tl = Math.hypot(t[0], t[1], t[2]) || 1
  const T = [t[0] / tl, t[1] / tl, t[2] / tl]
  const N = [0, -Math.cos(a), -Math.sin(a)]
  const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]]
  return { T, N, B }
}

/** Vertex count of a helix tube with `segments` steps along the wire and `radial` around it. */
export const helixTubeSize = (segments, radial) => (segments + 1) * (radial + 1)

/**
 * Writes the positions and normals of a round wire of radius `wire` wound along the helix
 * into `positions` and `normals` (Float32Array, 3 per vertex, helixTubeSize() vertices).
 * Called again with a new `length` when the spring stretches or squeezes: the coils keep their
 * count and the wire its thickness, only the pitch changes, like a real spring.
 */
export function fillHelixTube(positions, normals, { length, radius, coils, wire, segments, radial }) {
  let k = 0
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments
    const P = helixPoint(u, { length, radius, coils })
    const { N, B } = helixFrame(u, { length, radius, coils })
    for (let j = 0; j <= radial; j += 1) {
      const v = (j / radial) * TAU
      const c = Math.cos(v)
      const s = Math.sin(v)
      const nx = c * N[0] + s * B[0]
      const ny = c * N[1] + s * B[1]
      const nz = c * N[2] + s * B[2]
      positions[k] = P[0] + wire * nx
      positions[k + 1] = P[1] + wire * ny
      positions[k + 2] = P[2] + wire * nz
      normals[k] = nx
      normals[k + 1] = ny
      normals[k + 2] = nz
      k += 3
    }
  }
  return positions
}

/** Triangle indices for fillHelixTube()'s vertex layout. */
export function helixTubeIndex(segments, radial) {
  const out = new Uint32Array(segments * radial * 6)
  let k = 0
  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < radial; j += 1) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      out[k++] = a
      out[k++] = b
      out[k++] = a + 1
      out[k++] = b
      out[k++] = b + 1
      out[k++] = a + 1
    }
  }
  return out
}

// ----------------------------------------------------------------------------- spring track
/**
 * The spring track draws displacement magnified so a swing of a few centimetres is still seen:
 * the ruler under the mass reads true metres from the rest position, its half-span a round
 * number above the largest starting displacement the lesson allows.
 *   → { scale (scene units per metre), half (metres either side), step, ticks }
 */
export function springLayout(maxAmp, { swing = 0.5 } = {}) {
  const amp = Math.max(0.001, Math.abs(Number(maxAmp) || 0))
  const half = niceCeil(amp * 1.15)
  const scale = swing / half
  const step = niceStep(2 * half, 4)
  return { scale, half, step, ticks: ticks(-half, half, step) }
}

/** Length of the spring (scene units) when the mass is `x` metres from its rest position. */
export function springLength(x, layout, rest) {
  return Math.max(rest * 0.25, rest + (Number(x) || 0) * layout.scale)
}

// ----------------------------------------------------------------------------- projectile field
/**
 * One scale for both axes, so the path keeps its true shape. The field shows a round number of
 * metres (it only rescales when a throw outgrows it) and its distance marks a round step.
 *   items: [{ range, maxHeight, h0 }] in metres; length and height in scene units.
 *   → { scale (scene units per metre), metres (field length), step, ticks }
 */
export function projectileLayout(items = [], { length = 5.2, height = 2.6 } = {}) {
  const ranges = items.map((it) => Math.max(0, Number(it.range) || 0))
  const heights = items.map((it) => Math.max(Number(it.maxHeight) || 0, Number(it.h0) || 0))
  const metresW = niceCeil(Math.max(1, ...ranges) * 1.06)
  const metresH = niceCeil(Math.max(0.5, ...heights) * 1.1)
  const scale = Math.min(length / metresW, height / metresH)
  const metres = tidy(length / scale)
  const step = niceStep(metres, 5)
  return { scale, metres, step, ticks: ticks(0, metres, step) }
}

/**
 * Cumulative length along a polyline of [x, y] points, as fractions of the whole (0 … 1).
 * The flight is sampled at equal times, a tube is built at equal lengths: this maps one to the
 * other so the trail ends where the ball is.
 */
export function arcFractions(points = []) {
  const out = new Float64Array(Math.max(1, points.length))
  let total = 0
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    out[i] = total
  }
  if (total > 0) for (let i = 1; i < out.length; i += 1) out[i] /= total
  return out
}

/** The length fraction reached at time fraction `p` along equal-time samples (see arcFractions). */
export function arcAt(fractions, p) {
  const n = fractions.length - 1
  if (n <= 0) return clamp(p, 0, 1)
  const x = clamp(p, 0, 1) * n
  const i = Math.min(n - 1, Math.floor(x))
  return fractions[i] + (fractions[i + 1] - fractions[i]) * (x - i)
}

/** How much of the flight has happened at time t (0 before the throw, 1 once it lands). */
export function flightProgress(t, duration) {
  if (!(duration > 0)) return 1
  return clamp((Number(t) || 0) / duration, 0, 1)
}

// ----------------------------------------------------------------------------- colours
/**
 * `oklch(L C h)` (as tokens.css writes it) → '#rrggbb' in sRGB, clipped to the gamut; null when
 * the text is not an OKLCH colour. Three.js materials take sRGB, the tokens are OKLCH.
 */
export function oklchToHex(input) {
  const m = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)/i.exec(String(input || ''))
  if (!m) return null
  let L = parseFloat(m[1])
  if (m[2] === '%') L /= 100
  const C = parseFloat(m[3])
  const h = (parseFloat(m[4]) * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const linear = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s]
  const encode = (x) => {
    const c = clamp(x, 0, 1)
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  }
  return `#${linear.map((x) => Math.round(encode(x) * 255).toString(16).padStart(2, '0')).join('')}`
}
