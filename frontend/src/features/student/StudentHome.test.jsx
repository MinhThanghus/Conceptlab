import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider, useT } from '../../i18n/index.jsx'
import StudentHome from './StudentHome.jsx'

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => ({ user: { name: 'Test' } }) }))
vi.mock('../labs/LabCover.jsx', () => ({ default: () => <div /> }))
const fetchFeatured = vi.hoisted(() => vi.fn())
vi.mock('../public/hooks.js', () => ({ useDocumentTitle: () => {}, useFetch: fetchFeatured }))
function Toggle() { const { setLang } = useT(); return <button onClick={() => setLang('vi')}>Switch VI</button> }
beforeEach(() => { window.localStorage.setItem('cl.lang', 'en'); fetchFeatured.mockReset() })
afterEach(() => { cleanup(); window.localStorage.clear() })
it('uses the prepared card title only for its matching language, including during a refetch', () => {
  fetchFeatured.mockReturnValue({ data: [{ share_code: 'ABC234', title: 'Vietnamese title', language: 'vi', display_title: 'English title', display_language: 'en', subject: 'physics', grade: '10' }], loading: false, error: null })
  render(<MemoryRouter><I18nProvider><Toggle /><StudentHome /></I18nProvider></MemoryRouter>)
  expect(screen.getByText('English title').getAttribute('lang')).toBe('en')
  expect(fetchFeatured).toHaveBeenLastCalledWith('/api/public/featured?lang=en', { scope: 'en' })
  fireEvent.click(screen.getByRole('button', { name: 'Switch VI' }))
  expect(screen.getByText('Vietnamese title').getAttribute('lang')).toBe('vi')
  expect(screen.queryByText('English title')).toBeNull()
  expect(fetchFeatured).toHaveBeenLastCalledWith('/api/public/featured?lang=vi', { scope: 'vi' })
})
