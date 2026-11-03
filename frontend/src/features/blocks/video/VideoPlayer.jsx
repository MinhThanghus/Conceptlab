import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { LoaderCircle, Pause, Play, Repeat, StepBack, StepForward, TriangleAlert, Volume2, VolumeX } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { IconButton, Segmented } from '../../../components/ui/index.js'
import { drawMaskOverlay } from '../../../lib/sam.js'
import { boxesAt, clamp, containRect, durationOf, formatClock, fraction, labelX, overlayFrameReady, pointInMedia, safeFps, SPEEDS, stepTime } from './videoUtils.js'
import './video.css'

const COLOR_TOKENS = ['--cl-accent', '--cl-ink-on-accent', '--cl-warning', '--cl-primary', '--cl-danger', '--cl-series-1', '--cl-series-2', '--cl-series-3', '--cl-series-4', '--cl-info', '--color-ink', '--color-card', '--font-body']

/** Resolve the design tokens (CSS custom properties) used on the canvas, once per change. */
function resolveColors(el) {
  const out = {}
  if (!el) return out
  const style = getComputedStyle(el)
  for (const name of COLOR_TOKENS) out[name] = style.getPropertyValue(name).trim()
  return out
}

/** Any CSS colour (the tokens are OKLCH) as [r, g, b], read back from a one-pixel canvas. */
function colorToRgb(value, fallback = [242, 183, 5]) {
  const text = String(value || '').trim()
  if (!text) return fallback
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return fallback
    ctx.fillStyle = text
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return [r, g, b]
  } catch {
    return fallback
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Accessible practice-video player (spec §8.3): play/pause, 0.25–1× speed, frame steps,
 * seek bar with marker ticks, loop around a marker, keyboard shortcuts on the video area,
 * and a canvas overlay synced to the current frame (SAM track boxes, highlight masks/points).
 *
 * Imperative API through `controllerRef`: { play, pause, toggle, seek(t, {pause}), step(n),
 * getTime, isPaused, getVideo, redraw }.
 */
export default function VideoPlayer({
  source,
  markers = [],
  selectedMarkerId = null,
  onMarkerClick,
  pendingIds,
  tracks = [],
  visibleTrackIds,
  loop = false,
  loopRange = null,
  loopAvailable = false,
  onLoopToggle,
  pick = null,
  mask = null,
  controllerRef,
  onTimeChange,
  onPlayingChange,
  onRateChange,
  label,
  helpId,
}) {
  const { t, lang, fmt } = useT()
  const videoRef = useRef(null)
  const stageRef = useRef(null)
  const canvasRef = useRef(null)
  const fps = safeFps(source?.fps)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(() => durationOf(Number.NaN, source?.duration_ms))
  const [rate, setRateState] = useState(1)
  const [muted, setMuted] = useState(false)
  const [dims, setDims] = useState({ w: source?.width || 0, h: source?.height || 0 })
  const [rect, setRect] = useState(null)
  const [buffering, setBuffering] = useState(false)
  const [failed, setFailed] = useState(false)

  // Latest values for animation callbacks (avoid stale closures without re-subscribing).
  const live = useRef({})
  live.current = { rect, tracks, visibleTrackIds, loop, loopRange, mask, pick, duration, onTimeChange }
  const colors = useRef({})
  // True once a decoded frame replaced the poster (first play or seek); reset when a source (re)loads.
  const frameShown = useRef(false)

  /* ---------------------------------------------------------------- overlay drawing */
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    const { rect: r, tracks: trs, visibleTrackIds: vis, mask: mk, pick: pk } = live.current
    if (!canvas || !video || !r || r.width <= 0 || r.height <= 0) return
    // While a seek is in flight the previous frame stays on screen: keep the overlay that matches it.
    if (video.seeking && frameShown.current) return
    // SAM boxes/masks belong to the frame at currentTime: never draw them over the poster
    // (captured at another moment) or before that frame is decoded.
    const synced = overlayFrameReady(video, frameShown.current)
    const palette = colors.current
    const color = (name, fallback) => palette[name] || fallback
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = Math.max(1, Math.round(r.width * dpr))
    const H = Math.max(1, Math.round(r.height * dpr))
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const now = video.currentTime || 0

    // SAM masks for the paused frame that was segmented (only while we are on that frame)
    if (synced && mk?.result?.objects?.length && Math.abs((mk.t ?? -1) - now) < 0.04) {
      const fill = colorToRgb(color('--cl-accent', '#f2b705'))
      const stroke = color('--cl-warning', '#a84b05')
      for (const obj of mk.result.objects) {
        try {
          drawMaskOverlay(ctx, obj, mk.result.width, mk.result.height, { color: fill, alpha: 0.45, stroke })
        } catch {
          /* undecodable mask: the box outline is enough */
        }
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const cw = r.width
    const ch = r.height
    ctx.font = `600 12px ${color('--font-body', 'system-ui, sans-serif')}`
    ctx.textBaseline = 'middle'
    for (const tr of synced ? trs || [] : []) {
      if (vis && !vis.has(tr.id)) continue
      const boxes = boxesAt(tr, now)
      if (!boxes.length) continue
      const stroke = color(tr.colorVar, '#f2b705')
      const ink = tr.colorVar === '--cl-accent' ? color('--cl-ink-on-accent', '#3d2f00') : color('--color-card', '#ffffff')
      for (const [x0, y0, x1, y1] of boxes) {
        const x = x0 * cw
        const y = y0 * ch
        const w = (x1 - x0) * cw
        const h = (y1 - y0) * ch
        ctx.lineWidth = 3
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = color('--color-ink', '#1b1f27')
        roundRect(ctx, x, y, w, h, 6)
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.lineWidth = 2
        ctx.strokeStyle = stroke
        ctx.stroke()
        const text = tr.phrase.length > 28 ? `${tr.phrase.slice(0, 27)}…` : tr.phrase
        const tw = ctx.measureText(text).width + 12
        const ty = y - 20 >= 0 ? y - 20 : y + 2
        // a box near the right edge still gets its whole label
        const tx = labelX(x, tw, cw)
        ctx.fillStyle = stroke
        roundRect(ctx, tx, ty, tw, 18, 5)
        ctx.fill()
        ctx.fillStyle = ink
        ctx.fillText(text, tx + 6, ty + 9.5)
      }
    }

    // points picked on the frame for SAM (positive = +, negative = −)
    if (pk?.active && pk.points?.length) {
      const pos = color('--cl-primary', '#0b6e69')
      const neg = color('--cl-danger', '#b91c1c')
      pk.points.forEach((p) => {
        const x = p.x * cw
        const y = p.y * ch
        ctx.beginPath()
        ctx.arc(x, y, 10, 0, Math.PI * 2)
        ctx.fillStyle = p.negative ? neg : pos
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = color('--color-card', '#ffffff')
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x - 5, y)
        ctx.lineTo(x + 5, y)
        if (!p.negative) {
          ctx.moveTo(x, y - 5)
          ctx.lineTo(x, y + 5)
        }
        ctx.lineWidth = 2.5
        ctx.stroke()
      })
    }
  }, [])

  /* ---------------------------------------------------------------- geometry */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const measure = () => {
      const box = stage.getBoundingClientRect()
      setRect(containRect(box.width, box.height, dims.w, dims.h))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [dims.w, dims.h])

  useEffect(() => {
    colors.current = resolveColors(stageRef.current)
  }, [tracks])

  useEffect(() => {
    draw()
  }, [draw, rect, tracks, visibleTrackIds, mask, pick, time])

  /* ---------------------------------------------------------------- playback loop */
  useEffect(() => {
    const video = videoRef.current
    if (!video || !playing) return undefined
    let raf = 0
    let vfc = 0
    let lastReport = 0
    let alive = true
    const tick = (now) => {
      if (!alive) return
      const current = video.currentTime
      const { loop: lp, loopRange: lr } = live.current
      if (lp && lr && (current >= lr[1] - 0.03 || current < lr[0] - 0.25)) video.currentTime = lr[0]
      draw()
      if (now - lastReport > 125) {
        lastReport = now
        setTime(video.currentTime)
        live.current.onTimeChange?.(video.currentTime)
      }
      schedule()
    }
    const schedule = () => {
      if (typeof video.requestVideoFrameCallback === 'function') vfc = video.requestVideoFrameCallback((now) => tick(now))
      else raf = requestAnimationFrame(tick)
    }
    schedule()
    return () => {
      alive = false
      if (vfc && typeof video.cancelVideoFrameCallback === 'function') video.cancelVideoFrameCallback(vfc)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [playing, draw])

  // When the loop turns on (or moves to another marker) keep the playhead inside it.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !loop || !loopRange) return
    if (video.currentTime < loopRange[0] - 0.01 || video.currentTime > loopRange[1]) video.currentTime = loopRange[0]
  }, [loop, loopRange])

  /* ---------------------------------------------------------------- actions */
  const syncTime = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    setTime(video.currentTime)
    live.current.onTimeChange?.(video.currentTime)
  }, [])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const result = video.play()
    if (result && typeof result.catch === 'function') result.catch(() => setPlaying(false))
  }, [])
  const pause = useCallback(() => videoRef.current?.pause(), [])
  const toggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) play()
    else video.pause()
  }, [play])
  const seek = useCallback((to, { pause: andPause = false } = {}) => {
    const video = videoRef.current
    if (!video) return
    if (andPause) video.pause()
    const d = live.current.duration
    const target = clamp(Number(to) || 0, 0, d > 0 ? d : Math.max(0, Number(to) || 0))
    video.currentTime = target
    setTime(target)
    live.current.onTimeChange?.(target)
  }, [])
  const step = useCallback(
    (frames) => {
      const video = videoRef.current
      if (!video) return
      video.pause()
      seek(stepTime(video.currentTime, fps, frames, live.current.duration))
    },
    [fps, seek],
  )
  const setRate = useCallback(
    (value) => {
      const video = videoRef.current
      setRateState(value)
      if (video) {
        video.playbackRate = value
        video.defaultPlaybackRate = value
      }
      onRateChange?.(value)
    },
    [onRateChange],
  )

  useImperativeHandle(
    controllerRef,
    () => ({
      play,
      pause,
      toggle,
      seek,
      step,
      getTime: () => videoRef.current?.currentTime || 0,
      isPaused: () => (videoRef.current ? videoRef.current.paused : true),
      getVideo: () => videoRef.current,
      redraw: draw,
    }),
    [play, pause, toggle, seek, step, draw],
  )

  /* ---------------------------------------------------------------- input */
  const onStageKeyDown = (event) => {
    if (event.target !== event.currentTarget) return
    const big = event.shiftKey
    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        event.preventDefault()
        toggle()
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (big) seek((videoRef.current?.currentTime || 0) - 1)
        else step(-1)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (big) seek((videoRef.current?.currentTime || 0) + 1)
        else step(1)
        break
      case 'Home':
        event.preventDefault()
        seek(0)
        break
      case 'End':
        event.preventDefault()
        seek(Math.max(0, duration - 0.05), { pause: true })
        break
      default:
    }
  }

  const onStageClick = (event) => {
    if (pick?.active) {
      const stage = stageRef.current
      if (!stage || !rect) return
      const box = stage.getBoundingClientRect()
      const point = pointInMedia(event.clientX - box.left, event.clientY - box.top, rect)
      if (point) pick.onPick?.(point)
      return
    }
    toggle()
  }

  /* ---------------------------------------------------------------- render */
  const src = source?.urls?.file || null
  const poster = source?.urls?.poster || undefined
  const clock = (s) => formatClock(s, { lang })
  const progress = fraction(time, duration)
  const speedOptions = useMemo(() => SPEEDS.map((s) => ({ value: s, label: `${fmt.number(s, 2)}×` })), [fmt])
  const aspect = dims.w > 0 && dims.h > 0 ? `${dims.w} / ${dims.h}` : '16 / 9'
  const showStartHint = !playing && !buffering && !failed && !pick?.active && time < 0.05

  return (
    <div className="vb-player">
      <div
        ref={stageRef}
        className={['vb-stage', pick?.active ? 'picking' : ''].filter(Boolean).join(' ')}
        style={{ aspectRatio: aspect }}
        role="group"
        aria-roledescription={t('video.player.roledescription')}
        aria-label={label || t('video.player.stageLabel')}
        aria-describedby={helpId}
        tabIndex={0}
        onKeyDown={onStageKeyDown}
        onClick={onStageClick}
      >
        {src ? (
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            preload="metadata"
            playsInline
            muted={muted}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget
              setDuration(durationOf(v.duration, source?.duration_ms))
              if (v.videoWidth && v.videoHeight) setDims({ w: v.videoWidth, h: v.videoHeight })
              v.playbackRate = rate
              setFailed(false)
            }}
            onDurationChange={(e) => setDuration(durationOf(e.currentTarget.duration, source?.duration_ms))}
            onLoadStart={() => {
              // a (re)loaded source shows its poster again until the next play or seek
              frameShown.current = false
              draw()
            }}
            onPlay={() => {
              frameShown.current = true
              setPlaying(true)
              onPlayingChange?.(true)
            }}
            onPause={() => {
              setPlaying(false)
              setBuffering(false)
              onPlayingChange?.(false)
              syncTime()
            }}
            onEnded={() => {
              const { loop: lp, loopRange: lr } = live.current
              const v = videoRef.current
              if (lp && lr && v) {
                v.currentTime = lr[0]
                play()
              } else {
                setPlaying(false)
                onPlayingChange?.(false)
                syncTime()
              }
            }}
            onSeeked={() => {
              frameShown.current = true
              syncTime()
              draw()
            }}
            onLoadedData={draw}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => {
              setBuffering(false)
              draw()
            }}
            onCanPlay={() => {
              setBuffering(false)
              draw()
            }}
            onError={() => {
              setFailed(true)
              setBuffering(false)
            }}
          >
            {t('video.player.unsupported')}
          </video>
        ) : null}
        {rect ? <canvas ref={canvasRef} className="vb-overlay" aria-hidden="true" style={{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` }} /> : null}
        {rate !== 1 ? (
          <span className="vb-stage-chip" aria-hidden="true">
            {fmt.number(rate, 2)}×
          </span>
        ) : null}
        {pick?.active ? (
          <span className="vb-stage-chip end" aria-hidden="true">
            {t('video.player.pickChip')}
          </span>
        ) : null}
        {showStartHint ? (
          <div className="vb-stage-hint" aria-hidden="true">
            <span>
              <Play />
            </span>
          </div>
        ) : null}
        {buffering && !failed ? (
          <div className="vb-stage-msg" aria-hidden="true">
            <LoaderCircle className="spin" size={32} />
          </div>
        ) : null}
        {failed ? (
          <div className="vb-stage-msg interactive" role="alert">
            <div className="stack-sm">
              <TriangleAlert size={28} aria-hidden="true" />
              <span>{t('video.player.loadError')}</span>
              <button
                type="button"
                className="btn btn-sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setFailed(false)
                  videoRef.current?.load()
                }}
              >
                {t('common.actions.retry')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="vb-seek-wrap">
        {duration > 0 && markers.length ? (
          <div className="vb-ticks">
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={['vb-tick', m.id === selectedMarkerId ? 'selected' : '', pendingIds?.has(m.id) ? 'pending' : ''].filter(Boolean).join(' ')}
                style={{ '--x': fraction(m.t, duration) }}
                title={`${clock(m.t)}: ${m.label}`}
                onClick={() => onMarkerClick?.(m)}
              />
            ))}
          </div>
        ) : null}
        <input
          type="range"
          className="vb-seek"
          min={0}
          max={duration > 0 ? duration : 0}
          step={1 / fps}
          value={Math.min(time, duration || 0)}
          disabled={!(duration > 0)}
          style={{ '--p': `${(progress * 100).toFixed(2)}%` }}
          aria-label={t('video.player.seek')}
          aria-valuetext={t('video.player.seekValue', { time: clock(time), duration: clock(duration) })}
          onChange={(e) => seek(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === ' ') {
              e.preventDefault()
              toggle()
            }
          }}
        />
      </div>

      <div className="vb-controls">
        <IconButton icon={playing ? Pause : Play} label={playing ? t('video.player.pause') : t('video.player.play')} bordered onClick={toggle} disabled={!src} />
        <IconButton icon={StepBack} label={t('video.player.frameBack')} bordered onClick={() => step(-1)} disabled={!src} />
        <IconButton icon={StepForward} label={t('video.player.frameForward')} bordered onClick={() => step(1)} disabled={!src} />
        <span className="vb-time" aria-live="off">
          {clock(time)} <span className="muted">/ {clock(duration)}</span>
        </span>
        <span className="vb-grow" />
        <div className="vb-speed">
          <span className="small muted" aria-hidden="true">
            {t('video.player.speed')}
          </span>
          <Segmented value={rate} onChange={setRate} options={speedOptions} label={t('video.player.speed')} size="sm" />
        </div>
        <button
          type="button"
          className="btn btn-sm vb-toggle"
          aria-pressed={loop}
          disabled={!loopAvailable && !loop}
          title={loopAvailable || loop ? t('video.player.loopHint') : t('video.player.loopNeedsMarker')}
          onClick={() => onLoopToggle?.(!loop)}
        >
          <Repeat aria-hidden="true" />
          {t('video.player.loop')}
        </button>
        <IconButton icon={muted ? VolumeX : Volume2} label={muted ? t('video.player.unmute') : t('video.player.mute')} pressed={muted} onClick={() => setMuted((m) => !m)} />
      </div>
    </div>
  )
}
