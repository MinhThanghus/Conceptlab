import { describe, expect, it } from 'vitest'
import { allPages, defaultPages, formatPageRanges, parsePageRanges, togglePage } from './pageRanges.js'

describe('parsePageRanges', () => {
  it('parses single pages and ranges', () => {
    expect(parsePageRanges('1-3,5', 10)).toEqual({ pages: [1, 2, 3, 5], error: null })
    expect(parsePageRanges(' 64 – 66 ; 70 ', 100)).toEqual({ pages: [64, 65, 66, 70], error: null })
    expect(parsePageRanges('4 2 2', 10)).toEqual({ pages: [2, 4], error: null })
  })

  it('accepts reversed ranges and spaces around the dash', () => {
    expect(parsePageRanges('5 - 3', 10).pages).toEqual([3, 4, 5])
  })

  it('treats empty text as no selection', () => {
    expect(parsePageRanges('', 10)).toEqual({ pages: [], error: null })
    expect(parsePageRanges('   ', 10)).toEqual({ pages: [], error: null })
  })

  it('reports invalid tokens', () => {
    expect(parsePageRanges('1-3,abc', 10).error).toEqual({ code: 'invalid', token: 'abc' })
    expect(parsePageRanges('1--3', 10).error?.code).toBe('invalid')
    expect(parsePageRanges('2.5', 10).error?.code).toBe('invalid')
  })

  it('reports pages outside the document', () => {
    expect(parsePageRanges('0', 10).error).toEqual({ code: 'outOfRange', page: 0, max: 10 })
    expect(parsePageRanges('8-12', 10).error).toEqual({ code: 'outOfRange', page: 12, max: 10 })
  })

  it('refuses absurdly large selections', () => {
    expect(parsePageRanges('1-999999', Infinity, { limit: 500 }).error?.code).toBe('tooMany')
  })
})

describe('formatPageRanges', () => {
  it('compresses consecutive pages', () => {
    expect(formatPageRanges([1, 2, 3, 5, 7, 8])).toBe('1-3, 5, 7-8')
    expect(formatPageRanges([9])).toBe('9')
    expect(formatPageRanges([])).toBe('')
  })
  it('sorts, dedupes and ignores invalid values', () => {
    expect(formatPageRanges([3, 1, 2, 2, 0, -1, 1.5])).toBe('1-3')
  })
  it('round-trips with parsePageRanges', () => {
    const pages = [1, 2, 4, 6, 7, 8, 12]
    expect(parsePageRanges(formatPageRanges(pages), 20).pages).toEqual(pages)
  })
})

describe('helpers', () => {
  it('allPages lists 1..n', () => {
    expect(allPages(3)).toEqual([1, 2, 3])
    expect(allPages(0)).toEqual([])
  })
  it('defaultPages selects short documents fully and long ones partially', () => {
    expect(defaultPages(4)).toEqual([1, 2, 3, 4])
    expect(defaultPages(20)).toHaveLength(20)
    expect(defaultPages(120)).toEqual(allPages(10))
    expect(defaultPages(null)).toEqual([])
  })
  it('togglePage adds and removes a page', () => {
    expect(togglePage([1, 3], 2)).toEqual([1, 2, 3])
    expect(togglePage([1, 2, 3], 2)).toEqual([1, 3])
  })
})
