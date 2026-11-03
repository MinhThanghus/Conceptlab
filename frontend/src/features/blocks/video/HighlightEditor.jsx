import { useLayoutEffect, useRef, useState } from 'react'
import { Crosshair, Eraser, Eye, Save, ScanSearch, Trash2, Undo2, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post, upload } from '../../../lib/api.js'
import { Alert, Button, ErrorMessage, IconButton, Segmented, Spinner, Switch, TextField, useToast } from '../../../components/ui/index.js'
import { newId } from '../../lab/specUtils.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { useAiTask } from './editorKit.jsx'
import { captureSize, formatClock, MAX_POINTS, MAX_TRACKS, pointsToPixels, snapshotTrack } from './videoUtils.js'

/** Draw the paused video frame to a JPEG file (same-origin video, so the canvas is not tainted). */
async function captureFrame(video) {
  if (!video?.videoWidth || !video?.videoHeight) throw new Error('not_ready')
  const { width, height } = captureSize(video.videoWidth, video.videoHeight, 1280)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, width, height)
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', 0.9)
  })
  return { file: new File([blob], 'frame.jpg', { type: 'image/jpeg' }), width, height }
}

/**
 * SAM 3.1 in the video editor:
 *  1. Track an object through the whole video (POST …/ai/track) → a highlight track.
 *  2. Highlight objects on the paused frame (POST …/ai/segment-frame with a phrase or
 *     clicked points) → masks drawn over that frame; kept only if saved as a snapshot.
 */
export default function HighlightEditor({ block, onChange, session, ready, pickState, setPickState, highlight, setHighlight }) {
  const { t, lang, fmt } = useT()
  const env = useBlockEnv()
  const toast = useToast()
  const trackTask = useAiTask()
  const segTask = useAiTask()
  const [trackPhrase, setTrackPhrase] = useState('')
  const [notFound, setNotFound] = useState('')
  const [captureError, setCaptureError] = useState(false)
  // Tracking can take minutes: its result is applied to the block as it is then, not as it was at submit.
  const latest = useRef({ block, onChange })
  useLayoutEffect(() => {
    latest.current = { block, onChange }
  })
  const tracks = block.tracks || []
  const clock = (s) => formatClock(s, { lang })
  const trackPath = env.aiPath('track')
  const segPath = env.aiPath('segment-frame')
  const aiReady = Boolean(env.aiAvailable && trackPath && segPath)
  const canAddTrack = tracks.length < MAX_TRACKS

  const runTrack = async (event) => {
    event?.preventDefault()
    const phrase = trackPhrase.trim()
    if (!phrase || !canAddTrack) return
    setNotFound('')
    const submitted = { id: block.id, sourceId: block.source_id }
    const res = await trackTask.run((signal) => post(trackPath, { source_id: submitted.sourceId, phrase }, { signal }))
    if (!res) return
    const { block: current, onChange: change } = latest.current
    // The block was replaced or now shows another video: this track no longer belongs to it.
    if (current.id !== submitted.id || current.source_id !== submitted.sourceId) return
    const frames = Array.isArray(res.track?.frames) ? res.track.frames : []
    if (!res.frames_with_objects || !frames.length) {
      setNotFound(phrase)
      return
    }
    const currentTracks = current.tracks || []
    if (currentTracks.length >= MAX_TRACKS) return
    const id = res.track?.id && !currentTracks.some((x) => x.id === res.track.id) ? String(res.track.id).slice(0, 40) : newId('tr')
    const track = { id, phrase: String(res.track?.phrase || phrase).slice(0, 200), frames: frames.slice(0, 5000) }
    change({ ...current, tracks: [...currentTracks, track] })
    toast.success(t('video.tracks.added', { phrase: track.phrase, found: res.frames_with_objects, total: frames.length }))
    setTrackPhrase('')
  }

  const removeTrack = (id) => onChange({ ...block, tracks: tracks.filter((x) => x.id !== id) })

  const segReady = pickState.mode === 'points' ? pickState.points.length > 0 : pickState.phrase.trim().length > 0
  const runSegment = async (event) => {
    event?.preventDefault()
    const ctrl = session.controllerRef.current
    const video = ctrl?.getVideo()
    if (!video || !segReady) return
    ctrl.pause()
    setCaptureError(false)
    let captured
    try {
      captured = await captureFrame(video)
    } catch {
      setCaptureError(true)
      return
    }
    const at = video.currentTime
    const fields =
      pickState.mode === 'points' ? { points: pointsToPixels(pickState.points, captured.width, captured.height) } : { phrase: pickState.phrase.trim().slice(0, 120) }
    const res = await segTask.run((signal) => upload(segPath, captured.file, { fields, signal }))
    if (!res) return
    setHighlight({ t: at, result: res, phrase: res.phrase_used || (pickState.mode === 'phrase' ? pickState.phrase.trim() : '') })
  }

  const saveSnapshot = () => {
    if (!highlight || !canAddTrack) return
    const track = snapshotTrack({ id: newId('tr'), phrase: highlight.phrase || t('video.highlight.pointsPhrase'), t: highlight.t, result: highlight.result })
    onChange({ ...block, tracks: [...tracks, track].slice(0, MAX_TRACKS) })
    setHighlight(null)
    setPickState((s) => ({ ...s, points: [] }))
    toast.success(t('video.highlight.saved', { time: clock(track.frames[0].t) }))
  }

  const objects = highlight?.result?.objects || []
  const away = highlight ? Math.abs(session.time - highlight.t) > 0.04 : false

  return (
    <div className="stack">
      {!aiReady ? <Alert tone="info">{t('common.ai.notConfigured')}</Alert> : null}

      {/* ---------------------------------------------------------- whole-video tracking */}
      <section className="vb-section" aria-labelledby={`${block.id}-track-h`}>
        <h4 id={`${block.id}-track-h`}>{t('video.tracks.title')}</h4>
        <p className="small muted" style={{ margin: 0 }}>
          {t('video.tracks.intro')}
        </p>
        <form className="vb-inline-form" onSubmit={runTrack}>
          <TextField
            label={t('video.tracks.phraseLabel')}
            hint={t('video.tracks.phraseHint')}
            value={trackPhrase}
            maxLength={120}
            placeholder={t('video.tracks.phrasePlaceholder')}
            onChange={(e) => setTrackPhrase(e.target.value)}
            disabled={trackTask.busy}
          />
          <Button type="submit" variant="soft" icon={Crosshair} loading={trackTask.busy} disabled={!ready || !aiReady || !trackPhrase.trim() || !canAddTrack}>
            {t('video.tracks.run')}
          </Button>
        </form>
        {!canAddTrack ? <p className="small muted" style={{ margin: 0 }}>{t('video.tracks.limit', { max: MAX_TRACKS })}</p> : null}
        {trackTask.busy ? (
          <div className="card-muted row-between" role="status">
            <Spinner label={t('video.tracks.working', { phrase: trackPhrase.trim() })} />
            <Button size="sm" onClick={trackTask.cancel}>
              {t('common.actions.cancel')}
            </Button>
          </div>
        ) : null}
        <ErrorMessage error={trackTask.error} onRetry={runTrack} />
        {notFound ? (
          <Alert tone="warning" role="alert">
            {t('video.tracks.notFound', { phrase: notFound })}
          </Alert>
        ) : null}
        {session.prepared.length ? (
          <ul className="list-reset vb-tracklist" aria-label={t('video.tracks.listLabel')}>
            {session.prepared.map((tr) => {
              const snapshot = tr.frames.length === 1
              return (
                <li key={tr.id} className="vb-track-row">
                  <span className="vb-swatch" style={{ background: `var(${tr.colorVar})` }} aria-hidden="true" />
                  <span className="vb-grow">
                    <strong className="break">{tr.phrase || t('video.tracks.unnamed')}</strong>
                    <span className="small muted" style={{ display: 'block' }}>
                      {snapshot
                        ? t('video.tracks.snapshotInfo', { time: clock(tr.frames[0].t) })
                        : t('video.tracks.info', { found: tr.withObjects, total: tr.frames.length })}
                    </span>
                  </span>
                  {snapshot ? (
                    <IconButton icon={Eye} label={t('video.tracks.goTo', { time: clock(tr.frames[0].t) })} size="sm" bordered onClick={() => session.seekTo(tr.frames[0].t, { pause: true })} />
                  ) : null}
                  <Switch label={t('video.tracks.show')} checked={session.visible.has(tr.id)} onChange={() => session.toggleTrack(tr.id)} />
                  <IconButton icon={Trash2} label={t('video.tracks.delete', { phrase: tr.phrase })} size="sm" onClick={() => removeTrack(tr.id)} />
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            {t('video.tracks.empty')}
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- this frame only */}
      <section className="vb-section" aria-labelledby={`${block.id}-frame-h`}>
        <h4 id={`${block.id}-frame-h`}>{t('video.highlight.title')}</h4>
        <p className="small muted" style={{ margin: 0 }}>
          {t('video.highlight.intro')}
        </p>
        <Segmented
          value={pickState.mode}
          onChange={(mode) => setPickState((s) => ({ ...s, mode }))}
          label={t('video.highlight.modeLabel')}
          options={[
            { value: 'phrase', label: t('video.highlight.modePhrase') },
            { value: 'points', label: t('video.highlight.modePoints') },
          ]}
        />
        <form className="stack-sm" onSubmit={runSegment}>
          {pickState.mode === 'phrase' ? (
            <TextField
              label={t('video.highlight.phraseLabel')}
              hint={t('video.highlight.phraseHint')}
              value={pickState.phrase}
              maxLength={120}
              placeholder={t('video.tracks.phrasePlaceholder')}
              onChange={(e) => {
                const phrase = e.target.value
                setPickState((s) => ({ ...s, phrase }))
              }}
            />
          ) : (
            <div className="stack-sm">
              <p className="small" style={{ margin: 0 }}>
                {t('video.highlight.pointsHint')}
              </p>
              <div className="row">
                <Switch label={t('video.highlight.negative')} checked={pickState.negative} onChange={(e) => setPickState((s) => ({ ...s, negative: e.target.checked }))} />
                <Button size="sm" icon={Undo2} disabled={!pickState.points.length} onClick={() => setPickState((s) => ({ ...s, points: s.points.slice(0, -1) }))}>
                  {t('video.highlight.undoPoint')}
                </Button>
                <Button size="sm" icon={Eraser} disabled={!pickState.points.length} onClick={() => setPickState((s) => ({ ...s, points: [] }))}>
                  {t('video.highlight.clearPoints')}
                </Button>
                <span className="small muted" aria-live="polite">
                  {t('video.highlight.pointCount', { count: pickState.points.length, max: MAX_POINTS })}
                </span>
              </div>
            </div>
          )}
          <div className="row">
            <Button type="submit" variant="soft" icon={ScanSearch} loading={segTask.busy} disabled={!ready || !aiReady || !segReady}>
              {t('video.highlight.run', { time: clock(session.time) })}
            </Button>
            {segTask.busy ? (
              <Button size="sm" onClick={segTask.cancel}>
                {t('common.actions.cancel')}
              </Button>
            ) : null}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('video.highlight.privacy')}
          </p>
        </form>
        {captureError ? (
          <Alert tone="danger" role="alert">
            {t('video.highlight.captureFailed')}
          </Alert>
        ) : null}
        <ErrorMessage error={segTask.error} onRetry={runSegment} />
        {highlight ? (
          <div className="card-muted stack-sm" aria-live="polite">
            {objects.length ? (
              <p style={{ margin: 0 }}>
                <strong>{t('video.highlight.found', { count: objects.length, time: clock(highlight.t) })}</strong>
                {objects.some((o) => typeof o.confidence === 'number') ? (
                  <span className="small muted">
                    {' '}
                    {t('video.highlight.confidence', {
                      values: objects
                        .filter((o) => typeof o.confidence === 'number')
                        .map((o) => fmt.percent(o.confidence))
                        .join(', '),
                    })}
                  </span>
                ) : null}
              </p>
            ) : (
              <Alert tone="warning">{t('video.highlight.none')}</Alert>
            )}
            {away ? (
              <Alert
                tone="info"
                action={
                  <Button size="sm" onClick={() => session.seekTo(highlight.t, { pause: true })}>
                    {t('video.highlight.backToFrame')}
                  </Button>
                }
              >
                {t('video.highlight.otherFrame', { time: clock(highlight.t) })}
              </Alert>
            ) : null}
            <div className="row">
              <Button variant="primary" icon={Save} onClick={saveSnapshot} disabled={!objects.length || !canAddTrack}>
                {t('video.highlight.save', { time: clock(highlight.t) })}
              </Button>
              <Button icon={X} onClick={() => setHighlight(null)}>
                {t('video.highlight.discard')}
              </Button>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {t('video.highlight.notSavedHint')}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
