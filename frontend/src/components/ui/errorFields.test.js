import { describe, expect, it } from 'vitest'
import { displayErrorField } from './errorFields.js'

describe('validation details by interface language', () => {
  it('translates known Vietnamese field names and reasons', () => {
    expect(displayErrorField('values.0.value', 'must be a finite number', 'vi', 0)).toEqual({ field: 'Giá trị · Giá trị', message: 'phải là số hữu hạn' })
    expect(displayErrorField('title', 'at most 160 characters', 'vi', 0)).toEqual({ field: 'Tiêu đề', message: 'tối đa 160 ký tự' })
  })
  it('does not leak unknown server text in Vietnamese', () => {
    expect(displayErrorField('unknown', 'unknown server explanation', 'vi', 2)).toEqual({ field: 'Mục 3', message: 'không hợp lệ' })
  })
  it('preserves server details in English', () => {
    expect(displayErrorField('title', 'required', 'en', 0)).toEqual({ field: 'title', message: 'required' })
  })
})
