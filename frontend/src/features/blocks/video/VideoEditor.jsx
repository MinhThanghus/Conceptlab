import { useId, useMemo, useState } from 'react'
import { BookOpen, Flag, ScanSearch, ShieldCheck } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, ConfirmDialog, LinkButton, SelectField, TabsWithPanels, TextArea, TextField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import VideoPlayer from './VideoPlayer.jsx'
import ComparePanel from './ComparePanel.jsx'
import MarkersEditor from './MarkersEditor.jsx'
import HighlightEditor from './HighlightEditor.jsx'
import { BlockMetaFields } from './editorKit.jsx'
import { LimitsNote, ShortcutHelp, SourceStatus, useLiveSource } from './VideoParts.jsx'
import { useVideoSession } from './useVideoSession.js'
import { MAX_POINTS, pendingAiMarkers, sortMarkers } from './videoUtils.js'
import './video.css'

/** Teacher editor for a video block (spec §8.3). Lazy-loaded by VideoBlock in edit mode. */
export default function VideoEditor({ block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const helpId = useId()
  const source = useLiveSource(block.source_id)
  const ready = Boolean(source && source.status === 'ready' && source.kind === 'video' && source.urls?.file)
  const markers = useMemo(() => sortMarkers(block.markers), [block.markers])
  const pendingIds = useMemo(() => new Set(pendingAiMarkers(block.markers).map((m) => m.id)), [block.markers])
  const duration = (Number(source?.duration_ms) || 0) / 1000
  const session = useVideoSession({ markers, tracks: block.tracks, durationHint: duration })
  const [tab, setTab] = useState('markers')
  const [pickState, setPickState] = useState({ mode: 'phrase', phrase: '', points: [], negative: false })
  const [highlight, setHighlight] = useState(null)
  const [switchTo, setSwitchTo] = useState(null)

  const pickActive = ready && tab === 'highlight' && pickState.mode === 'points'
  const pick = useMemo(
    () =>
      pickActive
        ? {
            active: true,
            points: pickState.points,
            onPick: (point) =>
              setPickState((s) => (s.points.length >= MAX_POINTS ? s : { ...s, points: [...s.points, { ...point, negative: s.negative }] })),
          }
        : null,
    [pickActive, pickState.points],
  )

  const requestSource = (id) => {
    const next = id || null
    if (next === (block.source_id || null)) return
    if ((block.markers || []).length || (block.tracks || []).length) setSwitchTo(next)
    else applySource(next)
  }
  const applySource = (id) => {
    onChange({ ...block, source_id: id, markers: [], tracks: [] })
    setHighlight(null)
    setPickState((s) => ({ ...s, points: [] }))
    setSwitchTo(null)
  }

  const tabs = [
    {
      id: 'markers',
      label: t('video.tabs.markers'),
      icon: Flag,
      badge: markers.length || null,
      content: (
        <div className="vb-tabpanel">
          <MarkersEditor block={block} onChange={onChange} session={session} ready={ready} duration={duration} />
        </div>
      ),
    },
    {
      id: 'highlight',
      label: t('video.tabs.highlight'),
      icon: ScanSearch,
      badge: (block.tracks || []).length || null,
      content: (
        <div className="vb-tabpanel">
          <HighlightEditor
            block={block}
            onChange={onChange}
            session={session}
            ready={ready}
            pickState={pickState}
            setPickState={setPickState}
            highlight={highlight}
            setHighlight={setHighlight}
          />
        </div>
      ),
    },
    {
      id: 'compare',
      label: t('video.tabs.compare'),
      icon: BookOpen,
      content: (
        <div className="vb-tabpanel">
          <CompareEditor block={block} onChange={onChange} />
        </div>
      ),
    },
    {
      id: 'limits',
      label: t('video.tabs.limits'),
      icon: ShieldCheck,
      content: (
        <div className="vb-tabpanel">
          <TextArea
            label={t('video.limits.noteLabel')}
            hint={t('video.limits.noteHint')}
            rows={3}
            maxLength={2000}
            value={block.limits_note || ''}
            onChange={(e) => onChange({ ...block, limits_note: e.target.value })}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="stack vb-editor">
      <BlockMetaFields block={block} onChange={onChange} confirmHint={t('video.editor.confirmHint')} />

      <section className="vb-section" aria-labelledby={`${block.id}-src-h`}>
        <h3 id={`${block.id}-src-h`}>{t('video.source.title')}</h3>
        <SourcePicker block={block} liveSource={source} onRequestChange={requestSource} />
        {source?.contains_people && !source?.consent_confirmed ? (
          <Alert tone="warning" title={t('video.source.consentTitle')}>
            {t('video.source.consentBody')}
          </Alert>
        ) : null}
      </section>

      {block.source_id ? (
        ready ? (
          <div className="stack-sm">
            <VideoPlayer
              key={source.id}
              source={source}
              markers={markers}
              pendingIds={pendingIds}
              selectedMarkerId={session.current?.id}
              onMarkerClick={session.selectMarker}
              tracks={session.prepared}
              visibleTrackIds={session.visible}
              loop={session.loop}
              loopRange={session.loopRange}
              loopAvailable={session.loopAvailable}
              onLoopToggle={session.toggleLoop}
              pick={pick}
              mask={highlight}
              controllerRef={session.controllerRef}
              onTimeChange={session.setTime}
              onPlayingChange={session.setPlaying}
              onRateChange={session.setRate}
              label={t('video.player.stageLabelNamed', { title: block.title || t('blocks.types.video') })}
              helpId={helpId}
            />
            <ShortcutHelp id={helpId} />
          </div>
        ) : (
          <SourceStatus sourceId={block.source_id} source={source} editHint />
        )
      ) : null}

      {block.source_id ? <TabsWithPanels tabs={tabs} value={tab} onChange={setTab} label={t('video.tabs.label')} /> : null}

      <LimitsNote note={block.limits_note} />

      <ConfirmDialog
        open={switchTo !== null}
        onClose={() => setSwitchTo(null)}
        onConfirm={() => applySource(switchTo)}
        title={t('video.source.switchTitle')}
        confirmLabel={t('video.source.switchConfirm')}
        tone="danger"
      >
        <p style={{ margin: 0 }}>{t('video.source.switchBody', { markers: (block.markers || []).length, tracks: (block.tracks || []).length })}</p>
      </ConfirmDialog>
    </div>
  )
}

function SourcePicker({ block, liveSource, onRequestChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const videos = (env.sources || []).filter((s) => s.kind === 'video')
  if (!videos.length) {
    return (
      <Alert
        tone="info"
        title={t('video.source.noneTitle')}
        action={
          env.labId ? (
            <LinkButton size="sm" to={`/app/labs/${env.labId}/sources`}>
              {t('video.source.goToSources')}
            </LinkButton>
          ) : null
        }
      >
        {t('video.source.noneBody')}
      </Alert>
    )
  }
  const options = videos.map((s) => {
    const live = liveSource && liveSource.id === s.id ? liveSource : s
    const status = live.status === 'processing' ? ` (${t('video.status.processingShort')})` : live.status === 'failed' ? ` (${t('video.status.failedShort')})` : ''
    return { value: s.id, label: `${s.title}${status}`, disabled: live.status === 'failed' }
  })
  const known = videos.some((s) => s.id === block.source_id)
  return (
    <SelectField
      label={t('video.source.label')}
      hint={t('video.source.hint')}
      value={known ? block.source_id : ''}
      placeholder={t('video.source.placeholder')}
      options={options}
      onChange={(e) => onRequestChange(e.target.value)}
    />
  )
}

function CompareEditor({ block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const compare = block.compare || null
  const candidates = (env.sources || []).filter((s) => s.id !== block.source_id && ['pdf', 'image', 'video'].includes(s.kind) && s.status !== 'failed')
  const options = [
    { value: '', label: t('video.compare.none') },
    ...(compare?.asset_id ? [{ value: '__asset', label: t('video.compare.savedImage') }] : []),
    ...candidates.map((s) => ({
      value: s.id,
      label: `${s.title} (${t(`common.sourceKinds.${s.kind}`)}${s.status === 'processing' ? `, ${t('video.status.processingShort')}` : ''})`,
    })),
  ]
  const value = compare?.asset_id ? '__asset' : compare?.source_id && candidates.some((s) => s.id === compare.source_id) ? compare.source_id : ''
  const selected = compare?.source_id ? env.sourceById(compare.source_id) : null
  const pageCount = Number(selected?.page_count) || 1

  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        {t('video.compare.intro')}
      </p>
      <div className="grid-2" style={{ gap: 'var(--cl-space-3)' }}>
        <SelectField
          label={t('video.compare.label')}
          value={value}
          options={options}
          onChange={(e) => {
            const id = e.target.value
            if (id === '__asset') return
            if (!id) return onChange({ ...block, compare: null })
            const src = env.sourceById(id)
            return onChange({ ...block, compare: { source_id: id, page: src?.kind === 'pdf' ? 1 : null, asset_id: null } })
          }}
        />
        {selected?.kind === 'pdf' ? (
          <TextField
            label={t('video.compare.pageLabel')}
            hint={t('video.compare.pageHint', { count: pageCount })}
            type="number"
            min={1}
            max={pageCount}
            value={compare?.page || 1}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value))
              if (!Number.isFinite(n) || n < 1) return
              onChange({ ...block, compare: { ...compare, page: Math.min(pageCount, n) } })
            }}
          />
        ) : null}
      </div>
      {!candidates.length && !compare ? <Alert tone="info">{t('video.compare.noCandidates')}</Alert> : null}
      {compare ? <ComparePanel compare={compare} /> : null}
    </div>
  )
}
