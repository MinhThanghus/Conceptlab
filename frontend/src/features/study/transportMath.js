// Dimensionless, closed 1D teaching system. This is not a fit to a paper's kinetics.
export function initialTransport(size = 41) {
  return Array.from({ length: size }, (_, i) => {
    const b = Math.abs(i - Math.floor(size / 2)) <= 1 ? .8 : 0
    return { a: 1 - b, b, c: 0 }
  })
}
export function transportStep(cells, { diffusion = .2, reaction = true, removal = false } = {}) {
  const dt = .1
  const d = Math.max(0, Math.min(1, Number(diffusion)))
  return cells.map((cell, i) => {
    const left = cells[Math.max(0, i - 1)], right = cells[Math.min(cells.length - 1, i + 1)]
    const conversion = reaction ? .5 * cell.a * cell.b : 0
    const loss = removal ? .12 * cell.b : 0
    const lap = (key) => left[key] + right[key] - 2 * cell[key]
    return { a: cell.a + dt * (d * lap('a') - conversion), b: cell.b + dt * (d * lap('b') + conversion - loss), c: cell.c + dt * (d * lap('c') + loss) }
  })
}
export function advanceTransport(cells, controls, steps = 20) {
  let next = cells
  for (let i = 0; i < steps; i++) next = transportStep(next, controls)
  return next
}
export function siteOccupancy(co2, water, total = 24) {
  const carbon = Math.max(0, Math.min(total, Math.floor(Number(co2) || 0)))
  const moisture = Math.max(0, Math.min(total - carbon, Math.floor(Number(water) || 0)))
  return { carbon, moisture, empty: total - carbon - moisture, total }
}
