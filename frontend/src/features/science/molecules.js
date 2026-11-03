// Simplified ball-and-stick geometry. Atom sizes and bond lengths are illustrative.
// Directions for methane are the four vertices of a regular tetrahedron.
const s = Math.sqrt(3)
const tetra = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((p) => p.map((n) => n / s))
const halfWater = 104.5 * Math.PI / 360

export const MOLECULES = {
  water: {
    formula: 'H₂O', center: 'O', outer: 'H', angle: 104.5,
    directions: [[Math.sin(halfWater), Math.cos(halfWater), 0], [-Math.sin(halfWater), Math.cos(halfWater), 0]],
    bondOrder: 1,
    source: 'https://cccbdb.nist.gov/listgeomexpx.asp?casno=7732185',
  },
  carbonDioxide: {
    formula: 'CO₂', center: 'C', outer: 'O', angle: 180,
    directions: [[-1, 0, 0], [1, 0, 0]], bondOrder: 2,
    source: 'https://cccbdb.nist.gov/listangleexp3x.asp?bi=13&descript=aOCO&mi=1',
  },
  methane: {
    formula: 'CH₄', center: 'C', outer: 'H', angle: 109.5,
    directions: tetra, bondOrder: 1,
    source: 'https://cccbdb.nist.gov/expgeom2x.asp?casno=74828&charge=0',
  },
}

export function angleBetween(a, b) {
  const dot = a.reduce((sum, value, i) => sum + value * b[i], 0)
  const length = (v) => Math.hypot(...v)
  return Math.acos(Math.max(-1, Math.min(1, dot / (length(a) * length(b))))) * 180 / Math.PI
}
