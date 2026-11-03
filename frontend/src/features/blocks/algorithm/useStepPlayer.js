import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Step-by-step player for algorithm traces: first / prev / next / last and play at a
 * speed (base `interval` ms per step at 1×). Never autoplays; while the stage is
 * off-screen or the tab is hidden it keeps its place instead of advancing; stops at the
 * last frame. A new `resetKey` (new input) jumps back to the first frame.
 */
export function useStepPlayer(count, { interval = 1100, speed = 1, rootRef, resetKey } = {}) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [wait, setWait] = useState(0)
  const visible = useRef(true)
  const last = Math.max(0, count - 1)
  const delay = Math.max(120, interval / (speed || 1))

  useEffect(() => {
    setIndex(0)
    setPlaying(false)
  }, [resetKey])

  useEffect(() => {
    if (index > last) setIndex(last)
  }, [index, last])

  useEffect(() => {
    const el = rootRef?.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting
    })
    io.observe(el)
    return () => io.disconnect()
  }, [rootRef])

  useEffect(() => {
    if (!playing) return undefined
    if (index >= last) {
      setPlaying(false)
      return undefined
    }
    const id = setTimeout(() => {
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (!visible.current || hidden) setWait((w) => w + 1) // re-arm without advancing
      else setIndex((i) => Math.min(last, i + 1))
    }, delay)
    return () => clearTimeout(id)
  }, [playing, index, last, delay, wait])

  const play = useCallback(() => {
    setIndex((i) => (i >= last ? 0 : i))
    setPlaying(true)
  }, [last])
  const pause = useCallback(() => setPlaying(false), [])
  const go = useCallback(
    (i) => {
      setPlaying(false)
      setIndex(Math.max(0, Math.min(last, i)))
    },
    [last],
  )
  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])
  const first = useCallback(() => go(0), [go])
  const end = useCallback(() => go(last), [go, last])

  return { index: Math.min(index, last), last, playing, play, pause, next, prev, first, end, go, atStart: index <= 0, atEnd: index >= last }
}
