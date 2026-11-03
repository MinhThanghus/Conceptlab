import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { ApiError, get } from '../../lib/api.js'
import { useErrorText } from '../../components/ui/index.js'
import ClassCodeForm from './ClassCodeForm.jsx'
import { AMBIGUOUS, sharePath } from './classCode.js'
import { useDocumentTitle } from './hooks.js'
import './join.css'

const TIPS = ['noAccount', 'qr', 'ask']

export default function JoinPage() {
  const { t } = useT()
  const errorText = useErrorText()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  useDocumentTitle(t('join.meta.title'))

  // Validate with the server first so a typo gets a clear message here, not a broken page.
  const submit = async (code) => {
    try {
      await get(`/api/share/${encodeURIComponent(code)}`)
      navigate(sharePath(code))
      return ''
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return t('join.errors.notFound', { code })
      return errorText(error) || t('errors.generic')
    }
  }

  return (
    <div className="join">
      <div className="container jn-grid">
        <section className="jn-counter" aria-labelledby="join-title">
          <h1 id="join-title">{t('join.title')}</h1>
          <p className="jn-lead">{t('join.lead')}</p>
          <ClassCodeForm size="large" initialCode={params.get('code') || ''} autoFocus onSubmitCode={submit} />
          <p className="jn-never" aria-hidden="true">
            <span>{t('join.lookAlikeTitle')}</span>
            <span className="jn-never-chars">
              {AMBIGUOUS.map((ch) => (
                <s key={ch}>{ch}</s>
              ))}
            </span>
          </p>
          <p className="visually-hidden">{t('join.lookAlikeSpoken')}</p>
        </section>

        <aside className="jn-tips" aria-labelledby="join-tips-title">
          <h2 id="join-tips-title">{t('join.tipsTitle')}</h2>
          <ul className="list-reset jn-rows">
            {TIPS.map((key) => (
              <li key={key}>
                <h3>{t(`join.tips.${key}.title`)}</h3>
                <p>{t(`join.tips.${key}.body`)}</p>
              </li>
            ))}
          </ul>
          <p className="jn-more">
            {t('join.noCode')} <Link to="/gallery">{t('join.browseGallery')}</Link>
          </p>
        </aside>
      </div>
    </div>
  )
}
