import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from './AuthContext.jsx'
import { Alert, Button, ErrorMessage, LinkButton, TextField } from '../../components/ui/index.js'
import AuthShell from '../account/AuthShell.jsx'
import PasswordField from '../account/PasswordField.jsx'
import { fieldErrorsFromApi, isEmail, retryMinutes, safeNext } from '../account/formErrors.js'
import { useDocumentTitle } from '../public/hooks.js'

export default function LoginPage() {
  const { t, fmt } = useT()
  const { login, user, ready } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  useDocumentTitle(t('auth.login.metaTitle'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)

  if (ready && user && !busy) return <Navigate to={next} replace />

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!email.trim()) found.email = t('auth.errors.emailRequired')
    else if (!isEmail(email)) found.email = t('auth.errors.emailInvalid')
    if (!password) found.password = t('auth.errors.passwordRequired')
    setErrors(found)
    setFormError(null)
    if (found.email) return emailRef.current?.focus()
    if (found.password) return passwordRef.current?.focus()
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (error) {
      setBusy(false)
      const fields = fieldErrorsFromApi(error, {
        email: t('auth.errors.emailInvalid'),
        password: t('auth.errors.passwordRequired'),
      })
      setErrors(fields)
      if (error?.code === 'invalid_credentials') {
        setFormError(error)
        setPassword('')
        passwordRef.current?.focus()
      } else if (Object.keys(fields).length) {
        ;(fields.email ? emailRef : passwordRef).current?.focus()
      } else {
        setFormError(error)
      }
    }
  }

  const registerHref = `/register${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`

  return (
    <AuthShell
      title={t('auth.login.title')}
      lead={t('auth.login.lead')}
      asideTitle={t('auth.login.asideTitle')}
      asidePoints={[t('auth.login.aside.private'), t('auth.login.aside.code'), t('auth.login.aside.review')]}
      after={
        <>
          <div className="auth-divider">{t('auth.or')}</div>
          <div className="auth-student">
            <p>{t('auth.studentNoAccount')}</p>
            <LinkButton to="/join">{t('auth.joinWithCode')}</LinkButton>
          </div>
        </>
      }
    >
      {params.get('next') ? <p className="auth-note">{t('auth.login.needSignIn')}</p> : null}
      <form className="auth-form" onSubmit={onSubmit} noValidate aria-describedby={formError ? 'login-error' : undefined}>
        {formError ? (
          <div id="login-error">
            {formError.code === 'rate_limited' ? (
              // Sign-in is locked for up to 15 minutes: say how long instead of "wait a moment".
              <Alert tone="danger" role="alert">
                {t('auth.errors.tooManyAttempts', { count: retryMinutes(formError), minutes: fmt.number(retryMinutes(formError), 0) })}
              </Alert>
            ) : (
              <ErrorMessage error={formError} />
            )}
          </div>
        ) : null}
        <TextField
          ref={emailRef}
          label={t('auth.fields.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
          maxLength={254}
        />
        <PasswordField
          ref={passwordRef}
          label={t('auth.fields.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {busy ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
        <p className="auth-note">{t('auth.login.forgot')}</p>
      </form>
      <p className="auth-switch">
        {t('auth.login.noAccount')} <Link to={registerHref}>{t('auth.login.toRegister')}</Link>
      </p>
    </AuthShell>
  )
}
