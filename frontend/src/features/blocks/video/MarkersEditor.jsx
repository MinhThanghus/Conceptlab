import { useState } from 'react'
import { Check, Eye, Flag, Plus, Timer, Trash2, WandSparkles, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { AIBadge, Alert, Button, EmptyState, ErrorMessage, IconButton, RichText, Spinner, Switch, useToast } from '../../../components/ui/index.js'
import { newId } from '../../lab/specUtils.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { useAiTask } from './editorKit.jsx'
import { acceptSuggestion, clamp, formatClock, MAX_MARKERS, sortMarkers, upsertMarker } from './videoUtils.js'
import { DecimalInput } from '../../studio/authoring/DecimalInput.jsx'

/** An existing marker within half a second of `time` (AI suggestions often repeat them). */
function nearbyMarker(markers, time) {
  return markers.find((m) => Math.abs(Number(m.t) - Number(time)) <= 0.5) || null
}

/**
 * Teacher tools for observation markers: add at the current time, edit label/note/time,
 * confirm, delete, and AI suggestions (POST …/ai/video-markers) to accept or reject.
 * Learners only see confirmed AI markers (the published snapshot drops the others).
 */
export default function MarkersEditor({ block, onChange, session, ready, duration }) {
  const { t, lang } = useT()
  const env = useBlockEnv()
  const toast = useToast()
  const ai = useAiTask()
  const [suggestions, setSuggestions] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const markers = block.markers || []
  const clock = (s) => formatClock(s, { lang })
  const full = markers.length >= MAX_MARKERS
  const aiPath = env.aiPath('video-markers')
  const aiReady = Boolean(env.aiAvailable && aiPath)
  const pending = markers.filter((m) => m.ai_suggested && !m.confirmed)

  const setMarkers = (list) => onChange({ ...block, markers: list })
  const patchMarker = (id, patch) => setMarkers(markers.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  const clampT = (v) => clamp(Number(v) || 0, 0, duration > 0 ? duration : Number.MAX_SAFE_INTEGER)

  const addAtNow = () => {
    if (full) return
    session.controllerRef.current?.pause()
    const now = Number((session.controllerRef.current?.getTime() ?? session.time).toFixed(2))
    const marker = { id: newId('m'), t: now, label: t('video.markers.defaultLabel', { n: markers.length + 1 }), note: '', confirmed: true, ai_suggested: false }
    setMarkers(upsertMarker(markers, marker))
    setFocusId(marker.id)
  }

  const suggest = async () => {
    const res = await ai.run((signal) => post(aiPath, { source_id: block.source_id }, { signal }))
    if (!res) return
    const items = sortMarkers(res.markers || []).map((m) => ({ ...m, key: newId('s'), t: clampT(m.t) }))
    setSuggestions({ items, notes: res.notes || '', limits: res.limits || '' })
    if (!items.length) toast.info(t('video.ai.noSuggestions'))
  }

  const accept = (items) => {
    let list = markers
    for (const item of items) list = upsertMarker(list, acceptSuggestion({ ...item, id: null }, () => newId('m')))
    setMarkers(list)
    const keys = new Set(items.map((i) => i.key))
    setSuggestions((s) => (s ? { ...s, items: s.items.filter((i) => !keys.has(i.key)) } : s))
    toast.success(t('video.ai.accepted', { count: items.length }))
  }
  const reject = (item) => setSuggestions((s) => (s ? { ...s, items: s.items.filter((i) => i.key !== item.key) } : s))
  const useLimits = () => {
    const text = [block.limits_note, suggestions?.limits].filter(Boolean).join('\n').slice(0, 2000)
    onChange({ ...block, limits_note: text })
    toast.success(t('video.ai.limitsAdded'))
  }

  return (
    <div className="stack">
      <div className="row">
        <Button variant="primary" icon={Plus} onClick={addAtNow} disabled={!ready || full}>
          {t('video.markers.addAt', { time: clock(session.time) })}
        </Button>
        <Button variant="soft" icon={WandSparkles} onClick={suggest} loading={ai.busy} disabled={!ready || !aiReady}>
          {t('video.ai.suggest')}
        </Button>
      </div>
      {full ? <p className="small muted" style={{ margin: 0 }}>{t('video.markers.limit', { max: MAX_MARKERS })}</p> : null}
      {!aiReady ? <p className="small muted" style={{ margin: 0 }}>{t('common.ai.notConfigured')}</p> : null}
      {ai.busy ? (
        <div className="card-muted row-between" role="status">
          <Spinner label={t('video.ai.working')} />
          <Button size="sm" onClick={ai.cancel}>
            {t('common.actions.cancel')}
          </Button>
        </div>
      ) : null}
      <ErrorMessage error={ai.error} onRetry={suggest} />

      {suggestions ? (
        <section className="card-muted stack-sm" aria-label={t('video.ai.panelTitle')}>
          <div className="row-between">
            <h4 className="row" style={{ margin: 0, gap: '0.4rem' }}>
              {t('video.ai.panelTitle')} <AIBadge />
            </h4>
            <IconButton icon={X} label={t('video.ai.closePanel')} size="sm" onClick={() => setSuggestions(null)} />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('video.ai.reviewHint')}
          </p>
          {suggestions.notes ? <RichText text={suggestions.notes} className="small" /> : null}
          {suggestions.limits ? (
            <Alert
              tone="warning"
              title={t('video.ai.limitsTitle')}
              action={
                <Button size="sm" onClick={useLimits}>
                  {t('video.ai.useLimits')}
                </Button>
              }
            >
              {suggestions.limits}
            </Alert>
          ) : null}
          {suggestions.items.length ? (
            <>
              <ul className="list-reset vb-suggest">
                {suggestions.items.map((item) => {
                  const near = nearbyMarker(markers, item.t)
                  const what = { time: clock(item.t), label: item.label || '' }
                  return (
                    <li key={item.key} className="vb-suggest-item">
                      <span className="vb-marker-time">{clock(item.t)}</span>
                      <span className="vb-marker-body">
                        <strong>{item.label}</strong>
                        {item.note ? <span>{item.note}</span> : null}
                        {near ? <span className="tiny au-warn-text">{t('build.editors.nearMarker', { time: clock(near.t), label: near.label || '' })}</span> : null}
                      </span>
                      <span className="row" style={{ gap: '0.35rem' }}>
                        <IconButton icon={Eye} label={t('video.ai.preview', { time: clock(item.t) })} size="sm" bordered onClick={() => session.seekTo(item.t, { pause: true })} />
                        <Button size="sm" icon={Check} onClick={() => accept([item])} disabled={full} aria-label={t('build.editors.acceptMarker', what)}>
                          {t('video.ai.accept')}
                        </Button>
                        <Button size="sm" icon={X} onClick={() => reject(item)} aria-label={t('build.editors.rejectMarker', what)}>
                          {t('video.ai.reject')}
                        </Button>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="row">
                <Button size="sm" icon={Check} onClick={() => accept(suggestions.items.slice(0, Math.max(0, MAX_MARKERS - markers.length)))} disabled={full}>
                  {t('video.ai.acceptAll', { count: suggestions.items.length })}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSuggestions((s) => ({ ...s, items: [] }))}>
                  {t('video.ai.rejectAll')}
                </Button>
              </div>
            </>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              {t('video.ai.allHandled')}
            </p>
          )}
        </section>
      ) : null}

      {pending.length ? (
        <Alert tone="info" title={t('video.markers.pendingTitle', { count: pending.length })}>
          {t('video.markers.pendingBody')}
        </Alert>
      ) : null}

      {markers.length ? (
        <ol className="list-reset vb-mlist" aria-label={t('video.markers.editListLabel')}>
          {markers.map((m, i) => {
            const isPending = m.ai_suggested && !m.confirmed
            return (
              <li key={m.id} className={['vb-mrow', isPending ? 'pending' : ''].filter(Boolean).join(' ')}>
                <div className="vb-mrow-head">
                  <span className="vb-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <DecimalInput
                    className="input-sm vb-time-input"
                    value={Number(m.t)}
                    aria-label={t('video.markers.timeLabel', { n: i + 1 })}
                    title={t('video.markers.timeLabel', { n: i + 1 })}
                    onChange={(n) => {
                      if (n === null) return
                      patchMarker(m.id, { t: clampT(n) })
                    }}
                    onBlur={() => {
                      const sorted = sortMarkers(markers)
                      if (sorted.some((x, k) => x.id !== markers[k]?.id)) setMarkers(sorted)
                    }}
                  />
                  <IconButton icon={Timer} label={t('video.markers.setNow', { time: clock(session.time) })} size="sm" bordered onClick={() => patchMarker(m.id, { t: Number(session.time.toFixed(2)) })} />
                  <IconButton icon={Eye} label={t('video.markers.goTo')} size="sm" bordered onClick={() => session.selectMarker(m)} />
                  <input
                    ref={m.id === focusId ? (el) => el && (el.focus(), setFocusId(null)) : undefined}
                    className="input input-sm vb-label-input"
                    value={m.label || ''}
                    maxLength={200}
                    placeholder={t('video.markers.labelPlaceholder')}
                    aria-label={t('video.markers.labelLabel', { n: i + 1 })}
                    onChange={(e) => patchMarker(m.id, { label: e.target.value })}
                  />
                  {m.ai_suggested ? <AIBadge /> : null}
                  <Switch label={t('video.markers.confirmed')} checked={Boolean(m.confirmed)} onChange={(e) => patchMarker(m.id, { confirmed: e.target.checked })} />
                  <IconButton icon={Trash2} label={t('video.markers.delete', { n: i + 1 })} size="sm" onClick={() => setMarkers(markers.filter((x) => x.id !== m.id))} />
                </div>
                <textarea
                  className="textarea"
                  rows={2}
                  value={m.note || ''}
                  maxLength={2000}
                  placeholder={t('video.markers.notePlaceholder')}
                  aria-label={t('video.markers.noteLabel', { n: i + 1 })}
                  onChange={(e) => patchMarker(m.id, { note: e.target.value })}
                />
                {!(m.label || '').trim() ? <span className="field-error">{t('video.markers.labelRequired')}</span> : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <EmptyState icon={Flag} title={t('video.markers.emptyTitle')}>
          <p>{t('video.markers.emptyBody')}</p>
        </EmptyState>
      )}
    </div>
  )
}
