import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, Globe, Lock, Share2, ShieldCheck } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { Alert, Button, ConfirmDialog, ErrorMessage, Switch, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import ValidationChecklist, { summarize } from '../explorer/ValidationChecklist.jsx'
import SharePanel from '../explorer/SharePanel.jsx'
import TranslatePanel from '../explorer/TranslatePanel.jsx'
import CoverPanel from '../explorer/CoverPanel.jsx'
import { shareUrlFor } from '../explorer/explorerUtils.js'
import VersionHistory from './authoring/VersionHistory.jsx'
import { StepHeader } from './authoring/StepHeader.jsx'
import '../explorer/studio-steps.css'
import './authoring/authoring.css'

const VISIBILITIES = [
  { value: 'link', icon: Lock },
  { value: 'public', icon: Globe },
]

function PrivacyCard({ lab }) {
  const { t } = useT()
  const withPeople = (lab.sources || []).filter((s) => s.contains_people)
  const missingConsent = withPeople.filter((s) => !s.consent_confirmed)
  return (
    <section className="card stack pub-side-card" aria-labelledby="pub-privacy-title">
      <h2 id="pub-privacy-title" className="pub-card-title">
        <ShieldCheck aria-hidden="true" />
        {t('publish.privacy.title')}
      </h2>
      <ul className="st-privacy-list">
        <li>{t('publish.privacy.consent')}</li>
        <li>{t('publish.privacy.private')}</li>
        <li>{t('publish.privacy.control')}</li>
        <li>{t('publish.privacy.noRanking')}</li>
        <li>{t('publish.privacy.anonymous')}</li>
      </ul>
      {missingConsent.length ? (
        <Alert tone="danger" title={t('publish.privacy.missingTitle')}>
          {t('publish.privacy.missing', { count: missingConsent.length })} <Link to={`/app/labs/${lab.id}/sources`}>{t('publish.check.fixSources')}</Link>
        </Alert>
      ) : null}
      {lab.ai_mode === 'contributor' && withPeople.length ? <Alert tone="warning">{t('publish.privacy.contributor')}</Alert> : null}
    </section>
  )
}

/**
 * Studio step "Chia sẻ" (spec §10.5, §11, §16): checks, visibility, AI tutor switch,
 * publish/update/unpublish, class code + link + QR, translated copy, AI cover.
 */
export default function PublishStep() {
  const { t } = useT()
  const toast = useToast()
  const { lab, flush, replaceLab, reload } = useLab()
  const [report, setReport] = useState(null)
  const [checking, setChecking] = useState(true)
  const [checkError, setCheckError] = useState(null)
  const [visibility, setVisibility] = useState(lab?.visibility === 'public' ? 'public' : 'link')
  const [allowTutor, setAllowTutor] = useState(lab?.allow_tutor !== false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState(null)
  const [fresh, setFresh] = useState(false)
  const [serverUrl, setServerUrl] = useState(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const [unpublishing, setUnpublishing] = useState(false)
  const shareHeadingRef = useRef(null)
  const checksRef = useRef(null)

  const runChecks = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      await flush()
      setReport(await post(`/api/labs/${lab.id}/validate`))
    } catch (err) {
      setCheckError(err)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    runChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab?.id])

  if (!lab) return null
  const published = lab.status === 'published' && Boolean(lab.share_code)
  const settingsChanged = published && (visibility !== lab.visibility || allowTutor !== Boolean(lab.allow_tutor))
  const counts = summarize(report)
  const blockedByChecks = Boolean(report && counts.fail)

  const publish = async () => {
    const wasPublished = published
    setPublishing(true)
    setPublishError(null)
    try {
      await flush()
      const out = await post(`/api/labs/${lab.id}/publish`, { visibility, allow_tutor: allowTutor })
      replaceLab(out.lab)
      if (out.report) setReport(out.report)
      setServerUrl(out.share_url || null)
      setFresh(!wasPublished)
      toast.success(wasPublished ? t('publish.toast.updated') : t('publish.toast.published'))
      window.requestAnimationFrame(() => {
        shareHeadingRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        shareHeadingRef.current?.focus({ preventScroll: true })
      })
    } catch (err) {
      if (err?.code === 'validation_failed' && err.extra?.report) {
        setReport(err.extra.report)
        window.requestAnimationFrame(() => checksRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
      }
      setPublishError(err)
    } finally {
      setPublishing(false)
    }
  }

  const unpublish = async () => {
    setUnpublishing(true)
    setPublishError(null)
    try {
      const out = await post(`/api/labs/${lab.id}/unpublish`)
      replaceLab(out)
      setFresh(false)
      setConfirmOff(false)
      toast.success(t('publish.unpublish.done'))
    } catch (err) {
      setPublishError(err)
      setConfirmOff(false)
    } finally {
      setUnpublishing(false)
    }
  }

  // Same origin as the "join" hint and as after a reload, so the link and QR code never switch
  // hosts between "just published" and later visits; the server URL is only a fallback.
  const shareUrl = shareUrlFor(lab.share_code) || serverUrl

  const publishErrorExtra =
    publishError?.code === 'consent_required' ? (
      <Link to={`/app/labs/${lab.id}/sources`}>{t('publish.errors.consentLink')}</Link>
    ) : publishError?.code === 'nothing_to_publish' ? (
      <Link to={`/app/labs/${lab.id}/build`}>{t('publish.errors.nothingLink')}</Link>
    ) : null

  return (
    <div className="container page au-page">
      <StepHeader
        step="publish"
        title={t('publish.title')}
        description={t('publish.lead')}
        actions={
          <Link to={`/app/labs/${lab.id}/preview`} className="btn">
            <Eye aria-hidden="true" />
            {t('publish.previewLink')}
          </Link>
        }
      />

      <div className="st-pub-grid">
        <div className="stack-lg st-pub-main">
          {published ? (
            <SharePanel
              ref={shareHeadingRef}
              lab={lab}
              shareUrl={shareUrl}
              fresh={fresh}
              settingsChanged={settingsChanged}
              onUpdate={publish}
              updating={publishing}
              onUnpublish={() => setConfirmOff(true)}
            />
          ) : null}

          <div ref={checksRef}>
            <ValidationChecklist lab={lab} report={report} checking={checking} error={checkError} onRerun={runChecks} />
          </div>

          <section className="card stack" aria-labelledby="pub-settings-title">
            <h2 id="pub-settings-title" className="pub-card-title">
              <Share2 aria-hidden="true" />
              {t('publish.settings.title')}
            </h2>
            <fieldset className="st-choices">
              <legend className="field-label">{t('publish.settings.visibility')}</legend>
              <div className="st-choice-list">
                {VISIBILITIES.map(({ value, icon: Icon }) => (
                  <label key={value} className={['st-choice', visibility === value && 'is-selected'].filter(Boolean).join(' ')}>
                    <input type="radio" name="pub-visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} />
                    <span className="st-choice-text">
                      <span className="st-choice-title">
                        <Icon aria-hidden="true" />
                        {t(`publish.settings.${value}.title`)}
                      </span>
                      <span className="st-choice-desc">{t(`publish.settings.${value}.desc`)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="st-tutor">
              <Switch label={t('publish.settings.tutor')} checked={allowTutor} onChange={(e) => setAllowTutor(e.target.checked)} />
              <p className="small muted">{t('publish.settings.tutorHint')}</p>
              {allowTutor && lab.ai_mode === 'contributor' ? <p className="small st-warn-text">{t('publish.settings.tutorContributor')}</p> : null}
            </div>

            {publishError ? (
              <ErrorMessage error={publishError} />
            ) : null}
            {publishErrorExtra ? <p className="small" style={{ margin: 0 }}>{publishErrorExtra}</p> : null}
            {blockedByChecks ? (
              <Alert tone="danger">{t('publish.errors.blocked', { count: counts.fail })}</Alert>
            ) : null}

            <div className="st-publish-row">
              {published ? (
                <Button variant="primary" size="lg" icon={Share2} onClick={publish} loading={publishing} disabled={blockedByChecks || checking || (!settingsChanged && !lab.has_unpublished_changes)}>
                  {t('publish.actions.update')}
                </Button>
              ) : (
                <Button variant="primary" size="lg" icon={Share2} onClick={publish} loading={publishing} disabled={blockedByChecks || checking}>
                  {t('publish.actions.publish')}
                </Button>
              )}
              {published && !settingsChanged && !lab.has_unpublished_changes ? <span className="small muted">{t('publish.shared.upToDate')}</span> : null}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {t('publish.settings.snapshotNote')}
            </p>
          </section>

          <VersionHistory />
        </div>

        <aside className="stack-lg st-pub-aside" aria-label={t('publish.asideLabel')}>
          <PrivacyCard lab={lab} />
          <TranslatePanel lab={lab} flush={flush} />
          <CoverPanel lab={lab} flush={flush} reload={reload} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={unpublish}
        loading={unpublishing}
        tone="danger"
        title={t('publish.unpublish.title')}
        confirmLabel={t('publish.unpublish.confirm')}
      >
        <p style={{ margin: 0 }}>{t('publish.unpublish.body', { code: lab.share_code || '' })}</p>
      </ConfirmDialog>
    </div>
  )
}
