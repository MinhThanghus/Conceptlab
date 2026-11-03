import { Component, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Bot, FlaskConical, House, MessageSquareHeart, RefreshCw, TriangleAlert, Users, WifiOff } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { RequireAdmin, RequireAuth } from '../../features/auth/AuthContext.jsx'
import { Button, EmptyState, LinkButton } from '../ui/index.js'
import { SiteHeader } from './SiteHeader.jsx'
import { LogoMark } from './Logo.jsx'

/** A lazy page chunk that failed to download (flaky mobile network, or a new deploy). */
export function isChunkLoadError(error) {
  return /dynamically imported module|importing a module script failed|error loading dynamically|chunkloaderror|loading (css )?chunk/i.test(
    `${error?.name || ''} ${error?.message || ''}`,
  )
}

function PageCrash({ error }) {
  const { t } = useT()
  const chunk = isChunkLoadError(error)
  return (
    <div className="container page" role="alert">
      <EmptyState
        icon={chunk ? WifiOff : TriangleAlert}
        headingLevel={1}
        title={chunk ? t('errors.chunkLoadTitle') : t('errors.pageCrashTitle')}
        action={
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button variant="primary" icon={RefreshCw} onClick={() => window.location.reload()}>
              {t('common.actions.reload')}
            </Button>
            <LinkButton to="/" icon={House}>
              {t('home.notFound.home')}
            </LinkButton>
          </div>
        }
      >
        <p>{chunk ? t('errors.chunkLoadBody') : t('errors.pageCrashBody')}</p>
      </EmptyState>
    </div>
  )
}

/**
 * Keeps the header and navigation usable when a page throws or its code fails to load,
 * instead of React Router's developer screen ("Unexpected Application Error!").
 * The error clears when the path changes; children are not remounted on navigation.
 */
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error, info) {
    console.error('Page error', error, info?.componentStack)
  }

  render() {
    return this.state.error ? <PageCrash error={this.state.error} /> : this.props.children
  }
}

function SafeOutlet() {
  const { pathname } = useLocation()
  return (
    <PageErrorBoundary resetKey={pathname}>
      <Outlet />
    </PageErrorBoundary>
  )
}

export function SkipLink() {
  const { t } = useT()
  return (
    <a className="skip-link" href="#main">
      {t('common.actions.skipToContent')}
    </a>
  )
}

export function SiteFooter() {
  const { t } = useT()
  return (
    <footer className="site-footer torn-band">
      <div className="container footer-mast">
        <Link to="/" className="footer-word" aria-label={t('nav.home')}>
          <LogoMark size={64} />
          <span aria-hidden="true">ConceptLab</span>
        </Link>
        <p className="footer-about">{t('nav.footer.about')}</p>
      </div>
      <div className="container cols">
        <div>
          <h2>{t('nav.footer.product')}</h2>
          <ul>
            <li>
              <NavLink to="/gallery?space=school2lab">School2Lab</NavLink>
            </li>
            <li>
              <NavLink to="/gallery?space=paper2explorer">Paper2Explorer</NavLink>
            </li>
            <li>
              <NavLink to="/gallery">{t('nav.gallery')}</NavLink>
            </li>
          </ul>
        </div>
        <div>
          <h2>{t('nav.footer.learn')}</h2>
          <ul>
            <li>
              <NavLink to="/guide">{t('nav.guide')}</NavLink>
            </li>
            <li>
              <NavLink to="/join">{t('nav.join')}</NavLink>
            </li>
            <li>
              <NavLink to="/register">{t('nav.register')}</NavLink>
            </li>
          </ul>
        </div>
        <div>
          <h2>{t('nav.footer.trust')}</h2>
          <p style={{ margin: '0 0 0.5rem' }}>{t('nav.footer.privacy')}</p>
          <p style={{ margin: 0 }}>{t('nav.footer.models')}</p>
        </div>
      </div>
      <div className="container">
        <p className="footer-legal">
          © {new Date().getFullYear()} ConceptLab AI. {t('nav.footer.rights')}
        </p>
      </div>
    </footer>
  )
}

/** Public pages: header, content, footer. */
export function PublicLayout() {
  return (
    <>
      <SkipLink />
      <SiteHeader variant="public" />
      <main id="main" className="site-main" tabIndex={-1}>
        <SafeOutlet />
      </main>
      <SiteFooter />
    </>
  )
}

/** Signed-in workspace (my labs, studio, account). No marketing footer. */
export function AppLayout() {
  return (
    <RequireAuth>
      <SkipLink />
      <SiteHeader variant="app" />
      <main id="main" className="site-main" tabIndex={-1}>
        <SafeOutlet />
      </main>
    </RequireAuth>
  )
}

/** Minimal shell for learners opening a shared lab (/s/:code). */
export function LearnerLayout() {
  return (
    <>
      <SkipLink />
      <SiteHeader variant="public" />
      <main id="main" className="site-main" tabIndex={-1}>
        <SafeOutlet />
      </main>
    </>
  )
}

export function AdminLayout() {
  const { t } = useT()
  const location = useLocation()
  const navRef = useRef(null)
  // On phones the admin nav is one sideways-scrolling row: keep the current page's tab in view.
  useEffect(() => {
    const active = navRef.current?.querySelector('a.active')
    if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [location.pathname])
  const links = [
    { to: '/admin', label: t('admin.nav.dashboard'), icon: BarChart3, end: true },
    { to: '/admin/users', label: t('admin.nav.users'), icon: Users },
    { to: '/admin/labs', label: t('admin.nav.labs'), icon: FlaskConical },
    { to: '/admin/ai', label: t('admin.nav.ai'), icon: Bot },
    { to: '/admin/feedback', label: t('admin.nav.feedback'), icon: MessageSquareHeart },
  ]
  return (
    <RequireAdmin>
      <SkipLink />
      <SiteHeader variant="app" />
      <div className="admin-layout">
        <nav className="admin-side" aria-label={t('admin.nav.label')} ref={navRef}>
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={18} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="admin-main" tabIndex={-1}>
          <SafeOutlet />
        </main>
      </div>
    </RequireAdmin>
  )
}
