import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CopyPlus,
  Footprints,
  MousePointer2,
  Pause,
  Play,
  Redo2,
  Send,
  Trash2,
  Undo2,
  UserPlus,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, IconButton } from '../../../components/ui/index.js'
import FieldBoard from './FieldBoard.jsx'
const SportsField3D = lazy(() => import('./SportsField3D.jsx'))
import {
  addArrow,
  addPlayer,
  advanceFrame,
  blankFrame,
  findItem,
  frameAtPlayback,
  MAX_ARROWS,
  MAX_FRAMES,
  MAX_PLAYERS,
  moveFrame,
  passBetween,
  removeItem,
  runFromPlayer,
  SEGMENT_MS,
} from './fieldUtils.js'

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Playback of a scenario: interpolated positions between frames, ~1.2 s per frame. */
function usePlayback(frames, onFinish) {
  const [run, setRun] = useState(null) // { from, reduced }
  const [elapsed, setElapsed] = useState(0)
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish
  const countRef = useRef(frames.length)
  countRef.current = frames.length
  useEffect(() => {
    if (!run) return undefined
    let raf = 0
    const begin = performance.now()
    const total = (countRef.current - 1) * SEGMENT_MS
    const tick = (now) => {
      const e = run.from * SEGMENT_MS + (now - begin)
      if (e >= total) {
        setRun(null)
        finishRef.current?.(countRef.current - 1)
        return
      }
      setElapsed(e)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run])
  const view = run ? frameAtPlayback(frames, elapsed, { reducedMotion: run.reduced }) : null
  return {
    playing: Boolean(run),
    view,
    start: (from) => {
      setElapsed(from * SEGMENT_MS)
      setRun({ from, reduced: prefersReducedMotion() })
    },
    stop: () => setRun(null),
  }
}

function LegendSwatch({ kind }) {
  if (kind === 'a') return <circle cx="8" cy="8" r="6.5" className="fb-token fb-team-a" strokeWidth="1.5" />
  if (kind === 'b') return <rect x="2" y="2" width="12" height="12" rx="3" className="fb-token fb-team-b" strokeWidth="1.5" />
  if (kind === 'ball') return <circle cx="8" cy="8" r="5" className="fb-ball-body" strokeWidth="1.5" />
  if (kind === 'ghost') return <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
  return (
    <>
      <line x1="1" y1="8" x2="20" y2="8" className={`fb-arrow-line fb-arrow-${kind}`} strokeWidth="2" strokeDasharray={kind === 'run' ? '4 3' : undefined} />
      <path d="M19 4 L26 8 L19 12 z" className={`fb-head-${kind}`} />
    </>
  )
}

export function FieldLegend({ showGhost }) {
  const { t } = useT()
  const items = [
    ['a', t('field.legend.teamA')],
    ['b', t('field.legend.teamB')],
    ['ball', t('field.legend.ball')],
    ['run', t('field.legend.run')],
    ['pass', t('field.legend.pass')],
  ]
  if (showGhost) items.push(['ghost', t('field.legend.ghost')])
  return (
    <ul className="fb-legend" aria-label={t('field.legend.title')}>
      {items.map(([kind, text]) => (
        <li key={kind}>
          <svg viewBox="0 0 26 16" aria-hidden="true">
            <LegendSwatch kind={kind} />
          </svg>
          {text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Board + tools + timeline. `mode`:
 *   'edit'    teacher: every tool, add/delete/reorder frames, notes, labels, teams.
 *   'learn'   learner scratch copy: move tokens, draw runs/passes, delete, undo; frames are
 *             navigated and replayed but not added or removed.
 *   'preview' read-only (AI proposal, teacher's solution): navigate and replay only.
 * Changes are committed with onFramesChange(nextFrames) and can be undone.
 */
export default function FieldWorkspace({
  sport,
  frames: framesProp,
  onFramesChange,
  mode = 'edit',
  ghostFrames = null,
  sideFrames = null,
  sideTitle,
  makeId,
  extraActions = null,
  onStateChange,
  boardLabel,
}) {
  const { t, lang } = useT()
  const helpId = useId()
  const descId = useId()
  const frames = useMemo(() => (framesProp && framesProp.length ? framesProp : [blankFrame('f_blank')]), [framesProp])
  const [index, setIndex] = useState(0)
  const [tool, setTool] = useState('select')
  const [selection, setSelection] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [show3d, setShow3d] = useState(mode === 'learn')
  const [announce, setAnnounce] = useState('')
  const [, bump] = useState(0)
  const undo = useRef([])
  const redo = useRef([])
  const lastSeen = useRef(framesProp)
  const own = useRef(null)
  const coalesce = useRef({ key: null, at: 0 })
  const interactive = mode !== 'preview'
  const editing = mode === 'edit'

  const current = Math.min(index, frames.length - 1)
  const frame = frames[current]
  const playback = usePlayback(frames, (last) => setIndex(last))

  // Frames replaced from outside (AI scenario, reset) become an undoable step too.
  useEffect(() => {
    if (framesProp === lastSeen.current) return
    if (framesProp !== own.current && lastSeen.current) {
      undo.current = [...undo.current, lastSeen.current].slice(-60)
      redo.current = []
      bump((n) => n + 1)
    }
    lastSeen.current = framesProp
  }, [framesProp])

  useEffect(() => {
    if (index > frames.length - 1) setIndex(frames.length - 1)
  }, [index, frames.length])

  useEffect(() => {
    if (!playback.playing) onStateChange?.({ index: current, frame, total: frames.length })
  }, [current, frame, frames.length, playback.playing, onStateChange])

  const commitFrames = useCallback(
    (next, { coalesceKey } = {}) => {
      const now = Date.now()
      const merge = coalesceKey && coalesce.current.key === coalesceKey && now - coalesce.current.at < 1500
      if (!merge) {
        undo.current = [...undo.current, framesProp && framesProp.length ? framesProp : frames].slice(-60)
        redo.current = []
      }
      coalesce.current = { key: coalesceKey || null, at: now }
      own.current = next
      lastSeen.current = next
      onFramesChange?.(next)
      bump((n) => n + 1)
    },
    [framesProp, frames, onFramesChange],
  )

  const commitFrame = useCallback(
    (nextFrame, opts) => commitFrames(frames.map((f, i) => (i === current ? nextFrame : f)), opts),
    [commitFrames, frames, current],
  )

  const doUndo = () => {
    const prev = undo.current.at(-1)
    if (!prev) return
    undo.current = undo.current.slice(0, -1)
    redo.current = [...redo.current, frames]
    coalesce.current = { key: null, at: 0 }
    own.current = prev
    lastSeen.current = prev
    onFramesChange?.(prev)
    setSelection(null)
    bump((n) => n + 1)
    setAnnounce(t('field.a11y.undone'))
  }
  const doRedo = () => {
    const next = redo.current.at(-1)
    if (!next) return
    redo.current = redo.current.slice(0, -1)
    undo.current = [...undo.current, frames]
    coalesce.current = { key: null, at: 0 }
    own.current = next
    lastSeen.current = next
    onFramesChange?.(next)
    setSelection(null)
    bump((n) => n + 1)
    setAnnounce(t('field.a11y.redone'))
  }

  const onKeyDown = (event) => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest('input, textarea, select')) return
    if (!(event.ctrlKey || event.metaKey) || !interactive) return
    const key = event.key.toLowerCase()
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      doUndo()
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault()
      doRedo()
    }
  }

  /* ---------------------------------------------------------------- frame operations */
  const id = (prefix) => makeId(prefix)
  const goTo = (i) => {
    playback.stop()
    setIndex(Math.max(0, Math.min(frames.length - 1, i)))
  }
  const addFrame = () => {
    if (frames.length >= MAX_FRAMES) return
    const next = [...frames.slice(0, current + 1), advanceFrame(frame, id('f')), ...frames.slice(current + 1)]
    commitFrames(next)
    setIndex(current + 1)
    setAnnounce(t('field.a11y.frameAdded', { n: current + 2 }))
  }
  const deleteFrame = () => {
    if (frames.length <= 1) return
    commitFrames(frames.filter((_, i) => i !== current))
    setIndex(Math.max(0, current - 1))
    setAnnounce(t('field.a11y.frameDeleted'))
  }
  const shiftFrame = (delta) => {
    const next = moveFrame(frames, current, delta)
    if (next === frames) return
    commitFrames(next)
    setIndex(current + delta)
  }
  const setNote = (note) => commitFrame({ ...frame, note }, { coalesceKey: `note:${frame.id}` })

  /* ---------------------------------------------------------------- item operations */
  const selected = selection ? findItem(frame, selection) : null
  const activeSel = selected ? selection : null
  const addTeamPlayer = (team) => {
    if ((frame.players || []).length >= MAX_PLAYERS) return
    const pid = id('p')
    commitFrame(addPlayer(frame, team, pid))
    setSelection({ kind: 'player', id: pid })
    setTool('select')
    setAnnounce(t('field.a11y.playerAdded', { team }))
  }
  const toggleBall = () => {
    if (frame.ball) {
      commitFrame({ ...frame, ball: null })
      if (selection?.kind === 'ball') setSelection(null)
    } else {
      commitFrame({ ...frame, ball: { x: 0.5, y: 0.5 } })
      setSelection({ kind: 'ball' })
      setTool('select')
    }
  }
  const deleteSelected = () => {
    if (!activeSel) return
    commitFrame(removeItem(frame, activeSel))
    setSelection(null)
    setAnnounce(t('field.a11y.removed'))
  }
  const drawRunFrom = (player) => {
    if ((frame.arrows || []).length >= MAX_ARROWS) return
    const arrow = runFromPlayer(player, id('a'))
    commitFrame(addArrow(frame, arrow))
    setSelection({ kind: 'arrow', id: arrow.id })
    setAnnounce(t('field.a11y.runAdded'))
  }
  const passTo = (from, targetId) => {
    const to = (frame.players || []).find((p) => p.id === targetId)
    if (!to || (frame.arrows || []).length >= MAX_ARROWS) return
    const arrow = passBetween(from, to, id('a'))
    commitFrame(addArrow(frame, arrow))
    setSelection({ kind: 'arrow', id: arrow.id })
    setAnnounce(t('field.a11y.passAdded'))
  }
  const patchPlayer = (pid, patch) => commitFrame({ ...frame, players: frame.players.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }, { coalesceKey: `player:${pid}` })
  const flipArrow = (aid) =>
    commitFrame({ ...frame, arrows: frame.arrows.map((a) => (a.id === aid ? { ...a, kind: a.kind === 'pass' ? 'run' : 'pass' } : a)) })

  /* ---------------------------------------------------------------- render */
  const playing = playback.playing
  const shownIndex = playing ? playback.view.index : current
  const shownFrame = playing ? playback.view.frame : frame
  const ghost = ghostFrames && ghostFrames.length ? ghostFrames[Math.min(shownIndex, ghostFrames.length - 1)] : null
  const side = sideFrames && sideFrames.length ? sideFrames[Math.min(shownIndex, sideFrames.length - 1)] : null
  const readOnly = !interactive || playing
  const tools = [
    { id: 'select', icon: MousePointer2, label: t('field.tools.select') },
    { id: 'run', icon: Footprints, label: t('field.tools.run') },
    { id: 'pass', icon: Send, label: t('field.tools.pass') },
  ]
  const others = selected && activeSel?.kind !== 'arrow' ? (frame.players || []).filter((p) => p.id !== activeSel.id) : []
  const fromPoint = activeSel?.kind === 'ball' ? frame.ball : activeSel?.kind === 'player' ? selected : null
  const summary = useMemo(() => {
    const f = shownFrame || {}
    const team = (tm) =>
      (f.players || [])
        .filter((p) => p.team === tm)
        .map((p) => t('field.a11y.summaryPlayer', { label: p.label || '?', x: Math.round(p.x * 100), y: Math.round(p.y * 100) }))
        .join('; ') || t('field.a11y.summaryNone')
    return t('field.a11y.summary', {
      n: shownIndex + 1,
      total: frames.length,
      a: team('A'),
      b: team('B'),
      ball: f.ball ? t('field.a11y.summaryBall', { x: Math.round(f.ball.x * 100), y: Math.round(f.ball.y * 100) }) : t('field.a11y.summaryNoBall'),
      arrows: (f.arrows || []).length,
    })
  }, [shownFrame, shownIndex, frames.length, t])

  const board = (
    <div className="fb-scroll">
      <FieldBoard
        sport={sport}
        frame={shownFrame}
        ghost={ghost}
        readOnly={readOnly}
        tool={tool}
        selection={activeSel}
        onSelect={setSelection}
        onChange={commitFrame}
        onAnnounce={setAnnounce}
        zoom={zoom}
        label={boardLabel || t('field.board.label', { sport: t(`field.sports.${sport}`) })}
        describedBy={readOnly ? descId : helpId}
        makeId={makeId}
      />
    </div>
  )

  return (
    <div className="fb-workspace" onKeyDown={onKeyDown}>
      {interactive ? (
        <div className="fb-toolbar" role="toolbar" aria-label={t('field.tools.label')}>
          {tools.map((tl) => (
            <button
              key={tl.id}
              type="button"
              className="btn btn-sm fb-tool"
              aria-pressed={tool === tl.id}
              disabled={playing}
              onClick={() => setTool(tl.id)}
              title={tl.label}
            >
              <tl.icon aria-hidden="true" />
              <span className="fb-tool-label">{tl.label}</span>
            </button>
          ))}
          {editing ? (
            <>
              <span className="fb-sep" aria-hidden="true" />
              <button type="button" className="btn btn-sm fb-tool" onClick={() => addTeamPlayer('A')} disabled={playing || (frame.players || []).length >= MAX_PLAYERS} title={t('field.tools.addA')}>
                <UserPlus aria-hidden="true" />
                <span className="fb-tool-label">{t('field.tools.addA')}</span>
              </button>
              <button type="button" className="btn btn-sm fb-tool" onClick={() => addTeamPlayer('B')} disabled={playing || (frame.players || []).length >= MAX_PLAYERS} title={t('field.tools.addB')}>
                <UserPlus aria-hidden="true" />
                <span className="fb-tool-label">{t('field.tools.addB')}</span>
              </button>
              <button type="button" className="btn btn-sm fb-tool" onClick={toggleBall} disabled={playing} title={frame.ball ? t('field.tools.removeBall') : t('field.tools.addBall')}>
                <CircleDot aria-hidden="true" />
                <span className="fb-tool-label">{frame.ball ? t('field.tools.removeBall') : t('field.tools.addBall')}</span>
              </button>
            </>
          ) : null}
          <span className="fb-sep" aria-hidden="true" />
          <IconButton icon={Trash2} label={t('field.tools.delete')} bordered onClick={deleteSelected} disabled={playing || !activeSel} />
          <IconButton icon={Undo2} label={t('field.tools.undo')} bordered onClick={doUndo} disabled={playing || !undo.current.length} />
          <IconButton icon={Redo2} label={t('field.tools.redo')} bordered onClick={doRedo} disabled={playing || !redo.current.length} />
          <IconButton icon={zoom > 1 ? ZoomOut : ZoomIn} label={zoom > 1 ? t('field.tools.zoomOut') : t('field.tools.zoomIn')} bordered pressed={zoom > 1} onClick={() => setZoom((z) => (z > 1 ? 1 : 2))} />
          {extraActions}
        </div>
      ) : null}

      {side ? (
        <div className="fb-boards side">
          <div>
            <p className="fb-board-title">{t('field.compare.mine')}</p>
            {board}
          </div>
          <div>
            <p className="fb-board-title">{sideTitle || t('field.compare.teacher')}</p>
            <div className="fb-scroll">
              <FieldBoard sport={sport} frame={side} readOnly label={t('field.compare.teacherBoard', { n: Math.min(shownIndex, sideFrames.length - 1) + 1 })} zoom={1} makeId={makeId} />
            </div>
          </div>
        </div>
      ) : (
        board
      )}
      <div>
        <button type="button" className="fb-3d-toggle" aria-expanded={show3d} onClick={() => setShow3d((current) => !current)}>
          {lang === 'en' ? (show3d ? 'Hide 3D field' : 'View 3D field') : (show3d ? 'Ẩn sân 3D' : 'Xem sân 3D')}
        </button>
      </div>
      {show3d ? <Suspense fallback={<p role="status">{lang === 'en' ? 'Loading 3D field…' : 'Đang tải sân 3D…'}</p>}><SportsField3D sport={sport} frame={shownFrame} ghost={ghost} /></Suspense> : null}
      <p id={descId} className="visually-hidden">
        {summary}
      </p>
      <p id={helpId} className="visually-hidden">
        {t('field.a11y.help')}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announce}
      </p>

      <FieldLegend showGhost={Boolean(ghost)} />

      {interactive && !playing ? (
        <div className="fb-inspector" aria-live="off">
          {activeSel?.kind === 'player' && selected ? (
            <>
              <span className="fb-inspector-title">{t('field.inspector.player', { team: selected.team, label: selected.label || '?' })}</span>
              {editing ? (
                <>
                  <label className="row" style={{ gap: '0.35rem' }}>
                    <span className="small">{t('field.inspector.label')}</span>
                    <input
                      className="input input-sm fb-label-input"
                      value={selected.label || ''}
                      maxLength={4}
                      onChange={(e) => patchPlayer(selected.id, { label: e.target.value.slice(0, 4) })}
                    />
                  </label>
                  <Button size="sm" onClick={() => patchPlayer(selected.id, { team: selected.team === 'A' ? 'B' : 'A' })}>
                    {t('field.inspector.switchTeam', { team: selected.team === 'A' ? 'B' : 'A' })}
                  </Button>
                </>
              ) : null}
              <Button size="sm" icon={Footprints} onClick={() => drawRunFrom(selected)} disabled={(frame.arrows || []).length >= MAX_ARROWS}>
                {t('field.inspector.addRun')}
              </Button>
              {others.length ? (
                <label className="row" style={{ gap: '0.35rem' }}>
                  <span className="small">{t('field.inspector.passTo')}</span>
                  <select className="select input-sm" style={{ minBlockSize: 'var(--cl-control-h-sm)' }} value="" onChange={(e) => passTo(fromPoint, e.target.value)}>
                    <option value="" disabled>
                      {t('field.inspector.choosePlayer')}
                    </option>
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t('field.inspector.playerOption', { team: p.team, label: p.label || '?' })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : activeSel?.kind === 'ball' ? (
            <>
              <span className="fb-inspector-title">{t('field.inspector.ball')}</span>
              {others.length ? (
                <label className="row" style={{ gap: '0.35rem' }}>
                  <span className="small">{t('field.inspector.passBallTo')}</span>
                  <select className="select input-sm" style={{ minBlockSize: 'var(--cl-control-h-sm)' }} value="" onChange={(e) => passTo(fromPoint, e.target.value)}>
                    <option value="" disabled>
                      {t('field.inspector.choosePlayer')}
                    </option>
                    {others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {t('field.inspector.playerOption', { team: p.team, label: p.label || '?' })}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : activeSel?.kind === 'arrow' && selected ? (
            <>
              <span className="fb-inspector-title">{selected.kind === 'pass' ? t('field.inspector.passArrow') : t('field.inspector.runArrow')}</span>
              <Button size="sm" onClick={() => flipArrow(selected.id)}>
                {selected.kind === 'pass' ? t('field.inspector.makeRun') : t('field.inspector.makePass')}
              </Button>
              <span className="small muted">{t('field.inspector.arrowKeys')}</span>
            </>
          ) : (
            <span className="small muted">{tool === 'select' ? t('field.inspector.hintSelect') : t('field.inspector.hintDraw')}</span>
          )}
        </div>
      ) : null}

      <div className="fb-timeline">
        <div className="row-between">
          <div className="fb-frames" role="group" aria-label={t('field.frames.label')}>
            <IconButton icon={ChevronLeft} label={t('field.frames.prev')} size="sm" bordered onClick={() => goTo(current - 1)} disabled={playing || current === 0} />
            {frames.map((f, i) => (
              <button
                key={f.id || i}
                type="button"
                className={['fb-frame-btn', f.note ? 'has-note' : ''].filter(Boolean).join(' ')}
                aria-current={i === shownIndex ? 'step' : undefined}
                aria-label={t('field.frames.frameN', { n: i + 1, total: frames.length })}
                onClick={() => goTo(i)}
              >
                {i + 1}
              </button>
            ))}
            <IconButton icon={ChevronRight} label={t('field.frames.next')} size="sm" bordered onClick={() => goTo(current + 1)} disabled={playing || current >= frames.length - 1} />
          </div>
          <Button
            size="sm"
            variant={playing || mode !== 'learn' ? undefined : 'primary'}
            icon={playing ? Pause : Play}
            onClick={() => (playing ? playback.stop() : playback.start(current >= frames.length - 1 ? 0 : current))}
            disabled={frames.length < 2}
            title={frames.length < 2 ? t('field.frames.needTwo') : undefined}
          >
            {playing ? t('field.frames.stop') : t('field.frames.play')}
          </Button>
        </div>
        {editing ? (
          <div className="row">
            <Button size="sm" icon={CopyPlus} onClick={addFrame} disabled={playing || frames.length >= MAX_FRAMES}>
              {t('field.frames.add')}
            </Button>
            <IconButton icon={ChevronLeft} label={t('field.frames.moveEarlier')} size="sm" bordered onClick={() => shiftFrame(-1)} disabled={playing || current === 0} />
            <IconButton icon={ChevronRight} label={t('field.frames.moveLater')} size="sm" bordered onClick={() => shiftFrame(1)} disabled={playing || current >= frames.length - 1} />
            <IconButton icon={Trash2} label={t('field.frames.delete', { n: current + 1 })} size="sm" bordered onClick={deleteFrame} disabled={playing || frames.length <= 1} />
            <span className="small muted">{frames.length >= MAX_FRAMES ? t('field.frames.limit', { max: MAX_FRAMES }) : t('field.frames.addHint')}</span>
          </div>
        ) : null}
        {editing ? (
          <div className="field">
            <label className="field-label" htmlFor={`${helpId}-note`}>
              {t('field.frames.noteLabel', { n: current + 1 })}
            </label>
            <textarea
              id={`${helpId}-note`}
              className="textarea"
              rows={2}
              maxLength={2000}
              value={frame.note || ''}
              placeholder={t('field.frames.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
              disabled={playing}
            />
          </div>
        ) : shownFrame?.note ? (
          <p className="fb-note" aria-live="polite">
            <strong>{t('field.frames.noteTitle', { n: shownIndex + 1 })}</strong> {shownFrame.note}
          </p>
        ) : null}
      </div>
    </div>
  )
}
