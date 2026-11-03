import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { post } from '../../lib/api.js'
import { useTranslatedLesson } from './useTranslatedLesson.js'

vi.mock('../../lib/api.js', () => ({ post: vi.fn() }))
const original = { language: 'vi', title: 'Con lắc', share_code: 'TPEND6' }

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('translated lesson', () => {
  it('uses the source directly in its original language', () => {
    const { result } = renderHook(() => useTranslatedLesson(original, 'TPEND6', 'vi'))
    expect(result.current.lab).toBe(original)
    expect(post).not.toHaveBeenCalled()
  })
  it('does not show a stale translation when language changes during a request', async () => {
    let resolve
    post.mockImplementation(() => new Promise((done) => { resolve = done }))
    const { result, rerender } = renderHook(({ lang }) => useTranslatedLesson(original, 'TPEND6', lang), { initialProps: { lang: 'en' } })
    expect(result.current.status).toBe('loading')
    rerender({ lang: 'vi' })
    await act(async () => resolve({ ...original, title: 'Pendulum', translated_language: 'en' }))
    expect(result.current.lab.title).toBe('Con lắc')
  })
  it('does not claim to translate an unavailable offline copy', () => {
    const { result } = renderHook(() => useTranslatedLesson(original, 'TPEND6', 'en', true))
    expect(result.current.status).toBe('offline')
    expect(post).not.toHaveBeenCalled()
    act(() => result.current.viewOriginal())
    expect(result.current.lab).toBe(original)
  })
  it('rejects an incomplete translation response', async () => {
    post.mockResolvedValue(original)
    const { result } = renderHook(() => useTranslatedLesson(original, 'TPEND6', 'en'))
    await waitFor(() => expect(result.current.status).toBe('error'))
  })
  it('reuses the completed translation when switching back to English', async () => {
    post.mockResolvedValue({ ...original, title: 'Pendulum', translated_language: 'en' })
    const { result, rerender } = renderHook(({ lang }) => useTranslatedLesson(original, 'TPEND6', lang), { initialProps: { lang: 'en' } })
    await waitFor(() => expect(result.current.lab?.title).toBe('Pendulum'))
    rerender({ lang: 'vi' })
    expect(result.current.lab).toBe(original)
    rerender({ lang: 'en' })
    expect(result.current.lab?.title).toBe('Pendulum')
    expect(post).toHaveBeenCalledTimes(1)
  })
  it('requests a fresh translation when the published lesson changes', async () => {
    post.mockResolvedValue({ ...original, title: 'Pendulum', translated_language: 'en' })
    const { result, rerender } = renderHook(({ lesson }) => useTranslatedLesson(lesson, 'TPEND6', 'en'), { initialProps: { lesson: original } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ lesson: { ...original, title: 'Bài đã cập nhật' } })
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2))
  })
})
