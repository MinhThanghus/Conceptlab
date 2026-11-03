import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useFetch } from './hooks.js'
import { get } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({ get: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
function Sample({ url }) { const result = useFetch(url); return <p>{result.data?.title || (result.error ? 'error' : 'loading')}</p> }
it('does not let a late aborted response replace the current locale', async () => {
  let finishEnglish
  get.mockImplementation((url) => url === '/en' ? new Promise((resolve) => { finishEnglish = resolve }) : Promise.resolve({ title: 'Vietnamese title' }))
  const view = render(<Sample url="/en" />)
  await waitFor(() => expect(finishEnglish).toBeTypeOf('function'))
  view.rerender(<Sample url="/vi" />)
  expect(await screen.findByText('Vietnamese title')).toBeTruthy()
  await act(async () => finishEnglish({ title: 'English title' }))
  expect(screen.getByText('Vietnamese title')).toBeTruthy()
  expect(screen.queryByText('English title')).toBeNull()
})
it('hides stale content across language scopes while retaining it for same-language filters', async () => {
  let resolveFilter
  let resolveOther
  get.mockImplementation((url) => {
    if (url === '/en/first') return Promise.resolve({ title: 'English title' })
    if (url === '/en/filter') return new Promise((resolve) => { resolveFilter = resolve })
    return new Promise((resolve) => { resolveOther = resolve })
  })
  function Scoped({ url, scope }) { const result = useFetch(url, { scope }); return <p>{result.data?.title || (result.error ? 'error' : 'loading')}</p> }
  const view = render(<Scoped url="/en/first" scope="en" />)
  expect(await screen.findByText('English title')).toBeTruthy()
  view.rerender(<Scoped url="/en/filter" scope="en" />)
  await waitFor(() => expect(resolveFilter).toBeTypeOf('function'))
  expect(screen.getByText('English title')).toBeTruthy()
  view.rerender(<Scoped url="/vi/first" scope="vi" />)
  await waitFor(() => expect(resolveOther).toBeTypeOf('function'))
  expect(screen.getByText('loading')).toBeTruthy()
  expect(screen.queryByText('English title')).toBeNull()
  await act(async () => resolveOther({ title: 'Vietnamese title' }))
  expect(await screen.findByText('Vietnamese title')).toBeTruthy()
  await act(async () => resolveFilter({ title: 'Late English title' }))
  expect(screen.getByText('Vietnamese title')).toBeTruthy()
})
