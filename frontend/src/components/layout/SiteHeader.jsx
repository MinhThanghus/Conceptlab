import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { FlaskConical, LayoutDashboard, LogOut, Menu, Plus, ShieldCheck, UserRound, X, Zap } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../../features/auth/AuthContext.jsx'
import { Logo } from './Logo.jsx'
import { LanguageSwitch } from './LanguageSwitch.jsx'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function UserMenu() {
  const { t } = useT()
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const buttonRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div
      className="user-menu"
      ref={ref}
      onBlur={(e) => {
        // Tabbing past the last item closes the panel instead of leaving it over the page.
        if (open && e.relatedTarget && !ref.current?.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost"
        aria-expanded={open}
        aria-controls={open ? 'user-menu-panel' : undefined}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingInline: '0.4rem' }}
      >
        <span className="avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="visually-hidden">{t('nav.accountMenu', { name: user.name })}</span>
      </button>
      {open ? (
        <div className="menu" id="user-menu-panel">
          <div className="menu-meta">
            <div style={{ fontWeight: 700 }} className="break">
              {user.name}
            </div>
            <div className="small muted break">{user.email}</div>
            <span className="badge badge-primary" style={{ marginBlockStart: '0.35rem' }}>
              {t(`common.roles.${user.role}`)}
            </span>
          </div>
          <Link to="/app" onClick={() => setOpen(false)}>
            <LayoutDashboard size={18} aria-hidden="true" />
            {user.role === 'student' ? t('student.home') : t('nav.myLabs')}
          </Link>
          <Link to="/app/account" onClick={() => setOpen(false)}>
            <UserRound size={18} aria-hidden="true" />
            {t('nav.account')}
          </Link>
          {isAdmin ? (
            <Link to="/admin" onClick={() => setOpen(false)}>
              <ShieldCheck size={18} aria-hidden="true" />
              {t('nav.admin')}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              setOpen(false)
              // Leave the signed-in area first (committed synchronously). Logging out while
              // still on /app/... made the route guard send people to "Sign in to open the
              // page you selected" right after they chose to sign out.
              navigate('/', { flushSync: true })
              await logout()
            }}
          >
            <LogOut size={18} aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Shared header for public and signed-in areas. `variant="app"` shows app navigation. */
export function SiteHeader({ variant = 'public' }) {
  const { t } = useT()
  const { user } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggleRef = useRef(null)
  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    if (!mobileOpen) return undefined
    // Escape closes the phone menu and puts focus back on its button.
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setMobileOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const student = user?.role === 'student'
  // The bar's one button for a signed-in person. The nav row never repeats it: on a laptop the
  // row, this button and the avatar have to share one line.
  const primary = !user
    ? null
    : variant !== 'app'
    ? { to: '/app', label: student ? t('student.home') : t('nav.myLabs'), icon: FlaskConical, className: 'btn btn-soft btn-sm hide-sm' }
    : student
    ? { to: '/join', label: t('student.join'), icon: null, className: 'btn btn-sm hide-sm' }
    : { to: '/app/new', label: t('nav.newLab'), icon: Plus, className: 'btn btn-sm hide-sm' }
  // A second shortcut the menu has always offered on phones, unless it is the button itself.
  const shortcut = user ? (student ? { to: '/app/manage', label: t('student.manage') } : { to: '/app/new', label: t('nav.newLab') }) : null
  const links =
    variant === 'app' && student
      ? [
          { to: '/app', label: t('student.home'), end: true },
          { to: '/gallery', label: t('nav.gallery') },
          { to: '/learn', label: t('nav.visualLessons') },
        ]
      : variant === 'app'
      ? [
          { to: '/app', label: t('nav.myLabs'), end: true },
          { to: '/gallery', label: t('nav.gallery') },
          { to: '/learn', label: t('nav.visualLessons') },
          { to: '/guide', label: t('nav.guide') },
        ]
      : [
          // The two spaces are filters of the gallery: they live in the gallery, the home page and the footer.
          { to: '/gallery', label: t('nav.gallery'), end: true },
          { to: '/learn', label: t('nav.visualLessons') },
          { to: '/guide', label: t('nav.guide') },
          { to: '/join', label: t('nav.join') },
        ]

  const isActive = (link) => (link.end ? location.pathname === link.to : location.pathname.startsWith(link.to))

  const nav = (
    <>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} className={() => (isActive(link) ? 'active' : undefined)} aria-current={isActive(link) ? 'page' : undefined}>
          {link.label}
        </NavLink>
      ))}
    </>
  )

  return (
    <header className={['site-header', variant === 'app' && 'app-header', user && 'has-user'].filter(Boolean).join(' ')}>
      <div className="container bar">
        <Logo />
        <nav className="main-nav" aria-label={t('nav.mainNav')}>
          {nav}
        </nav>
        <div className="header-actions">
          {/* the label folds away on a crowded laptop bar (the icon keeps it as its name) */}
          <Link to="/lite" className="btn btn-ghost btn-sm header-lite" title={t('lite.linkHint')}>
            <Zap size={16} aria-hidden="true" />
            <span className="header-lite-label">{t('lite.link')}</span>
          </Link>
          <LanguageSwitch />
          {primary ? (
            <>
              <Link to={primary.to} className={primary.className}>
                {primary.icon ? <primary.icon size={16} aria-hidden="true" /> : null}
                {primary.label}
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost btn-sm hide-sm">
                {t('nav.login')}
              </Link>
              <Link to="/register" className="btn btn-sm hide-xs">
                {t('nav.register')}
              </Link>
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            className="icon-btn menu-toggle"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? t('common.actions.closeMenu') : t('common.actions.openMenu')}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {/* The menu holds what the bar has no room for at this width: each extra's class names the
          width below which the bar hides it (menu-sm 960px, menu-md 720px, mobile-only-link 520px). */}
      <nav id="mobile-nav" className={['mobile-nav container', mobileOpen && 'open'].filter(Boolean).join(' ')} aria-label={t('nav.mainNav')} hidden={!mobileOpen}>
        {nav}
        {primary ? (
          <NavLink to={primary.to} end className="menu-sm">
            {primary.label}
          </NavLink>
        ) : (
          <NavLink to="/login" className="menu-sm">
            {t('nav.login')}
          </NavLink>
        )}
        {!user ? (
          <NavLink to="/register" className="mobile-only-link">
            {t('nav.register')}
          </NavLink>
        ) : shortcut.to !== primary.to ? (
          <NavLink to={shortcut.to} className="mobile-only-link">
            {shortcut.label}
          </NavLink>
        ) : null}
        <NavLink to="/lite" className="menu-md" title={t('lite.linkHint')}>
          <Zap size={18} aria-hidden="true" />
          {t('lite.link')}
        </NavLink>
      </nav>
    </header>
  )
}
