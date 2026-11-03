import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ get: null, patch: null }))
vi.mock('../../lib/api.js', () => ({ get: (...args) => h.get(...args), patch: (...args) => h.patch(...args) }))

const { LabProvider, useLab } = await import('./LabContext.jsx')

const base = { id: 'L1', version: 1, title: 'Start', spec: { blocks: [] }, analysis: null }

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function mount() {
  const view = renderHook(() => useLab(), { wrapper: ({ children }) => <LabProvider labId="L1">{children}</LabProvider> })
  await waitFor(() => expect(view.result.current.lab).not.toBeNull())
  return view
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('LabProvider autosave', () => {
  it('keeps an edit made while a failed save was in flight', async () => {
    h.get = vi.fn(async () => base)
    const first = deferred()
    h.patch = vi.fn().mockReturnValueOnce(first.promise).mockImplementation(async (_url, body) => ({ ...base, ...body, version: 3 }))
    const { result } = await mount()

    act(() => result.current.updateFields({ title: 'A' }))
    let saving
    act(() => {
      saving = result.current.saveNow().catch(() => {})
    })
    act(() => result.current.updateFields({ title: 'B' }))
    await act(async () => {
      first.reject(Object.assign(new Error('offline'), { code: 'network_error' }))
      await saving
    })
    await act(async () => {
      await result.current.flush()
    })

    expect(h.patch).toHaveBeenCalledTimes(2)
    expect(h.patch.mock.calls[1][1].title).toBe('B')
    expect(result.current.lab.title).toBe('B')
  })

  it('ignores a save that finishes after the lab was replaced', async () => {
    h.get = vi.fn(async () => base)
    const pending = deferred()
    h.patch = vi.fn(() => pending.promise)
    const { result } = await mount()

    act(() => result.current.updateFields({ title: 'Mine' }))
    let saving
    act(() => {
      saving = result.current.saveNow()
    })
    act(() => result.current.replaceLab({ ...base, version: 5, title: 'From AI' }))
    await act(async () => {
      pending.resolve({ ...base, version: 2, title: 'Mine' })
      await saving
    })

    expect(result.current.lab).toMatchObject({ version: 5, title: 'From AI' })
    expect(result.current.saveState).toBe('saved')
  })

  it('keeps the newest reload when an older one answers last', async () => {
    const older = deferred()
    const newer = deferred()
    h.get = vi.fn().mockResolvedValueOnce(base).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    h.patch = vi.fn()
    const { result } = await mount()

    let a
    let b
    act(() => {
      a = result.current.reload()
      b = result.current.reload()
    })
    await act(async () => {
      newer.resolve({ ...base, version: 9, title: 'Newest' })
      await b
      older.resolve({ ...base, version: 4, title: 'Older' })
      await a
    })

    expect(result.current.lab).toMatchObject({ version: 9, title: 'Newest' })
    expect(result.current.loading).toBe(false)
  })
})
