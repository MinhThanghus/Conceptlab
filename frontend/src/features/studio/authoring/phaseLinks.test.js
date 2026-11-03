import { describe, expect, it } from 'vitest'
import { phaseFromSearch } from '../../blocks/quiz/quizModel.js'
import { phaseLink } from './phaseLinks.js'

describe('phaseLink', () => {
  it('adds the phase the quiz reads back', () => {
    const pre = phaseLink('https://lab.example/s/K7M2QX', 'pre')
    expect(pre).toBe('https://lab.example/s/K7M2QX?phase=pre')
    expect(phaseFromSearch(new URL(pre).search)).toBe('pre')
    expect(phaseFromSearch(new URL(phaseLink('https://lab.example/s/K7M2QX', 'post')).search)).toBe('post')
  })
  it('keeps existing query strings and fragments, ignores unknown phases', () => {
    expect(phaseLink('https://lab.example/s/K7M2QX?x=1#q', 'post')).toBe('https://lab.example/s/K7M2QX?x=1&phase=post#q')
    expect(phaseLink('https://lab.example/s/K7M2QX', 'final')).toBe('https://lab.example/s/K7M2QX')
    expect(phaseLink('', 'pre')).toBe('')
  })
})
