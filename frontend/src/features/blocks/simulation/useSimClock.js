import { useCallback, useEffect, useRef, useState } from 'react'

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [reduced, setReduced] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mql = window.matchMedia(query)
    const on = () => setReduced(mql.matches)
    mql.addEventListener?.('change', on)
    return () => mql.removeEventListener?.('change', on)
  }, [])
  return reduced
}

/**
 * Animation clock for simulations.
 * - requestAnimationFrame, ≤ 30 state updates per second (kind to low-end phones);
 * - pauses while the stage is off-screen (IntersectionObserver) or the tab is hidden;
 * - autoplays once when first visible, never with prefers-reduced-motion;
 * - `rate` = model time per real second at 1× (1 s/s for physics, years/s for money).
 */
export function useSimClock({ duration, rate = 1, speed = 1, stepSize = 0.05, autoplay = true, rootRef }) {
  const reduced = usePrefersReducedMotion()
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const tRef = useRef(0)
  const visible = useRef(true)
  const started = useRef(false)

  const setTime = useCallback((v) => {
    tRef.current = v
    setT(v)
  }, [])

  useEffect(() => {
    const el = rootRef?.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const io = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting
        if (entry.isIntersecting && autoplay && !reduced && !started.current) {
          started.current = true
          setPlaying(true)
        }
      },
      { threshold: 0.2 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [rootRef, autoplay, reduced])

  // Keep t inside a shorter timeline when parameters change.
  useEffect(() => {
    if (tRef.current > duration) setTime(duration)
  }, [duration, setTime])

  useEffect(() => {
    if (!playing || !(duration > 0)) return undefined
    let raf = 0
    let last = performance.now()
    let acc = 0
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      if (visible.current && !hidden) {
        acc += dt
        if (acc >= 1 / 30) {
          const next = tRef.current + acc * speed * rate
          acc = 0
          if (next >= duration) {
            setTime(duration)
            setPlaying(false)
            return
          }
          setTime(next)
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, rate, duration, setTime])

  const play = useCallback(() => {
    started.current = true
    if (tRef.current >= duration - 1e-9) setTime(0)
    setPlaying(true)
  }, [duration, setTime])
  const pause = useCallback(() => setPlaying(false), [])
  const reset = useCallback(() => {
    setPlaying(false)
    setTime(0)
  }, [setTime])
  const step = useCallback(
    (dir = 1) => {
      setPlaying(false)
      setTime(Math.max(0, Math.min(duration, tRef.current + dir * stepSize)))
    },
    [duration, stepSize, setTime],
  )
  const seek = useCallback((v) => setTime(Math.max(0, Math.min(duration, v))), [duration, setTime])
  const restart = useCallback(() => {
    started.current = true
    setTime(0)
    setPlaying(true)
  }, [setTime])

  return { t, playing, play, pause, reset, step, seek, restart, reduced }
}
