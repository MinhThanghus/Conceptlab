import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CopyPlus, KeyRound, Pencil, SearchX } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { get, post } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button, EmptyState, ErrorMessage, LinkButton, LoadingBlock, useToast } from '../../components/ui/index.js'
import Explorer from './Explorer.jsx'
import LessonLanguageNotice from './LessonLanguageNotice.jsx'
import TranslationWait from './TranslationWait.jsx'
import { useTranslatedLesson } from './useTranslatedLesson.js'
import './explorer.css'

/** While the lesson loads, the shape of what opens: the deck's bar, then its cover sheet. */
function ExplorerSkeleton() {
  const { t } = useT()
  return (
    <div className="xp-skeleton" aria-busy="true">
      <div className="xp-skeleton-bar" aria-hidden="true">
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
      <div className="xp-skeleton-sheet">
        <div className="xp-skeleton-words">
          <LoadingBlock lines={4} height="4.5rem" />
        </div>
        <div className="skeleton xp-skeleton-picture" aria-hidden="true" />
      </div>
      <span className="visually-hidden">{t('explorer.shared.loading')}</span>
    </div>
  )
}

function CloneButton({ code, lab }) {
  const { t } = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!user) return null
  if (lab?.owner?.id && lab.owner.id === user.id) {
    return (
      <LinkButton to={`/app/labs/${lab.id}/build`} size="sm" icon={Pencil}>
        {t('explorer.shared.editOwn')}
      </LinkButton>
    )
  }
  return (
    <div className="stack-sm">
      <Button
        size="sm"
        icon={CopyPlus}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            const copy = await post(`/api/share/${code}/clone`)
            toast.success(t('explorer.shared.cloned'))
            navigate(`/app/labs/${copy.id}/build`)
          } catch (err) {
            setError(err)
          } finally {
            setBusy(false)
          }
        }}
      >
        {t('explorer.shared.clone')}
      </Button>
      {error?.code === 'forbidden' ? (
        <p className="small muted" role="alert" style={{ margin: 0, maxInlineSize: '22rem' }}>
          {t('explorer.shared.cloneForbidden')}
        </p>
      ) : error ? (
        <ErrorMessage error={error} />
      ) : null}
    </div>
  )
}

/** /s/:code: a published lab opened by learners with the class code (no account needed). */
export default function SharedLabPage() {
  const { code: rawCode } = useParams()
  const code = String(rawCode || '').trim().toUpperCase()
  const { t, lang } = useT()
  const requestKey = `${code}:${lang}`
  const [state, setState] = useState({ status: 'loading', lab: null, error: null })
  const translation = useTranslatedLesson(state.key === requestKey ? state.lab : null, code, lang)

  const load = useCallback(
    (signal) => {
      setState({ key: requestKey, status: 'loading', lab: null, error: null })
      get(`/api/share/${encodeURIComponent(code)}?lang=${lang}`, { signal })
        .then((lab) => { if (!signal?.aborted) setState({ key: requestKey, status: 'ready', lab, error: null }) })
        .catch((error) => {
          if (signal?.aborted || error?.name === 'AbortError') return
          setState({ key: requestKey, status: error?.status === 404 ? 'not_found' : 'error', lab: null, error })
        })
    },
    [code, lang, requestKey],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const previous = document.title
    if (translation.lab?.title) document.title = t('explorer.shared.docTitle', { title: translation.lab.title })
    else if (state.status === 'not_found') document.title = t('explorer.shared.notFoundTitle')
    return () => {
      document.title = previous
    }
  }, [translation.lab, state.status, t])

  if (state.key !== requestKey || state.status === 'loading') return <ExplorerSkeleton />

  if (state.status === 'not_found') {
    return (
      <div className="container page">
        <div className="card xp-notfound">
          <EmptyState icon={SearchX} headingLevel={1} title={t('explorer.shared.notFoundTitle')} action={<LinkButton to="/join" variant="primary" icon={KeyRound}>{t('explorer.shared.enterCode')}</LinkButton>}>
            <p>{t('explorer.shared.notFoundBody', { code })}</p>
            <p className="small">{t('explorer.shared.codeHint')}</p>
          </EmptyState>
          <p className="xp-notfound-more">
            <Link to="/gallery">{t('explorer.shared.browseGallery')}</Link>
          </p>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="container page">
        <ErrorMessage error={state.error} title={t('explorer.shared.loadError')} onRetry={() => load()} />
      </div>
    )
  }

  if (translation.status === 'loading') return <TranslationWait target={lang} onOriginal={translation.viewOriginal} />
  if (translation.status === 'error') return (
    <div className="container page stack">
      <p role="alert">{t('explorer.shared.translationFailed')}</p>
      <div><button className="btn btn-primary" onClick={translation.retry}>{t('explorer.shared.translationRetry')}</button>{' '}
        <button className="btn" onClick={translation.viewOriginal}>{t('explorer.shared.viewOriginal')}</button></div>
    </div>
  )
  const lab = translation.lab

  const introNotice = (
      <div className="xp-language-info">
        {lab.translated_language ? <p>{t(lab.translation_kind === 'reviewed' ? 'explorer.shared.translatedReviewed' : 'explorer.shared.translated')}</p> : <LessonLanguageNotice language={lab.language} />}
        <Link to={`/lite/${lab.share_code}`}>{t('lite.link')}</Link>
        <span className="small muted"> {t('lite.linkHint')}</span>
      </div>
  )
  return <Explorer key={`${lab.share_code}:${lab.translated_language || lab.language}`} lab={lab} mode="shared" introNotice={introNotice} headerActions={<CloneButton code={lab.share_code} lab={lab} />} />
}
