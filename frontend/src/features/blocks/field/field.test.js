import { describe, expect, it } from 'vitest'
import { arcPath, COURTS, courtShapes, polar, toMeters, toNormalized, viewBox } from './courts.js'
import {
  addArrow,
  addPlayer,
  advanceFrame,
  arrowLength,
  easeInOut,
  frameAtPlayback,
  interpolateFrames,
  MAX_ARROWS,
  MAX_PLAYERS,
  moveFrame,
  nextLabel,
  nudge,
  passBetween,
  playbackAt,
  removeItem,
  runFromPlayer,
  sanitizeFrames,
  setArrowEnd,
  setItemPos,
  spawnPosition,
  translateArrow,
  tutorState,
} from './fieldUtils.js'

const close = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

describe('court templates keep official proportions', () => {
  it('uses the official playing-area sizes', () => {
    expect(COURTS.football).toMatchObject({ length: 105, width: 68 })
    expect(COURTS.futsal).toMatchObject({ length: 40, width: 20 })
    expect(COURTS.volleyball).toMatchObject({ length: 18, width: 9 })
    expect(COURTS.basketball).toMatchObject({ length: 28, width: 15 })
    expect(COURTS.badminton).toMatchObject({ length: 13.4, width: 6.1 })
    expect(viewBox('volleyball')).toEqual({ x: -3, y: -3, width: 24, height: 15 })
  })

  it('football: centre circle, penalty and goal areas, goals', () => {
    const s = courtShapes('football')
    expect(s.find((x) => x.type === 'circle' && x.r === 9.15)).toMatchObject({ cx: 52.5, cy: 34 })
    const penalty = s.filter((x) => x.type === 'rect' && x.cls === 'fb-line' && x.w === 16.5)
    expect(penalty).toHaveLength(2)
    expect(penalty[0].h).toBeCloseTo(40.32, 3)
    expect(penalty[0].y).toBeCloseTo(13.84, 3)
    const goalArea = s.filter((x) => x.type === 'rect' && x.cls === 'fb-line' && x.w === 5.5)
    expect(goalArea[0].h).toBeCloseTo(18.32, 3)
    const goals = s.filter((x) => x.cls === 'fb-goal')
    expect(goals.map((g) => g.h)).toEqual([7.32, 7.32])
    expect(s.find((x) => x.type === 'line' && x.x1 === 52.5)).toMatchObject({ y1: 0, y2: 68 })
    // the penalty arc starts and ends on the edge of the penalty area (16.5 m)
    const arc = s.find((x) => x.type === 'path' && x.d.startsWith('M 16.5'))
    expect(arc).toBeTruthy()
  })

  it('futsal: 6 m penalty area arcs from the posts and both penalty marks', () => {
    const s = courtShapes('futsal')
    const area = s.find((x) => x.cls === 'fb-line' && x.type === 'path' && x.d.startsWith('M 0 2.42'))
    expect(area.d).toContain('L 6 11.58')
    expect(s.filter((x) => x.cls === 'fb-mark').map((m) => m.cx).sort((a, b) => a - b)).toEqual([6, 10, 20, 30, 34])
    expect(s.filter((x) => x.cls === 'fb-goal').every((g) => g.h === 3)).toBe(true)
  })

  it('volleyball: net over the centre line and 3 m attack lines', () => {
    const s = courtShapes('volleyball')
    const xs = s.filter((x) => x.type === 'line' && x.cls === 'fb-line').map((l) => l.x1)
    expect(xs).toEqual(expect.arrayContaining([6, 9, 12]))
    expect(s.find((x) => x.cls === 'fb-net')).toMatchObject({ x1: 9, x2: 9 })
  })

  it('basketball: key, 6.75 m three-point arcs and hoops 1.575 m from the end line', () => {
    const s = courtShapes('basketball')
    const hoops = s.filter((x) => x.type === 'circle' && x.cls === 'fb-hoop')
    expect(hoops.map((h) => h.cx)).toEqual([1.575, 26.425])
    const keys = s.filter((x) => x.type === 'rect' && x.cls === 'fb-line' && x.w === 5.8)
    expect(keys).toHaveLength(2)
    expect(keys[0].h).toBeCloseTo(4.9, 3)
    const three = s.find((x) => x.type === 'path' && x.d.startsWith('M 0 0.9'))
    expect(three.d).toContain('A 6.75 6.75')
    expect(three.d.endsWith('L 0 14.1')).toBe(true)
  })

  it('badminton: singles lines 0.46 m in, short service lines 1.98 m from the net', () => {
    const s = courtShapes('badminton')
    const vertical = s.filter((x) => x.type === 'line' && x.cls === 'fb-line' && x.x1 === x.x2).map((l) => l.x1)
    expect(vertical).toEqual(expect.arrayContaining([0.76, 4.72, 8.68, 12.64]))
    const horizontal = s.filter((x) => x.type === 'line' && x.cls === 'fb-line' && x.y1 === x.y2).map((l) => l.y1)
    expect(horizontal).toEqual(expect.arrayContaining([0.46, 5.64, 3.05]))
    expect(s.find((x) => x.cls === 'fb-net')).toMatchObject({ x1: 6.7 })
  })

  it('arc helpers and coordinate conversion', () => {
    expect(polar(0, 0, 2, 90)).toEqual({ x: 0, y: 2 })
    expect(arcPath(0, 0, 1, 0, 90)).toBe('M 1 0 A 1 1 0 0 1 0 1')
    expect(arcPath(0, 0, 1, 90, 0)).toBe('M 0 1 A 1 1 0 0 0 1 0')
    expect(toMeters('football', 0.5, 0.5)).toEqual({ x: 52.5, y: 34 })
    expect(toNormalized('volleyball', -2, 4.5)).toEqual({ x: 0, y: 0.5 })
    expect(courtShapes('unknown')).toBe(courtShapes('football'))
  })
})

describe('editing frames', () => {
  const frame = {
    id: 'f1',
    note: '',
    players: [
      { id: 'a1', team: 'A', label: '1', x: 0.2, y: 0.5 },
      { id: 'b1', team: 'B', label: '1', x: 0.8, y: 0.5 },
    ],
    ball: { x: 0.2, y: 0.5 },
    arrows: [{ id: 'r1', kind: 'run', x1: 0.5, y1: 0.5, x2: 0.9, y2: 0.95 }],
  }

  it('moves players and the ball, clamped to the court', () => {
    const moved = setItemPos(frame, { kind: 'player', id: 'a1' }, 1.4, -0.2)
    expect(moved.players[0]).toMatchObject({ x: 1, y: 0 })
    expect(moved.players[1]).toBe(frame.players[1])
    expect(nudge(frame, { kind: 'ball' }, 0.05, 0).ball).toEqual({ x: 0.25, y: 0.5 })
    expect(setItemPos({ ...frame, ball: null }, { kind: 'ball' }, 0.1, 0.1).ball).toBeNull()
  })

  it('aims an arrow head with the keyboard and keeps translated arrows inside', () => {
    expect(nudge(frame, { kind: 'arrow', id: 'r1' }, 0.01, 0).arrows[0]).toMatchObject({ x1: 0.5, x2: 0.91 })
    const t = translateArrow(frame, 'r1', 0.5, 0.5).arrows[0]
    expect(t).toMatchObject({ x1: 0.6, y1: 0.55, x2: 1, y2: 1 })
    expect(setArrowEnd(frame, 'r1', 1, -1, 0.3).arrows[0]).toMatchObject({ x1: 0, y1: 0.3 })
  })

  it('removes the selected item', () => {
    expect(removeItem(frame, { kind: 'player', id: 'b1' }).players).toHaveLength(1)
    expect(removeItem(frame, { kind: 'ball' }).ball).toBeNull()
    expect(removeItem(frame, { kind: 'arrow', id: 'r1' }).arrows).toHaveLength(0)
    expect(removeItem(frame, null)).toBe(frame)
  })

  it('adds players with free labels and positions, up to the limit', () => {
    expect(nextLabel(frame.players, 'A')).toBe('2')
    expect(nextLabel([], 'B')).toBe('1')
    const next = addPlayer(frame, 'A', 'a2')
    const added = next.players.at(-1)
    expect(added).toMatchObject({ id: 'a2', team: 'A', label: '2' })
    expect(Math.hypot(added.x - 0.2, added.y - 0.5)).toBeGreaterThan(0.05)
    const full = { ...frame, players: Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: `p${i}`, team: 'A', label: `${i}`, x: 0.5, y: 0.5 })) }
    expect(addPlayer(full, 'B', 'x')).toBe(full)
    const spot = spawnPosition([], 'B')
    expect(spot).toEqual({ x: 0.7, y: 0.5 })
  })

  it('adds arrows (clamped, limited) and offers keyboard alternatives to drawing', () => {
    const a = addArrow(frame, { id: 'p1', kind: 'pass', x1: 0.2, y1: 0.5, x2: 1.3, y2: 0.4 })
    expect(a.arrows.at(-1)).toEqual({ id: 'p1', kind: 'pass', x1: 0.2, y1: 0.5, x2: 1, y2: 0.4 })
    const full = { ...frame, arrows: Array.from({ length: MAX_ARROWS }, (_, i) => ({ id: `${i}`, kind: 'run', x1: 0, y1: 0, x2: 1, y2: 1 })) }
    expect(addArrow(full, { id: 'z', kind: 'run', x1: 0, y1: 0, x2: 1, y2: 1 })).toBe(full)
    const run = runFromPlayer(frame.players[1], 'r9')
    expect(run).toMatchObject({ kind: 'run', x1: 0.8, x2: 0.68 })
    expect(runFromPlayer({ team: 'A', x: 0.95, y: 0.2 }, 'r').x2).toBeCloseTo(0.83, 4)
    expect(passBetween(frame.players[0], frame.players[1], 'p').x2).toBe(0.8)
    expect(arrowLength({ x1: 0, y1: 0, x2: 0.3, y2: 0.4 })).toBeCloseTo(0.5, 6)
  })

  it('creates the next frame by following run and pass arrows', () => {
    const f = {
      id: 'f1',
      note: 'start',
      players: [
        { id: 'a1', team: 'A', label: '1', x: 0.2, y: 0.5 },
        { id: 'a2', team: 'A', label: '2', x: 0.4, y: 0.2 },
      ],
      ball: { x: 0.21, y: 0.5 },
      arrows: [
        { id: 'r', kind: 'run', x1: 0.41, y1: 0.2, x2: 0.6, y2: 0.3 },
        { id: 'p', kind: 'pass', x1: 0.2, y1: 0.5, x2: 0.6, y2: 0.3 },
        { id: 'far', kind: 'run', x1: 0.9, y1: 0.9, x2: 0.1, y2: 0.1 },
      ],
    }
    const next = advanceFrame(f, 'f2')
    expect(next.id).toBe('f2')
    expect(next.arrows).toEqual([])
    expect(next.note).toBe('')
    expect(next.players.find((p) => p.id === 'a2')).toMatchObject({ x: 0.6, y: 0.3 })
    expect(next.players.find((p) => p.id === 'a1')).toMatchObject({ x: 0.2, y: 0.5 })
    expect(next.ball).toEqual({ x: 0.6, y: 0.3 })
  })

  it('reorders frames safely', () => {
    expect(moveFrame(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
    const same = ['a', 'b']
    expect(moveFrame(same, 1, 1)).toBe(same)
  })
})

describe('playback', () => {
  const a = {
    id: 'f1',
    players: [
      { id: 'p1', team: 'A', label: '7', x: 0, y: 0 },
      { id: 'gone', team: 'B', label: '2', x: 0.5, y: 0.5 },
    ],
    ball: { x: 0, y: 0 },
    arrows: [{ id: 'r', kind: 'run', x1: 0, y1: 0, x2: 1, y2: 1 }],
  }
  const b = {
    id: 'f2',
    players: [
      { id: 'other-id', team: 'A', label: '7', x: 1, y: 1 },
      { id: 'new', team: 'B', label: '9', x: 0.3, y: 0.3 },
    ],
    ball: null,
    arrows: [],
  }

  it('splits elapsed time into segments', () => {
    expect(playbackAt(0, 3)).toEqual({ index: 0, progress: 0, done: false })
    expect(playbackAt(1800, 3)).toEqual({ index: 1, progress: 0.5, done: false })
    expect(playbackAt(2400, 3)).toEqual({ index: 2, progress: 0, done: true })
    expect(playbackAt(500, 1).done).toBe(true)
  })

  it('draws arrows first, then moves matched players and fades the others', () => {
    const early = interpolateFrames(a, b, 0.175)
    expect(early.arrows[0].x2).toBeCloseTo(0.5, 6)
    expect(early.players[0].x).toBe(0)
    const end = interpolateFrames(a, b, 1)
    expect(end.arrows[0].x2).toBe(1)
    expect(end.players.find((p) => p.id === 'p1')).toMatchObject({ x: 1, y: 1, opacity: 1 })
    expect(end.players.find((p) => p.id === 'gone').opacity).toBe(0)
    expect(end.players.find((p) => p.id === 'new~in').opacity).toBe(1)
    expect(end.ball.opacity).toBe(0)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6)
    expect(easeInOut(2)).toBe(1)
  })

  it('steps without in-between positions when motion is reduced', () => {
    const frames = [a, b]
    expect(frameAtPlayback(frames, 600, { reducedMotion: true }).frame).toBe(a)
    expect(frameAtPlayback(frames, 600).frame).not.toBe(a)
    const last = frameAtPlayback(frames, 5000)
    expect(last).toMatchObject({ index: 1, done: true })
    expect(last.frame).toBe(b)
  })
})

describe('sanitizeFrames (AI scenarios and old data)', () => {
  it('clamps, limits and repairs ids, teams, labels and kinds', () => {
    let n = 0
    const makeId = (p) => `${p}${(n += 1)}`
    const out = sanitizeFrames(
      [
        {
          id: 'f',
          note: 7,
          players: [
            { id: 'p', team: 'A', label: 'ABCDEF', x: 2, y: -1 },
            { id: 'p', team: 'X', label: 5, x: 0.5, y: 'nope' },
            null,
          ],
          ball: { x: 0.4, y: 0.6 },
          arrows: [{ kind: 'shoot', x1: 0, y1: 0, x2: 0.5, y2: 0.5 }],
        },
        { id: 'f', players: 'bad', ball: 'bad' },
        'junk',
      ],
      makeId,
    )
    expect(out).toHaveLength(2)
    expect(out[0].note).toBe('7')
    expect(out[0].players[0]).toEqual({ id: 'p', team: 'A', label: 'ABCD', x: 1, y: 0 })
    expect(out[0].players[1]).toMatchObject({ team: 'A', label: '5', y: 0.5 })
    expect(out[0].players[1].id).not.toBe('p')
    expect(out[0].arrows[0]).toMatchObject({ kind: 'run', x2: 0.5 })
    expect(out[0].arrows[0].id).toBeTruthy()
    expect(out[1].id).not.toBe('f')
    expect(out[1]).toMatchObject({ players: [], ball: null, arrows: [] })
    expect(sanitizeFrames(null)).toEqual([])
    expect(sanitizeFrames(Array.from({ length: 40 }, (_, i) => ({ id: `f${i}` })))).toHaveLength(30)
  })
})

describe('tutorState', () => {
  it('reports positions in percent of the court', () => {
    const state = tutorState({
      sport: 'volleyball',
      frame: { note: 'Chuyền 2', players: [{ team: 'A', label: '4', x: 0.333, y: 0.5 }], ball: { x: 0.5, y: 0.25 }, arrows: [{ kind: 'pass', x1: 0.1, y1: 0.2, x2: 0.3, y2: 0.4 }] },
      index: 1,
      total: 3,
      solutionVisible: true,
    })
    expect(state).toMatchObject({ sport: 'volleyball', frame: 2, frames: 3, note: 'Chuyền 2', ball: { x: 50, y: 25 }, solution_visible: true })
    expect(state.players[0]).toEqual({ team: 'A', label: '4', x: 33, y: 50 })
    expect(state.arrows[0]).toEqual({ kind: 'pass', from: [10, 20], to: [30, 40] })
    expect(close(state.players[0].x, 33)).toBe(true)
  })
})
