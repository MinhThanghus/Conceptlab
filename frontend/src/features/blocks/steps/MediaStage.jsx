import { useEffect, useId, useRef, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { boxFromPoints, boxInCrop, clamp, coverRegion, cropRegion, moveBox, normBox, resizeBox } from './lessonKit.js'
import { useElementSize } from './lessonHooks.js'
import './lesson.css'
import './stepSlide.css'

/**
 * Picture with overlays in normalized coordinates. The box keeps the picture's aspect ratio,
 * fits within `maxBlock` height at zoom 1 and scrolls when zoomed in.
 * Children are absolutely positioned layers (inset: 0) drawn over the picture.
 */
export function ImageStage({ src, alt, size, onSize, zoom = 1, maxBlock = '70vh', children, className, loading = 'lazy' }) {
  const { t } = useT()
  const [natural, setNatural] = useState(size || null)
  const [attempt, setAttempt] = useState(0)
  // The status belongs to one picture (src + attempt). It is derived, never reset in an effect: a
  // picture already in the memory cache can fire `load` before effects run, and a reset there left
  // the skeleton over a loaded picture for good (a studio step opened again in the app).
  const imageKey = `${src}#${attempt}`
  const [loaded, setLoaded] = useState({ key: null, status: 'loading' })
  const status = loaded.key === imageKey ? loaded.status : 'loading'

  useEffect(() => {
    if (size?.width && size?.height) setNatural(size)
  }, [size?.width, size?.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const ratio = natural?.width && natural?.height ? natural.width / natural.height : 0.75
  const style = { '--lk-ratio': ratio, '--lk-zoom': zoom, '--lk-max-block': maxBlock }
  return (
    <div className={['lk-stage-scroll', className].filter(Boolean).join(' ')}>
      <div className="lk-stage" style={style}>
        {src ? (
          <img
            key={imageKey}
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth: width, naturalHeight: height } = event.currentTarget
              if (width && height) {
                setNatural((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }))
                onSize?.({ width, height })
              }
              setLoaded({ key: imageKey, status: 'ready' })
            }}
            onError={() => setLoaded({ key: imageKey, status: 'error' })}
          />
        ) : null}
        {status === 'loading' && src ? <div className="skeleton lk-stage-fill" aria-hidden="true" /> : null}
        {status === 'error' || !src ? (
          <div className="lk-stage-fill lk-stage-error" role={src ? 'alert' : undefined}>
            <ImageOff aria-hidden="true" />
            <span>{src ? t('steps.kit.imageError') : t('steps.kit.noImage')}</span>
            {src ? (
              <button type="button" className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
                {t('common.actions.retry')}
              </button>
            ) : null}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

/**
 * Zoomed view of a highlighted region (normalized bbox) with the region outlined.
 * `whole` shows the full picture with the outline instead.
 */
export function CropPreview({ src, alt, bbox, size, whole = false, maxBlock = '20rem', pad = 0.35, min = 0.3, outlined = true, className }) {
  const { t } = useT()
  const [natural, setNatural] = useState(size || null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setStatus('loading')
  }, [src, attempt])

  const box = normBox(bbox)
  const crop = whole || !box ? [0, 0, 1, 1] : cropRegion(box, { pad, min })
  const cw = crop[2] - crop[0]
  const ch = crop[3] - crop[1]
  const ratio = natural ? (cw * natural.width) / (ch * natural.height) : 4 / 3
  const imgStyle = { inlineSize: `${100 / cw}%`, insetInlineStart: `${(-crop[0] / cw) * 100}%`, insetBlockStart: `${(-crop[1] / ch) * 100}%` }
  const outline = box && outlined ? boxInCrop(box, crop) : null
  return (
    <div className={['lk-crop', className].filter(Boolean).join(' ')} style={{ '--lk-ratio': ratio, '--lk-max-block': maxBlock }}>
      <img
        key={`${src}#${attempt}`}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        style={imgStyle}
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } = event.currentTarget
          if (width && height) setNatural((prev) => (prev?.width === width && prev?.height === height ? prev : { width, height }))
          setStatus('ready')
        }}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? <div className="skeleton lk-stage-fill" aria-hidden="true" /> : null}
      {status === 'error' ? (
        <div className="lk-stage-fill lk-stage-error" role="alert">
          <ImageOff aria-hidden="true" />
          <span>{t('steps.kit.imageError')}</span>
          <button type="button" className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.actions.retry')}
          </button>
        </div>
      ) : null}
      {outline && status === 'ready' ? (
        <span
          className="lk-outline"
          aria-hidden="true"
          style={{ insetInlineStart: `${outline.left}%`, insetBlockStart: `${outline.top}%`, inlineSize: `${outline.width}%`, blockSize: `${outline.height}%` }}
        />
      ) : null}
    </div>
  )
}

/**
 * A highlighted region that fills its box edge to edge (the box is sized by its parent, e.g. a
 * figure well in a lesson slide). The region is widened to the box's shape so there is no empty
 * band, never magnified so much that a photo blurs, and the highlight stays outlined. Moving to
 * another region of the same picture pans and zooms there (instant under reduced motion).
 * `badge` puts a numbered bead on the outline's corner (the item's number in a list beside it).
 */
export function CoverCrop({ src, alt, bbox, size, margin = 0.03, min = 0.3, maxZoom = 1.6, outlined = true, badge = null, className, loading = 'eager' }) {
  const { t } = useT()
  const boxRef = useRef(null)
  const { width, height } = useElementSize(boxRef)
  const [natural, setNatural] = useState(size || null)
  const [status, setStatus] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setStatus('loading')
  }, [src, attempt])
  useEffect(() => {
    if (size?.width && size?.height) setNatural(size)
  }, [size?.width, size?.height]) // eslint-disable-line react-hooks/exhaustive-deps

  const box = normBox(bbox)
  const aspect = width > 0 && height > 0 ? width / height : 0
  const crop = box ? coverRegion(box, { natural, boxAspect: aspect, boxWidth: width, margin, min, maxZoom }) : [0, 0, 1, 1]
  const cw = crop[2] - crop[0] || 1
  // The picture is laid out at the box's width and moved with a transform only, so a change of
  // region animates on the compositor (transform-origin: 0 0).
  const imgStyle = { transform: `translate(${(-crop[0] / cw) * 100}%, ${(-crop[1] / cw) * 100}%) scale(${1 / cw})` }
  const outline = box && outlined ? boxInCrop(box, crop) : null
  // the bead sits in the hidden outline layer, so its number is spoken with the picture instead
  const numbered = outline && badge !== null && badge !== undefined && alt ? `${badge}. ${alt}` : alt
  return (
    <div ref={boxRef} className={['lk-cover', className].filter(Boolean).join(' ')}>
      <img
        key={`${src}#${attempt}`}
        src={src}
        alt={numbered}
        loading={loading}
        decoding="async"
        draggable={false}
        style={imgStyle}
        onLoad={(event) => {
          const { naturalWidth: w, naturalHeight: h } = event.currentTarget
          if (w && h) setNatural((prev) => (prev?.width === w && prev?.height === h ? prev : { width: w, height: h }))
          setStatus('ready')
        }}
        onError={() => setStatus('error')}
      />
      {status === 'loading' ? <div className="skeleton lk-stage-fill" aria-hidden="true" /> : null}
      {status === 'error' ? (
        <div className="lk-stage-fill lk-stage-error" role="alert">
          <ImageOff aria-hidden="true" />
          <span>{t('steps.kit.imageError')}</span>
          <button type="button" className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            {t('common.actions.retry')}
          </button>
        </div>
      ) : null}
      {outline && status === 'ready' ? (
        <span
          key={`${src}|${box.join(',')}`}
          className="lk-outline lk-cover-outline"
          aria-hidden="true"
          style={{ insetInlineStart: `${outline.left}%`, insetBlockStart: `${outline.top}%`, inlineSize: `${outline.width}%`, blockSize: `${outline.height}%` }}
        >
          {badge !== null && badge !== undefined ? <span className="lk-cover-badge">{badge}</span> : null}
        </span>
      ) : null}
    </div>
  )
}

const pct = (v) => `${Math.round(v * 100)}%`
const KEY_STEP = 0.01
const DEFAULT_BOX = [0.35, 0.35, 0.65, 0.65]

/**
 * Drawing layer for a normalized rectangle: drag on the picture to draw, drag inside the box
 * to move it, drag the corner handle to resize. Keyboard: arrows move, Shift+arrows resize,
 * Enter creates a box, Delete removes it (when `clearable`).
 */
export function DrawLayer({ value, onChange, label, clearable = true, minSize = 0.02 }) {
  const { t } = useT()
  const layerRef = useRef(null)
  const drag = useRef(null)
  const [draft, setDraft] = useState(null)
  const [announce, setAnnounce] = useState('')
  const hintId = useId()
  const box = normBox(value)

  const point = (event) => {
    const rect = layerRef.current.getBoundingClientRect()
    return [clamp((event.clientX - rect.left) / (rect.width || 1), 0, 1), clamp((event.clientY - rect.top) / (rect.height || 1), 0, 1)]
  }
  const describe = (b) => (b ? t('steps.kit.boxNow', { left: pct(b[0]), top: pct(b[1]), width: pct(b[2] - b[0]), height: pct(b[3] - b[1]) }) : t('steps.kit.boxNone'))

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    layerRef.current.focus({ preventScroll: true })
    layerRef.current.setPointerCapture?.(event.pointerId)
    const p = point(event)
    const handle = event.target?.dataset?.handle === 'resize'
    const inside = box && p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]
    drag.current = { mode: handle && box ? 'resize' : inside ? 'move' : 'draw', start: p, origin: box }
    setDraft(drag.current.mode === 'draw' ? boxFromPoints(p, p) : box)
  }
  const current = (event) => {
    const d = drag.current
    const p = point(event)
    if (d.mode === 'move') return moveBox(d.origin, p[0] - d.start[0], p[1] - d.start[1])
    if (d.mode === 'resize') return resizeBox(d.origin, p[0] - d.start[0], p[1] - d.start[1], minSize)
    return boxFromPoints(d.start, p)
  }
  const onPointerMove = (event) => {
    if (!drag.current) return
    setDraft(current(event))
  }
  const finish = (event, cancelled = false) => {
    if (!drag.current) return
    const next = cancelled ? null : current(event)
    drag.current = null
    setDraft(null)
    if (next && next[2] - next[0] >= minSize && next[3] - next[1] >= minSize) {
      onChange(next)
      setAnnounce(describe(next))
    }
  }

  const onKeyDown = (event) => {
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    let next = null
    if (arrows[event.key]) {
      if (!box) return
      const [dx, dy] = arrows[event.key].map((v) => v * KEY_STEP)
      next = event.shiftKey ? resizeBox(box, dx, dy, minSize) : moveBox(box, dx, dy)
    } else if ((event.key === 'Enter' || event.key === ' ') && !box) {
      next = DEFAULT_BOX
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && box && clearable) {
      event.preventDefault()
      onChange(null)
      setAnnounce(describe(null))
      return
    } else {
      return
    }
    event.preventDefault()
    onChange(next)
    setAnnounce(describe(next))
  }

  const shown = draft || box
  return (
    <div
      ref={layerRef}
      className="lk-draw"
      role="application"
      aria-roledescription={t('steps.kit.drawRole')}
      aria-label={label || t('steps.kit.drawLabel')}
      aria-describedby={hintId}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
      onKeyDown={onKeyDown}
    >
      {shown ? (
        <span
          className={['lk-draw-box', draft ? 'is-dragging' : ''].join(' ')}
          style={{ insetInlineStart: pct(shown[0]), insetBlockStart: pct(shown[1]), inlineSize: pct(shown[2] - shown[0]), blockSize: pct(shown[3] - shown[1]) }}
        >
          <span className="lk-draw-handle" data-handle="resize" aria-hidden="true" />
        </span>
      ) : null}
      <span id={hintId} className="visually-hidden">
        {t('steps.kit.drawKeys')} {describe(box)}
      </span>
      <span className="visually-hidden" aria-live="polite">
        {announce}
      </span>
    </div>
  )
}
