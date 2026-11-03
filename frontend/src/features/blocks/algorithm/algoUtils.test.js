import { describe, expect, it } from 'vitest'
import { formatNumberList, listIssue, parseNumberList } from './algoUtils.js'

describe('number lists for algorithm inputs', () => {
  it('reads commas and spaces', () => {
    expect(parseNumberList('7, 3, 9, 1').values).toEqual([7, 3, 9, 1])
    expect(parseNumberList(' 7 3   9,1 ').values).toEqual([7, 3, 9, 1])
    expect(parseNumberList('-2, 0.5, −4').values).toEqual([-2, 0.5, -4])
  })

  it('reads Vietnamese decimal commas when numbers are separated by semicolons', () => {
    expect(parseNumberList('2,5; 1; 4').values).toEqual([2.5, 1, 4])
  })

  it('reports what it could not read', () => {
    const p = parseNumberList('3, x, 5, 1e')
    expect(p.values).toEqual([3, 5])
    expect(p.invalid).toEqual(['x', '1e'])
    expect(listIssue(p)).toEqual({ code: 'invalid', vars: { list: 'x, 1e' } })
  })

  it('checks the size limits', () => {
    expect(listIssue(parseNumberList('4'), { min: 2, max: 12 })).toEqual({ code: 'tooFew', vars: { min: 2 } })
    expect(listIssue(parseNumberList('1 2 3 4 5 6 7 8 9 10 11 12 13'), { min: 2, max: 12 })).toEqual({ code: 'tooMany', vars: { max: 12 } })
    expect(listIssue(parseNumberList('4 2'), { min: 2, max: 12 })).toBeNull()
  })

  it('formats lists back for editing', () => {
    expect(formatNumberList([7, 3, 9])).toBe('7, 3, 9')
    expect(formatNumberList([2.5, 1], 'vi')).toBe('2,5; 1')
    expect(formatNumberList([2.5, 1], 'en')).toBe('2.5, 1')
    expect(parseNumberList(formatNumberList([2.5, 1, -3], 'vi')).values).toEqual([2.5, 1, -3])
  })
})
