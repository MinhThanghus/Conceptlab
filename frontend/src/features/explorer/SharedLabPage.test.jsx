import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { I18nProvider, useT } from '../../i18n/index.jsx'
import { ToastProvider } from '../../components/ui/Toast.jsx'
import SharedLabPage from './SharedLabPage.jsx'
import { get, post } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({ get: vi.fn(async () => ({ share_code: 'ABC234', language: 'vi', title: 'Bài học' })), post: vi.fn() }))
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('./Explorer.jsx', () => ({ default: ({ lab, introNotice }) => <div>{lab.title}{introNotice}</div> }))

beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); vi.clearAllMocks() })
afterEach(() => { cleanup(); window.localStorage.clear() })

function LanguageToggle() {
  const { setLang } = useT()
  return <><button onClick={() => setLang('vi')}>Switch VI</button><button onClick={() => setLang('en')}>Switch EN</button></>
}
function openLesson() {
  render(<MemoryRouter initialEntries={['/s/ABC234']}><I18nProvider><ToastProvider><Routes>
    <Route path="/s/:code" element={<><LanguageToggle /><SharedLabPage /></>} />
  </Routes></ToastProvider></I18nProvider></MemoryRouter>)
}

it('loads the lesson in the chosen language', async () => {
  post.mockResolvedValue({ share_code: 'ABC234', language: 'vi', translated_language: 'en', title: 'A lesson' })
  openLesson()
  expect(await screen.findByText('A lesson')).toBeTruthy()
  expect(screen.getByText(/AI translation/)).toBeTruthy()
  expect(post).toHaveBeenCalledWith('/api/share/ABC234/translate', { target: 'en' }, expect.any(Object))
})

it('shows a designed wait while translating and lets the visitor read the original at once', async () => {
  post.mockImplementation(() => new Promise(() => {}))
  openLesson()
  expect(await screen.findByRole('heading', { name: 'Translating the lesson into English' })).toBeTruthy()
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
  expect(screen.getByText(/about half a minute/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Read the original now' }))
  expect(await screen.findByText('Bài học')).toBeTruthy()
  expect(screen.getByText(/lesson content is in Vietnamese/)).toBeTruthy()
})

it('offers the original if translation fails', async () => {
  post.mockRejectedValue(new Error('offline'))
  openLesson()
  expect(await screen.findByText(/could not be translated/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View original' }))
  expect(await screen.findByText(/lesson content is in Vietnamese/)).toBeTruthy()
  expect(screen.getByText('Bài học')).toBeTruthy()
})


it('uses an already-localized GET response without a translation POST', async () => {
  get.mockResolvedValueOnce({ share_code: 'ABC234', language: 'vi', translated_language: 'en', translation_kind: 'reviewed', title: 'Reviewed English' })
  openLesson()
  expect(await screen.findByText('Reviewed English')).toBeTruthy()
  expect(get).toHaveBeenCalledWith('/api/share/ABC234?lang=en', expect.any(Object))
  expect(post).not.toHaveBeenCalled()
})

it('waits for the localized GET after switching languages before considering translation', async () => {
  window.localStorage.setItem('cl.lang', 'vi')
  let resolveEnglish
  get.mockImplementation((url) => String(url).endsWith('lang=vi')
    ? Promise.resolve({ share_code: 'ABC234', language: 'vi', title: 'Vietnamese original' })
    : new Promise((resolve) => { resolveEnglish = resolve }))
  openLesson()
  expect(await screen.findByText('Vietnamese original')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Switch EN' }))
  await waitFor(() => expect(resolveEnglish).toBeTypeOf('function'))
  expect(screen.queryByText('Vietnamese original')).toBeNull()
  expect(post).not.toHaveBeenCalled()
  await act(async () => resolveEnglish({ share_code: 'ABC234', language: 'vi', translated_language: 'en', translation_kind: 'reviewed', title: 'Prepared English' }))
  expect(await screen.findByText('Prepared English')).toBeTruthy()
  expect(post).not.toHaveBeenCalled()
})

it('ignores a late failure from an aborted language request', async () => {
  window.localStorage.setItem('cl.lang', 'vi')
  let rejectEnglish
  get.mockImplementation((url) => String(url).endsWith('lang=vi')
    ? Promise.resolve({ share_code: 'ABC234', language: 'vi', title: 'Vietnamese original' })
    : new Promise((resolve, reject) => { rejectEnglish = reject }))
  openLesson()
  expect(await screen.findByText('Vietnamese original')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Switch EN' }))
  await waitFor(() => expect(rejectEnglish).toBeTypeOf('function'))
  fireEvent.click(screen.getByRole('button', { name: 'Switch VI' }))
  expect(await screen.findByText('Vietnamese original')).toBeTruthy()
  await act(async () => rejectEnglish(new Error('late network failure')))
  expect(screen.getByText('Vietnamese original')).toBeTruthy()
  expect(post).not.toHaveBeenCalled()
})
