import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loopWindow, markerAt, prepareTrack, TRACK_COLOR_VARS, tutorState } from './videoUtils.js'

/**
 * Playback state shared by the learner view and the editor: playhead, speed, the marker
 * loop, SAM track visibility and the player controller.
 *   current  = marker being looped, otherwise the last marker the playhead passed.
 */
export function useVideoSession({ markers, tracks, durationHint = 0 }) {
  const controllerRef = useRef(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(false)
  const [loopMarkerId, setLoopMarkerId] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())

  const prepared = useMemo(
    () => (tracks || []).map((tr, i) => ({ ...prepareTrack(tr), colorVar: TRACK_COLOR_VARS[i % TRACK_COLOR_VARS.length] })),
    [tracks],
  )
  const visible = useMemo(() => new Set(prepared.filter((p) => !hidden.has(p.id)).map((p) => p.id)), [prepared, hidden])

  const loopMarker = loop ? markers.find((m) => m.id === loopMarkerId) || null : null
  const current = loopMarker || markerAt(markers, time)
  const loopRange = useMemo(() => (loopMarker ? loopWindow(loopMarker.t, durationHint) : null), [loopMarker, durationHint])

  // a looped marker that was deleted ends the loop
  useEffect(() => {
    if (loop && !loopMarker) setLoop(false)
  }, [loop, loopMarker])

  const seekTo = useCallback((t, opts) => controllerRef.current?.seek(t, opts), [])

  const selectMarker = useCallback((marker) => {
    if (!marker) return
    setLoopMarkerId(marker.id)
    controllerRef.current?.seek(Number(marker.t), { pause: true })
  }, [])

  const toggleLoop = useCallback(
    (on) => {
      if (!on) {
        setLoop(false)
        return
      }
      const here = markerAt(markers, controllerRef.current?.getTime?.() ?? time)
      const target = here || markers[0]
      if (!target) return
      setLoopMarkerId(target.id)
      if (!here) controllerRef.current?.seek(Number(target.t))
      setLoop(true)
    },
    [markers, time],
  )

  const toggleTrack = useCallback((id) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return {
    controllerRef,
    time,
    setTime,
    playing,
    setPlaying,
    rate,
    setRate,
    loop,
    loopRange,
    loopAvailable: markers.length > 0,
    toggleLoop,
    current,
    selectMarker,
    seekTo,
    prepared,
    visible,
    toggleTrack,
  }
}

/**
 * Share the live player state with the AI tutor (env.reportState), at most about once a
 * second while playing and right away after discrete changes (pause, marker, speed…).
 */
export function useReportVideoState(env, blockId, session) {
  const envRef = useRef(env)
  envRef.current = env
  const last = useRef(0)
  const timer = useRef(0)
  const { time, current, rate, loop, prepared, visible, playing } = session
  const phrases = useMemo(() => prepared.filter((p) => visible.has(p.id)).map((p) => p.phrase), [prepared, visible])
  useEffect(() => {
    const send = () => {
      last.current = Date.now()
      envRef.current?.reportState?.(blockId, tutorState({ time, marker: current, speed: rate, loop, visibleTracks: phrases }))
    }
    window.clearTimeout(timer.current)
    const wait = playing ? Math.max(0, 1000 - (Date.now() - last.current)) : 250
    timer.current = window.setTimeout(send, wait)
    return () => window.clearTimeout(timer.current)
  }, [blockId, time, current, rate, loop, phrases, playing])
}
