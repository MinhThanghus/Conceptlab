import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, EyeOff, Share2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, LoadingBlock } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import Explorer from '../explorer/Explorer.jsx'
import { hiddenContent, publicSpec } from '../explorer/publicSpec.js'
import { StepHeader } from './authoring/StepHeader.jsx'
import '../explorer/studio-steps.css'
import './authoring/authoring.css'

/**
 * Studio step "Xem như học sinh": the learner Explorer built from the current lab after the
 * same filtering the server applies when publishing (approved questions, validated+approved
 * widgets, confirmed or teacher-added video markers). Saves first so the tutor reads the
 * latest content. The learner view keeps its own primary actions, so the way on to
 * sharing is card stock here.
 */
export default function PreviewStep() {
  const { t } = useT()
  const { lab, flush } = useLab()
  const [saving, setSaving] = useState(true)
  const [saveError, setSaveError] = useState(null)

  const save = () => {
    setSaving(true)
    setSaveError(null)
    flush()
      .catch((err) => setSaveError(err || true))
      .finally(() => setSaving(false))
  }

  useEffect(() => {
    save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const previewLab = useMemo(
    () => (lab ? { ...lab, spec: publicSpec(lab.spec), sources: (lab.sources || []).filter((s) => s.status === 'ready') } : null),
    [lab],
  )
  const hidden = useMemo(() => hiddenContent(lab?.spec), [lab?.spec])
  if (!lab) return null

  const hiddenLines = [
    hidden.questions ? t('explorer.preview.hiddenQuestions', { count: hidden.questions }) : null,
    hidden.quizzes ? t('explorer.preview.hiddenQuizzes', { count: hidden.quizzes }) : null,
    hidden.widgets ? t('explorer.preview.hiddenWidgets', { count: hidden.widgets }) : null,
    hidden.markers ? t('explorer.preview.hiddenMarkers', { count: hidden.markers }) : null,
  ].filter(Boolean)

  return (
    <div className="studio-step-preview">
      <details className="st-preview-notes">
        <summary>
          <ChevronDown className="st-preview-chevron" size={18} aria-hidden="true" />
          {t('explorer.preview.title')}
          {hiddenLines.length ? <span className="st-preview-count">{t('explorer.preview.hiddenCount', { count: hiddenLines.length })}</span> : null}
        </summary>
      <div className="container st-preview-intro">
        <StepHeader
          step="preview"
          title={t('explorer.preview.title')}
          description={t('explorer.preview.lead')}
          actions={
            <Link to={`/app/labs/${lab.id}/publish`} className="btn">
              <Share2 aria-hidden="true" />
              {t('explorer.preview.publishLink')}
            </Link>
          }
        />
        <Alert tone={hiddenLines.length ? 'warning' : 'success'} title={t('explorer.preview.exact')}>
          {hiddenLines.length ? (
            <>
              <ul className="st-plain-list">
                {hiddenLines.map((line) => (
                  <li key={line}>
                    <EyeOff size={15} aria-hidden="true" /> {line}
                  </li>
                ))}
              </ul>
              <Link to={`/app/labs/${lab.id}/build`}>{t('explorer.preview.reviewLink')}</Link>
            </>
          ) : (
            t('explorer.preview.nothingHidden')
          )}
        </Alert>
        {!lab.allow_tutor ? <p className="st-preview-note">{t('explorer.preview.tutorNote')}</p> : null}
        {saving ? (
          <p className="st-preview-note" role="status">
            {t('explorer.preview.saving')}
          </p>
        ) : null}
        {saveError ? (
          <Alert
            tone="warning"
            role="alert"
            action={
              <Button size="sm" onClick={save}>
                {t('common.actions.retry')}
              </Button>
            }
          >
            {t('explorer.preview.saveFailed')}
          </Alert>
        ) : null}
      </div>
      </details>
      {saving ? (
        <div className="container page">
          <LoadingBlock lines={4} height="16rem" />
        </div>
      ) : (
        <Explorer lab={previewLab} mode="preview" />
      )}
    </div>
  )
}
