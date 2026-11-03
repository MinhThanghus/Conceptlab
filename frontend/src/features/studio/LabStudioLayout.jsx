import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { ArrowLeft, CircleAlert, CircleCheck, CloudUpload, LoaderCircle } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { Alert, Button, Drawer, ErrorMessage, LoadingBlock, StatusBadge } from '../../components/ui/index.js'
import { LabProvider, useLab } from '../lab/LabContext.jsx'
import { BlockEnvProvider, makeAiPath } from '../blocks/BlockEnv.jsx'
import SourceViewer from '../sources/SourceViewer.jsx'
import './studio.css'

export function studioSteps(space) {
  return space === 'paper2explorer'
    ? ['sources', 'paper', 'build', 'preview', 'publish', 'results']
    : ['sources', 'analyze', 'review', 'build', 'preview', 'publish', 'results']
}

function SaveIndicator() {
  const { t } = useT()
  const { saveState } = useLab()
  const icon =
    saveState === 'saving' ? (
      <LoaderCircle size={15} className="spin" aria-hidden="true" />
    ) : saveState === 'saved' ? (
      <CircleCheck size={15} aria-hidden="true" className="is-ok" />
    ) : saveState === 'unsaved' ? (
      <CloudUpload size={15} aria-hidden="true" />
    ) : (
      <CircleAlert size={15} aria-hidden="true" className="is-error" />
    )
  return (
    <span className={`save-state is-${saveState}`} role="status" aria-live="polite">
      {icon}
      {t(`studio.saveState.${saveState}`)}
    </span>
  )
}

/** Keep the current step in view inside the sideways-scrolling stepper (phones). */
function useActiveStepInView(navRef, ready) {
  const location = useLocation()
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector('a.active')
    if (!nav || !active || typeof nav.scrollTo !== 'function') return
    if (nav.scrollWidth <= nav.clientWidth) return
    const navBox = nav.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    const left = nav.scrollLeft + (box.left - navBox.left) - (nav.clientWidth - box.width) / 2
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    nav.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  }, [navRef, ready, location.pathname])
}

function StudioShell() {
  const { t } = useT()
  const isPreview = useLocation().pathname.endsWith('/preview')
  const { ai } = useAuth()
  const { lab, loading, error, reload, saveState, saveError, flush } = useLab()
  const [sourceRef, setSourceRef] = useState(null)
  const stepperRef = useRef(null)
  useActiveStepInView(stepperRef, Boolean(lab))

  const openSource = useCallback((ref) => setSourceRef(ref), [])
  const env = useMemo(() => {
    if (!lab) return null
    return {
      mode: 'edit',
      labId: lab.id,
      shareCode: null,
      language: lab.language,
      level: lab.level,
      subject: lab.subject,
      grade: lab.grade,
      space: lab.space,
      sources: lab.sources || [],
      assets: lab.assets || [],
      sourceById: (id) => (lab.sources || []).find((s) => s.id === id) || null,
      assetById: (id) => (lab.assets || []).find((a) => a.id === id) || null,
      aiPath: makeAiPath({ labId: lab.id }),
      aiAvailable: Boolean(ai?.configured),
      openSource,
      glossary: lab.spec?.glossary || [],
      assumptions: lab.spec?.assumptions || [],
    }
  }, [lab, ai, openSource])

  if (loading && !lab)
    return (
      <div className="container page">
        <LoadingBlock lines={5} height="10rem" />
      </div>
    )
  if (error && !lab)
    return (
      <div className="container page">
        <ErrorMessage error={error} title={t('studio.loadError')} onRetry={reload} />
      </div>
    )
  if (!lab) return null

  const steps = studioSteps(lab.space)
  const viewing = sourceRef ? env.sourceById(sourceRef.source_id) : null
  return (
    <BlockEnvProvider value={env}>
      {isPreview ? <div className="studio-preview-bar">
        <Link to={`/app/labs/${lab.id}/build`}><ArrowLeft size={16} aria-hidden="true" />{t('studio.steps.build')}</Link>
        <span>{t('studio.steps.preview')}</span>
        <Link to={`/app/labs/${lab.id}/publish`}>{t('studio.steps.publish')}</Link>
        <SaveIndicator />
      </div> : <div className="studio-header">
        <div className="container inner">
          <div className="studio-title">
            <Link to="/app" className="icon-btn" aria-label={t('studio.backToLabs')} title={t('studio.backToLabs')}>
              <ArrowLeft aria-hidden="true" />
            </Link>
            <div className="studio-title-text">
              <h1>{lab.title}</h1>
              <p className="studio-meta">
                <span>{t(`common.spaces.${lab.space}`)}</span>
                <span>{t(`common.subjects.${lab.subject}`)}</span>
                <span>{t(`common.grades.${lab.grade}`)}</span>
                <StatusBadge status={lab.status} />
              </p>
            </div>
          </div>
          <SaveIndicator />
        </div>
        <div className="container">
          <nav className="stepper studio-stepper" aria-label={t('studio.stepsAria')} ref={stepperRef}>
            {steps.map((step, i) => (
              <NavLink key={step} to={step} className={({ isActive }) => (isActive ? 'active' : undefined)} onClick={() => flush().catch(() => {})}>
                <span className="step-num" aria-hidden="true">
                  {i + 1}
                </span>
                {t(`studio.steps.${step}`)}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>}
      {saveState === 'conflict' ? (
        <div className="container studio-alert">
          <Alert tone="warning" title={t('studio.conflictTitle')} action={<Button size="sm" onClick={reload}>{t('common.actions.reload')}</Button>}>
            {t('studio.conflictBody')}
          </Alert>
        </div>
      ) : saveState === 'error' ? (
        <div className="container studio-alert">
          <ErrorMessage error={saveError} onRetry={() => flush().catch(() => {})} />
        </div>
      ) : null}
      <Outlet context={{ openSource }} />
      <Drawer open={Boolean(sourceRef)} onClose={() => setSourceRef(null)} title={viewing?.title || t('blocks.sources')} width="40rem">
        {sourceRef ? <SourceViewer source={viewing} sourceRef={sourceRef} /> : null}
      </Drawer>
    </BlockEnvProvider>
  )
}

/** /app/labs/:labId/* : loads the lab and renders the current step. */
export default function LabStudioLayout() {
  const { labId } = useParams()
  return (
    <LabProvider key={labId} labId={labId}>
      <StudioShell />
    </LabProvider>
  )
}

/** Step pages: `const { openSource } = useStudio()` */
export function useStudio() {
  return useOutletContext() || {}
}
