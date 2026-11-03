import { useEffect, useId, useState } from 'react'
import { ChevronLeft, ChevronRight, FileText, LocateFixed, MapPinOff, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, IconButton, LocatedBadge } from '../../components/ui/index.js'

const ZOOM_SCALE = 2.5

function pageUrl(source, page, zoom) {
  const template = source?.urls?.page
  if (!template || !(page >= 1)) return null
  const url = template.replace('{n}', String(page))
  return zoom ? `${url}${url.includes('?') ? '&' : '?'}scale=${ZOOM_SCALE}` : url
}

/** One rendered PDF page; resets (skeleton → image | error) whenever its key changes. */
function PageImage({ url, alt, zoom, children }) {
  const { t } = useT()
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const src = attempt ? `${url}${url.includes('?') ? '&' : '?'}retry=${attempt}` : url
  return (
    <div className={['paper-page-scroll', zoom && 'is-zoomed'].filter(Boolean).join(' ')} tabIndex={zoom ? 0 : undefined} aria-label={zoom ? alt : undefined}>
      <div className="paper-page" data-state={state}>
        {state === 'loading' ? <div className="skeleton paper-page-skeleton" aria-hidden="true" /> : null}
        {state === 'error' ? (
          <div className="paper-page-error">
            <Alert
              tone="warning"
              action={
                <Button
                  size="sm"
                  icon={RefreshCw}
                  onClick={() => {
                    setState('loading')
                    setAttempt((n) => n + 1)
                  }}
                >
                  {t('common.actions.retry')}
                </Button>
              }
            >
              {t('paper.viewer.loadError')}
            </Alert>
          </div>
        ) : null}
        <img
          src={src}
          alt={alt}
          decoding="async"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
          className={state === 'ready' ? 'is-ready' : undefined}
        />
        {state === 'ready' ? children : null}
      </div>
    </div>
  )
}

/**
 * PDF page viewer for the paper workspace.
 *   source: SourceOut (kind pdf)
 *   page: page shown (1-based); onPageChange(n)
 *   focus: { ref: SourceRef|null, label, kind } describing the selected item, or null
 * Highlights the focused SourceRef's bbox only on its own page (solid = exact, dashed =
 * approximate) and says so plainly when the page or region is unknown, never a fake target.
 */
export default function PaperPageViewer({ source, page, onPageChange, focus }) {
  const { t } = useT()
  const headingId = useId()
  const [zoom, setZoom] = useState(false)
  const count = Math.max(1, Number(source?.page_count) || 1)
  const current = Math.min(Math.max(1, Number(page) || 1), count)
  const [draft, setDraft] = useState(String(current))
  useEffect(() => setDraft(String(current)), [current])

  const ref = focus?.ref || null
  const sameSource = !ref?.source_id || ref.source_id === source?.id
  const focusPage = focus?.kind === 'section' ? Number(focus.page) || null : sameSource && Number(ref?.page) >= 1 ? Number(ref.page) : null
  const bbox = Array.isArray(ref?.bbox) && ref.bbox.length === 4 ? ref.bbox.map(Number) : null
  const showBox = Boolean(bbox && sameSource && focusPage === current && ref.located && ref.located !== 'none')
  const url = pageUrl(source, current, zoom)

  const go = (n) => {
    const next = Math.min(Math.max(1, Math.round(Number(n)) || 1), count)
    if (next !== current) onPageChange?.(next)
    else setDraft(String(current))
  }

  let note = null
  if (focus?.kind === 'section') {
    note = { tone: 'neutral', icon: FileText, text: focusPage ? t('paper.viewer.sectionStart', { page: focusPage }) : t('paper.viewer.unknownPage') }
  } else if (focus && !ref) {
    note = { tone: 'neutral', icon: MapPinOff, text: t('paper.viewer.noRef') }
  } else if (ref && !sameSource) {
    note = { tone: 'neutral', icon: MapPinOff, text: t('paper.viewer.otherSource') }
  } else if (ref && !focusPage) {
    note = { tone: 'neutral', icon: MapPinOff, text: t('paper.viewer.unknownPage') }
  } else if (ref && (!bbox || ref.located === 'none')) {
    note = { tone: 'neutral', icon: MapPinOff, text: t('paper.viewer.unknownRegion', { page: focusPage }) }
  } else if (ref?.located === 'approximate') {
    note = { tone: 'warning', icon: null, text: t('paper.viewer.approximate') }
  } else if (ref?.located === 'exact') {
    note = { tone: 'info', icon: null, text: t('paper.viewer.exact') }
  }

  if (!source) {
    return (
      <section className="paper-viewer card" aria-labelledby={headingId}>
        <h3 id={headingId} className="panel-title">
          <FileText size={18} aria-hidden="true" />
          {t('paper.viewer.title')}
        </h3>
        <Alert tone="neutral">{t('paper.viewer.noSource')}</Alert>
      </section>
    )
  }

  return (
    <section className="paper-viewer card" aria-labelledby={headingId}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ minInlineSize: 0 }}>
          <h3 id={headingId} className="panel-title" style={{ marginBlockEnd: '0.15rem' }}>
            <FileText size={18} aria-hidden="true" />
            {t('paper.viewer.title')}
          </h3>
          <p className="small muted break" style={{ margin: 0 }}>
            {source.title}
          </p>
        </div>
        {ref && sameSource ? <LocatedBadge located={ref.located || 'none'} /> : null}
      </div>

      {focus?.label ? (
        <p className="small" style={{ margin: 0 }}>
          <span className="muted">{t('paper.viewer.looking')}</span> <strong className="break">{focus.label}</strong>
        </p>
      ) : null}
      {note ? (
        <div className={`paper-viewer-note tone-${note.tone}`} role="status">
          {note.icon ? <note.icon size={16} aria-hidden="true" /> : null}
          <span>{note.text}</span>
        </div>
      ) : null}
      {ref?.quote && sameSource ? (
        <blockquote className="paper-quote small">
          <span className="visually-hidden">{t('paper.viewer.quote')}: </span>“{ref.quote}”
        </blockquote>
      ) : null}

      <div className="paper-viewer-nav">
        <IconButton icon={ChevronLeft} label={t('paper.viewer.prev')} bordered size="sm" disabled={current <= 1} onClick={() => go(current - 1)} />
        <label className="paper-page-input">
          <span>{t('paper.viewer.page')}</span>
          <input
            className="input input-sm"
            type="number"
            inputMode="numeric"
            min={1}
            max={count}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => go(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                go(draft)
              }
            }}
          />
          <span className="muted">/ {count}</span>
        </label>
        <IconButton icon={ChevronRight} label={t('paper.viewer.next')} bordered size="sm" disabled={current >= count} onClick={() => go(current + 1)} />
        <IconButton
          icon={zoom ? ZoomOut : ZoomIn}
          label={zoom ? t('paper.viewer.zoomOut') : t('paper.viewer.zoomIn')}
          bordered
          size="sm"
          pressed={zoom}
          onClick={() => setZoom((z) => !z)}
        />
        {focusPage && focusPage !== current ? (
          <Button size="sm" variant="soft" icon={LocateFixed} onClick={() => go(focusPage)}>
            {t('paper.viewer.backToItem', { page: focusPage })}
          </Button>
        ) : null}
      </div>

      {url ? (
        <PageImage key={url} url={url} zoom={zoom} alt={t('paper.viewer.alt', { page: current, title: source.title })}>
          {showBox ? (
            <span
              className={['paper-highlight', ref.located === 'approximate' && 'is-approximate'].filter(Boolean).join(' ')}
              style={{
                left: `${Math.max(0, bbox[0]) * 100}%`,
                top: `${Math.max(0, bbox[1]) * 100}%`,
                width: `${Math.max(0.01, bbox[2] - bbox[0]) * 100}%`,
                height: `${Math.max(0.01, bbox[3] - bbox[1]) * 100}%`,
              }}
              aria-hidden="true"
            >
              {focus?.short ? <span className="paper-highlight-tag">{focus.short}</span> : null}
            </span>
          ) : null}
          {showBox ? <span className="visually-hidden">{t('paper.viewer.highlighted', { label: focus?.label || '' })}</span> : null}
        </PageImage>
      ) : (
        <Alert tone="warning">{source.status === 'processing' ? t('paper.viewer.processing') : t('paper.viewer.noPages')}</Alert>
      )}
    </section>
  )
}
