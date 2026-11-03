import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Info, Lightbulb, MousePointer2, RotateCcw, ScanSearch, Square, Type, Undo2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post, upload } from '../../lib/api.js'
import { cutoutBlob, drawMaskOverlay, normalizedBox, normalizedMaskPath } from '../../lib/sam.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import { Alert, Button, Dialog, EmptyState, ErrorMessage, Segmented, SelectField, Switch, TextField } from '../../components/ui/index.js'
import { pageImageUrl } from '../sources/sourceMeta.js'
import { boxFromPoints, boxIsUsable, boxToPercent, clientToImage, moveCursor, pointToPercent, rankObjects, scaleBox, scalePoint } from './geometry.js'
import './SamSelector.css'

/** PDF pages are shown (and segmented) from the page render at this scale. */
export const PDF_SAM_SCALE = 1.5
const MAX_POINTS = 10

function cssToken(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || fallback
  } catch {
    return fallback
  }
}

/**
 * [r, g, b] of a design token, whatever colour syntax it is written in (the tokens are OKLCH):
 * the browser paints it into one canvas pixel and we read the pixel back.
 */
function tokenRgb(name, fallback) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.fillStyle = cssToken(name, '')
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return a ? [r, g, b] : fallback
  } catch {
    return fallback
  }
}

/**
 * Select an object in an image with SAM 3.1 (spec §6.1): describe it in words, click on it, or
 * drag a box around it. SAM only finds the region of the object; it does not determine
 * physical parameters (length, mass…), those stay with the teacher.
 *
 *   <SamSelector image={{ url, width, height }} sourceId page assetId
 *                onSelect={({ asset, object, box, mask_path }) => …} onCancel={…} />
 *
 * `box` is normalized 0..1 and `mask_path` an SVG path in 0..1000 units (diagram hotspot format).
 * The cut-out is uploaded as a lab asset (kind "cutout"); `asset` is the AssetOut.
 * Optional: `labId` (defaults to the block environment), `initialPhrase`, `label` (name stored
 * with the cut-out, shown in object pickers), `mediaSize`
 * ({width, height} of the media the server segments, when it differs from the displayed image).
 */
export function SamSelector({ image, sourceId, page, assetId, labId: labIdProp, initialPhrase = '', label = '', mediaSize, onSelect, onCancel }) {
  const { t, fmt } = useT()
  const env = useBlockEnv()
  const { ai } = useAuth()
  const labId = labIdProp || env.labId
  const hintId = useId()

  const [mode, setMode] = useState('phrase')
  const [phrase, setPhrase] = useState(initialPhrase || '')
  const [points, setPoints] = useState([])
  const [negative, setNegative] = useState(false)
  const [box, setBox] = useState(null)
  const [drag, setDrag] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [keyboard, setKeyboard] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const [natural, setNatural] = useState(image?.width && image?.height ? { width: image.width, height: image.height } : null)
  const [imgState, setImgState] = useState('loading')
  const [result, setResult] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [hoverId, setHoverId] = useState(null)
  const [busy, setBusy] = useState(null) // 'search' | 'save'
  const [error, setError] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [announce, setAnnounce] = useState('')

  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const controllerRef = useRef(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const ranked = useMemo(() => rankObjects(result?.objects || []), [result])
  const numberOf = useMemo(() => new Map(ranked.map((o, i) => [o.id, i + 1])), [ranked])
  const selected = ranked.find((o) => o.id === selectedId) || null

  // ---------------------------------------------------------------- canvas overlay
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return undefined
    const draw = () => {
      const rect = img.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (!result?.objects?.length || !result.width || !result.height) return
      // The chosen region is marked in pear, like a highlighter; the others in blue (what the picture shows).
      const accent = tokenRgb('--color-accent', [240, 212, 58])
      const primary = tokenRgb('--color-accent-2', [0, 100, 190])
      const ink = cssToken('--color-ink', 'black')
      const primaryStroke = cssToken('--color-accent-2', 'blue')
      const ordered = [...result.objects].sort((a, b) => Number(a.id === selectedId || a.id === hoverId) - Number(b.id === selectedId || b.id === hoverId))
      for (const obj of ordered) {
        const active = obj.id === selectedId || obj.id === hoverId
        drawMaskOverlay(ctx, obj, result.width, result.height, active ? { color: accent, alpha: 0.55, stroke: ink } : { color: primary, alpha: 0.3, stroke: primaryStroke })
      }
    }
    draw()
    let observer = null
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(draw)
      observer.observe(img)
    }
    return () => observer?.disconnect()
  }, [result, selectedId, hoverId, imgState])

  // ---------------------------------------------------------------- geometry helpers
  const size = natural
  const minBox = size ? Math.max(6, Math.round(Math.min(size.width, size.height) * 0.01)) : 6
  const toImage = (e) => (size && imgRef.current ? clientToImage(e.clientX, e.clientY, imgRef.current.getBoundingClientRect(), size.width, size.height) : null)
  const toMedia = (p) => (mediaSize && size ? scalePoint(p, size, mediaSize) : p)

  const addPoint = (p) => {
    if (!p) return
    if (points.length >= MAX_POINTS) {
      setAnnounce(t('sam.points.max', { count: MAX_POINTS }))
      return
    }
    const next = [...points, { x: p.x, y: p.y, negative }]
    setPoints(next)
    setAnnounce(t(negative ? 'sam.points.addedNegative' : 'sam.points.added', { n: next.length }))
  }

  const selectAt = (p) => {
    if (!p || !ranked.length) return
    const hits = ranked.filter((o) => p.x >= o.box[0] && p.x <= o.box[2] && p.y >= o.box[1] && p.y <= o.box[3])
    if (!hits.length) return
    const area = (o) => (o.box[2] - o.box[0]) * (o.box[3] - o.box[1])
    const best = [...hits].sort((a, b) => area(a) - area(b))[0]
    setSelectedId(best.id)
    setAnnounce(t('sam.results.selected', { n: numberOf.get(best.id) }))
  }

  // ---------------------------------------------------------------- pointer + keyboard
  const onPointerDown = (e) => {
    if (busy || !size) return
    setKeyboard(false)
    if (mode === 'box') {
      const p = toImage(e)
      if (!p) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      setDrag({ start: p, current: p })
    }
  }
  const onPointerMove = (e) => {
    if (mode === 'box' && drag) {
      const p = toImage(e)
      if (p) setDrag((d) => (d ? { ...d, current: p } : d))
    }
  }
  const onPointerUp = (e) => {
    if (busy || !size) return
    const p = toImage(e)
    if (mode === 'box') {
      if (!drag) return
      const b = boxFromPoints(drag.start, p || drag.current)
      setDrag(null)
      if (boxIsUsable(b, minBox)) {
        setBox(b)
        setAnnounce(t('sam.box.set'))
      }
      return
    }
    if (mode === 'point') addPoint(p)
    else if (mode === 'phrase') selectAt(p)
  }
  const onKeyDown = (e) => {
    if (!size) return
    if (e.key.startsWith('Arrow')) {
      const c = moveCursor(cursor, e.key, size.width, size.height, e.shiftKey)
      if (c) {
        e.preventDefault()
        setKeyboard(true)
        setCursor(c)
      }
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setKeyboard(true)
      const c = cursor || { x: Math.round(size.width / 2), y: Math.round(size.height / 2) }
      if (!cursor) setCursor(c)
      if (mode === 'point') addPoint(c)
      else if (mode === 'box') {
        if (!anchor) {
          setAnchor(c)
          setAnnounce(t('sam.box.firstCorner'))
        } else {
          const b = boxFromPoints(anchor, c)
          setAnchor(null)
          if (boxIsUsable(b, minBox)) {
            setBox(b)
            setAnnounce(t('sam.box.set'))
          } else setAnnounce(t('sam.box.tooSmall'))
        }
      } else selectAt(c)
    }
  }

  // ---------------------------------------------------------------- actions
  const canSearch =
    Boolean(ai?.configured && labId && (sourceId || assetId) && size) &&
    (mode === 'phrase' ? phrase.trim().length >= 2 : mode === 'point' ? points.some((p) => !p.negative) : Boolean(box))

  const search = async () => {
    if (!canSearch || busy) return
    const body = assetId ? { asset_id: assetId } : { source_id: sourceId }
    if (page) body.page = page
    if (mode === 'phrase') body.phrase = phrase.trim().slice(0, 120)
    else if (mode === 'point') body.points = points.map((p) => ({ ...toMedia(p), negative: Boolean(p.negative) }))
    else body.box = mediaSize && size ? scaleBox(box, size, mediaSize) : box
    const controller = new AbortController()
    controllerRef.current?.abort()
    controllerRef.current = controller
    setBusy('search')
    setError(null)
    setSaveError(null)
    try {
      const res = await post(`/api/labs/${labId}/ai/segment`, body, { signal: controller.signal })
      const objects = Array.isArray(res?.objects) ? res.objects.filter((o) => Array.isArray(o.box) && o.box.length === 4) : []
      const clean = { width: res?.width || size.width, height: res?.height || size.height, phrase_used: res?.phrase_used || null, objects }
      setResult(clean)
      const first = rankObjects(objects)[0]
      setSelectedId(first ? first.id : null)
      setAnnounce(objects.length ? t('sam.results.found', { count: objects.length }) : t('sam.results.noneTitle'))
    } catch (err) {
      if (err?.name === 'AbortError') return
      if (err?.code === 'no_objects_found') {
        setResult({ width: size.width, height: size.height, phrase_used: null, objects: [] })
        setSelectedId(null)
        setAnnounce(t('sam.results.noneTitle'))
      } else setError(err)
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(null)
      }
    }
  }

  const stop = () => {
    controllerRef.current?.abort()
    controllerRef.current = null
    setBusy(null)
  }

  const reset = () => {
    setPoints([])
    setBox(null)
    setAnchor(null)
    setDrag(null)
    setResult(null)
    setSelectedId(null)
    setError(null)
    setSaveError(null)
  }

  const confirmSelection = async () => {
    if (!selected || !imgRef.current || !result) return
    setBusy('save')
    setSaveError(null)
    try {
      const blob = await cutoutBlob(imgRef.current, selected, result.width, result.height)
      if (!blob) throw new Error('cutout_failed')
      const nbox = normalizedBox(selected.box, result.width, result.height)
      const file = new File([blob], `cutout-${Date.now().toString(36)}.png`, { type: 'image/png' })
      const meta = { box: nbox, phrase: result.phrase_used || (mode === 'phrase' ? phrase.trim() : null), page: page || null, prompt: mode }
      // Human name of the object (e.g. "Quả nặng của con lắc") so pickers can show it instead of SAM's English phrase.
      if (label && String(label).trim()) meta.label = String(label).trim().slice(0, 120)
      const asset = await upload(`/api/labs/${labId}/assets`, file, { fields: { kind: 'cutout', source_id: sourceId || undefined, meta: JSON.stringify(meta) } })
      onSelect?.({
        asset,
        object: selected,
        box: nbox,
        mask_path: normalizedMaskPath(selected, result.width, result.height),
        phrase_used: result.phrase_used,
        source_id: sourceId || null,
        page: page || null,
        width: result.width,
        height: result.height,
      })
    } catch (err) {
      setSaveError(err?.code ? err : { code: 'generic' })
    } finally {
      setBusy(null)
    }
  }

  // ---------------------------------------------------------------- render
  if (!image?.url) {
    return (
      <EmptyState icon={ScanSearch} title={t('sam.noImageTitle')}>
        <p>{t('sam.noImage')}</p>
      </EmptyState>
    )
  }

  const dragBox = drag ? boxFromPoints(drag.start, drag.current) : null
  const shownBox = dragBox || box
  const boxPct = shownBox && size ? boxToPercent(shownBox, size.width, size.height) : null
  const anchorPct = anchor && size ? pointToPercent(anchor, size.width, size.height) : null
  const cursorPct = keyboard && cursor && size ? pointToPercent(cursor, size.width, size.height) : null
  const stageLabel = t(`sam.stage.${mode}`)

  return (
    <div className="sam stack">
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {!ai?.configured ? <Alert tone="warning">{t('common.ai.notConfigured')}</Alert> : null}

      <div className="sam-modes">
        <Segmented
          label={t('sam.modeLabel')}
          value={mode}
          onChange={(m) => {
            setMode(m)
            setAnchor(null)
            setDrag(null)
          }}
          options={[
            { value: 'phrase', label: t('sam.modes.phrase') },
            { value: 'point', label: t('sam.modes.point') },
            { value: 'box', label: t('sam.modes.box') },
          ]}
        />
      </div>

      {mode === 'phrase' ? (
        <form
          className="sam-controls"
          onSubmit={(e) => {
            e.preventDefault()
            search()
          }}
        >
          <TextField
            label={t('sam.phrase.label')}
            hint={t('sam.phrase.hint')}
            value={phrase}
            maxLength={120}
            placeholder={t('sam.phrase.placeholder')}
            onChange={(e) => setPhrase(e.target.value)}
            className="sam-grow"
          />
          <Button type="submit" variant={selected ? undefined : 'primary'} icon={Type} loading={busy === 'search'} disabled={!canSearch && busy !== 'search'}>
            {t('sam.find')}
          </Button>
        </form>
      ) : mode === 'point' ? (
        <div className="sam-controls">
          <div className="sam-grow stack-sm">
            <p className="small" style={{ margin: 0 }}>
              {t('sam.points.help')}
            </p>
            <div className="row" style={{ gap: '0.5rem' }}>
              <Switch label={t('sam.points.negative')} checked={negative} onChange={(e) => setNegative(e.target.checked)} />
              <span className="badge badge-outline">{t('sam.points.count', { count: points.length, max: MAX_POINTS })}</span>
              {points.length ? (
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setPoints(points.slice(0, -1))}>
                  {t('sam.points.undo')}
                </Button>
              ) : null}
            </div>
          </div>
          <Button variant={selected ? undefined : 'primary'} icon={MousePointer2} loading={busy === 'search'} disabled={!canSearch && busy !== 'search'} onClick={search}>
            {t('sam.find')}
          </Button>
        </div>
      ) : (
        <div className="sam-controls">
          <p className="small sam-grow" style={{ margin: 0 }}>
            {box ? t('sam.box.ready') : t('sam.box.help')}
          </p>
          <Button variant={selected ? undefined : 'primary'} icon={Square} loading={busy === 'search'} disabled={!canSearch && busy !== 'search'} onClick={search}>
            {t('sam.find')}
          </Button>
        </div>
      )}

      <div className="sam-stage-wrap">
        <div
          className={['sam-stage', `mode-${mode}`, busy === 'search' ? 'is-busy' : ''].filter(Boolean).join(' ')}
          tabIndex={0}
          role="group"
          aria-label={stageLabel}
          aria-describedby={hintId}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setKeyboard(false)}
        >
          {imgState === 'loading' ? <div className="skeleton sam-skeleton" style={natural ? { aspectRatio: `${natural.width} / ${natural.height}` } : undefined} /> : null}
          {imgState === 'error' ? (
            <Alert tone="warning">{t('sam.imageError')}</Alert>
          ) : (
            <img
              ref={imgRef}
              src={image.url}
              alt={t('sam.imageAlt')}
              width={image.width || undefined}
              height={image.height || undefined}
              draggable={false}
              className={imgState === 'ready' ? 'is-ready' : undefined}
              onLoad={(e) => {
                setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                setImgState('ready')
              }}
              onError={() => setImgState('error')}
            />
          )}
          <canvas ref={canvasRef} className="sam-canvas" aria-hidden="true" />
          {imgState === 'ready' && size
            ? ranked.map((o) => {
                const pct = boxToPercent(o.box, result.width, result.height)
                return (
                  <span
                    key={o.id}
                    className={['sam-tag', o.id === selectedId ? 'is-selected' : ''].filter(Boolean).join(' ')}
                    style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
                    aria-hidden="true"
                  >
                    {numberOf.get(o.id)}
                  </span>
                )
              })
            : null}
          {mode === 'point' && size
            ? points.map((p, i) => {
                const pct = pointToPercent(p, size.width, size.height)
                return (
                  <span key={i} className={['sam-point', p.negative ? 'is-negative' : ''].filter(Boolean).join(' ')} style={{ left: `${pct.left}%`, top: `${pct.top}%` }} aria-hidden="true">
                    {p.negative ? '−' : '+'}
                  </span>
                )
              })
            : null}
          {mode === 'box' && boxPct ? (
            <span className={['sam-box', dragBox ? 'is-dragging' : ''].filter(Boolean).join(' ')} style={{ left: `${boxPct.left}%`, top: `${boxPct.top}%`, width: `${boxPct.width}%`, height: `${boxPct.height}%` }} aria-hidden="true" />
          ) : null}
          {mode === 'box' && anchorPct ? <span className="sam-anchor" style={{ left: `${anchorPct.left}%`, top: `${anchorPct.top}%` }} aria-hidden="true" /> : null}
          {cursorPct ? <span className="sam-cursor" style={{ left: `${cursorPct.left}%`, top: `${cursorPct.top}%` }} aria-hidden="true" /> : null}
          {busy === 'search' ? (
            <div className="sam-busy">
              <span className="sam-busy-pill">
                <ScanSearch aria-hidden="true" />
                {t('sam.searching')}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <p className="tiny muted" id={hintId} style={{ margin: 0 }}>
        {t(`sam.keyboard.${mode}`)}
      </p>

      {busy === 'search' ? (
        <div>
          <Button size="sm" onClick={stop}>
            {t('sam.stop')}
          </Button>
        </div>
      ) : null}

      {error ? <ErrorMessage error={error} onRetry={search} /> : null}

      {result && !result.objects.length ? (
        <div className="sam-none" role="status">
          <Lightbulb aria-hidden="true" />
          <div>
            <p className="alert-title">{t('sam.results.noneTitle')}</p>
            <ul className="small">
              <li>{t('sam.results.tipShort')}</li>
              <li>{t('sam.results.tipPoint')}</li>
              <li>{t('sam.results.tipBox')}</li>
            </ul>
          </div>
        </div>
      ) : null}

      {ranked.length ? (
        <fieldset className="sam-results">
          <legend>{t('sam.results.title', { count: ranked.length })}</legend>
          {result.phrase_used ? <p className="small muted" style={{ margin: 0 }}>{t('sam.results.phraseUsed', { phrase: result.phrase_used })}</p> : null}
          <div className="sam-result-list">
            {ranked.map((o) => {
              const n = numberOf.get(o.id)
              const w = o.box[2] - o.box[0] + 1
              const h = o.box[3] - o.box[1] + 1
              return (
                <label
                  key={o.id}
                  className={['sam-result', o.id === selectedId ? 'is-selected' : ''].filter(Boolean).join(' ')}
                  onMouseEnter={() => setHoverId(o.id)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <input type="radio" name={`sam-${hintId}`} checked={o.id === selectedId} onChange={() => setSelectedId(o.id)} onFocus={() => setHoverId(o.id)} onBlur={() => setHoverId(null)} />
                  <span className="sam-result-num" aria-hidden="true">
                    {n}
                  </span>
                  <span className="sam-result-text">
                    <strong>{t('sam.results.object', { n })}</strong>
                    <span className="tiny muted">
                      {typeof o.confidence === 'number' ? `${t('sam.results.confidence', { value: fmt.percent(o.confidence) })}, ` : ''}
                      {t('sam.results.size', { w, h })}
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {saveError ? <ErrorMessage error={saveError} onRetry={confirmSelection} /> : null}

      <div className="sam-note">
        <Info aria-hidden="true" />
        <p className="small" style={{ margin: 0 }}>
          {t('sam.limits')}
        </p>
      </div>

      <div className="sam-actions">
        <Button variant="ghost" icon={RotateCcw} onClick={reset} disabled={Boolean(busy)}>
          {t('sam.reset')}
        </Button>
        <div className="row" style={{ gap: '0.5rem' }}>
          {onCancel ? <Button onClick={onCancel}>{t('common.actions.cancel')}</Button> : null}
          <Button variant={selected ? 'primary' : undefined} icon={Check} disabled={!selected || busy === 'search'} loading={busy === 'save'} onClick={confirmSelection}>
            {t('sam.use')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SamSelector

/**
 * Dialog wrapper. Give either a fixed `image` (+ sourceId/page/assetId) or a list of lab
 * `sources` (ready images and PDFs) to choose from; for PDFs a page number is asked.
 */
export function SamSelectorDialog({ open, onClose, title, sources, image, sourceId, page, assetId, mediaSize, initialPhrase, label, labId, onSelect }) {
  const { t } = useT()
  const options = useMemo(() => (sources || []).filter((s) => s && s.status === 'ready' && (s.kind === 'image' || (s.kind === 'pdf' && s.urls?.page))), [sources])
  const [choiceId, setChoiceId] = useState('')
  const [pageNo, setPageNo] = useState(1)
  const [pageDraft, setPageDraft] = useState('1')

  useEffect(() => {
    if (!open) return
    const preferred = options.find((s) => s.id === sourceId) ? sourceId : options[0]?.id || ''
    setChoiceId(preferred)
    setPageNo(page || 1)
    setPageDraft(String(page || 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const chosen = options.find((s) => s.id === choiceId) || null
  let target = null
  if (image) target = { image, sourceId, page, assetId, mediaSize }
  else if (chosen?.kind === 'image') target = { image: { url: chosen.urls.file, width: chosen.width, height: chosen.height }, sourceId: chosen.id }
  else if (chosen?.kind === 'pdf') target = { image: { url: pageImageUrl(chosen, pageNo, PDF_SAM_SCALE) }, sourceId: chosen.id, page: pageNo }

  const pageCount = chosen?.kind === 'pdf' ? chosen.page_count || 1 : 0
  const commitPage = () => {
    const n = Math.min(Math.max(1, Math.round(Number(pageDraft) || 1)), Math.max(1, pageCount))
    setPageNo(n)
    setPageDraft(String(n))
  }

  return (
    <Dialog open={open} onClose={onClose} title={title || t('sam.title')} size="wide">
      <div className="stack">
        {!image && options.length > 1 ? (
          <SelectField
            label={t('sam.chooseImage')}
            value={choiceId}
            onChange={(e) => {
              setChoiceId(e.target.value)
              setPageNo(1)
              setPageDraft('1')
            }}
            options={options.map((s) => ({ value: s.id, label: `${s.title} (${t(`common.sourceKinds.${s.kind}`)})` }))}
          />
        ) : null}
        {!image && pageCount > 1 ? (
          <div className="row" style={{ gap: '0.5rem', alignItems: 'flex-end' }}>
            <TextField
              label={t('sam.pageLabel', { count: pageCount })}
              type="number"
              inputMode="numeric"
              min={1}
              max={pageCount}
              value={pageDraft}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={commitPage}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitPage()
                }
              }}
              inputClassName="sam-page-input"
            />
            <Button onClick={commitPage}>{t('sam.showPage')}</Button>
          </div>
        ) : null}
        {target ? (
          <SamSelector
            key={`${target.sourceId || ''}-${target.page || ''}-${target.assetId || ''}`}
            {...target}
            labId={labId}
            initialPhrase={initialPhrase}
            label={label}
            onSelect={onSelect}
            onCancel={onClose}
          />
        ) : (
          <EmptyState icon={ScanSearch} title={t('sam.noImageTitle')}>
            <p>{t('sam.noImage')}</p>
          </EmptyState>
        )}
      </div>
    </Dialog>
  )
}

