import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleCheck, Languages, Sparkles } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { patch, post } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Alert, Button, Dialog, ErrorMessage, RichText, TextField } from '../../components/ui/index.js'
import { collectIdMap, pairListIds, remapIds } from './publicSpec.js'
import './studio-steps.css'

function stripTitle(spec) {
  if (!spec || typeof spec !== 'object') return spec
  const { title: _title, ...rest } = spec // eslint-disable-line no-unused-vars
  return rest
}

/**
 * Bilingual copy of a lab (spec §10.4): AI translates the lab text and glossary, the teacher
 * reviews it, then a translated copy is created (the original stays untouched).
 */
export default function TranslatePanel({ lab, flush }) {
  const { t } = useT()
  const { ai } = useAuth()
  const target = lab.language === 'vi' ? 'en' : 'vi'
  const languageName = t(`publish.languages.${target}`)
  const [busy, setBusy] = useState(null) // 'translate' | 'create'
  const [error, setError] = useState(null)
  const [review, setReview] = useState(null) // { spec, original, version }
  const [title, setTitle] = useState('')
  const [result, setResult] = useState(null) // { copy, partial }

  const translate = async () => {
    setBusy('translate')
    setError(null)
    setResult(null)
    try {
      const saved = (await flush()) || lab
      const out = await post(`/api/labs/${lab.id}/ai/translate`, { target })
      const spec = out?.spec || {}
      const translatedTitle = out?.title || spec.title || ''
      setTitle(String(translatedTitle || saved.title || lab.title).slice(0, 160))
      setReview({
        spec: stripTitle(spec),
        original: saved.spec || lab.spec,
        version: saved.version,
        sources: saved.sources || [],
        assets: saved.assets || [],
        titleTranslated: Boolean(translatedTitle),
      })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    if (!review) return
    setBusy('create')
    setError(null)
    let copy = null
    try {
      const saved = (await flush()) || lab
      if (saved.version !== review.version) {
        setError({ code: 'translate_outdated', message: t('publish.translate.outdated') })
        setBusy(null)
        return
      }
      copy = await post(`/api/labs/${lab.id}/duplicate`)
      const map = collectIdMap(review.original, copy.spec)
      pairListIds(review.sources, copy.sources || [], map)
      pairListIds(review.assets, copy.assets || [], map)
      const spec = remapIds(review.spec, map)
      const finalTitle = title.trim() || copy.title
      const updated = await patch(`/api/labs/${copy.id}`, { version: copy.version, spec, language: target, title: finalTitle.slice(0, 160) })
      setResult({ copy: updated, partial: false })
      setReview(null)
    } catch (err) {
      setError(err)
      if (copy) {
        setResult({ copy, partial: true })
        setReview(null)
      }
    } finally {
      setBusy(null)
    }
  }

  const blocks = review?.spec?.blocks || []
  const originalBlocks = review?.original?.blocks || []
  const objectives = review?.spec?.objectives || []
  const glossaryCount = (review?.spec?.glossary || []).length

  return (
    <section className="card stack pub-side-card" aria-labelledby="pub-translate-title">
      <h2 id="pub-translate-title" className="pub-card-title">
        <Languages aria-hidden="true" />
        {t('publish.translate.title')}
      </h2>
      <p className="pub-hint">{t('publish.translate.lead', { language: languageName })}</p>
      {!ai?.configured ? <Alert tone="info">{t('common.ai.notConfigured')}</Alert> : null}
      <Button icon={Sparkles} onClick={translate} loading={busy === 'translate'} disabled={!ai?.configured || Boolean(busy)}>
        {busy === 'translate' ? t('publish.translate.working') : t('publish.translate.button', { language: languageName })}
      </Button>
      {error && !review ? (error.code === 'translate_outdated' ? <Alert tone="warning">{error.message}</Alert> : <ErrorMessage error={error} />) : null}
      {result ? (
        <Alert
          tone={result.partial ? 'warning' : 'success'}
          title={result.partial ? undefined : t('publish.translate.created')}
          action={
            <Link className="btn btn-sm" to={`/app/labs/${result.copy.id}/build`}>
              {t('publish.translate.openCopy')}
            </Link>
          }
        >
          {result.partial ? t('publish.translate.partial') : <span className="break">{result.copy.title}</span>}
        </Alert>
      ) : null}

      <Dialog
        open={Boolean(review)}
        onClose={() => (busy ? null : setReview(null))}
        title={t('publish.translate.reviewTitle', { language: languageName })}
        size="wide"
        footer={
          <>
            <Button onClick={() => setReview(null)} disabled={busy === 'create'}>
              {t('common.actions.cancel')}
            </Button>
            <Button variant="primary" icon={CircleCheck} onClick={create} loading={busy === 'create'}>
              {t('publish.translate.create', { language: languageName })}
            </Button>
          </>
        }
      >
        {review ? (
          <div className="stack">
            <Alert tone="info">{t('publish.translate.reviewLead')}</Alert>
            <TextField
              label={t('publish.translate.titleLabel')}
              hint={review.titleTranslated ? undefined : t('publish.translate.titleHint', { language: languageName })}
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              lang={target}
              data-autofocus
            />
            {review.spec.summary ? (
              <div className="stack-sm">
                <h3 className="pub-review-h">{t('publish.translate.summary')}</h3>
                <div className="card-muted" lang={target}>
                  <RichText text={review.spec.summary} />
                </div>
              </div>
            ) : null}
            {objectives.length ? (
              <div className="stack-sm">
                <h3 className="pub-review-h">{t('publish.translate.objectives')}</h3>
                <ul className="pub-review-list" lang={target}>
                  {objectives.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {blocks.length ? (
              <div className="stack-sm">
                <h3 className="pub-review-h">{t('publish.translate.blocks', { count: blocks.length })}</h3>
                <ol className="pub-review-blocks">
                  {blocks.map((block, i) => (
                    <li key={block.id || i}>
                      <span className="muted" lang={lab.language}>
                        {originalBlocks[i]?.title || t(`blocks.types.${block.type}`)}
                      </span>
                      <ArrowRight size={16} aria-hidden="true" />
                      <strong lang={target}>{block.title || t(`blocks.types.${block.type}`)}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {glossaryCount ? <p className="pub-hint">{t('publish.translate.glossary', { count: glossaryCount })}</p> : null}
            {error ? (error.code === 'translate_outdated' ? <Alert tone="warning">{error.message}</Alert> : <ErrorMessage error={error} />) : null}
          </div>
        ) : null}
      </Dialog>
    </section>
  )
}
