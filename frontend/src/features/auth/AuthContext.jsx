import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { get, onUnauthorized, patch, post, setCsrfToken } from '../../lib/api.js'
import { LoadingBlock } from '../../components/ui/index.js'
import { useT } from '../../i18n/index.jsx'

const AuthContext = createContext(null)

/**
 * Session state mirrored from the server (GET /api/auth/me). The server is the
 * source of truth for identity and roles; nothing about the session is stored in
 * localStorage. Exposes: user, ai (AI status), ready, login, register, logout,
 * refresh, updateProfile.
 */
export function AuthProvider({ children }) {
  const { setLang } = useT()
  const [state, setState] = useState({ ready: false, user: null, ai: null })

  const apply = useCallback(
    (me) => {
      setCsrfToken(me?.csrf_token)
      setState({ ready: true, user: me?.user || null, ai: me?.ai || null })
      if (me?.user?.locale) setLang(me.user.locale)
      return me?.user || null
    },
    [setLang],
  )

  const refresh = useCallback(async () => {
    try {
      return apply(await get('/api/auth/me'))
    } catch {
      setState((s) => ({ ...s, ready: true }))
      return null
    }
  }, [apply])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(
    () =>
      onUnauthorized(() => {
        setCsrfToken(null)
        setState((s) => (s.user ? { ...s, user: null } : s))
      }),
    [],
  )

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      login: async (email, password) => apply(await post('/api/auth/login', { email, password })),
      register: async (payload) => apply(await post('/api/auth/register', payload)),
      logout: async () => {
        try {
          await post('/api/auth/logout')
        } finally {
          setCsrfToken(null)
          setState((s) => ({ ...s, user: null }))
          refresh()
        }
      },
      updateProfile: async (payload) => apply(await patch('/api/auth/me', payload)),
      isAdmin: state.user?.role === 'admin',
    }),
    [state, refresh, apply],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Route guard for signed-in areas (UI only — the API enforces permissions itself). */
export function RequireAuth({ children }) {
  const { ready, user } = useAuth()
  const location = useLocation()
  if (!ready)
    return (
      <div className="container page">
        <LoadingBlock lines={4} height="8rem" />
      </div>
    )
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

export function RequireAdmin({ children }) {
  const { ready, user } = useAuth()
  const location = useLocation()
  if (!ready)
    return (
      <div className="container page">
        <LoadingBlock lines={4} height="8rem" />
      </div>
    )
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (user.role !== 'admin') return <Navigate to="/app" replace />
  return children
}
