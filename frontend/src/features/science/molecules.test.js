import { describe, expect, it } from 'vitest'
import { angleBetween, MOLECULES } from './molecules.js'

describe('molecular geometry', () => {
  it.each(Object.entries(MOLECULES))('%s has the stated angle between its first two bonds', (_name, model) => {
    expect(angleBetween(model.directions[0], model.directions[1])).toBeCloseTo(model.angle, 1)
  })
  it('uses four distinct, equally separated bonds for methane', () => {
    const vectors = MOLECULES.methane.directions
    for (let a = 0; a < vectors.length; a++) for (let b = a + 1; b < vectors.length; b++) expect(angleBetween(vectors[a], vectors[b])).toBeCloseTo(109.47, 1)
  })
})
