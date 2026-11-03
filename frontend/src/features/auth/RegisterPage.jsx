import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from './AuthContext.jsx'
import { Alert, Button, ErrorMessage, LinkButton, TextField } from '../../components/ui/index.js'
import AuthShell from '../account/AuthShell.jsx'
import PasswordField from '../account/PasswordField.jsx'
import { PASSWORD_MIN, fieldErrorsFromApi, isEmail, retryMinutes, safeNext } from '../account/formErrors.js'
import { useDocumentTitle } from '../public/hooks.js'

const ROLES = [{ value: 'teacher' }, { value: 'student' }, { value: 'researcher' }]

export default function RegisterPage() {
  const { t, lang, fmt } = useT()
  const { register, user, ready } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  useDocumentTitle(t('auth.register.metaTitle'))

  const initialRole = ROLES.some((r) => r.value === params.get('role')) ? params.get('role') : ''
  const [form, setForm] = useState({ role: initialRole, name: '', email: '', password: '', school: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [emailTaken, setEmailTaken] = useState(false)
  const [busy, setBusy] = useState(false)
  const refs = { role: useRef(null), name: useRef(null), email: useRef(null), password: useRef(null), school: useRef(null) }

  if (ready && user && !busy) return <Navigate to={next} replace />

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }))
  const order = ['role', 'name', 'email', 'password', 'school']
  const focusFirst = (found) => {
    const first = order.find((key) => found[key])
    if (first) refs[first].current?.focus()
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!form.role) found.role = t('auth.errors.roleRequired')
    if (!form.name.trim()) found.name = t('auth.errors.nameRequired')
    if (!form.email.trim()) found.email = t('auth.errors.emailRequired')
    else if (!isEmail(form.email)) found.email = t('auth.errors.emailInvalid')
    if (form.password.length < PASSWORD_MIN) found.password = t('auth.errors.passwordShort', { min: PASSWORD_MIN })
    setErrors(found)
    setFormError(null)
    setEmailTaken(false)
    if (Object.keys(found).length) return focusFirst(found)
    setBusy(true)
    try {
      await register({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        role: form.role,
        locale: lang,
        school: form.school.trim() || null,
      })
      navigate(next, { replace: true })
    } catch (error) {
      setBusy(false)
      if (error?.code === 'email_taken') {
        setErrors({ email: t('auth.errors.emailTaken') })
        setEmailTaken(true)
        refs.email.current?.focus()
        return
      }
      const fields = fieldErrorsFromApi(error, {
        role: t('auth.errors.roleRequired'),
        name: t('auth.errors.nameRequired'),
        email: t('auth.errors.emailInvalid'),
        password: t('auth.errors.passwordShort', { min: PASSWORD_MIN }),
        school: t('auth.errors.schoolTooLong'),
      })
      setErrors(fields)
      if (Object.keys(fields).length) focusFirst(fields)
      else setFormError(error)
    }
  }

  const loginHref = `/login${next !== '/app' ? `?next=${encodeURIComponent(next)}` : ''}`

  return (
    <AuthShell
      title={t('auth.register.title')}
      lead={t('auth.register.lead')}
      asideTitle={t('auth.register.asideTitle')}
      asidePoints={[t('auth.register.aside.create'), t('auth.register.aside.share'), t('auth.register.aside.results'), t('auth.register.aside.delete')]}
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
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        {formError?.code === 'rate_limited' ? (
          <Alert tone="danger" role="alert">
            {t('auth.errors.tooManyRegistrations', { count: retryMinutes(formError), minutes: fmt.number(retryMinutes(formError), 0) })}
          </Alert>
        ) : formError ? (
          <ErrorMessage error={formError} />
        ) : null}

        <fieldset className="role-fieldset">
          <legend>
            {t('auth.register.roleLabel')}
            <span aria-hidden="true" style={{ color: 'var(--cl-danger)' }}>
              {' '}
              *
            </span>
            <span className="visually-hidden"> ({t('common.a11y.required')})</span>
          </legend>
          <div className="role-cards">
            {ROLES.map(({ value }, index) => (
              <label key={value} className="role-card">
                <input
                  ref={index === 0 ? refs.role : undefined}
                  type="radio"
                  name="role"
                  value={value}
                  checked={form.role === value}
                  onChange={set('role')}
                  aria-describedby={errors.role ? 'role-error' : undefined}
                />
                <span className="role-name">{t(`common.roles.${value}`)}</span>
                <span className="role-hint">{t(`auth.register.roleHints.${value}`)}</span>
              </label>
            ))}
          </div>
          {errors.role ? (
            <span className="field-error" id="role-error">
              <CircleAlert size={16} aria-hidden="true" />
              {errors.role}
            </span>
          ) : null}
        </fieldset>

        {form.role === 'student' ? (
          <Alert tone="warning" title={t('auth.register.minorTitle')}>
            {t('auth.register.minorBody')}
          </Alert>
        ) : null}

        <TextField
          ref={refs.name}
          label={t('auth.fields.name')}
          autoComplete="name"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
          required
          maxLength={120}
        />
        <TextField
          ref={refs.email}
          label={t('auth.fields.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={form.email}
          onChange={(e) => {
            set('email')(e)
            setEmailTaken(false)
          }}
          error={errors.email}
          required
          maxLength={254}
        />
        {emailTaken ? (
          <p className="auth-note">
            {t('auth.register.emailTakenHelp')} <Link to={loginHref}>{t('auth.register.loginInstead')}</Link>
          </p>
        ) : null}
        <PasswordField
          ref={refs.password}
          label={t('auth.fields.password')}
          hint={t('auth.register.passwordHint', { min: PASSWORD_MIN })}
          value={form.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="new-password"
          showStrength
          required
          maxLength={128}
        />
        <TextField
          ref={refs.school}
          label={`${t('auth.fields.school')} (${t('common.states.optional').toLowerCase()})`}
          hint={t('auth.register.schoolHint')}
          autoComplete="organization"
          value={form.school}
          onChange={set('school')}
          error={errors.school}
          maxLength={160}
        />
        <p className="auth-note">{t('auth.register.languageNote', { language: t(`common.language.${lang}`) })}</p>

        <Alert tone="neutral" title={t('auth.register.privacyTitle')}>
          <p style={{ margin: 0 }}>{t('auth.register.privacyBody')}</p>
        </Alert>

        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          {busy ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>
      </form>
      <p className="auth-switch">
        {t('auth.register.haveAccount')} <Link to={loginHref}>{t('auth.register.toLogin')}</Link>
      </p>
    </AuthShell>
  )
}
