import { describe, expect, it } from 'vitest'
import { learnerOptions } from './explorerUtils.js'

describe('learnerOptions', () => {
  it('offers the explanation level only when a diagram can use it', () => {
    expect(learnerOptions([{ type: 'diagram' }, { type: 'quiz' }])).toEqual({ level: true, active: false })
    expect(learnerOptions([{ type: 'steps' }, { type: 'video' }])).toEqual({ level: false, active: false })
  })
  it('offers active learning only with a simulation or a graph', () => {
    expect(learnerOptions([{ type: 'simulation' }])).toEqual({ level: false, active: true })
    expect(learnerOptions([{ type: 'graph' }, { type: 'diagram' }])).toEqual({ level: true, active: true })
  })
  it('copes with missing input', () => {
    expect(learnerOptions()).toEqual({ level: false, active: false })
    expect(learnerOptions([null])).toEqual({ level: false, active: false })
  })
})
