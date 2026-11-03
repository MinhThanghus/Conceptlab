/**
 * Court templates with official proportions, in metres (spec §8.4).
 *
 * Coordinate convention shared with the Lab spec (FieldPlayer / FieldArrow / Point):
 *   normalized (0, 0) = top-left corner of the playing-area lines,
 *   normalized (1, 1) = bottom-right corner;
 *   x runs along the LENGTH (left goal/end line → right), y across the WIDTH.
 * The drawing adds a margin (run-off / free zone) around the lines for goals, nets and posts.
 *
 * `courtShapes(sport)` returns plain shape descriptors (rect/line/circle/path) that the
 * board renders as SVG; CSS classes give each sport its surface and line colours.
 */

export const SPORTS = ['football', 'futsal', 'volleyball', 'basketball', 'badminton']

export const COURTS = {
  football: { length: 105, width: 68, margin: 4 }, // FIFA standard pitch
  futsal: { length: 40, width: 20, margin: 2 }, // FIFA futsal (international 38–42 × 20–25)
  volleyball: { length: 18, width: 9, margin: 3 }, // FIVB court + 3 m free zone
  basketball: { length: 28, width: 15, margin: 2 }, // FIBA
  badminton: { length: 13.4, width: 6.1, margin: 1.2 }, // BWF doubles court
}

export function courtOf(sport) {
  return COURTS[sport] || COURTS.football
}

/** SVG viewBox (metres) including the margin. */
export function viewBox(sport) {
  const c = courtOf(sport)
  return { x: -c.margin, y: -c.margin, width: c.length + 2 * c.margin, height: c.width + 2 * c.margin }
}

/** Normalized (0..1) → metres. */
export function toMeters(sport, x, y) {
  const c = courtOf(sport)
  return { x: x * c.length, y: y * c.width }
}

/** Metres → normalized, clamped to the playing area. */
export function toNormalized(sport, mx, my) {
  const c = courtOf(sport)
  const clamp = (v) => Math.min(1, Math.max(0, v))
  return { x: clamp(mx / c.length), y: clamp(my / c.width) }
}

const round = (v) => Math.round(v * 1000) / 1000

/** Point on a circle; angles in degrees, measured clockwise on screen from +x (SVG y points down). */
export function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180
  return { x: round(cx + r * Math.cos(a)), y: round(cy + r * Math.sin(a)) }
}

/** "A" path segment from angle a0 to a1 (the caller has already moved to polar(a0)). */
export function arcTo(cx, cy, r, a0, a1) {
  const end = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `A ${round(r)} ${round(r)} 0 ${large} ${sweep} ${end.x} ${end.y}`
}

/** Complete arc path from angle a0 to a1. */
export function arcPath(cx, cy, r, a0, a1) {
  const start = polar(cx, cy, r, a0)
  return `M ${start.x} ${start.y} ${arcTo(cx, cy, r, a0, a1)}`
}

const rect = (x, y, w, h, cls) => ({ type: 'rect', x: round(x), y: round(y), w: round(w), h: round(h), cls })
const line = (x1, y1, x2, y2, cls = 'fb-line') => ({ type: 'line', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), cls })
const circle = (cx, cy, r, cls = 'fb-line') => ({ type: 'circle', cx: round(cx), cy: round(cy), r: round(r), cls })
const path = (d, cls = 'fb-line') => ({ type: 'path', d, cls })

function football() {
  const L = 105
  const W = 68
  const cy = W / 2
  const shapes = [rect(0, 0, L, W, 'fb-surface')]
  for (let i = 0; i < 10; i += 2) shapes.push(rect((i * L) / 10, 0, L / 10, W, 'fb-stripe'))
  const goalW = 7.32
  const penW = 16.5 * 2 + goalW // 40.32
  const goalAreaW = 5.5 * 2 + goalW // 18.32
  const alpha = (Math.acos(5.5 / 9.15) * 180) / Math.PI // where the penalty arc meets the area
  shapes.push(
    rect(0, 0, L, W, 'fb-line'),
    line(L / 2, 0, L / 2, W),
    circle(L / 2, cy, 9.15),
    circle(L / 2, cy, 0.3, 'fb-mark'),
    // left end
    rect(0, cy - penW / 2, 16.5, penW, 'fb-line'),
    rect(0, cy - goalAreaW / 2, 5.5, goalAreaW, 'fb-line'),
    circle(11, cy, 0.25, 'fb-mark'),
    path(arcPath(11, cy, 9.15, -alpha, alpha)),
    rect(-2, cy - goalW / 2, 2, goalW, 'fb-goal'),
    // right end
    rect(L - 16.5, cy - penW / 2, 16.5, penW, 'fb-line'),
    rect(L - 5.5, cy - goalAreaW / 2, 5.5, goalAreaW, 'fb-line'),
    circle(L - 11, cy, 0.25, 'fb-mark'),
    path(arcPath(L - 11, cy, 9.15, 180 - alpha, 180 + alpha)),
    rect(L, cy - goalW / 2, 2, goalW, 'fb-goal'),
    // corner arcs (1 m)
    path(arcPath(0, 0, 1, 0, 90)),
    path(arcPath(L, 0, 1, 90, 180)),
    path(arcPath(L, W, 1, 180, 270)),
    path(arcPath(0, W, 1, 270, 360)),
  )
  return shapes
}

function futsal() {
  const L = 40
  const W = 20
  const cy = W / 2
  const post = 1.58 // half of 3.16 m: measured from the outside of the goal posts
  const r = 6
  const leftArea = `M 0 ${round(cy - post - r)} ${arcTo(0, cy - post, r, 270, 360)} L ${r} ${round(cy + post)} ${arcTo(0, cy + post, r, 0, 90)}`
  const rightArea = `M ${L} ${round(cy - post - r)} ${arcTo(L, cy - post, r, 270, 180)} L ${L - r} ${round(cy + post)} ${arcTo(L, cy + post, r, 180, 90)}`
  return [
    rect(0, 0, L, W, 'fb-surface'),
    path(`${leftArea} Z`, 'fb-zone'),
    path(`${rightArea} Z`, 'fb-zone'),
    rect(0, 0, L, W, 'fb-line'),
    line(L / 2, 0, L / 2, W),
    circle(L / 2, cy, 3),
    circle(L / 2, cy, 0.15, 'fb-mark'),
    path(leftArea),
    path(rightArea),
    circle(6, cy, 0.15, 'fb-mark'), // penalty mark
    circle(10, cy, 0.15, 'fb-mark'), // second penalty mark
    circle(L - 6, cy, 0.15, 'fb-mark'),
    circle(L - 10, cy, 0.15, 'fb-mark'),
    rect(-1, cy - 1.5, 1, 3, 'fb-goal'),
    rect(L, cy - 1.5, 1, 3, 'fb-goal'),
    path(arcPath(0, 0, 0.25, 0, 90)),
    path(arcPath(L, 0, 0.25, 90, 180)),
    path(arcPath(L, W, 0.25, 180, 270)),
    path(arcPath(0, W, 0.25, 270, 360)),
  ]
}

function volleyball() {
  const L = 18
  const W = 9
  return [
    rect(-3, -3, L + 6, W + 6, 'fb-freezone'),
    rect(0, 0, L, W, 'fb-surface'),
    rect(6, 0, 6, W, 'fb-zone'), // front zones (between the attack lines)
    rect(0, 0, L, W, 'fb-line'),
    line(9, 0, 9, W), // centre line under the net
    line(6, 0, 6, W), // attack lines, 3 m from the centre line
    line(12, 0, 12, W),
    line(6, -1.75, 6, 0, 'fb-line-dash'), // attack-line extensions beyond the sidelines
    line(6, W, 6, W + 1.75, 'fb-line-dash'),
    line(12, -1.75, 12, 0, 'fb-line-dash'),
    line(12, W, 12, W + 1.75, 'fb-line-dash'),
    line(9, -1, 9, W + 1, 'fb-net'),
    circle(9, -1, 0.18, 'fb-post'),
    circle(9, W + 1, 0.18, 'fb-post'),
  ]
}

function basketballEnd(hoopX, dir) {
  // dir = +1 for the left basket (court extends to +x), -1 for the right one
  const L = 28
  const W = 15
  const cy = W / 2
  const endX = dir > 0 ? 0 : L
  const ftX = endX + dir * 5.8 // free-throw line
  const keyX = Math.min(endX, ftX)
  const r3 = 6.75
  const side = 0.9
  const dy = cy - side // 6.6
  const dx = Math.sqrt(r3 * r3 - dy * dy)
  const meet = hoopX + dir * dx
  const aTop = (Math.atan2(side - cy, meet - hoopX) * 180) / Math.PI
  const aBottom = (Math.atan2(W - side - cy, meet - hoopX) * 180) / Math.PI
  // left: from -77.9° to +77.9°; right: from 257.9° down to 102.1°
  const a0 = dir > 0 ? aTop : 360 + aTop
  const a1 = dir > 0 ? aBottom : aBottom
  const three = `M ${endX} ${side} L ${round(meet)} ${side} ${arcTo(hoopX, cy, r3, a0, a1)} L ${endX} ${round(W - side)}`
  const ftOuter = dir > 0 ? arcPath(ftX, cy, 1.8, -90, 90) : arcPath(ftX, cy, 1.8, 270, 90)
  const ftInner = dir > 0 ? arcPath(ftX, cy, 1.8, 90, 270) : arcPath(ftX, cy, 1.8, 90, -90)
  const boardX = endX + dir * 1.2
  const noCharge = dir > 0 ? arcPath(hoopX, cy, 1.25, -90, 90) : arcPath(hoopX, cy, 1.25, 270, 90)
  return [
    rect(keyX, cy - 2.45, 5.8, 4.9, 'fb-zone'),
    rect(keyX, cy - 2.45, 5.8, 4.9, 'fb-line'),
    path(ftOuter),
    path(ftInner, 'fb-line-dash'),
    path(three),
    path(noCharge),
    line(boardX, cy - 0.9, boardX, cy + 0.9, 'fb-board'),
    line(boardX, cy, hoopX - dir * 0.225, cy, 'fb-hoop'),
    circle(hoopX, cy, 0.225, 'fb-hoop'),
  ]
}

function basketball() {
  const L = 28
  const W = 15
  return [
    rect(0, 0, L, W, 'fb-surface'),
    ...basketballEnd(1.575, 1).filter((s) => s.cls === 'fb-zone'),
    ...basketballEnd(L - 1.575, -1).filter((s) => s.cls === 'fb-zone'),
    rect(0, 0, L, W, 'fb-line'),
    line(L / 2, 0, L / 2, W),
    circle(L / 2, W / 2, 1.8),
    ...basketballEnd(1.575, 1).filter((s) => s.cls !== 'fb-zone'),
    ...basketballEnd(L - 1.575, -1).filter((s) => s.cls !== 'fb-zone'),
  ]
}

function badminton() {
  const L = 13.4
  const W = 6.1
  const net = L / 2 // 6.7
  const shortL = net - 1.98 // 4.72
  const shortR = net + 1.98 // 8.68
  return [
    rect(0, 0, L, W, 'fb-surface'),
    rect(0, 0, L, W, 'fb-line'),
    line(0, 0.46, L, 0.46), // singles sidelines
    line(0, W - 0.46, L, W - 0.46),
    line(0.76, 0, 0.76, W), // doubles long service lines
    line(L - 0.76, 0, L - 0.76, W),
    line(shortL, 0, shortL, W), // short service lines
    line(shortR, 0, shortR, W),
    line(0, W / 2, shortL, W / 2), // centre lines
    line(shortR, W / 2, L, W / 2),
    line(net, -0.3, net, W + 0.3, 'fb-net'),
    circle(net, 0, 0.12, 'fb-post'),
    circle(net, W, 0.12, 'fb-post'),
  ]
}

const BUILDERS = { football, futsal, volleyball, basketball, badminton }
const cache = new Map()

/** Shape descriptors for a sport (cached — the geometry never changes). */
export function courtShapes(sport) {
  const key = BUILDERS[sport] ? sport : 'football'
  if (!cache.has(key)) cache.set(key, BUILDERS[key]())
  return cache.get(key)
}
