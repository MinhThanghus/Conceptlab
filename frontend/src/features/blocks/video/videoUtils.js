/**
 * Pure helpers for the video block (spec §8.3): clock formatting, frame stepping,
 * marker loops, SAM track lookup and object-fit geometry. No DOM access, so every
 * function is unit-tested in videoUtils.test.js.
 */

export const SPEEDS = [0.25, 0.5, 0.75, 1]
export const LOOP_HALF_WINDOW = 1.5 // seconds on each side of the selected marker
export const DEFAULT_FPS = 30
export const MAX_MARKERS = 60
export const MAX_TRACKS = 6
export const MAX_POINTS = 10
/** CSS custom properties (design tokens) used to colour SAM tracks, in order. */
export const TRACK_COLOR_VARS = ['--cl-accent', '--cl-series-3', '--cl-series-2', '--cl-series-1', '--cl-series-4', '--cl-info']

export function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value))
}

export function safeFps(fps) {
  const n = Number(fps)
  return Number.isFinite(n) && n >= 1 && n <= 240 ? n : DEFAULT_FPS
}

/** Duration in seconds from the video element or the SourceOut (duration_ms). 0 when unknown. */
export function durationOf(elementDuration, durationMs) {
  const d = Number(elementDuration)
  if (Number.isFinite(d) && d > 0) return d
  const ms = Number(durationMs)
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : 0
}

/**
 * Clock text "m:ss.d" — Vietnamese uses a decimal comma ("0:03,2").
 * Hours appear only when needed ("1:02:03.4"). Invalid / negative input → 0.
 */
export function formatClock(seconds, { lang = 'vi', decimals = 1 } = {}) {
  let s = Number(seconds)
  if (!Number.isFinite(s) || s < 0) s = 0
  const factor = 10 ** decimals
  const scaled = Math.round(s * factor)
  const whole = Math.floor(scaled / factor)
  const frac = scaled - whole * factor
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const sec = whole % 60
  const base = h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
  if (decimals <= 0) return base
  return `${base}${lang === 'vi' ? ',' : '.'}${String(frac).padStart(decimals, '0')}`
}

/** Index of the frame shown at time t (frame k covers [k/fps, (k+1)/fps)). */
export function frameIndexAt(t, fps) {
  return Math.max(0, Math.floor(Number(t || 0) * safeFps(fps) + 1e-6))
}

/**
 * Time to seek to after stepping `frames` frames (negative = back). The result is the
 * middle of the target frame, which browsers display reliably, clamped inside the video.
 */
export function stepTime(t, fps, frames = 1, duration = 0) {
  const f = safeFps(fps)
  const index = Math.max(0, frameIndexAt(t, f) + frames)
  const target = (index + 0.5) / f
  const max = duration > 0 ? Math.max(0.5 / f, duration - 0.5 / f) : Infinity
  return clamp(target, 0, max)
}

/** [start, end] of the loop around a marker (±1.5 s by default), clamped to the video. */
export function loopWindow(markerT, duration, half = LOOP_HALF_WINDOW) {
  const t = Math.max(0, Number(markerT) || 0)
  const end = duration > 0 ? Math.min(duration, t + half) : t + half
  const start = Math.max(0, Math.min(t - half, end - 0.2))
  return [start, end]
}

/** Seek-bar fraction 0..1 for a time. */
export function fraction(t, duration) {
  return duration > 0 ? clamp(Number(t) / duration, 0, 1) : 0
}

function validMarker(m) {
  return m && typeof m === 'object' && Number.isFinite(Number(m.t)) && Number(m.t) >= 0
}

export function sortMarkers(markers = []) {
  return (markers || []).filter(validMarker).sort((a, b) => Number(a.t) - Number(b.t))
}

/** Learners only see markers a person wrote or confirmed — same rule as the published snapshot. */
export function learnerMarkers(markers = []) {
  return sortMarkers(markers).filter((m) => m.confirmed || !m.ai_suggested)
}

/** AI-suggested markers that still wait for the teacher. */
export function pendingAiMarkers(markers = []) {
  return (markers || []).filter((m) => validMarker(m) && m.ai_suggested && !m.confirmed)
}

/** Marker the playhead is in: the last marker at or before `time` (sorted input). */
export function markerAt(sorted, time, tolerance = 0.05) {
  let found = null
  for (const m of sorted || []) {
    if (Number(m.t) <= time + tolerance) found = m
    else break
  }
  return found
}

/**
 * Next (direction 1) or previous (-1) marker relative to `time` (sorted input).
 * "Previous" skips a marker we are sitting on, so pressing it repeatedly walks back.
 */
export function adjacentMarker(sorted, time, direction) {
  const list = sorted || []
  if (direction > 0) return list.find((m) => Number(m.t) > time + 0.05) || null
  for (let i = list.length - 1; i >= 0; i -= 1) if (Number(list[i].t) < time - 0.25) return list[i]
  return null
}

/** New marker list after inserting/replacing one marker, kept sorted and within the limit. */
export function upsertMarker(markers, marker) {
  const rest = (markers || []).filter((m) => m.id !== marker.id)
  return sortMarkers([...rest, marker]).slice(0, MAX_MARKERS)
}

/** A suggestion from POST …/ai/video-markers accepted by the teacher. */
export function acceptSuggestion(suggestion, makeId) {
  return {
    id: suggestion.id || makeId(),
    t: Math.max(0, Number(suggestion.t) || 0),
    label: String(suggestion.label || '').slice(0, 200),
    note: String(suggestion.note || '').slice(0, 2000),
    confirmed: true,
    ai_suggested: true,
  }
}

function validBox(box) {
  if (!Array.isArray(box) || box.length !== 4) return null
  const [x0, y0, x1, y1] = box.map(Number)
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  const b = [clamp(Math.min(x0, x1), 0, 1), clamp(Math.min(y0, y1), 0, 1), clamp(Math.max(x0, x1), 0, 1), clamp(Math.max(y0, y1), 0, 1)]
  return b[2] - b[0] > 0 && b[3] - b[1] > 0 ? b : null
}

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Prepare a VideoTrack for fast lookup: frames sorted by time, boxes validated, and the
 * largest time gap at which a sample is still considered "this moment".
 */
export function prepareTrack(track) {
  const frames = (track?.frames || [])
    .filter((f) => f && Number.isFinite(Number(f.t)))
    .map((f) => ({ t: Number(f.t), boxes: (f.boxes || []).map(validBox).filter(Boolean) }))
    .sort((a, b) => a.t - b.t)
  const gaps = []
  for (let i = 1; i < frames.length; i += 1) gaps.push(frames[i].t - frames[i - 1].t)
  return {
    id: track?.id,
    phrase: track?.phrase || '',
    frames,
    maxGap: Math.max(0.35, median(gaps) * 1.5),
    withObjects: frames.filter((f) => f.boxes.length).length,
  }
}

/** Boxes of the sample nearest to t, or [] when the nearest sample is too far away. */
export function boxesAt(prepared, t) {
  const frames = prepared?.frames || []
  if (!frames.length || !Number.isFinite(t)) return []
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t < t) lo = mid + 1
    else hi = mid
  }
  let best = lo
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) <= Math.abs(frames[lo].t - t)) best = lo - 1
  return Math.abs(frames[best].t - t) <= prepared.maxGap ? frames[best].boxes : []
}

/** Content box of media shown with `object-fit: contain` inside a box of boxW × boxH. */
export function containRect(boxW, boxH, mediaW, mediaH) {
  if (!(boxW > 0 && boxH > 0)) return { x: 0, y: 0, width: 0, height: 0 }
  if (!(mediaW > 0 && mediaH > 0)) return { x: 0, y: 0, width: boxW, height: boxH }
  const scale = Math.min(boxW / mediaW, boxH / mediaH)
  const width = mediaW * scale
  const height = mediaH * scale
  return { x: (boxW - width) / 2, y: (boxH - height) / 2, width, height }
}

/**
 * May frame-synced overlays (SAM boxes, masks) be drawn over the video right now?
 * Only when the element shows a decoded frame for its current time: it has data for the
 * current position (readyState ≥ HAVE_CURRENT_DATA = 2) and the poster is gone. Browsers keep
 * showing the poster (captured at another moment, e.g. 1 s) until the first play or seek, even
 * when frames are already loaded, so `frameShown` must be set by the player on play/seeked.
 */
export function overlayFrameReady({ readyState = 0, poster = '' } = {}, frameShown = false) {
  if (!(Number(readyState) >= 2)) return false
  return Boolean(frameShown) || !poster
}

/** x of a label `width` wide that starts at the box's left edge but stays inside 0..canvasWidth. */
export function labelX(boxX, width, canvasWidth) {
  const maxX = Math.max(0, canvasWidth - width)
  return Math.max(0, Math.min(boxX, maxX))
}

/** Normalized point (0..1 of the picture) for a position inside the element, or null outside the picture. */
export function pointInMedia(px, py, rect) {
  if (!rect || !(rect.width > 0 && rect.height > 0)) return null
  const x = (px - rect.x) / rect.width
  const y = (py - rect.y) / rect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) }
}

/** Pixel rectangle (relative to the content rect's parent) of a normalized box. */
export function boxToRect(box, rect) {
  const [x0, y0, x1, y1] = box
  return { x: rect.x + x0 * rect.width, y: rect.y + y0 * rect.height, width: (x1 - x0) * rect.width, height: (y1 - y0) * rect.height }
}

/** Size of a captured frame: same aspect ratio, longest side at most `max` pixels. */
export function captureSize(width, height, max = 1280) {
  const w = Math.max(1, Math.round(Number(width) || 0))
  const h = Math.max(1, Math.round(Number(height) || 0))
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** SAM points in pixels of the uploaded frame (PointIn[] of the segment-frame API). */
export function pointsToPixels(points, width, height) {
  return (points || []).slice(0, MAX_POINTS).map((p) => ({
    x: Math.round(clamp(p.x, 0, 1) * (width - 1)),
    y: Math.round(clamp(p.y, 0, 1) * (height - 1)),
    negative: Boolean(p.negative),
  }))
}

/** Normalized [x0,y0,x1,y1] from an inclusive SAM pixel box. */
export function normalizeSamBox(box, width, height) {
  const [x1, y1, x2, y2] = box
  return [x1 / width, y1 / height, (x2 + 1) / width, (y2 + 1) / height].map((v) => clamp(Number(v.toFixed(4)), 0, 1))
}

/**
 * Turn a SegmentOut for one paused frame into a one-frame VideoTrack ("snapshot"),
 * so the highlight is kept in the lesson at that moment only.
 */
export function snapshotTrack({ id, phrase, t, result }) {
  const width = result?.width || 0
  const height = result?.height || 0
  const boxes = width && height ? (result.objects || []).slice(0, 20).map((o) => normalizeSamBox(o.box, width, height)) : []
  return { id, phrase: String(phrase || '').slice(0, 200), frames: [{ t: Math.max(0, Number(t) || 0), boxes }] }
}

/** Compare panel content for an ImageRef {source_id, page, asset_id}. */
export function compareMedia(compare, sourceById, assetById) {
  if (!compare) return null
  if (compare.asset_id) {
    const asset = assetById?.(compare.asset_id)
    return asset ? { kind: 'image', url: asset.url, title: null, asset } : { kind: 'missing' }
  }
  if (!compare.source_id) return null
  const src = sourceById?.(compare.source_id)
  if (!src) return { kind: 'missing' }
  if (src.status === 'processing') return { kind: 'processing', source: src }
  if (src.status === 'failed') return { kind: 'failed', source: src }
  if (src.kind === 'pdf' && src.urls?.page) {
    const pageCount = Number(src.page_count) || 1
    const page = clamp(Math.round(Number(compare.page) || 1), 1, pageCount)
    return { kind: 'page', url: src.urls.page.replace('{n}', String(page)), page, source: src }
  }
  if (src.kind === 'image' && src.urls?.file) return { kind: 'image', url: src.urls.file, source: src }
  if (src.kind === 'video' && src.urls?.file) return { kind: 'video', url: src.urls.file, poster: src.urls.poster, source: src }
  return { kind: 'missing' }
}

/** Live state shared with the AI tutor (env.reportState). */
export function tutorState({ time, marker, speed, loop, visibleTracks }) {
  return {
    time: Number((Number(time) || 0).toFixed(2)),
    marker: marker ? { id: marker.id, t: Number(marker.t), label: marker.label, note: marker.note || '' } : null,
    speed,
    loop: Boolean(loop),
    highlighted: visibleTracks || [],
  }
}
