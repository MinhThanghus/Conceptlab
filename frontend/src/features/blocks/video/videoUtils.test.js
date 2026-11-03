import { describe, expect, it } from 'vitest'
import {
  acceptSuggestion,
  adjacentMarker,
  boxesAt,
  boxToRect,
  captureSize,
  compareMedia,
  containRect,
  durationOf,
  formatClock,
  fraction,
  frameIndexAt,
  learnerMarkers,
  loopWindow,
  markerAt,
  normalizeSamBox,
  pendingAiMarkers,
  pointInMedia,
  labelX,
  overlayFrameReady,
  pointsToPixels,
  prepareTrack,
  safeFps,
  snapshotTrack,
  sortMarkers,
  stepTime,
  tutorState,
  upsertMarker,
} from './videoUtils.js'

describe('formatClock', () => {
  it('uses a decimal comma in Vietnamese and a point in English', () => {
    expect(formatClock(3.24, { lang: 'vi' })).toBe('0:03,2')
    expect(formatClock(3.24, { lang: 'en' })).toBe('0:03.2')
  })
  it('carries rounding into the next minute', () => {
    expect(formatClock(59.96, { lang: 'en' })).toBe('1:00.0')
  })
  it('shows hours only when needed and handles bad input', () => {
    expect(formatClock(3723.4, { lang: 'en' })).toBe('1:02:03.4')
    expect(formatClock(-4, { lang: 'en' })).toBe('0:00.0')
    expect(formatClock(Number.NaN, { lang: 'vi', decimals: 0 })).toBe('0:00')
  })
})

describe('frame stepping', () => {
  it('lands in the middle of the next / previous frame', () => {
    expect(stepTime(0, 30, 1)).toBeCloseTo(1.5 / 30, 6)
    expect(stepTime(1.5 / 30, 30, 1)).toBeCloseTo(2.5 / 30, 6)
    expect(stepTime(1.5 / 30, 30, -1)).toBeCloseTo(0.5 / 30, 6)
  })
  it('never goes before 0 or past the last frame', () => {
    expect(stepTime(0, 25, -3)).toBeCloseTo(0.5 / 25, 6)
    expect(stepTime(9.99, 25, 5, 10)).toBeCloseTo(10 - 0.5 / 25, 6)
  })
  it('falls back to 30 fps for missing/absurd values', () => {
    expect(safeFps(null)).toBe(30)
    expect(safeFps(0)).toBe(30)
    expect(safeFps(1000)).toBe(30)
    expect(safeFps(24)).toBe(24)
    expect(frameIndexAt(1, 24)).toBe(24)
  })
  it('reads the duration from the element or the source', () => {
    expect(durationOf(12.5, 9000)).toBe(12.5)
    expect(durationOf(Number.NaN, 9000)).toBe(9)
    expect(durationOf(Infinity, null)).toBe(0)
  })
})

describe('marker loops and navigation', () => {
  const markers = [
    { id: 'c', t: 8, label: 'C', confirmed: true },
    { id: 'a', t: 1, label: 'A', confirmed: false, ai_suggested: false },
    { id: 'b', t: 4.5, label: 'B', confirmed: false, ai_suggested: true },
    { id: 'bad', t: 'x', label: 'bad' },
  ]
  it('builds a ±1.5 s window clamped to the video', () => {
    expect(loopWindow(4, 10)).toEqual([2.5, 5.5])
    expect(loopWindow(0.5, 10)).toEqual([0, 2])
    expect(loopWindow(9.5, 10)).toEqual([8, 10])
    const [s, e] = loopWindow(12, 10)
    expect(e).toBe(10)
    expect(e - s).toBeGreaterThan(0)
  })
  it('sorts and filters markers like the published snapshot', () => {
    expect(sortMarkers(markers).map((m) => m.id)).toEqual(['a', 'b', 'c'])
    expect(learnerMarkers(markers).map((m) => m.id)).toEqual(['a', 'c'])
    expect(pendingAiMarkers(markers).map((m) => m.id)).toEqual(['b'])
  })
  it('finds the current, next and previous marker', () => {
    const sorted = sortMarkers(markers)
    expect(markerAt(sorted, 0.5)).toBeNull()
    expect(markerAt(sorted, 4.48)?.id).toBe('b')
    expect(markerAt(sorted, 20)?.id).toBe('c')
    expect(adjacentMarker(sorted, 1, 1)?.id).toBe('b')
    expect(adjacentMarker(sorted, 4.5, -1)?.id).toBe('a')
    expect(adjacentMarker(sorted, 8, 1)).toBeNull()
  })
  it('inserts markers in time order and accepts AI suggestions as confirmed', () => {
    const list = upsertMarker(sortMarkers(markers), { id: 'n', t: 2, label: 'N' })
    expect(list.map((m) => m.id)).toEqual(['a', 'n', 'b', 'c'])
    const accepted = acceptSuggestion({ t: '3.2', label: 'Tiếp xúc bóng', note: 'Cổ tay khóa' }, () => 'm1')
    expect(accepted).toEqual({ id: 'm1', t: 3.2, label: 'Tiếp xúc bóng', note: 'Cổ tay khóa', confirmed: true, ai_suggested: true })
  })
  it('computes seek-bar fractions safely', () => {
    expect(fraction(5, 10)).toBe(0.5)
    expect(fraction(15, 10)).toBe(1)
    expect(fraction(3, 0)).toBe(0)
  })
})

describe('SAM tracks', () => {
  const track = {
    id: 't1',
    phrase: 'ball',
    frames: [
      { t: 0.4, boxes: [[0.1, 0.1, 0.2, 0.2]] },
      { t: 0, boxes: [[0, 0, 0.1, 0.1]] },
      { t: 0.2, boxes: [] },
      {
        t: 0.6,
        boxes: [
          [0.5, 0.5, 0.4, 0.4],
          [1.2, 0.1, 0.9, 0.3],
          ['x', 0, 1, 1],
        ],
      },
    ],
  }
  it('sorts frames, validates boxes and estimates the sampling gap', () => {
    const p = prepareTrack(track)
    expect(p.frames.map((f) => f.t)).toEqual([0, 0.2, 0.4, 0.6])
    expect(p.frames[3].boxes).toEqual([
      [0.4, 0.4, 0.5, 0.5],
      [0.9, 0.1, 1, 0.3],
    ])
    expect(p.maxGap).toBeCloseTo(0.35, 6)
    expect(p.withObjects).toBe(3)
  })
  it('returns the boxes of the nearest sample only when it is close enough', () => {
    const p = prepareTrack(track)
    expect(boxesAt(p, 0.05)).toEqual([[0, 0, 0.1, 0.1]])
    expect(boxesAt(p, 0.38)).toEqual([[0.1, 0.1, 0.2, 0.2]])
    expect(boxesAt(p, 0.21)).toEqual([])
    expect(boxesAt(p, 0.9)).toHaveLength(2)
    expect(boxesAt(p, 5)).toEqual([])
    expect(boxesAt(prepareTrack({ frames: [] }), 1)).toEqual([])
  })
  it('turns one segmented frame into a one-frame snapshot track', () => {
    const snap = snapshotTrack({ id: 's1', phrase: 'quả bóng', t: 3.2, result: { width: 100, height: 50, objects: [{ box: [10, 5, 29, 24] }] } })
    expect(snap).toEqual({ id: 's1', phrase: 'quả bóng', frames: [{ t: 3.2, boxes: [[0.1, 0.1, 0.3, 0.5]] }] })
    expect(normalizeSamBox([0, 0, 99, 49], 100, 50)).toEqual([0, 0, 1, 1])
  })
})

describe('geometry', () => {
  it('computes the letterboxed picture inside the player', () => {
    expect(containRect(800, 450, 1280, 720)).toEqual({ x: 0, y: 0, width: 800, height: 450 })
    const portrait = containRect(800, 450, 720, 1280)
    expect(portrait.height).toBe(450)
    expect(portrait.width).toBeCloseTo(253.125, 3)
    expect(portrait.x).toBeCloseTo(273.4375, 3)
    expect(containRect(0, 10, 1, 1)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
  it('maps pointer positions into the picture and back', () => {
    const rect = { x: 100, y: 0, width: 200, height: 100 }
    expect(pointInMedia(200, 50, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(pointInMedia(50, 50, rect)).toBeNull()
    expect(boxToRect([0.25, 0.5, 0.75, 1], rect)).toEqual({ x: 150, y: 50, width: 100, height: 50 })
  })
  it('limits captured frame size and converts points to pixels', () => {
    expect(captureSize(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(captureSize(640, 360)).toEqual({ width: 640, height: 360 })
    expect(pointsToPixels([{ x: 0.5, y: 1, negative: 1 }], 101, 51)).toEqual([{ x: 50, y: 50, negative: true }])
  })
})

describe('compare panel media', () => {
  const sources = {
    pdf: { id: 'pdf', kind: 'pdf', status: 'ready', page_count: 4, urls: { page: '/api/sources/pdf/pages/{n}.png' } },
    img: { id: 'img', kind: 'image', status: 'ready', urls: { file: '/api/sources/img/file' } },
    vid: { id: 'vid', kind: 'video', status: 'ready', urls: { file: '/v.mp4', poster: '/p.jpg' } },
    wip: { id: 'wip', kind: 'video', status: 'processing', urls: {} },
  }
  const byId = (id) => sources[id] || null
  it('resolves PDF pages (clamped), images and videos', () => {
    expect(compareMedia({ source_id: 'pdf', page: 9 }, byId)).toMatchObject({ kind: 'page', page: 4, url: '/api/sources/pdf/pages/4.png' })
    expect(compareMedia({ source_id: 'img' }, byId)).toMatchObject({ kind: 'image', url: '/api/sources/img/file' })
    expect(compareMedia({ source_id: 'vid' }, byId)).toMatchObject({ kind: 'video', poster: '/p.jpg' })
  })
  it('is honest about missing or unfinished sources', () => {
    expect(compareMedia(null, byId)).toBeNull()
    expect(compareMedia({ source_id: 'gone' }, byId)).toEqual({ kind: 'missing' })
    expect(compareMedia({ source_id: 'wip' }, byId).kind).toBe('processing')
    expect(compareMedia({ asset_id: 'a1' }, byId, () => ({ url: '/api/assets/a1/file' }))).toMatchObject({ kind: 'image', url: '/api/assets/a1/file' })
  })
})

describe('tutorState', () => {
  it('reports the playhead and the selected marker', () => {
    expect(tutorState({ time: 3.14159, marker: { id: 'm', t: 3, label: 'Đỡ bóng', note: '' }, speed: 0.5, loop: 1, visibleTracks: ['ball'] })).toEqual({
      time: 3.14,
      marker: { id: 'm', t: 3, label: 'Đỡ bóng', note: '' },
      speed: 0.5,
      loop: true,
      highlighted: ['ball'],
    })
  })
})

describe('overlayFrameReady', () => {
  it('waits for frame data at the current time', () => {
    expect(overlayFrameReady({ readyState: 0, poster: '' }, true)).toBe(false)
    expect(overlayFrameReady({ readyState: 1, poster: '' }, true)).toBe(false)
    expect(overlayFrameReady({ readyState: 2, poster: '' }, false)).toBe(true)
    expect(overlayFrameReady({ readyState: 4, poster: '' }, false)).toBe(true)
  })

  it('does not draw over the poster before the first play or seek', () => {
    // the poster was captured at another moment (1 s): boxes for t=0 would not match it
    expect(overlayFrameReady({ readyState: 4, poster: '/poster' }, false)).toBe(false)
    expect(overlayFrameReady({ readyState: 4, poster: '/poster' }, true)).toBe(true)
    expect(overlayFrameReady({ readyState: 1, poster: '/poster' }, true)).toBe(false)
  })

  it('treats a missing element as not ready', () => {
    expect(overlayFrameReady(undefined, true)).toBe(false)
  })
})

describe('labelX', () => {
  it('keeps a label inside the canvas', () => {
    expect(labelX(40, 60, 600)).toBe(40)
    expect(labelX(570, 60, 600)).toBe(540)
    expect(labelX(-10, 60, 600)).toBe(0)
    expect(labelX(10, 900, 600)).toBe(0)
  })
})
