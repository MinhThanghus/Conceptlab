import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CircleAlert, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { del, post } from '../../lib/api.js'
import { Button, Checkbox, ErrorMessage, Segmented, TextField, useToast } from '../../components/ui/index.js'
import { useDocumentTitle, useFetch } from '../public/hooks.js'
import PasswordField from './PasswordField.jsx'
import { PASSWORD_MIN, fieldErrorsFromApi } from './formErrors.js'
import './account.css'

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/** One settings row: what it is on the left, the controls on the right, a hairline above. */
function Section({ id, title, lead, children, tone }) {
  return (
    <section className={['acc-row', tone && `acc-${tone}`].filter(Boolean).join(' ')} aria-labelledby={id}>
      <div className="acc-head">
        <h2 id={id}>{title}</h2>
        {lead ? <p>{lead}</p> : null}
      </div>
      <div className="acc-body">{children}</div>
    </section>
  )
}

function ProfileForm({ user }) {
  const { t } = useT()
  const { updateProfile } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user.name || '')
  const [school, setSchool] = useState(user.school || '')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef(null)
  const dirty = name.trim() !== (user.name || '') || school.trim() !== (user.school || '')

  const onSubmit = async (event) => {
    event.preventDefault()
    setFormError(null)
    if (!name.trim()) {
      setErrors({ name: t('auth.errors.nameRequired') })
      nameRef.current?.focus()
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await updateProfile({ name: name.trim(), school: school.trim() })
      toast.success(t('account.profile.saved'))
    } catch (error) {
      const fields = fieldErrorsFromApi(error, { name: t('auth.errors.nameRequired'), school: t('auth.errors.schoolTooLong') })
      setErrors(fields)
      if (!Object.keys(fields).length) setFormError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit} noValidate>
      {formError ? <ErrorMessage error={formError} /> : null}
      <TextField ref={nameRef} label={t('auth.fields.name')} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" required maxLength={120} />
      <TextField
        label={`${t('auth.fields.school')} (${t('common.states.optional').toLowerCase()})`}
        value={school}
        onChange={(e) => setSchool(e.target.value)}
        error={errors.school}
        autoComplete="organization"
        maxLength={160}
      />
      <div className="account-actions">
        <Button type="submit" loading={busy} disabled={!dirty && !busy}>
          {t('account.profile.save')}
        </Button>
        {!dirty ? <span className="small muted">{t('account.profile.noChanges')}</span> : null}
      </div>
    </form>
  )
}

function PasswordForm() {
  const { t } = useT()
  const { refresh } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const refs = { current: useRef(null), next: useRef(null), confirm: useRef(null) }

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!current) found.current = t('account.password.errors.currentRequired')
    if (next.length < PASSWORD_MIN) found.next = t('auth.errors.passwordShort', { min: PASSWORD_MIN })
    else if (next === current) found.next = t('account.password.errors.same')
    if (!found.next && confirm !== next) found.confirm = t('account.password.errors.mismatch')
    setErrors(found)
    setFormError(null)
    const first = ['current', 'next', 'confirm'].find((key) => found[key])
    if (first) return refs[first].current?.focus()
    setBusy(true)
    try {
      await post('/api/auth/password', { current_password: current, new_password: next })
      await refresh() // the server issued a new session + CSRF token
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success(t('account.password.changed'))
    } catch (error) {
      const fields = fieldErrorsFromApi(error, {
        current_password: t('account.password.errors.currentWrong'),
        new_password: t('auth.errors.passwordShort', { min: PASSWORD_MIN }),
      })
      const mapped = { current: fields.current_password, next: fields.new_password }
      setErrors(mapped)
      if (mapped.current) refs.current.current?.focus()
      else if (mapped.next) refs.next.current?.focus()
      else setFormError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit} noValidate>
      {formError ? <ErrorMessage error={formError} /> : null}
      <PasswordField ref={refs.current} label={t('account.password.current')} value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} autoComplete="current-password" required maxLength={128} />
      <PasswordField
        ref={refs.next}
        label={t('account.password.new')}
        hint={t('auth.register.passwordHint', { min: PASSWORD_MIN })}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={errors.next}
        autoComplete="new-password"
        showStrength
        required
        maxLength={128}
      />
      <PasswordField ref={refs.confirm} label={t('account.password.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" required maxLength={128} />
      <p className="small muted account-note">{t('account.password.note')}</p>
      <div className="account-actions">
        <Button type="submit" loading={busy}>
          {t('account.password.submit')}
        </Button>
      </div>
    </form>
  )
}

function DeleteAccount({ user }) {
  const { t, fmt } = useT()
  const { refresh } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const labs = useFetch('/api/labs?page_size=1')
  const [password, setPassword] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [busy, setBusy] = useState(false)
  const passwordRef = useRef(null)
  const labCount = labs.data?.total

  const onSubmit = async (event) => {
    event.preventDefault()
    const found = {}
    if (!password) found.password = t('auth.errors.passwordRequired')
    if (!understood) found.understood = t('account.delete.errors.confirm')
    setErrors(found)
    setFormError(null)
    if (found.password) return passwordRef.current?.focus()
    if (found.understood) return document.getElementById('delete-understood')?.focus()
    setBusy(true)
    try {
      await del('/api/auth/me', { password })
      toast.success(t('account.delete.done'))
      // Leave /app before the session clears, so the route guard does not bounce to "Sign in".
      navigate('/', { replace: true, flushSync: true })
      refresh()
    } catch (error) {
      setBusy(false)
      const fields = fieldErrorsFromApi(error, { password: t('account.delete.errors.wrongPassword') })
      setErrors(fields)
      if (fields.password) {
        setPassword('')
        passwordRef.current?.focus()
      } else setFormError(error)
    }
  }

  return (
    <form className="account-form" onSubmit={onSubmit} noValidate>
      <p className="account-danger-intro">{t('account.delete.intro')}</p>
      <ul className="account-consequences">
        <li>
          {labCount === undefined
            ? t('account.delete.items.labs')
            : labCount === 0
              ? t('account.delete.items.noLabs')
              : t('account.delete.items.labsCount', { count: labCount, n: fmt.number(labCount, 0) })}
        </li>
        <li>{t('account.delete.items.files')}</li>
        <li>{t('account.delete.items.codes')}</li>
        <li>{t('account.delete.items.results')}</li>
        <li>{t('account.delete.items.profile')}</li>
      </ul>
      <p className="account-irreversible">
        <TriangleAlert aria-hidden="true" />
        {t('account.delete.irreversible')}
      </p>
      {user.role === 'admin' ? <p className="small muted">{t('account.delete.adminNote')}</p> : null}
      {formError ? <ErrorMessage error={formError} /> : null}
      <PasswordField
        ref={passwordRef}
        label={t('account.delete.password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="current-password"
        required
        maxLength={128}
      />
      <div>
        <Checkbox
          id="delete-understood"
          label={t('account.delete.understand')}
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          aria-invalid={errors.understood ? 'true' : undefined}
          aria-describedby={errors.understood ? 'delete-understood-error' : undefined}
        />
        {errors.understood ? (
          <p className="field-error acc-check-error" id="delete-understood-error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {errors.understood}
          </p>
        ) : null}
      </div>
      <div className="account-actions">
        <Button type="submit" className="acc-delete-btn" icon={Trash2} loading={busy}>
          {t('account.delete.submit')}
        </Button>
      </div>
    </form>
  )
}

export default function AccountPage() {
  const { t, fmt, lang, setLang } = useT()
  const { user, updateProfile } = useAuth()
  const toast = useToast()
  useDocumentTitle(t('account.metaTitle'))
  if (!user) return null

  const changeLanguage = async (code) => {
    if (code === lang) return
    setLang(code)
    try {
      await updateProfile({ locale: code })
    } catch {
      toast.error(t('account.language.notSaved'))
    }
  }

  return (
    <div className="container page account">
      <header className="acc-top">
        <span className="avatar acc-avatar" aria-hidden="true">
          {initials(user.name)}
        </span>
        <div className="acc-top-text">
          <h1>{user.name}</h1>
          <p className="acc-facts">
            <span className="acc-fact break">{user.email}</span>
            <span className="acc-fact">{t(`common.roles.${user.role}`)}</span>
            <span className="acc-fact">{t('account.memberSince', { date: fmt.date(user.created_at) })}</span>
          </p>
        </div>
      </header>

      <Section id="account-profile" title={t('account.profile.title')} lead={t('account.profile.lead')}>
        <dl className="acc-dl">
          <div>
            <dt>{t('auth.fields.email')}</dt>
            <dd className="break">{user.email}</dd>
          </div>
          <div>
            <dt>{t('account.profile.role')}</dt>
            <dd>
              {t(`common.roles.${user.role}`)}
              <span className="acc-dl-note">{t('account.profile.roleNote')}</span>
            </dd>
          </div>
        </dl>
        <ProfileForm user={user} />
      </Section>

      <Section id="account-language" title={t('account.language.title')} lead={t('account.language.lead')}>
        <Segmented
          label={t('account.language.title')}
          value={lang}
          onChange={changeLanguage}
          options={[
            { value: 'vi', label: t('common.language.vi') },
            { value: 'en', label: t('common.language.en') },
          ]}
        />
      </Section>

      <Section id="account-password" title={t('account.password.title')} lead={t('account.password.lead')}>
        <PasswordForm />
      </Section>

      <Section id="account-privacy" title={t('account.privacy.title')}>
        <ul className="acc-list">
          {['private', 'sharing', 'modes', 'students', 'delete'].map((key) => (
            <li key={key}>{t(`account.privacy.items.${key}`)}</li>
          ))}
        </ul>
        <p className="acc-links">
          <Link to="/app">{t('account.privacy.myLabs')}</Link>
          <Link to="/guide#faq">{t('account.privacy.faq')}</Link>
        </p>
      </Section>

      <Section id="account-delete" title={t('account.delete.title')} tone="danger">
        <DeleteAccount user={user} />
      </Section>
    </div>
  )
}
