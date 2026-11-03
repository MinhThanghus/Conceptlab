/**
 * Pure helpers for the interactive sports field (spec §8.4, §10.3): frame editing,
 * keyboard moves, playback interpolation and validation of AI-proposed scenarios.
 * Positions are normalized 0..1 of the playing area (see courts.js for the convention).
 */

export const MAX_FRAMES = 30
export const MAX_PLAYERS = 30
export const MAX_ARROWS = 40
export const SEGMENT_MS = 1200 // one frame → next frame during playback
export const DRAW_PHASE = 0.35 // part of a segment used to draw the frame's arrows before players move
export const KEY_STEP = 0.01 // arrow keys: 1 %
export const KEY_STEP_BIG = 0.05 // Shift + arrow keys: 5 %
export const MIN_ARROW = 0.02 // shorter drags are treated as clicks

export function clamp01(value, fallback = 0.5) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
}

const r4 = (v) => Math.round(v * 10000) / 10000

export function lerp(a, b, p) {
  return a + (b - a) * p
}

export function easeInOut(p) {
  const t = Math.min(1, Math.max(0, p))
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

export function blankFrame(id) {
  return { id, note: '', players: [], ball: { x: 0.5, y: 0.5 }, arrows: [] }
}

export function cloneFrames(frames) {
  return JSON.parse(JSON.stringify(frames || []))
}

/* ------------------------------------------------------------------ selection & moves */

/** Find the selected item ({kind: 'player'|'ball'|'arrow', id}) in a frame. */
export function findItem(frame, sel) {
  if (!frame || !sel) return null
  if (sel.kind === 'ball') return frame.ball || null
  if (sel.kind === 'player') return (frame.players || []).find((p) => p.id === sel.id) || null
  if (sel.kind === 'arrow') return (frame.arrows || []).find((a) => a.id === sel.id) || null
  return null
}

/** Put a player or the ball at (x, y). */
export function setItemPos(frame, sel, x, y) {
  const nx = r4(clamp01(x))
  const ny = r4(clamp01(y))
  if (sel?.kind === 'ball') return frame.ball ? { ...frame, ball: { x: nx, y: ny } } : frame
  if (sel?.kind === 'player') return { ...frame, players: frame.players.map((p) => (p.id === sel.id ? { ...p, x: nx, y: ny } : p)) }
  return frame
}

/** Move a whole arrow, keeping both ends inside the court (the shift is limited, not the shape). */
export function translateArrow(frame, id, dx, dy) {
  return {
    ...frame,
    arrows: frame.arrows.map((a) => {
      if (a.id !== id) return a
      const sx = Math.min(1 - Math.max(a.x1, a.x2), Math.max(-Math.min(a.x1, a.x2), dx))
      const sy = Math.min(1 - Math.max(a.y1, a.y2), Math.max(-Math.min(a.y1, a.y2), dy))
      return { ...a, x1: r4(a.x1 + sx), y1: r4(a.y1 + sy), x2: r4(a.x2 + sx), y2: r4(a.y2 + sy) }
    }),
  }
}

/** Move one end (1 = tail, 2 = head) of an arrow to (x, y). */
export function setArrowEnd(frame, id, end, x, y) {
  const nx = r4(clamp01(x))
  const ny = r4(clamp01(y))
  return { ...frame, arrows: frame.arrows.map((a) => (a.id !== id ? a : end === 1 ? { ...a, x1: nx, y1: ny } : { ...a, x2: nx, y2: ny })) }
}

/**
 * Keyboard move: players/ball move by (dx, dy); for an arrow the arrow keys move its
 * head (end point), so a run or pass can be aimed without a mouse.
 */
export function nudge(frame, sel, dx, dy) {
  const item = findItem(frame, sel)
  if (!item) return frame
  if (sel.kind === 'arrow') return setArrowEnd(frame, sel.id, 2, item.x2 + dx, item.y2 + dy)
  return setItemPos(frame, sel, item.x + dx, item.y + dy)
}

export function removeItem(frame, sel) {
  if (!sel) return frame
  if (sel.kind === 'ball') return { ...frame, ball: null }
  if (sel.kind === 'player') return { ...frame, players: frame.players.filter((p) => p.id !== sel.id) }
  if (sel.kind === 'arrow') return { ...frame, arrows: frame.arrows.filter((a) => a.id !== sel.id) }
  return frame
}

/** Smallest positive number not yet used as a label by that team. */
export function nextLabel(players, team) {
  const used = new Set((players || []).filter((p) => p.team === team).map((p) => String(p.label)))
  for (let n = 1; n < 100; n += 1) if (!used.has(String(n))) return String(n)
  return ''
}

/** A free spot for a new player: team A starts on the left half, team B on the right. */
export function spawnPosition(players, team) {
  const baseX = team === 'B' ? 0.7 : 0.3
  const taken = (players || []).map((p) => [p.x, p.y])
  const candidates = []
  for (let ring = 0; ring < 6; ring += 1) {
    for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
      for (const dx of ring === 0 ? [0] : [-ring, ring]) candidates.push([baseX + dx * 0.06, 0.5 + dy * 0.12])
    }
  }
  const free = candidates.find(([x, y]) => x >= 0.03 && x <= 0.97 && y >= 0.05 && y <= 0.95 && taken.every(([px, py]) => Math.hypot(px - x, py - y) > 0.055))
  const [x, y] = free || [baseX, 0.5]
  return { x: r4(x), y: r4(y) }
}

export function addPlayer(frame, team, id) {
  if ((frame.players || []).length >= MAX_PLAYERS) return frame
  const pos = spawnPosition(frame.players, team)
  return { ...frame, players: [...(frame.players || []), { id, team, label: nextLabel(frame.players, team), ...pos }] }
}

export function addArrow(frame, arrow) {
  if ((frame.arrows || []).length >= MAX_ARROWS) return frame
  return {
    ...frame,
    arrows: [
      ...(frame.arrows || []),
      { id: arrow.id, kind: arrow.kind === 'pass' ? 'pass' : 'run', x1: r4(clamp01(arrow.x1)), y1: r4(clamp01(arrow.y1)), x2: r4(clamp01(arrow.x2)), y2: r4(clamp01(arrow.y2)) },
    ],
  }
}

export function arrowLength(a) {
  return Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
}

/**
 * Keyboard/touch alternative to drawing: a run arrow from a player, pointing towards the
 * far side of the court for their team (or inward when near the edge).
 */
export function runFromPlayer(player, id) {
  const dir = player.team === 'B' ? -1 : 1
  let x2 = player.x + dir * 0.12
  if (x2 > 0.98 || x2 < 0.02) x2 = player.x - dir * 0.12
  return { id, kind: 'run', x1: player.x, y1: player.y, x2: r4(clamp01(x2)), y2: player.y }
}

export function passBetween(from, to, id) {
  return { id, kind: 'pass', x1: from.x, y1: from.y, x2: to.x, y2: to.y }
}

/* ------------------------------------------------------------------ frames */

/**
 * The next step of a scenario: a copy of the frame in which every player follows the run
 * arrow that starts at them and the ball follows the pass that starts at it. Arrows are not
 * copied (they described the move that has now happened). Player ids stay the same so
 * playback can animate each player.
 */
export function advanceFrame(frame, id, near = 0.045) {
  const runs = (frame.arrows || []).filter((a) => a.kind === 'run')
  const passes = (frame.arrows || []).filter((a) => a.kind === 'pass')
  const usedRuns = new Set()
  const players = (frame.players || []).map((p) => {
    let best = null
    let bestD = near
    for (const a of runs) {
      const d = Math.hypot(a.x1 - p.x, a.y1 - p.y)
      if (d <= bestD && !usedRuns.has(a.id)) {
        best = a
        bestD = d
      }
    }
    if (!best) return { ...p }
    usedRuns.add(best.id)
    return { ...p, x: best.x2, y: best.y2 }
  })
  let ball = frame.ball ? { ...frame.ball } : null
  if (ball) {
    const pass = passes
      .map((a) => ({ a, d: Math.hypot(a.x1 - ball.x, a.y1 - ball.y) }))
      .filter((c) => c.d <= near)
      .sort((p, q) => p.d - q.d)[0]
    if (pass) ball = { x: pass.a.x2, y: pass.a.y2 }
  }
  return { id, note: '', players, ball, arrows: [] }
}

export function moveFrame(frames, index, delta) {
  const j = index + delta
  if (index < 0 || j < 0 || index >= frames.length || j >= frames.length) return frames
  const next = [...frames]
  ;[next[index], next[j]] = [next[j], next[index]]
  return next
}

/* ------------------------------------------------------------------ playback */

/** Which segment of a playback we are in: {index, progress (0..1), done}. */
export function playbackAt(elapsedMs, frameCount, segmentMs = SEGMENT_MS) {
  if (frameCount <= 1) return { index: 0, progress: 0, done: true }
  const total = (frameCount - 1) * segmentMs
  if (elapsedMs >= total) return { index: frameCount - 1, progress: 0, done: true }
  const t = Math.max(0, elapsedMs)
  return { index: Math.floor(t / segmentMs), progress: (t % segmentMs) / segmentMs, done: false }
}

function matchPlayer(p, candidates, used) {
  let found = candidates.find((c) => c.id === p.id && !used.has(c))
  if (!found && p.label) found = candidates.find((c) => c.team === p.team && String(c.label) === String(p.label) && !used.has(c))
  return found || null
}

/**
 * Display state between frame a and frame b. During the first DRAW_PHASE of the segment
 * the arrows of frame a are drawn progressively; then players and ball glide to b.
 * Players that only exist in one of the two frames fade out / in.
 */
export function interpolateFrames(a, b, progress) {
  const drawP = Math.min(1, progress / DRAW_PHASE)
  const moveP = easeInOut(progress <= DRAW_PHASE ? 0 : (progress - DRAW_PHASE) / (1 - DRAW_PHASE))
  const used = new Set()
  const players = []
  for (const pa of a.players || []) {
    const pb = matchPlayer(pa, b.players || [], used)
    if (pb) {
      used.add(pb)
      players.push({ ...pa, x: lerp(pa.x, pb.x, moveP), y: lerp(pa.y, pb.y, moveP), opacity: 1 })
    } else {
      players.push({ ...pa, opacity: 1 - moveP })
    }
  }
  for (const pb of b.players || []) if (!used.has(pb)) players.push({ ...pb, id: `${pb.id}~in`, opacity: moveP })
  let ball = null
  if (a.ball && b.ball) ball = { x: lerp(a.ball.x, b.ball.x, moveP), y: lerp(a.ball.y, b.ball.y, moveP), opacity: 1 }
  else if (a.ball) ball = { ...a.ball, opacity: 1 - moveP }
  else if (b.ball) ball = { ...b.ball, opacity: moveP }
  const arrows = (a.arrows || []).map((ar) => ({ ...ar, x2: lerp(ar.x1, ar.x2, drawP), y2: lerp(ar.y1, ar.y2, drawP), opacity: 1 }))
  return { id: a.id, note: a.note, players, ball, arrows }
}

/**
 * Frame to show at `elapsedMs` of a playback. With reduced motion the frames are shown one
 * after another without in-between positions.
 */
export function frameAtPlayback(frames, elapsedMs, { reducedMotion = false, segmentMs = SEGMENT_MS } = {}) {
  const { index, progress, done } = playbackAt(elapsedMs, frames.length, segmentMs)
  if (done || reducedMotion || !frames[index + 1]) return { index, frame: frames[index], done }
  return { index, frame: interpolateFrames(frames[index], frames[index + 1], progress), done }
}

/* ------------------------------------------------------------------ validation */

let seq = 0
const fallbackId = (prefix) => {
  seq += 1
  return `${prefix}_${seq.toString(36)}`
}

/**
 * Clean frames from an untrusted source (AI scenario, older data): clamps coordinates,
 * enforces limits, fixes ids, labels and kinds. Player ids are kept so playback can
 * follow the same player across frames.
 */
export function sanitizeFrames(frames, makeId = fallbackId) {
  if (!Array.isArray(frames)) return []
  const frameIds = new Set()
  return frames
    .filter((f) => f && typeof f === 'object')
    .slice(0, MAX_FRAMES)
    .map((f) => {
      let id = typeof f.id === 'string' && f.id && f.id.length <= 40 ? f.id : makeId('f')
      if (frameIds.has(id)) id = makeId('f')
      frameIds.add(id)
      const playerIds = new Set()
      const players = (Array.isArray(f.players) ? f.players : [])
        .filter((p) => p && typeof p === 'object')
        .slice(0, MAX_PLAYERS)
        .map((p) => {
          let pid = typeof p.id === 'string' && p.id && p.id.length <= 40 ? p.id : makeId('p')
          if (playerIds.has(pid)) pid = makeId('p')
          playerIds.add(pid)
          return { id: pid, team: p.team === 'B' ? 'B' : 'A', label: String(p.label ?? '').slice(0, 4), x: r4(clamp01(p.x)), y: r4(clamp01(p.y)) }
        })
      const arrowIds = new Set()
      const arrows = (Array.isArray(f.arrows) ? f.arrows : [])
        .filter((a) => a && typeof a === 'object')
        .slice(0, MAX_ARROWS)
        .map((a) => {
          let aid = typeof a.id === 'string' && a.id && a.id.length <= 40 ? a.id : makeId('a')
          if (arrowIds.has(aid)) aid = makeId('a')
          arrowIds.add(aid)
          return { id: aid, kind: a.kind === 'pass' ? 'pass' : 'run', x1: r4(clamp01(a.x1)), y1: r4(clamp01(a.y1)), x2: r4(clamp01(a.x2)), y2: r4(clamp01(a.y2)) }
        })
      const ball = f.ball && typeof f.ball === 'object' ? { x: r4(clamp01(f.ball.x)), y: r4(clamp01(f.ball.y)) } : null
      return { id, note: String(f.note ?? '').slice(0, 2000), players, ball, arrows }
    })
}

/* ------------------------------------------------------------------ tutor */

const pct = (v) => Math.round(v * 100)

/** Live state for the AI tutor (env.reportState): positions in % of length/width. */
export function tutorState({ sport, frame, index, total, solutionVisible }) {
  return {
    sport,
    frame: index + 1,
    frames: total,
    note: frame?.note || '',
    players: (frame?.players || []).map((p) => ({ team: p.team, label: p.label, x: pct(p.x), y: pct(p.y) })),
    ball: frame?.ball ? { x: pct(frame.ball.x), y: pct(frame.ball.y) } : null,
    arrows: (frame?.arrows || []).map((a) => ({ kind: a.kind, from: [pct(a.x1), pct(a.y1)], to: [pct(a.x2), pct(a.y2)] })),
    solution_visible: Boolean(solutionVisible),
    units: 'percent of court length (x) and width (y)',
  }
}
