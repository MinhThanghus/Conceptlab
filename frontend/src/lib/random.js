/**
 * Small deterministic randomness for generated (never drawn) decoration: the same seed gives
 * the same pattern on every render, every device and every visit. No dependencies, so it is
 * safe for the entry bundle (lib/three/kit.js has its own copy for the 3D chunks).
 */

/** mulberry32: a tiny 32-bit PRNG returning numbers in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a: a stable 32-bit hash of a string (a share code, an id), used as a seed. */
export function hashString(text) {
  let h = 0x811c9dc5
  for (const ch of String(text ?? '')) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** A seeded generator with the helpers patterns need. */
export function seeded(seed) {
  const next = mulberry32(typeof seed === 'number' ? seed : hashString(seed))
  return {
    next,
    /** A float in [min, max). */
    range: (min, max) => min + (max - min) * next(),
    /** An integer in [min, max], both included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    /** One item of a list. */
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}
