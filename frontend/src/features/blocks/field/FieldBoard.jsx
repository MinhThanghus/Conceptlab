import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { courtOf, courtShapes, toNormalized, viewBox } from './courts.js'
import { addArrow, arrowLength, KEY_STEP, KEY_STEP_BIG, MIN_ARROW, nudge, removeItem, setArrowEnd, setItemPos, translateArrow } from './fieldUtils.js'
import './field.css'

const pctOf = (v) => Math.round(v * 100)

/** Token size in screen pixels: constant across court sizes and zoom levels. */
function tokenPx(svgWidthPx) {
  return Math.min(15, Math.max(10.5, svgWidthPx / 50))
}

function Shape({ s, u }) {
  const stroke = s.cls === 'fb-net' ? 3.2 * u : s.cls === 'fb-hoop' || s.cls === 'fb-board' ? 2.2 * u : 1.6 * u
  const dash = s.cls === 'fb-line-dash' ? `${5 * u} ${4 * u}` : undefined
  const common = { className: s.cls, strokeWidth: stroke, strokeDasharray: dash }
  if (s.type === 'rect') return <rect x={s.x} y={s.y} width={s.w} height={s.h} {...common} />
  if (s.type === 'line') return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} {...common} />
  if (s.type === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} {...common} />
  return <path d={s.d} {...common} />
}

/** Draw the court template once per sport/scale. */
function Court({ sport, u }) {
  const vb = viewBox(sport)
  const shapes = courtShapes(sport)
  return (
    <g aria-hidden="true">
      <rect className="fb-surround" x={vb.x} y={vb.y} width={vb.width} height={vb.height} />
      {shapes.map((s, i) => (
        <Shape key={i} s={s} u={u} />
      ))}
    </g>
  )
}

/** End point pulled back so an arrow head touches (not hides under) the token it points at. */
function visibleEnd(arrow, players, ball, L, W, rMeters) {
  const x2 = arrow.x2 * L
  const y2 = arrow.y2 * W
  const targets = [...players.map((p) => [p.x * L, p.y * W, rMeters]), ...(ball ? [[ball.x * L, ball.y * W, rMeters * 0.62]] : [])]
  for (const [tx, ty, tr] of targets) {
    if (Math.hypot(tx - x2, ty - y2) <= tr * 0.9) {
      const x1 = arrow.x1 * L
      const y1 = arrow.y1 * W
      const len = Math.hypot(x2 - x1, y2 - y1)
      if (len <= tr * 1.6) return { x: x2, y: y2 }
      const k = (len - tr - rMeters * 0.15) / len
      return { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k }
    }
  }
  return { x: x2, y: y2 }
}

function PlayerShape({ p, cx, cy, r, u, ghost }) {
  const team = p.team === 'B' ? 'b' : 'a'
  const side = r * 1.76
  const fontSize = r * (String(p.label).length <= 2 ? 1.0 : String(p.label).length === 3 ? 0.78 : 0.62)
  return (
    <>
      {ghost ? null : p.team === 'B' ? (
        <rect className="fb-shadow" x={cx - side / 2 + u} y={cy - side / 2 + 1.5 * u} width={side} height={side} rx={r * 0.32} />
      ) : (
        <circle className="fb-shadow" cx={cx + u} cy={cy + 1.5 * u} r={r} />
      )}
      {p.team === 'B' ? (
        <rect className={`fb-token fb-team-${team}`} x={cx - side / 2} y={cy - side / 2} width={side} height={side} rx={r * 0.32} strokeWidth={2 * u} strokeDasharray={ghost ? `${3 * u} ${2.5 * u}` : undefined} />
      ) : (
        <circle className={`fb-token fb-team-${team}`} cx={cx} cy={cy} r={r} strokeWidth={2 * u} strokeDasharray={ghost ? `${3 * u} ${2.5 * u}` : undefined} />
      )}
      {p.label ? (
        <text className="fb-label" x={cx} y={cy} fontSize={fontSize} dy="0.36em" textAnchor="middle">
          {p.label}
        </text>
      ) : null}
    </>
  )
}

function BallShape({ cx, cy, r, u, ghost }) {
  return (
    <>
      {ghost ? null : <circle className="fb-shadow" cx={cx + u} cy={cy + 1.2 * u} r={r} />}
      <circle className="fb-ball-body" cx={cx} cy={cy} r={r} strokeWidth={1.6 * u} strokeDasharray={ghost ? `${2.5 * u} ${2 * u}` : undefined} />
      {ghost ? null : <circle className="fb-ball-mark" cx={cx} cy={cy} r={r * 0.38} />}
    </>
  )
}

/**
 * Interactive SVG sports field (spec §8.4). Renders one frame on an accurate court; in
 * interactive mode players/ball/arrows can be selected, dragged (mouse, pen, touch) or moved
 * with the keyboard, and run/pass arrows drawn by dragging. Every change is committed with
 * `onChange(nextFrame, {coalesceKey?})` when the gesture ends.
 */
export default function FieldBoard({
  sport,
  frame,
  ghost = null,
  readOnly = false,
  tool = 'select',
  selection = null,
  onSelect,
  onChange,
  onAnnounce,
  zoom = 1,
  label,
  describedBy,
  makeId,
}) {
  const { t } = useT()
  const uid = useId().replace(/[:]/g, '')
  const svgRef = useRef(null)
  const [widthPx, setWidthPx] = useState(640)
  const [drag, setDrag] = useState(null)
  const court = courtOf(sport)
  const vb = viewBox(sport)
  const L = court.length
  const W = court.width

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    const measure = () => {
      const w = svg.getBoundingClientRect().width
      if (w > 0) setWidthPx(w)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [zoom, sport])

  const u = vb.width / Math.max(1, widthPx) // metres per screen pixel
  const r = tokenPx(widthPx / zoom) * u // token radius in metres (constant on screen)
  const hitR = Math.max(r, 22 * u)

  /* ---------------------------------------------------------------- gesture state */
  const working = useMemo(() => {
    if (!drag || !frame) return frame
    if (drag.type === 'move') return setItemPos(frame, drag.sel, drag.orig.x + (drag.cur.x - drag.start.x), drag.orig.y + (drag.cur.y - drag.start.y))
    if (drag.type === 'arrow') return translateArrow(frame, drag.id, drag.cur.x - drag.start.x, drag.cur.y - drag.start.y)
    if (drag.type === 'end') return setArrowEnd(frame, drag.id, drag.end, drag.cur.x, drag.cur.y)
    return frame
  }, [frame, drag])

  const shown = working || { players: [], arrows: [], ball: null }
  const players = shown.players || []
  const arrows = shown.arrows || []
  const ball = shown.ball || null

  const pointerNorm = (event) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!ctm) return null
    const inv = ctm.inverse()
    const x = inv.a * event.clientX + inv.c * event.clientY + inv.e
    const y = inv.b * event.clientX + inv.d * event.clientY + inv.f
    return toNormalized(sport, x, y)
  }

  /** Snap a normalized point to the centre of a nearby player (or the ball). */
  const snap = (pt, withBall) => {
    let best = null
    let bestD = hitR
    const consider = (x, y) => {
      const d = Math.hypot((x - pt.x) * L, (y - pt.y) * W)
      if (d <= bestD) {
        best = { x, y }
        bestD = d
      }
    }
    for (const p of frame?.players || []) consider(p.x, p.y)
    if (withBall && frame?.ball) consider(frame.ball.x, frame.ball.y)
    return best || pt
  }

  const capture = (event) => {
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      /* pointer already released */
    }
  }

  const startItem = (event, sel, pos) => {
    if (readOnly || event.button > 0) return
    event.stopPropagation()
    const pt = pointerNorm(event)
    if (!pt) return
    if (tool === 'run' || tool === 'pass') {
      capture(event)
      setDrag({ type: 'draw', kind: tool, pointerId: event.pointerId, x1: pos.x, y1: pos.y, cur: pt })
      return
    }
    onSelect?.(sel)
    capture(event)
    setDrag({ type: 'move', sel, pointerId: event.pointerId, start: pt, cur: pt, orig: pos, client: [event.clientX, event.clientY], moved: false })
  }

  const startArrow = (event, arrow) => {
    if (readOnly || event.button > 0) return
    if (tool !== 'select') return
    event.stopPropagation()
    const pt = pointerNorm(event)
    if (!pt) return
    onSelect?.({ kind: 'arrow', id: arrow.id })
    capture(event)
    setDrag({ type: 'arrow', id: arrow.id, pointerId: event.pointerId, start: pt, cur: pt, client: [event.clientX, event.clientY], moved: false })
  }

  const startEnd = (event, arrow, end) => {
    if (readOnly || event.button > 0) return
    event.stopPropagation()
    const pt = pointerNorm(event)
    if (!pt) return
    capture(event)
    setDrag({ type: 'end', id: arrow.id, end, pointerId: event.pointerId, cur: pt, client: [event.clientX, event.clientY], moved: false })
  }

  const onBackgroundDown = (event) => {
    if (readOnly || event.button > 0) return
    const pt = pointerNorm(event)
    if (!pt) return
    if (tool === 'run' || tool === 'pass') {
      const start = snap(pt, tool === 'pass')
      capture(event)
      setDrag({ type: 'draw', kind: tool, pointerId: event.pointerId, x1: start.x, y1: start.y, cur: pt })
      return
    }
    onSelect?.(null)
  }

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const pt = pointerNorm(event)
    if (!pt) return
    const moved = drag.moved || !drag.client || Math.hypot(event.clientX - drag.client[0], event.clientY - drag.client[1]) > 3
    setDrag({ ...drag, cur: pt, moved })
  }

  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const d = drag
    setDrag(null)
    if (d.type === 'draw') {
      const end = snap(d.cur, d.kind === 'pass')
      const arrow = { id: makeId('a'), kind: d.kind, x1: d.x1, y1: d.y1, x2: end.x, y2: end.y }
      if (arrowLength(arrow) < MIN_ARROW) return
      if ((frame.arrows || []).length >= 40) {
        onAnnounce?.(t('field.a11y.arrowLimit'))
        return
      }
      onChange?.(addArrow(frame, arrow))
      onSelect?.({ kind: 'arrow', id: arrow.id })
      onAnnounce?.(t(d.kind === 'pass' ? 'field.a11y.passAdded' : 'field.a11y.runAdded'))
      return
    }
    if (d.moved && working !== frame) onChange?.(working)
  }

  const cancel = (event) => {
    if (drag && event.pointerId === drag.pointerId) setDrag(null)
  }

  /* ---------------------------------------------------------------- keyboard */
  const describe = (sel, f = frame) => {
    if (sel.kind === 'ball') {
      const b = f.ball
      return b ? t('field.a11y.ball', { x: pctOf(b.x), y: pctOf(b.y) }) : ''
    }
    if (sel.kind === 'player') {
      const p = (f.players || []).find((q) => q.id === sel.id)
      return p ? t('field.a11y.player', { team: p.team, label: p.label || '?', x: pctOf(p.x), y: pctOf(p.y) }) : ''
    }
    const a = (f.arrows || []).find((q) => q.id === sel.id)
    return a
      ? t(a.kind === 'pass' ? 'field.a11y.pass' : 'field.a11y.run', { x1: pctOf(a.x1), y1: pctOf(a.y1), x2: pctOf(a.x2), y2: pctOf(a.y2) })
      : ''
  }

  const onItemKey = (event, sel) => {
    if (readOnly) return
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (moves[event.key]) {
      event.preventDefault()
      const next = nudge(frame, sel, ...moves[event.key])
      onChange?.(next, { coalesceKey: `nudge:${sel.kind}:${sel.id || ''}` })
      onAnnounce?.(describe(sel, next))
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onChange?.(removeItem(frame, sel))
      onSelect?.(null)
      onAnnounce?.(t('field.a11y.removed'))
      svgRef.current?.focus({ preventScroll: true })
    } else if (event.key === 'Escape') {
      onSelect?.(null)
      svgRef.current?.focus({ preventScroll: true })
    }
  }

  const itemProps = (sel, labelText) =>
    readOnly
      ? { 'aria-hidden': true }
      : {
          tabIndex: 0,
          role: 'button',
          'aria-label': labelText,
          'aria-pressed': Boolean(selection && selection.kind === sel.kind && (sel.kind === 'ball' || selection.id === sel.id)),
          'aria-describedby': describedBy,
          onFocus: () => onSelect?.(sel),
          onKeyDown: (e) => onItemKey(e, sel),
        }

  const isSel = (kind, id) => Boolean(selection && selection.kind === kind && (kind === 'ball' || selection.id === id))

  /* ---------------------------------------------------------------- render */
  const ghostPlayers = ghost?.players || []
  const drawingPreview = drag?.type === 'draw' ? { x1: drag.x1, y1: drag.y1, ...snap(drag.cur, drag.kind === 'pass'), kind: drag.kind } : null
  const selectedArrow = selection?.kind === 'arrow' && !readOnly ? arrows.find((a) => a.id === selection.id) : null
  const arrowStroke = 2.6 * u

  return (
    <svg
      ref={svgRef}
      className={['fb-svg', `fb-sport-${sport}`, !readOnly && tool !== 'select' ? 'fb-drawing' : '', readOnly ? 'fb-readonly' : ''].filter(Boolean).join(' ')}
      viewBox={`${vb.x} ${vb.y} ${vb.width} ${vb.height}`}
      style={{ inlineSize: `${zoom * 100}%` }}
      role="group"
      aria-label={label}
      aria-describedby={readOnly ? describedBy : undefined}
      tabIndex={-1}
      onPointerDown={onBackgroundDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      <defs>
        {['run', 'pass'].map((kind) => (
          <marker key={kind} id={`${uid}-head-${kind}`} viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse" markerUnits="strokeWidth">
            <path d="M0,0 L10,5 L0,10 z" className={`fb-head-${kind}`} />
          </marker>
        ))}
      </defs>
      <Court sport={sport} u={u} />

      {ghost ? (
        <g className="fb-ghost" aria-hidden="true">
          {(ghost.arrows || []).map((a) => (
            <line
              key={`g-${a.id}`}
              className={`fb-arrow-line fb-arrow-${a.kind}`}
              x1={a.x1 * L}
              y1={a.y1 * W}
              x2={a.x2 * L}
              y2={a.y2 * W}
              strokeWidth={arrowStroke * 0.85}
              strokeDasharray={a.kind === 'run' ? `${6 * u} ${4 * u}` : undefined}
              markerEnd={`url(#${uid}-head-${a.kind})`}
            />
          ))}
          {ghostPlayers.map((p) => (
            <g key={`g-${p.id}`}>
              <PlayerShape p={p} cx={p.x * L} cy={p.y * W} r={r} u={u} ghost />
            </g>
          ))}
          {ghost.ball ? <BallShape cx={ghost.ball.x * L} cy={ghost.ball.y * W} r={r * 0.62} u={u} ghost /> : null}
        </g>
      ) : null}

      <g className="fb-arrows">
        {arrows.map((a) => {
          const end = visibleEnd(a, players, ball, L, W, r)
          const selected = isSel('arrow', a.id)
          return (
            <g
              key={a.id}
              className={['fb-arrow', selected ? 'is-selected' : ''].filter(Boolean).join(' ')}
              opacity={a.opacity ?? 1}
              {...itemProps({ kind: 'arrow', id: a.id }, describe({ kind: 'arrow', id: a.id }, shown))}
              onPointerDown={readOnly ? undefined : (e) => startArrow(e, a)}
            >
              {!readOnly ? <line className="fb-arrow-hit" x1={a.x1 * L} y1={a.y1 * W} x2={end.x} y2={end.y} strokeWidth={16 * u} /> : null}
              {selected ? <line className="fb-arrow-sel" x1={a.x1 * L} y1={a.y1 * W} x2={end.x} y2={end.y} strokeWidth={arrowStroke + 5 * u} /> : null}
              <line
                className={`fb-arrow-line fb-arrow-${a.kind}`}
                x1={a.x1 * L}
                y1={a.y1 * W}
                x2={end.x}
                y2={end.y}
                strokeWidth={arrowStroke}
                strokeDasharray={a.kind === 'run' ? `${6 * u} ${4 * u}` : undefined}
                markerEnd={`url(#${uid}-head-${a.kind})`}
              />
            </g>
          )
        })}
      </g>

      {/* 44px drag targets around the arrow-end handles, under the players so a player keeps its own grip */}
      {selectedArrow && tool === 'select'
        ? [1, 2].map((end) => (
            <circle
              key={`hit${end}`}
              className="fb-hit"
              cx={(end === 1 ? selectedArrow.x1 : selectedArrow.x2) * L}
              cy={(end === 1 ? selectedArrow.y1 : selectedArrow.y2) * W}
              r={22 * u}
              aria-hidden="true"
              onPointerDown={(e) => startEnd(e, selectedArrow, end)}
            />
          ))
        : null}

      <g className="fb-players">
        {players.map((p) => {
          const cx = p.x * L
          const cy = p.y * W
          const selected = isSel('player', p.id)
          const sel = { kind: 'player', id: p.id }
          return (
            <g
              key={p.id}
              className={['fb-player', selected ? 'is-selected' : ''].filter(Boolean).join(' ')}
              opacity={p.opacity ?? 1}
              {...itemProps(sel, describe(sel, shown))}
              onPointerDown={readOnly ? undefined : (e) => startItem(e, sel, { x: p.x, y: p.y })}
            >
              {!readOnly ? <circle className="fb-hit" cx={cx} cy={cy} r={hitR} /> : null}
              {selected ? <circle className="fb-sel-ring" cx={cx} cy={cy} r={r + 5 * u} strokeWidth={2.4 * u} strokeDasharray={`${4 * u} ${3 * u}`} /> : null}
              <PlayerShape p={p} cx={cx} cy={cy} r={r} u={u} />
            </g>
          )
        })}
      </g>

      {ball ? (
        <g
          className={['fb-ball', isSel('ball') ? 'is-selected' : ''].filter(Boolean).join(' ')}
          opacity={ball.opacity ?? 1}
          {...itemProps({ kind: 'ball' }, describe({ kind: 'ball' }, shown))}
          onPointerDown={readOnly ? undefined : (e) => startItem(e, { kind: 'ball' }, { x: ball.x, y: ball.y })}
        >
          {!readOnly ? <circle className="fb-hit" cx={ball.x * L} cy={ball.y * W} r={hitR * 0.8} /> : null}
          {isSel('ball') ? <circle className="fb-sel-ring" cx={ball.x * L} cy={ball.y * W} r={r * 0.62 + 5 * u} strokeWidth={2.4 * u} strokeDasharray={`${4 * u} ${3 * u}`} /> : null}
          <BallShape cx={ball.x * L} cy={ball.y * W} r={r * 0.62} u={u} />
        </g>
      ) : null}

      {drawingPreview ? (
        <line
          className={`fb-arrow-line fb-arrow-${drawingPreview.kind} fb-preview`}
          x1={drawingPreview.x1 * L}
          y1={drawingPreview.y1 * W}
          x2={drawingPreview.x * L}
          y2={drawingPreview.y * W}
          strokeWidth={arrowStroke}
          strokeDasharray={drawingPreview.kind === 'run' ? `${6 * u} ${4 * u}` : undefined}
          markerEnd={`url(#${uid}-head-${drawingPreview.kind})`}
          pointerEvents="none"
        />
      ) : null}

      {selectedArrow && tool === 'select'
        ? [1, 2].map((end) => (
            <circle
              key={end}
              className="fb-handle"
              cx={(end === 1 ? selectedArrow.x1 : selectedArrow.x2) * L}
              cy={(end === 1 ? selectedArrow.y1 : selectedArrow.y2) * W}
              r={7 * u}
              strokeWidth={2 * u}
              aria-hidden="true"
              onPointerDown={(e) => startEnd(e, selectedArrow, end)}
            />
          ))
        : null}
    </svg>
  )
}
