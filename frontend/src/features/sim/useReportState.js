import { useEffect, useRef } from 'react'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'

/**
 * Share the live interactive state of a block with the AI tutor (env.reportState),
 * debounced so dragging a slider does not flood the host with updates.
 * `state` must be JSON-serialisable; it is only sent when it actually changes.
 */
export function useReportState(blockId, state, delay = 300) {
  const env = useBlockEnv()
  const report = env.reportState
  const json = JSON.stringify(state ?? null)
  const last = useRef(null)
  useEffect(() => {
    if (!blockId || typeof report !== 'function') return undefined
    const id = setTimeout(() => {
      if (last.current === json) return
      last.current = json
      try {
        report(blockId, JSON.parse(json))
      } catch {
        /* the host decides what to do with state; never break the block */
      }
    }, delay)
    return () => clearTimeout(id)
  }, [blockId, json, report, delay])
}
