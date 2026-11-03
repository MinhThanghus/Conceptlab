import { describe, expect, it } from 'vitest'
import { chooseMode, edgePaths, layoutFlow, rayExit, runSequence, sequentialEdges, validEdges } from './flowLayout.js'

const water = {
  nodes: [
    { id: 'evap', label: 'Bay hơi' },
    { id: 'cond', label: 'Ngưng tụ' },
    { id: 'prec', label: 'Giáng thủy' },
    { id: 'run', label: 'Dòng chảy' },
  ],
  edges: [
    { id: 'e1', source: 'evap', target: 'cond', label: 'hơi nước bốc lên' },
    { id: 'e2', source: 'cond', target: 'prec', label: 'mây' },
    { id: 'e3', source: 'prec', target: 'run', label: 'mưa' },
    { id: 'e4', source: 'run', target: 'evap', label: 'ra biển' },
  ],
}

function overlaps(layout, w, h) {
  const pts = Object.values(layout.centres)
  for (let i = 0; i < pts.length; i += 1)
    for (let j = i + 1; j < pts.length; j += 1) if (Math.abs(pts[i].x - pts[j].x) < w && Math.abs(pts[i].y - pts[j].y) < h) return true
  return false
}

describe('flow layout', () => {
  it('uses a ring on wide screens and a column on phones for cycles', () => {
    expect(chooseMode('cycle', 4, 900)).toBe('cycle')
    expect(chooseMode('cycle', 4, 330)).toBe('column')
    expect(chooseMode('cycle', 12, 500)).toBe('column')
    expect(chooseMode('linear', 4, 900)).toBe('row')
    expect(chooseMode('linear', 4, 375)).toBe('column')
    expect(chooseMode('linear', 8, 900)).toBe('column')
    expect(chooseMode('linear', 3, 0)).toBe('column')
  })

  it('places ring nodes inside the canvas without overlapping', () => {
    const layout = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 900 })
    expect(layout.mode).toBe('cycle')
    expect(overlaps(layout, layout.nodeWidth, 66)).toBe(false)
    for (const p of Object.values(layout.centres)) {
      expect(p.x - layout.nodeWidth / 2).toBeGreaterThanOrEqual(0)
      expect(p.x + layout.nodeWidth / 2).toBeLessThanOrEqual(900)
      expect(p.y - 33).toBeGreaterThanOrEqual(0)
      expect(p.y + 33).toBeLessThanOrEqual(layout.height)
    }
    // the first node is at the top
    expect(layout.centres.evap.y).toBeLessThan(layout.centres.prec.y)
  })

  it('stacks a column using measured heights', () => {
    const sizes = { evap: { w: 300, h: 90 }, cond: { w: 300, h: 50 } }
    const layout = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 343, sizes })
    expect(layout.mode).toBe('column')
    expect(layout.centres.cond.y - layout.centres.evap.y).toBe(90 / 2 + 64 + 50 / 2)
    expect(layout.side).toBeGreaterThan(0)
    expect(layout.nodeWidth + 2 * layout.side).toBeLessThanOrEqual(343)
  })

  it('keeps a row centred with readable node widths', () => {
    const layout = layoutFlow({ layout: 'linear', nodes: water.nodes, edges: water.edges.slice(0, 3), width: 1000 })
    expect(layout.mode).toBe('row')
    const xs = water.nodes.map((n) => layout.centres[n.id].x)
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(layout.nodeWidth).toBeGreaterThanOrEqual(104)
    expect(xs[0] - layout.nodeWidth / 2).toBeGreaterThanOrEqual(0)
    expect(xs[3] + layout.nodeWidth / 2).toBeLessThanOrEqual(1000)
  })

  it('clips arrows at box borders', () => {
    expect(rayExit(100, 100, 80, 40, 1, 0)).toEqual([145, 100])
    expect(rayExit(100, 100, 80, 40, 0, -1)).toEqual([100, 75])
    expect(rayExit(100, 100, 80, 40, 0, 0)).toEqual([100, 100])
  })

  it('draws every valid edge and uses compact labels for side arcs', () => {
    const layout = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 343 })
    const paths = edgePaths({ ...layout, nodes: water.nodes, edges: water.edges, width: 343 })
    expect(paths).toHaveLength(4)
    const loop = paths.find((p) => p.id === 'e4')
    expect(loop.compact).toBe(true)
    expect(loop.d.startsWith('M')).toBe(true)
    expect(paths.filter((p) => !p.compact)).toHaveLength(3)
    // loop-back arc stays inside the canvas
    expect(loop.labelX).toBeLessThanOrEqual(343)

    const ring = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 900 })
    const ringPaths = edgePaths({ ...ring, nodes: water.nodes, edges: water.edges, width: 900 })
    expect(ringPaths.every((p) => p.d.includes('Q'))).toBe(true)
  })

  it('gives every arrow its direction at the label, so an icon label points the way the arrow runs', () => {
    const ring = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 900 })
    const paths = edgePaths({ ...ring, nodes: water.nodes, edges: water.edges, width: 900 })
    const byId = Object.fromEntries(paths.map((p) => [p.id, p]))
    // evaporation (top) to condensation (right) runs down and right; runoff (left) back to the top runs up
    expect(byId.e1.angle).toBeGreaterThan(0)
    expect(byId.e1.angle).toBeLessThan(90)
    expect(Math.abs(byId.e4.angle)).toBeLessThan(90)
    expect(byId.e4.angle).toBeLessThan(0)
    const column = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 343 })
    const loop = edgePaths({ ...column, nodes: water.nodes, edges: water.edges, width: 343 }).find((p) => p.id === 'e4')
    expect(loop.angle).toBe(-90) // the loop-back arc climbs to the first stage
  })

  it('fills the height a lesson slide gives it, with room for the outer arrow labels', () => {
    const room = 440
    const ring = layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 1200, large: true, room })
    expect(ring.mode).toBe('cycle')
    expect(ring.height).toBe(room)
    const ys = Object.values(ring.centres).map((p) => p.y)
    expect(Math.max(...ys) + 84 / 2).toBeLessThanOrEqual(room - 12 - 20)
    expect(ring.nodeWidth).toBeGreaterThanOrEqual(150)
    const row = layoutFlow({ layout: 'linear', nodes: water.nodes, edges: water.edges.slice(0, 3), width: 1200, large: true, room })
    expect(row.mode).toBe('row')
    expect(row.height).toBe(room)
    expect(Object.values(row.centres).every((p) => p.y === room / 2)).toBe(true)
    // without room the default layout is unchanged
    expect(layoutFlow({ layout: 'cycle', nodes: water.nodes, edges: water.edges, width: 900 }).height).toBe(540)
  })

  it('ignores broken and self-referencing edges', () => {
    const edges = [...water.edges, { id: 'x', source: 'evap', target: 'nope' }, { id: 'y', source: 'cond', target: 'cond' }]
    expect(validEdges(water.nodes, edges)).toHaveLength(4)
  })
})

describe('run sequence', () => {
  it('follows a cycle and closes the loop last', () => {
    expect(runSequence(water.nodes, water.edges).map((s) => s.id)).toEqual(['evap', 'e1', 'cond', 'e2', 'prec', 'e3', 'run', 'e4'])
  })

  it('starts where nothing points in and visits branches', () => {
    const nodes = [{ id: 'b' }, { id: 'a' }, { id: 'c' }, { id: 'd' }]
    const edges = [
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ac', source: 'a', target: 'c' },
      { id: 'bd', source: 'b', target: 'd' },
    ]
    expect(runSequence(nodes, edges).map((s) => s.id)).toEqual(['a', 'ab', 'b', 'bd', 'd', 'ac', 'c'])
  })

  it('handles nodes without arrows', () => {
    expect(runSequence([{ id: 'x' }, { id: 'y' }], []).map((s) => s.id)).toEqual(['x', 'y'])
    expect(runSequence([], [])).toEqual([])
  })

  it('adds missing sequential arrows (and the loop for cycles)', () => {
    let n = 0
    const makeId = () => `new${(n += 1)}`
    const added = sequentialEdges(water.nodes, water.edges.slice(0, 1), 'cycle', makeId)
    expect(added.map((e) => `${e.source}>${e.target}`)).toEqual(['cond>prec', 'prec>run', 'run>evap'])
    expect(sequentialEdges(water.nodes, [], 'linear', makeId)).toHaveLength(3)
  })
})
