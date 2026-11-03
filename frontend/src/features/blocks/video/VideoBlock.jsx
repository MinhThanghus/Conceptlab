import { lazy, Suspense, useId, useMemo } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { LoadingBlock } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import VideoPlayer from './VideoPlayer.jsx'
import ComparePanel from './ComparePanel.jsx'
import { LimitsNote, MarkerList, ObservationCard, ShortcutHelp, SourceStatus, TrackToggles, useLiveSource } from './VideoParts.jsx'
import { useReportVideoState, useVideoSession } from './useVideoSession.js'
import { adjacentMarker, learnerMarkers } from './videoUtils.js'
import './video.css'

// Teachers only: the editor is split out so learners on slow networks never download it.
const VideoEditor = lazy(() => import('./VideoEditor.jsx'))

/**
 * Practice video with observation markers (spec §8.3, Demo 2).
 *   view: slow motion, frame steps, markers to observe, SAM highlights, textbook side by side.
 *   edit: choose the video, place/confirm markers (AI can suggest), SAM tracking, compare.
 * No automatic grading of technique: the teacher evaluates and guides.
 */
export default function VideoBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <VideoEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <VideoView block={block} />
}

function VideoView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const helpId = useId()
  const listId = useId()
  const source = useLiveSource(block.source_id)
  const markers = useMemo(() => learnerMarkers(block.markers), [block.markers])
  const durationHint = (Number(source?.duration_ms) || 0) / 1000
  const session = useVideoSession({ markers, tracks: block.tracks, durationHint })
  useReportVideoState(env, block.id, session)

  const ready = Boolean(source && source.status === 'ready' && source.kind === 'video' && source.urls?.file)
  const hasCompare = Boolean(block.compare?.source_id || block.compare?.asset_id)
  const index = session.current ? markers.findIndex((m) => m.id === session.current.id) : -1
  const prev = adjacentMarker(markers, session.time, -1)
  const next = adjacentMarker(markers, session.time, 1)

  return (
    <BlockFrame block={block}>
      <div className={['vb-layout', hasCompare ? 'has-compare' : ''].filter(Boolean).join(' ')}>
        {ready ? (
          <VideoPlayer
            key={source.id}
            source={source}
            markers={markers}
            selectedMarkerId={session.current?.id}
            onMarkerClick={session.selectMarker}
            tracks={session.prepared}
            visibleTrackIds={session.visible}
            loop={session.loop}
            loopRange={session.loopRange}
            loopAvailable={session.loopAvailable}
            onLoopToggle={session.toggleLoop}
            controllerRef={session.controllerRef}
            onTimeChange={session.setTime}
            onPlayingChange={session.setPlaying}
            onRateChange={session.setRate}
            label={t('video.player.stageLabelNamed', { title: block.title || t('blocks.types.video') })}
            helpId={helpId}
          />
        ) : (
          <SourceStatus sourceId={block.source_id} source={source} />
        )}
        {hasCompare ? <ComparePanel compare={block.compare} mainPlaying={session.playing} mainRate={session.rate} /> : null}
      </div>

      {ready ? (
        <>
          {markers.length ? (
            <section className="stack-sm" aria-labelledby={listId}>
              <ObservationCard
                marker={session.current}
                index={index}
                total={markers.length}
                onPrev={prev ? () => session.selectMarker(prev) : null}
                onNext={next ? () => session.selectMarker(next) : null}
              />
              <h3 id={listId} className="field-label" style={{ margin: 0 }}>
                {t('video.markers.listTitle', { count: markers.length })}
              </h3>
              <MarkerList markers={markers} currentId={session.current?.id} onSelect={session.selectMarker} />
            </section>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              {t('video.markers.noneView')}
            </p>
          )}
          <TrackToggles tracks={session.prepared} visible={session.visible} onToggle={session.toggleTrack} />
          <ShortcutHelp id={helpId} />
        </>
      ) : null}
      <LimitsNote note={block.limits_note} />
    </BlockFrame>
  )
}
