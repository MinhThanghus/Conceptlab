/**
 * Pure helpers shared by the lesson blocks (steps, flow, diagram, quiz).
 * No React here so everything is unit-testable (lessonKit.test.js).
 *
 * Limits mirror backend/app/schemas/spec.py — the autosave PATCH fails with
 * `invalid_spec` if any field is longer than allowed, so editors must enforce them.
 */
import { newId } from '../../lab/specUtils.js'

export const LIMITS = {
  short: 200,
  medium: 2000,
  long: 12000,
  quote: 600,
  unit: 40,
  maskPath: 60000,
  steps: 40,
  stepRefs: 10,
  blockRefs: 20,
  flowNodes: 30,
  flowEdges: 60,
  hotspots: 40,
  relations: 60,
  questions: 40,
  options: 8,
  questionRefs: 6,
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

const round4 = (v) => Math.round(v * 10000) / 10000

/** Immutable move of one item from index `from` to index `to`. */
export function moveItem(list, from, to) {
  const items = [...(list || [])]
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
  return items
}

/** Fisher–Yates copy. `rng` returns [0, 1). */
export function shuffle(list, rng = Math.random) {
  const items = [...(list || [])]
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

export function identity(n) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i)
}

export function isIdentity(order) {
  return Array.isArray(order) && order.every((v, i) => v === i)
}

/** A shuffled order of 0..n-1 that is never already sorted when n ≥ 2 (so the learner has work to do). */
export function shuffledIndices(n, rng = Math.random) {
  const base = identity(n)
  if (n < 2) return base
  let order = shuffle(base, rng)
  for (let tries = 0; tries < 6 && isIdentity(order); tries += 1) order = shuffle(base, rng)
  if (isIdentity(order)) order = [...base.slice(1), base[0]]
  return order
}

/** A fresh id with `prefix` that is not in `taken` (Set or array of ids). */
export function uniqueId(prefix, taken = []) {
  const used = taken instanceof Set ? taken : new Set(taken)
  let id = newId(prefix)
  while (used.has(id)) id = newId(prefix)
  return id
}

/** "Bước 2: Tạo mặt đệm" / "2. Tạo mặt đệm" → "Tạo mặt đệm" (so ordering games don't give the answer away). */
export function stripLeadingNumber(title) {
  const text = String(title || '').trim()
  const stripped = text.replace(/^(?:(?:bước|buoc|giai đoạn|giai doan|step|phase|stage)\s*)?\d{1,2}\s*[.):\-–—](?!\d)\s*/i, '')
  return stripped.trim() || text
}

// ----------------------------------------------------------------------------- boxes (normalized 0..1)
/** Normalized box [x0, y0, x1, y1] sorted, clamped to 0..1 and rounded to 4 decimals. */
export function normBox(box) {
  if (!Array.isArray(box) || box.length !== 4 || box.some((v) => !Number.isFinite(Number(v)))) return null
  const [a, b, c, d] = box.map((v) => clamp(Number(v), 0, 1))
  return [round4(Math.min(a, c)), round4(Math.min(b, d)), round4(Math.max(a, c)), round4(Math.max(b, d))]
}

export function boxFromPoints(p, q) {
  return normBox([p[0], p[1], q[0], q[1]])
}

export function boxSize(box) {
  return box ? [box[2] - box[0], box[3] - box[1]] : [0, 0]
}

export function boxCenter(box) {
  return [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]
}

/** Move a box by (dx, dy) keeping it inside the image. */
export function moveBox(box, dx, dy) {
  const [w, h] = boxSize(box)
  const x0 = clamp(box[0] + dx, 0, 1 - w)
  const y0 = clamp(box[1] + dy, 0, 1 - h)
  return normBox([x0, y0, x0 + w, y0 + h])
}

/** Grow/shrink the far corner by (dw, dh), keeping a minimum size and staying inside the image. */
export function resizeBox(box, dw, dh, min = 0.02) {
  const x1 = clamp(box[2] + dw, box[0] + min, 1)
  const y1 = clamp(box[3] + dh, box[1] + min, 1)
  return normBox([box[0], box[1], x1, y1])
}

/** Union of several normalized rects (e.g. the lines a quote spans). */
export function unionBox(rects) {
  const valid = (rects || []).map(normBox).filter(Boolean)
  if (!valid.length) return null
  return normBox([
    Math.min(...valid.map((r) => r[0])),
    Math.min(...valid.map((r) => r[1])),
    Math.max(...valid.map((r) => r[2])),
    Math.max(...valid.map((r) => r[3])),
  ])
}

/**
 * Region to show when zooming into a highlight: the box plus some context, at least
 * `min` of the image in each direction, kept inside the image.
 */
export function cropRegion(bbox, { pad = 0.35, min = 0.3 } = {}) {
  const box = normBox(bbox)
  if (!box) return [0, 0, 1, 1]
  const axis = (lo, hi) => {
    const size = hi - lo
    let want = Math.min(1, Math.max(min, size * (1 + 2 * pad)))
    let start = (lo + hi) / 2 - want / 2
    start = clamp(start, 0, 1 - want)
    if (want >= 1) {
      start = 0
      want = 1
    }
    return [start, start + want]
  }
  const [x0, x1] = axis(box[0], box[2])
  const [y0, y1] = axis(box[1], box[3])
  return [round4(x0), round4(y0), round4(x1), round4(y1)]
}

/**
 * The region around `bbox` with a fixed `margin` of the picture on every side (at least `min` of it
 * in each direction), kept inside the picture. Unlike cropRegion's margin, which grows with the
 * box, a wide box (three lines of a page) keeps a narrow frame and stays legible.
 */
export function marginRegion(bbox, { margin = 0.03, min = 0.3 } = {}) {
  const box = normBox(bbox)
  if (!box) return [0, 0, 1, 1]
  const axis = (lo, hi) => {
    const want = Math.min(1, Math.max(min, hi - lo + 2 * margin))
    const start = clamp((lo + hi) / 2 - want / 2, 0, 1 - want)
    return [start, start + want]
  }
  const [x0, x1] = axis(box[0], box[2])
  const [y0, y1] = axis(box[1], box[3])
  return [round4(x0), round4(y0), round4(x1), round4(y1)]
}

/**
 * The "cover" counterpart of cropRegion: the region of a picture that fills a box of aspect
 * `boxAspect` (width / height) edge to edge while keeping the highlighted `bbox` in view with a
 * `margin` of context (marginRegion). `natural` is the picture's pixel size. `boxWidth` (px) with
 * `maxZoom` keeps a photo crisp: the region is never so small that one picture pixel spans more
 * than `maxZoom` box pixels. Without a known size or aspect it returns the margin region.
 * Returns [x0, y0, x1, y1].
 */
export function coverRegion(bbox, { natural, boxAspect, boxWidth = 0, margin = 0.03, min = 0.3, maxZoom = 1.6 } = {}) {
  const base = marginRegion(bbox, { margin, min })
  const nw = Number(natural?.width)
  const nh = Number(natural?.height)
  if (!(nw > 0 && nh > 0 && boxAspect > 0 && Number.isFinite(boxAspect))) return base
  let w = (base[2] - base[0]) * nw
  let h = (base[3] - base[1]) * nh
  const cx = ((base[0] + base[2]) / 2) * nw
  const cy = ((base[1] + base[3]) / 2) * nh
  if (boxWidth > 0 && maxZoom > 0) {
    w = Math.max(w, boxWidth / maxZoom)
    h = Math.max(h, boxWidth / boxAspect / maxZoom)
  }
  if (w / h < boxAspect) w = h * boxAspect
  else h = w / boxAspect
  // too large for the picture: zoom in instead, keeping the box's shape
  if (w > nw) {
    h *= nw / w
    w = nw
  }
  if (h > nh) {
    w *= nh / h
    h = nh
  }
  const x0 = clamp(cx - w / 2, 0, nw - w)
  const y0 = clamp(cy - h / 2, 0, nh - h)
  return [round4(x0 / nw), round4(y0 / nh), round4((x0 + w) / nw), round4((y0 + h) / nh)]
}

/** Position (CSS percentages) of `box` inside the visible `crop` region. */
export function boxInCrop(box, crop) {
  const cw = crop[2] - crop[0] || 1
  const ch = crop[3] - crop[1] || 1
  return {
    left: ((box[0] - crop[0]) / cw) * 100,
    top: ((box[1] - crop[1]) / ch) * 100,
    width: ((box[2] - box[0]) / cw) * 100,
    height: ((box[3] - box[1]) / ch) * 100,
  }
}

// ----------------------------------------------------------------------------- media
/** URL of the picture behind an image source, a PDF page, or an image asset. */
export function mediaUrl({ source, asset, page } = {}) {
  if (asset?.url) return asset.url
  if (!source || source.status === 'failed') return null
  if (source.kind === 'image') return source.urls?.file || null
  if (source.kind === 'pdf' && source.urls?.page) {
    const max = source.page_count || 10000
    const n = clamp(Math.round(Number(page) || 1), 1, max)
    return source.urls.page.replace('{n}', String(n))
  }
  return null
}

/** Pixel size of an image source/asset when the server knows it (PDF pages are learned on load). */
export function knownSize({ source, asset } = {}) {
  const item = asset || (source?.kind === 'image' ? source : null)
  if (item?.width && item?.height) return { width: item.width, height: item.height }
  return null
}

export const IMAGE_ASSET_KINDS = ['page', 'frame', 'cutout']

/**
 * Pictures a teacher can pick for a diagram or highlight:
 * [{ value: 'src:<id>' | 'asset:<id>', kind: 'image'|'pdf'|'asset', source?, asset? }]
 */
export function pictureOptions(sources = [], assets = [], { includeAssets = true } = {}) {
  const out = []
  for (const source of sources) {
    if (source.status === 'failed') continue
    if (source.kind === 'image' || source.kind === 'pdf') out.push({ value: `src:${source.id}`, kind: source.kind, source })
  }
  if (includeAssets) {
    for (const asset of assets) {
      if (IMAGE_ASSET_KINDS.includes(asset.kind)) out.push({ value: `asset:${asset.id}`, kind: 'asset', asset })
    }
  }
  return out
}

/** Value used by pictureOptions() for an ImageRef / SourceRef. */
export function pictureValue(ref) {
  if (!ref) return ''
  if (ref.asset_id) return `asset:${ref.asset_id}`
  if (ref.source_id) return `src:${ref.source_id}`
  return ''
}

/** Shorten an SVG path in 0..1000 units: integer coordinates are plenty for display. */
export function compactPath(path) {
  if (!path) return ''
  return String(path)
    .replace(/-?\d+\.\d+/g, (num) => String(Math.round(Number(num))))
    .replace(/\s+/g, ' ')
    .trim()
}

/** mask_path ready for the spec (null when missing or too long for the 60 000-character limit). */
export function safeMaskPath(path) {
  const compact = compactPath(path)
  if (!compact || compact.length > LIMITS.maskPath) return null
  return compact
}

// ----------------------------------------------------------------------------- source refs
/** `located` for a reference picked by the teacher: a chosen page/region/source is a real location. */
export function manualLocated(ref, source) {
  if (!ref?.source_id || !source) return 'none'
  if (ref.bbox) return 'exact'
  if (source.kind === 'pdf') return ref.page ? 'exact' : 'none'
  if (source.kind === 'video') return Number.isFinite(ref.time) ? 'exact' : 'none'
  return 'exact'
}

export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** "1:23" → 83, "83" → 83, "1:02:03" → 3723; invalid → null. */
export function parseClock(text) {
  const value = String(text ?? '').trim()
  if (!value) return null
  if (/^\d+(?:[.,]\d+)?$/.test(value)) return Number(value.replace(',', '.'))
  if (!/^\d+(?::\d{1,2}){1,2}$/.test(value)) return null
  return value.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}

/**
 * Parse a number typed by a Vietnamese or English learner: "2,01", "2.01", "1 000,5",
 * "1,000.5", "-3", "4e2". Returns null when it is not a number.
 */
export function parseDecimal(text) {
  let value = String(text ?? '')
    .trim()
    .replace(/[\s  ]/g, '')
    .replace(/[−–]/g, '-')
  if (!value) return null
  const grouped = (text, sep) => new RegExp(`^[-+]?\\d{1,3}(?:\\${sep}\\d{3})+$`).test(text)
  const commas = value.split(',').length - 1
  const dots = value.split('.').length - 1
  if (commas && dots) {
    // the last separator is the decimal one; the other one groups thousands
    const decimalSep = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.'
    const groupSep = decimalSep === ',' ? '.' : ','
    const at = value.lastIndexOf(decimalSep)
    const whole = value.slice(0, at)
    if (!grouped(whole, groupSep)) return null
    value = `${whole.split(groupSep).join('')}.${value.slice(at + 1)}`
  } else if (commas || dots > 1) {
    const sep = commas ? ',' : '.'
    const count = commas || dots
    if (count === 1) value = value.replace(',', '.') // Vietnamese decimal comma: "2,01"
    else if (grouped(value, sep)) value = value.split(sep).join('') // "1.000.000" / "1,000,000"
    else return null
  }
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/** Trim a string to a schema limit (the server rejects longer values). */
export function cut(text, max) {
  const value = String(text ?? '')
  return value.length > max ? value.slice(0, max) : value
}
