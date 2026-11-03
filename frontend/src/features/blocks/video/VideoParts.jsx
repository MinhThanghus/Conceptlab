import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clapperboard, Keyboard, ShieldCheck } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { get } from '../../../lib/api.js'
import { Alert, EmptyState, IconButton, Spinner, useErrorText } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { formatClock } from './videoUtils.js'

/**
 * The video source of a block. In the studio a source that is still being transcoded is
 * polled (GET /api/sources/:id) until it is ready, so the teacher sees it appear.
 */
export function useLiveSource(sourceId) {
  const env = useBlockEnv()
  const base = sourceId ? env.sourceById(sourceId) : null
  const [polled, setPolled] = useState(null)
  const current = base && base.status !== 'processing' ? base : polled && polled.id === sourceId ? polled : base
  const shouldPoll = Boolean(env.labId && sourceId && current && current.status === 'processing')

  useEffect(() => {
    if (!shouldPoll) return undefined
    let alive = true
    let timer = 0
    const ctrl = new AbortController()
    const tick = async () => {
      try {
        const next = await get(`/api/sources/${sourceId}`, { signal: ctrl.signal })
        if (!alive) return
        setPolled(next)
        if (next?.status === 'processing') timer = window.setTimeout(tick, 4000)
      } catch (error) {
        if (alive && error?.name !== 'AbortError') timer = window.setTimeout(tick, 8000)
      }
    }
    timer = window.setTimeout(tick, 2500)
    return () => {
      alive = false
      ctrl.abort()
      window.clearTimeout(timer)
    }
  }, [shouldPoll, sourceId])

  return current
}

/** Honest state of the video source; renders nothing when the video can play. */
export function SourceStatus({ sourceId, source, editHint }) {
  const { t } = useT()
  const errorText = useErrorText()
  if (!sourceId) {
    return (
      <EmptyState icon={Clapperboard} title={t('video.status.noVideoTitle')}>
        <p>{editHint ? t('video.status.noVideoEdit') : t('video.status.noVideoView')}</p>
      </EmptyState>
    )
  }
  if (!source) return <Alert tone="warning">{t('video.status.missing')}</Alert>
  if (source.status === 'processing') {
    return (
      <div className="card-muted stack-sm" role="status">
        <Spinner label={t('video.status.processing')} />
        <p className="small muted" style={{ margin: 0 }}>
          {t('video.status.processingHint')}
        </p>
      </div>
    )
  }
  if (source.status === 'failed') {
    return (
      <Alert tone="danger" title={t('video.status.failed')}>
        {source.error_code ? errorText({ code: source.error_code }) : t('video.status.failedHint')}
      </Alert>
    )
  }
  if (source.kind !== 'video' || !source.urls?.file) return <Alert tone="warning">{t('video.status.missing')}</Alert>
  return null
}

/** Always-visible limits of video observation (spec §8.3) + the lesson's own note. */
export function LimitsNote({ note }) {
  const { t } = useT()
  return (
    <div className="alert alert-neutral vb-limits">
      <ShieldCheck aria-hidden="true" />
      <div style={{ flex: 1, minInlineSize: 0 }}>
        <p className="alert-title">{t('video.limits.title')}</p>
        <p>{t('video.limits.fixed')}</p>
        {note ? <p className="break">{note}</p> : null}
      </div>
    </div>
  )
}

export function ShortcutHelp({ id }) {
  const { t } = useT()
  return (
    <details className="vb-help">
      <summary>
        <Keyboard aria-hidden="true" />
        {t('video.help.title')}
      </summary>
      <p className="small muted" id={id} style={{ margin: '0.25rem 0 0' }}>
        {t('video.help.intro')}
      </p>
      <ul>
        <li>
          <kbd className="kbd">{t('video.help.keySpace')}</kbd> {t('video.help.space')}
        </li>
        <li>
          <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> {t('video.help.arrows')}
        </li>
        <li>
          <kbd className="kbd">{t('video.help.keyShift')}</kbd> + <kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd> {t('video.help.shiftArrows')}
        </li>
        <li>
          <kbd className="kbd">{t('video.help.keyHome')}</kbd> <kbd className="kbd">{t('video.help.keyEnd')}</kbd> {t('video.help.homeEnd')}
        </li>
      </ul>
    </details>
  )
}

/** Switches to show/hide each SAM highlight; colour swatch + phrase (never colour alone). */
export function TrackToggles({ tracks, visible, onToggle, title }) {
  const { t } = useT()
  if (!tracks.length) return null
  return (
    <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="field-label" style={{ padding: 0 }}>
        {title || t('video.tracks.viewTitle')}
      </legend>
      <div className="vb-tracks">
        {tracks.map((tr) => (
          <label key={tr.id} className="switch">
            <input type="checkbox" role="switch" checked={visible.has(tr.id)} onChange={() => onToggle(tr.id)} />
            <span className="row" style={{ gap: '0.4rem' }}>
              <span className="vb-swatch" style={{ background: `var(${tr.colorVar})` }} aria-hidden="true" />
              <span className="break">{tr.phrase || t('video.tracks.unnamed')}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {t('video.tracks.viewHint')}
      </p>
    </fieldset>
  )
}

/** Learner list of observation markers; clicking one seeks there and pauses. */
export function MarkerList({ markers, currentId, onSelect, labelledBy }) {
  const { lang } = useT()
  return (
    <ol className="vb-markers" aria-labelledby={labelledBy}>
      {markers.map((m) => (
        <li key={m.id}>
          <button type="button" className="vb-marker" aria-current={m.id === currentId ? 'true' : undefined} onClick={() => onSelect(m)}>
            <span className="vb-marker-time">{formatClock(m.t, { lang })}</span>
            <span className="vb-marker-body">
              <strong>{m.label}</strong>
              {m.note ? <span>{m.note}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}

/** "What to look at now": the current marker with previous/next navigation. */
export function ObservationCard({ marker, index, total, onPrev, onNext }) {
  const { t, lang } = useT()
  return (
    <div className="vb-observe" aria-live="polite">
      <div className="row-between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ gap: '0.2rem', minInlineSize: 0 }}>
          <span className="vb-observe-meta">
            {marker ? t('video.observe.meta', { n: index + 1, total, time: formatClock(marker.t, { lang }) }) : t('video.observe.before')}
          </span>
          <h3 className="break">{marker ? marker.label : t('video.observe.beforeTitle')}</h3>
        </div>
        <div className="row" style={{ gap: '0.25rem', flexWrap: 'nowrap' }}>
          <IconButton icon={ChevronLeft} label={t('video.observe.prev')} size="sm" bordered onClick={onPrev} disabled={!onPrev} />
          <IconButton icon={ChevronRight} label={t('video.observe.next')} size="sm" bordered onClick={onNext} disabled={!onNext} />
        </div>
      </div>
      {marker?.note ? <p className="break">{marker.note}</p> : null}
      {!marker ? <p className="small">{t('video.observe.beforeHint')}</p> : null}
    </div>
  )
}
