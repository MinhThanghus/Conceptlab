import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLab } from '../../lab/LabContext.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'

const REDUCED = '(prefers-reduced-motion: reduce)'

/** True when the device asks for less motion (animations pause, no auto-advance). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(REDUCED).matches : false))
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(REDUCED)
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/**
 * The studio lab context when the block is rendered inside the studio (edit mode),
 * otherwise null (learner view). Used to `flush()` unsaved edits before AI calls.
 */
export function useOptionalLab() {
  try {
    return useLab()
  } catch {
    return null
  }
}

/** Ref that always holds the latest value (for async callbacks that must not use stale props). */
export function useLatest(value) {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return ref
}

/** Content-box size of an element, kept up to date with ResizeObserver. */
export function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return size
}

/** "Ask the AI tutor" buttons only make sense in the learner view with the tutor available. */
export function useCanAsk() {
  const env = useBlockEnv()
  return Boolean(env.aiAvailable && env.mode === 'view')
}

/**
 * Report the block's live state to the AI tutor whenever `state` changes (compared as JSON),
 * without re-running on every render because env functions change identity.
 */
export function useReportState(blockId, state) {
  const env = useBlockEnv()
  const envRef = useLatest(env)
  const json = JSON.stringify(state ?? null)
  useEffect(() => {
    if (!blockId) return
    envRef.current.reportState?.(blockId, JSON.parse(json))
  }, [blockId, json, envRef])
}
