import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '../../i18n/index.jsx'
import { SiteHeader } from './SiteHeader.jsx'

const auth = vi.hoisted(() => ({ value: { user: null } }))
vi.mock('../../features/auth/AuthContext.jsx', () => ({ useAuth: () => auth.value }))

const teacher = { id: 'u1', name: 'Lan Nguyen', email: 'lan@example.test', role: 'teacher' }
const student = { id: 'u2', name: 'Minh Tran', email: 'minh@example.test', role: 'student' }

function renderHeader({ user = null, variant = 'public', path = '/' } = {}) {
  auth.value = { user, isAdmin: false, logout: vi.fn(), updateProfile: vi.fn(async () => {}) }
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <SiteHeader variant={variant} />
      </MemoryRouter>
    </I18nProvider>,
  )
}

const hrefs = (root) => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'))
// each extra in the menu says (by class) the width below which the bar hands it over
const menuItems = (container) => [...container.querySelectorAll('#mobile-nav a')].map((a) => `${a.getAttribute('href')} ${a.className.replace('active', '').trim()}`.trim())

beforeEach(() => window.localStorage.setItem('cl.lang', 'en'))
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

describe('SiteHeader', () => {
  it('keeps the teacher’s primary action out of the nav row, and gives the menu what the bar drops', () => {
    const { container } = renderHeader({ user: teacher, variant: 'app', path: '/app' })
    const header = container.querySelector('header')
    expect(header.classList.contains('has-user')).toBe(true)
    expect(hrefs(container.querySelector('.main-nav'))).toEqual(['/app', '/gallery', '/learn', '/guide'])
    const bar = container.querySelector('.header-actions')
    expect(within(bar).getByRole('link', { name: 'New lab' }).getAttribute('href')).toBe('/app/new')
    // the Lite link keeps its words as its name when its label folds to the icon
    const lite = within(bar).getByRole('link', { name: 'Lite mode' })
    expect(lite.getAttribute('title')).toBe('A light version for low-end phones and slow networks')
    expect(lite.querySelector('.header-lite-label').textContent).toBe('Lite mode')
    expect(menuItems(container)).toEqual(['/app', '/gallery', '/learn', '/guide', '/app/new menu-sm', '/lite menu-md'])
  })

  it('does not list the student’s class-code button twice', () => {
    const { container } = renderHeader({ user: student, variant: 'app', path: '/app' })
    expect(hrefs(container.querySelector('.main-nav'))).toEqual(['/app', '/gallery', '/learn'])
    expect(within(container.querySelector('.header-actions')).getByRole('link', { name: 'Enter a class code' }).getAttribute('href')).toBe('/join')
    expect(menuItems(container)).toEqual(['/app', '/gallery', '/learn', '/join menu-sm', '/app/manage mobile-only-link', '/lite menu-md'])
  })

  it('offers a visitor sign in, sign up and Lite mode from the menu, which Escape closes', () => {
    const { container } = renderHeader()
    expect(container.querySelector('header').classList.contains('has-user')).toBe(false)
    expect(menuItems(container)).toEqual(['/gallery', '/learn', '/guide', '/join', '/login menu-sm', '/register mobile-only-link', '/lite menu-md'])
    const toggle = screen.getByRole('button', { name: 'Open menu' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelector('#mobile-nav').hidden).toBe(false)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('#mobile-nav').hidden).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open menu' }))
  })

  it('keeps a signed-in teacher’s shortcuts on public pages', () => {
    const { container } = renderHeader({ user: teacher, variant: 'public', path: '/gallery' })
    expect(within(container.querySelector('.header-actions')).getByRole('link', { name: 'My labs' }).getAttribute('href')).toBe('/app')
    expect(menuItems(container)).toEqual(['/gallery', '/learn', '/guide', '/join', '/app menu-sm', '/app/new mobile-only-link', '/lite menu-md'])
  })
})
