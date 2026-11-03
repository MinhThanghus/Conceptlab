/**
 * Scaled dot-product attention on a tiny example (spec §9.3, Demo 3) — pure functions.
 *   scores = Q·Kᵀ → scaled = scores / √d_k → weights = softmax(row-wise) → output = weights·V
 * Partial illustration on small data only; not a reproduction of any paper's model.
 */

export const MIN_TOKENS = 2
export const MAX_TOKENS = 5
export const MIN_DIM = 2
export const MAX_DIM = 4

export function transpose(m) {
  return m.length ? m[0].map((_, j) => m.map((row) => row[j])) : []
}

export function matmul(a, b) {
  const inner = b.length
  return a.map((row) => {
    const out = new Array(b[0]?.length || 0).fill(0)
    for (let j = 0; j < out.length; j += 1) {
      let sum = 0
      for (let k = 0; k < inner; k += 1) sum += row[k] * b[k][j]
      out[j] = sum
    }
    return out
  })
}

/** Numerically stable softmax of one row. */
export function softmax(row) {
  const max = Math.max(...row)
  const exps = row.map((v) => Math.exp(v - max))
  const sum = exps.reduce((s, v) => s + v, 0)
  return exps.map((v) => v / sum)
}

export const softmaxRows = (m) => m.map(softmax)

/** Shannon entropy (nats) of a probability row — lower means "sharper" attention. */
export function entropy(row) {
  return -row.reduce((s, p) => (p > 0 ? s + p * Math.log(p) : s), 0)
}

/** Dot-product terms of score[i][j] = q_i · k_j, for the "how was this computed?" readout. */
export function dotTerms(Q, K, i, j) {
  return Q[i].map((q, c) => [q, K[j][c]])
}

/**
 * Full computation. `scale: false` skips the 1/√d_k step (to show a sharper softmax).
 * Returns { n, dk, dv, factor, scores, scaled, weights, output }.
 */
export function computeAttention({ Q, K, V }, { scale = true } = {}) {
  const n = Q.length
  const dk = Q[0]?.length || 0
  const dv = V[0]?.length || 0
  const factor = scale ? 1 / Math.sqrt(dk || 1) : 1
  const scores = matmul(Q, transpose(K))
  const scaled = scores.map((row) => row.map((v) => v * factor))
  const weights = softmaxRows(scaled)
  const output = matmul(weights, V)
  return { n, dk, dv, factor, scores, scaled, weights, output }
}

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || lo)))

function fitMatrix(m, rows, cols) {
  const src = Array.isArray(m) ? m : []
  return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => num(Array.isArray(src[i]) ? src[i][j] : 0)))
}

/** Built-in example (4 tokens, d = 3). Token text is supplied by the caller (localised). */
export const EXAMPLE_MATRICES = {
  Q: [
    [2, 0, 1],
    [0, 2, 1],
    [1, 1, 0],
    [1, 0, 2],
  ],
  K: [
    [2, 0, 1],
    [0, 2, 0],
    [1, 1, 1],
    [0, 1, 2],
  ],
  V: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
  ],
}

/**
 * Make any config safe to render: 2–5 tokens, Q/K with d_k (2–4) columns, V with d_v
 * columns (2–4, defaults to d_k), numbers coerced, missing cells 0, token labels non-empty.
 */
export function normalizeAttention(config = {}, fallbackTokens = []) {
  const srcTokens = Array.isArray(config.tokens) ? config.tokens : []
  const rowsGuess = Math.max(srcTokens.length, Array.isArray(config.Q) ? config.Q.length : 0)
  const n = clampInt(rowsGuess || 3, MIN_TOKENS, MAX_TOKENS)
  const dkGuess = Array.isArray(config.Q?.[0]) ? config.Q[0].length : Array.isArray(config.K?.[0]) ? config.K[0].length : 2
  const dk = clampInt(dkGuess, MIN_DIM, MAX_DIM)
  const dvGuess = Array.isArray(config.V?.[0]) ? config.V[0].length : dk
  const dv = clampInt(dvGuess, MIN_DIM, MAX_DIM)
  const tokens = Array.from({ length: n }, (_, i) => {
    const raw = srcTokens[i] ?? fallbackTokens[i]
    const text = raw === null || raw === undefined ? '' : String(raw).trim().slice(0, 24)
    return text || `t${i + 1}`
  })
  return { tokens, Q: fitMatrix(config.Q, n, dk), K: fitMatrix(config.K, n, dk), V: fitMatrix(config.V, n, dv) }
}

/** Change the number of tokens and/or the dimension; keeps existing numbers. */
export function resizeAttention(config, { tokens: nextN, dim: nextD }, newTokenLabel = (i) => `t${i + 1}`) {
  const cur = normalizeAttention(config)
  const n = clampInt(nextN ?? cur.tokens.length, MIN_TOKENS, MAX_TOKENS)
  const d = clampInt(nextD ?? cur.Q[0].length, MIN_DIM, MAX_DIM)
  const dv = nextD !== undefined ? d : cur.V[0].length
  const tokens = Array.from({ length: n }, (_, i) => cur.tokens[i] ?? newTokenLabel(i))
  return { tokens, Q: fitMatrix(cur.Q, n, d), K: fitMatrix(cur.K, n, d), V: fitMatrix(cur.V, n, dv) }
}

/** Small random integers in [lo, hi] (deterministic when `rng` is seeded). */
export function randomAttention(tokens, dim, rng = Math.random, [lo, hi] = [-2, 3]) {
  const n = tokens.length
  const r = () => lo + Math.floor(rng() * (hi - lo + 1))
  const mat = (cols) => Array.from({ length: n }, () => Array.from({ length: cols }, r))
  return { tokens: [...tokens], Q: mat(dim), K: mat(dim), V: mat(dim) }
}

/** Tiny deterministic PRNG (mulberry32) for reproducible tests/presets. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
