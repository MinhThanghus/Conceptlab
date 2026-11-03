import { describe, expect, it } from 'vitest'
import { pageFrom, pastLastPage, queryString } from './hooks.js'

describe('pageFrom', () => {
  it('accepts positive integers and falls back to 1', () => {
    expect(pageFrom('3')).toBe(3)
    expect(pageFrom('0')).toBe(1)
    expect(pageFrom('-2')).toBe(1)
    expect(pageFrom('abc')).toBe(1)
    expect(pageFrom(undefined)).toBe(1)
    expect(pageFrom('99999')).toBe(1000)
  })
})

describe('pastLastPage', () => {
  it('points an out-of-range page back to the last page with rows', () => {
    expect(pastLastPage({ page: 99, total: 9, pageSize: 12, itemCount: 0 })).toBe(1)
    expect(pastLastPage({ page: 4, total: 30, pageSize: 12, itemCount: 0 })).toBe(3)
  })

  it('leaves real pages and truly empty lists alone', () => {
    expect(pastLastPage({ page: 2, total: 30, pageSize: 12, itemCount: 12 })).toBeNull()
    expect(pastLastPage({ page: 1, total: 0, pageSize: 12, itemCount: 0 })).toBeNull()
    expect(pastLastPage({ page: 3, total: 0, pageSize: 12, itemCount: 0 })).toBeNull()
    expect(pastLastPage({ page: 1, total: 5, pageSize: 12, itemCount: 0 })).toBeNull()
  })
})

describe('queryString', () => {
  it('skips empty values', () => {
    expect(queryString({ q: 'con lắc', space: '', page: 2, grade: null })).toBe('?q=con+l%E1%BA%AFc&page=2')
    expect(queryString({ q: '' })).toBe('')
  })
})
