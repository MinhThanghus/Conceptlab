import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle, Quote, ScanSearch, Timer } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { Alert, Button, IconButton, LocatedBadge, ProvenanceBadge, Segmented, Spinner, useErrorText } from '../../components/ui/index.js'
import { isCitation, pageImageUrl } from './sourceMeta.js'
import { NoteContent } from './NoteContent.jsx'
import './SourceViewer.css'

const PDF_RENDER_SCALE = { fit: 1.5, 100: 1.5, 150: 2 }

function clampPage(n, count) {
  const v = Math.round(Number(n) || 1)
  return Math.min(Math.max(1, v), Math.max(1, count || 1))
}

function mmss(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Highlight boxes (normalized 0..1) over a page or image. */
function Highlights({ rects, approximate, focusRef }) {
  return rects.map((r, i) => (
    <span
      key={`${i}-${r.join(',')}`}
      ref={i === 0 ? focusRef : undefined}
      className={['sv-highlight', approximate ? 'is-approx' : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
      style={{
        left: `${Math.max(0, r[0]) * 100}%`,
        top: `${Math.max(0, r[1]) * 100}%`,
        width: `${Math.max(0.5, (r[2] - r[0]) * 100)}%`,
        height: `${Math.max(0.5, (r[3] - r[1]) * 100)}%`,
      }}
    />
  ))
}

function ZoomControl({ zoom, setZoom }) {
  const { t } = useT()
  return (
    <Segmented
      size="sm"
      label={t('sources.viewer.zoom')}
      value={zoom}
      onChange={setZoom}
      options={[
        { value: 'fit', label: t('sources.viewer.zoomFit') },
        { value: '100', label: '100%' },
        { value: '150', label: '150%' },
      ]}
    />
  )
}

/**
 * Zoomable media box. `natural` is the natural CSS size at 100% (px); the wrapper keeps the
 * highlight boxes aligned at every zoom level because they are positioned in percentages.
 */
function ZoomStage({ label, zoom, natural, children, onKeyDown }) {
  const width = zoom === 'fit' || !natural ? null : Math.round(natural.width * (zoom === '150' ? 1.5 : 1))
  return (
    <div className={['sv-stage', zoom === 'fit' ? 'is-fit' : 'is-zoomed'].join(' ')} tabIndex={0} role="region" aria-label={label} onKeyDown={onKeyDown}>
      <div className="sv-canvas" style={width ? { inlineSize: `${width}px` } : undefined}>
        {children}
      </div>
    </div>
  )
}

function useScrollIntoView(targetRef, deps) {
  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    const id = window.requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    })
    return () => window.cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function PdfView({ source, sourceRef, found }) {
  const { t, fmt } = useT()
  const count = source.page_count || 1
  const refPage = found?.page || sourceRef.page || 1
  const [page, setPage] = useState(() => clampPage(refPage, count))
  const [draft, setDraft] = useState(String(clampPage(refPage, count)))
  const [zoom, setZoom] = useState('fit')
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [natural, setNatural] = useState(null)
  const focusRef = useRef(null)

  useEffect(() => {
    const p = clampPage(refPage, count)
    setPage(p)
    setDraft(String(p))
  }, [refPage, count, source.id])

  const scale = PDF_RENDER_SCALE[zoom] || 1.5
  const url = pageImageUrl(source, page, scale)
  useEffect(() => setStatus('loading'), [url])

  const go = (p) => {
    const next = clampPage(p, count)
    setPage(next)
    setDraft(String(next))
  }

  let rects = []
  let approximate = false
  if (found?.rects?.length && found.page === page) rects = found.rects
  else if (Array.isArray(sourceRef.bbox) && sourceRef.bbox.length === 4 && (sourceRef.page || 1) === page && sourceRef.located !== 'none') {
    rects = [sourceRef.bbox]
    approximate = sourceRef.located === 'approximate'
  }
  useScrollIntoView(focusRef, [status === 'ready', zoom, page, rects.length])

  return (
    <div className="stack-sm">
      <div className="sv-toolbar">
        <div className="sv-pager">
          <IconButton icon={ChevronLeft} label={t('sources.viewer.prevPage')} bordered size="sm" disabled={page <= 1} onClick={() => go(page - 1)} />
          <label className="sv-page-input">
            <span>{t('sources.page')}</span>
            <input
              className="input input-sm"
              type="number"
              inputMode="numeric"
              min={1}
              max={count}
              value={draft}
              aria-label={t('sources.viewer.pageNumber', { count })}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => go(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  go(draft)
                }
              }}
            />
            <span className="muted">/ {fmt.number(count, 0)}</span>
          </label>
          <IconButton icon={ChevronRight} label={t('sources.viewer.nextPage')} bordered size="sm" disabled={page >= count} onClick={() => go(page + 1)} />
        </div>
        <ZoomControl zoom={zoom} setZoom={setZoom} />
      </div>
      <ZoomStage
        label={t('sources.viewer.pageAlt', { title: source.title, page })}
        zoom={zoom}
        natural={natural}
        onKeyDown={(e) => {
          if (zoom !== 'fit') return
          if (e.key === 'ArrowLeft' && page > 1) {
            e.preventDefault()
            go(page - 1)
          } else if (e.key === 'ArrowRight' && page < count) {
            e.preventDefault()
            go(page + 1)
          }
        }}
      >
        {status === 'loading' && !natural ? <div className="skeleton sv-skeleton" /> : null}
        {status === 'error' ? (
          <Alert tone="warning">{t('sources.viewer.pageError')}</Alert>
        ) : (
          <img
            key={url}
            src={url}
            alt={t('sources.viewer.pageAlt', { title: source.title, page })}
            className={status === 'ready' ? 'is-ready' : undefined}
            onLoad={(e) => {
              const img = e.currentTarget
              setNatural({ width: img.naturalWidth / scale, height: img.naturalHeight / scale })
              setStatus('ready')
            }}
            onError={() => setStatus('error')}
          />
        )}
        {status === 'ready' ? <Highlights rects={rects} approximate={approximate} focusRef={focusRef} /> : null}
        {status === 'loading' && natural ? (
          <span className="sv-loading" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span className="visually-hidden">{t('common.states.loading')}</span>
          </span>
        ) : null}
      </ZoomStage>
      {zoom === 'fit' ? <p className="sv-hint">{t('sources.viewer.keyboardPages')}</p> : null}
    </div>
  )
}

function ImageView({ source, sourceRef }) {
  const { t } = useT()
  const [zoom, setZoom] = useState('fit')
  const [status, setStatus] = useState('loading')
  const [natural, setNatural] = useState(source.width && source.height ? { width: source.width, height: source.height } : null)
  const focusRef = useRef(null)
  const rects = Array.isArray(sourceRef.bbox) && sourceRef.bbox.length === 4 && sourceRef.located !== 'none' ? [sourceRef.bbox] : []
  useScrollIntoView(focusRef, [status === 'ready', zoom, rects.length])
  return (
    <div className="stack-sm">
      <div className="sv-toolbar">
        <span className="sv-hint">{natural ? `${natural.width} × ${natural.height} px` : null}</span>
        <ZoomControl zoom={zoom} setZoom={setZoom} />
      </div>
      <ZoomStage label={source.title} zoom={zoom} natural={natural}>
        {status === 'loading' ? <div className="skeleton sv-skeleton is-photo" /> : null}
        {status === 'error' ? (
          <Alert tone="warning">{t('sources.viewer.imageError')}</Alert>
        ) : (
          <img
            src={source.urls.file}
            alt={source.title}
            width={source.width || undefined}
            height={source.height || undefined}
            className={status === 'ready' ? 'is-ready' : undefined}
            onLoad={(e) => {
              setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
              setStatus('ready')
            }}
            onError={() => setStatus('error')}
          />
        )}
        {status === 'ready' ? <Highlights rects={rects} approximate={sourceRef.located === 'approximate'} focusRef={focusRef} /> : null}
      </ZoomStage>
    </div>
  )
}

function VideoView({ source, sourceRef }) {
  const { t, fmt } = useT()
  const videoRef = useRef(null)
  const [rate, setRate] = useState('1')
  const time = sourceRef.time !== null && sourceRef.time !== undefined ? Number(sourceRef.time) : null
  const seek = () => {
    const v = videoRef.current
    if (!v || time === null) return
    try {
      v.currentTime = Math.min(time, Number.isFinite(v.duration) ? v.duration : time)
    } catch {
      /* metadata not loaded yet: onLoadedMetadata seeks */
    }
  }
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = Number(rate)
  }, [rate])
  useEffect(seek, [time]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack-sm">
      <video
        ref={videoRef}
        className="sv-video"
        src={source.urls.file}
        poster={source.urls.poster || undefined}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = Number(rate)
          seek()
        }}
      >
        {t('sources.viewer.videoUnsupported')}
      </video>
      <div className="sv-toolbar">
        {time !== null ? (
          <Button size="sm" icon={Timer} onClick={seek}>
            {t('sources.viewer.seekTo', { time: mmss(time) })}
          </Button>
        ) : (
          <span className="sv-hint">{source.duration_ms ? fmt.duration(source.duration_ms) : null}</span>
        )}
        <Segmented
          size="sm"
          label={t('sources.viewer.speed')}
          value={rate}
          onChange={setRate}
          options={['0.25', '0.5', '1'].map((value) => ({ value, label: `${fmt.number(Number(value), 2)}×` }))}
        />
      </div>
      <p className="sv-hint">{t('sources.viewer.videoHint')}</p>
    </div>
  )
}

function DataView({ source }) {
  const { t, fmt } = useT()
  const rows = Array.isArray(source.data) ? source.data : []
  return (
    <div className="stack-sm">
      <div className="sv-data-head">
        <ProvenanceBadge value="user" />
        <span className="sv-hint">{t('sources.viewer.dataHint')}</span>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('sources.data.symbol')}</th>
                <th scope="col">{t('sources.data.name')}</th>
                <th scope="col" className="num">
                  {t('sources.data.value')}
                </th>
                <th scope="col">{t('sources.data.unit')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="mono">{row.symbol}</td>
                  <td>{row.name}</td>
                  <td className="num">{fmt.number(row.value, 6)}</td>
                  <td>{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="sv-hint">{t('sources.viewer.noData')}</p>
      )}
      {source.text ? <p className="sv-note">{source.text}</p> : null}
    </div>
  )
}

/** What we know about where a citation points, said plainly (spec §11). */
function CitationNote({ source, sourceRef, found, onFound }) {
  const { t } = useT()
  const errorText = useErrorText()
  const [state, setState] = useState({ busy: false, error: null, missed: false })
  // This note is reused when the viewer moves to another source or citation: drop answers meant for the old one.
  const locateSeq = useRef(0)
  useEffect(() => {
    locateSeq.current += 1
    setState((s) => (s.busy || s.error || s.missed ? { busy: false, error: null, missed: false } : s))
  }, [source.id, sourceRef])
  const located = found?.located || sourceRef.located || 'none'
  const locationLabel = source.kind === 'note' ? sourceRef.page_label : t('sources.viewer.printedPage', { label: sourceRef.page_label })
  const canLocate = source.kind === 'pdf' && source.status === 'ready' && sourceRef.quote && located !== 'exact'

  const locate = async () => {
    const mine = ++locateSeq.current
    setState({ busy: true, error: null, missed: false })
    try {
      const res = await post(`/api/sources/${source.id}/locate`, { quote: sourceRef.quote, page: sourceRef.page || undefined })
      if (mine !== locateSeq.current) return
      if (res?.located === 'exact' && res.rects?.length) {
        onFound(res)
        setState({ busy: false, error: null, missed: false })
      } else {
        setState({ busy: false, error: null, missed: true })
      }
    } catch (error) {
      if (mine === locateSeq.current) setState({ busy: false, error, missed: false })
    }
  }

  return (
    <div className="stack-sm">
      {sourceRef.quote ? (
        <figure className="sv-quote">
          <Quote aria-hidden="true" />
          <blockquote>{sourceRef.quote}</blockquote>
          {sourceRef.page_label ? <figcaption className="sv-hint">{locationLabel}</figcaption> : null}
        </figure>
      ) : sourceRef.page_label ? (
        <p className="sv-hint">{locationLabel}</p>
      ) : null}
      {located === 'none' ? (
        <Alert tone="neutral" title={t('common.located.none')}>
          {sourceRef.page ? t('sources.viewer.noneWithPage', { page: sourceRef.page }) : t('sources.viewer.noneNoPage')}
        </Alert>
      ) : located === 'approximate' ? (
        <Alert tone="neutral">{t('sources.viewer.approximate')}</Alert>
      ) : (
        <p className="sv-exact">{t('sources.viewer.exact')}</p>
      )}
      {canLocate ? (
        <div className="sv-locate">
          <Button size="sm" icon={ScanSearch} loading={state.busy} onClick={locate}>
            {t('sources.viewer.locate')}
          </Button>
          {state.missed ? <span className="sv-hint">{t('sources.viewer.locateMissed')}</span> : null}
          {state.error ? <span className="sv-error">{errorText(state.error)}</span> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Shows a source at a SourceRef:
 *   <SourceViewer source={SourceOut} sourceRef={{ source_id, page, page_label, bbox, time, quote, located }} />
 * PDF → page viewer (prev/next, page number, zoom) with the cited region highlighted;
 * image → zoomable image with highlight; video → player at `time` with slow motion;
 * data → table (user-provided values); note → text. When the exact location is unknown it
 * says so instead of pointing at a made-up place.
 */
export default function SourceViewer({ source, sourceRef }) {
  const { t, fmt } = useT()
  const errorText = useErrorText()
  const ref = useMemo(() => sourceRef || {}, [sourceRef])
  const [found, setFound] = useState(null)
  useEffect(() => setFound(null), [source?.id, ref])

  if (!source) {
    return (
      <Alert tone="warning" title={t('sources.viewer.missingTitle')}>
        {t('sources.viewer.missing')}
      </Alert>
    )
  }
  const citation = isCitation(ref)
  const meta = [
    t(`common.sourceKinds.${source.kind}`),
    source.kind === 'pdf' && source.page_count ? t('sources.meta.pages', { count: source.page_count }) : null,
    source.kind === 'video' && source.duration_ms ? fmt.duration(source.duration_ms) : null,
    source.size_bytes ? fmt.bytes(source.size_bytes) : null,
  ]
    .filter(Boolean)
    .join(', ')
  const ready = source.status === 'ready'

  return (
    <div className="sv stack">
      <div className="sv-head">
        <div className="sv-head-text">
          <p className="sv-title break">{source.title}</p>
          <p className="sv-meta">{meta}</p>
        </div>
        {citation ? <LocatedBadge located={found?.located || ref.located || 'none'} /> : null}
      </div>

      {citation ? <CitationNote source={source} sourceRef={ref} found={found} onFound={setFound} /> : null}

      {source.status === 'processing' ? <Spinner label={t('sources.status.processingLong')} /> : null}
      {source.status === 'failed' ? (
        <Alert tone="danger" title={t('sources.status.failed')}>
          {errorText({ code: source.error_code || 'processing_failed' })}
        </Alert>
      ) : null}

      {ready && source.kind === 'pdf' && source.urls?.page ? <PdfView source={source} sourceRef={ref} found={found} /> : null}
      {ready && source.kind === 'image' && source.urls?.file ? <ImageView source={source} sourceRef={ref} /> : null}
      {ready && source.kind === 'video' && source.urls?.file ? <VideoView source={source} sourceRef={ref} /> : null}
      {source.kind === 'data' ? <DataView source={source} /> : null}
      {source.kind === 'note' ? <p className="sv-note"><NoteContent text={source.text || t('sources.viewer.emptyNote')} /></p> : null}
    </div>
  )
}
