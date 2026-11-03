/**
 * Geometry for the SAM object selector (pure; unit-tested).
 * Image coordinates are natural pixels of the media; boxes are [x1, y1, x2, y2].
 */

export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value))
}

/**
 * Pointer position → natural image pixels, given the displayed image rect
 * (from getBoundingClientRect) and the natural image size.
 */
export function clientToImage(clientX, clientY, rect, imageWidth, imageHeight) {
  if (!rect || !rect.width || !rect.height || !imageWidth || !imageHeight) return null
  const x = ((clientX - rect.left) / rect.width) * imageWidth
  const y = ((clientY - rect.top) / rect.height) * imageHeight
  return { x: Math.round(clamp(x, 0, imageWidth - 1)), y: Math.round(clamp(y, 0, imageHeight - 1)) }
}

/** Two corner points → ordered integer box [x1, y1, x2, y2]. */
export function boxFromPoints(a, b) {
  if (!a || !b) return null
  return [Math.round(Math.min(a.x, b.x)), Math.round(Math.min(a.y, b.y)), Math.round(Math.max(a.x, b.x)), Math.round(Math.max(a.y, b.y))]
}

/** A box is usable when it spans at least `minSize` pixels in both directions. */
export function boxIsUsable(box, minSize = 6) {
  return Array.isArray(box) && box.length === 4 && box[2] - box[0] >= minSize && box[3] - box[1] >= minSize
}

/** Box (inclusive pixels) → CSS percentages for an overlay on the displayed image. */
export function boxToPercent(box, imageWidth, imageHeight) {
  if (!Array.isArray(box) || !imageWidth || !imageHeight) return null
  const [x1, y1, x2, y2] = box
  return {
    left: (x1 / imageWidth) * 100,
    top: (y1 / imageHeight) * 100,
    width: ((x2 - x1 + 1) / imageWidth) * 100,
    height: ((y2 - y1 + 1) / imageHeight) * 100,
  }
}

/** Point (pixels) → CSS percentages. */
export function pointToPercent(point, imageWidth, imageHeight) {
  if (!point || !imageWidth || !imageHeight) return null
  return { left: (point.x / imageWidth) * 100, top: (point.y / imageHeight) * 100 }
}

/**
 * Keyboard cursor: arrow keys move by 2% of the image (Shift: 10%).
 * Returns the new cursor or null when the key is not an arrow key.
 */
export function moveCursor(cursor, key, imageWidth, imageHeight, big = false) {
  const stepX = Math.max(1, Math.round(imageWidth * (big ? 0.1 : 0.02)))
  const stepY = Math.max(1, Math.round(imageHeight * (big ? 0.1 : 0.02)))
  const c = cursor || { x: Math.round(imageWidth / 2), y: Math.round(imageHeight / 2) }
  const moves = { ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, -stepY], ArrowDown: [0, stepY] }
  const delta = moves[key]
  if (!delta) return null
  return { x: clamp(c.x + delta[0], 0, imageWidth - 1), y: clamp(c.y + delta[1], 0, imageHeight - 1) }
}

/**
 * Map a point from one pixel space to another (e.g. the natural size of the displayed page
 * image → the size of the media the server segments).
 */
export function scalePoint(point, from, to) {
  if (!point || !from?.width || !from?.height || !to?.width || !to?.height) return point
  return {
    ...point,
    x: Math.round(clamp((point.x / from.width) * to.width, 0, to.width - 1)),
    y: Math.round(clamp((point.y / from.height) * to.height, 0, to.height - 1)),
  }
}

export function scaleBox(box, from, to) {
  if (!Array.isArray(box) || !from?.width || !from?.height || !to?.width || !to?.height) return box
  const sx = to.width / from.width
  const sy = to.height / from.height
  return [
    Math.round(clamp(box[0] * sx, 0, to.width - 1)),
    Math.round(clamp(box[1] * sy, 0, to.height - 1)),
    Math.round(clamp(box[2] * sx, 0, to.width - 1)),
    Math.round(clamp(box[3] * sy, 0, to.height - 1)),
  ]
}

/** Objects sorted by confidence (unknown last), then by area (largest first). */
export function rankObjects(objects) {
  const area = (o) => (o.box ? (o.box[2] - o.box[0] + 1) * (o.box[3] - o.box[1] + 1) : 0)
  return [...(objects || [])].sort((a, b) => {
    const ca = typeof a.confidence === 'number' ? a.confidence : -1
    const cb = typeof b.confidence === 'number' ? b.confidence : -1
    if (cb !== ca) return cb - ca
    return area(b) - area(a)
  })
}
