import { useEffect, useRef } from 'react'
import { get } from '../../../../lib/api.js'

const POLL_MS = 2000
const BACKOFF_MS = 6000

/**
 * While a source is `processing` (video transcoding), poll GET /api/sources/:id every 2 s and
 * report it once it is ready or failed. Pauses while the tab is hidden (saves data on phones)
 * and slows down after network errors. A 404 means it was deleted elsewhere.
 */
export function useSourcePolling(sources, { onSettled, onGone }) {
  const handlers = useRef({ onSettled, onGone })
  useEffect(() => {
    handlers.current = { onSettled, onGone }
  })
  const ids = (sources || [])
    .filter((s) => s.status === 'processing')
    .map((s) => s.id)
    .join(',')

  useEffect(() => {
    if (!ids) return undefined
    let stopped = false
    let timer = null
    const list = ids.split(',')
    const tick = async () => {
      if (stopped) return
      if (typeof document !== 'undefined' && document.hidden) {
        timer = window.setTimeout(tick, POLL_MS)
        return
      }
      let delay = POLL_MS
      for (const id of list) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const source = await get(`/api/sources/${id}`)
          if (stopped) return
          // eslint-disable-next-line no-await-in-loop
          if (source && source.status !== 'processing') await handlers.current.onSettled?.(source)
        } catch (error) {
          if (stopped) return
          // eslint-disable-next-line no-await-in-loop
          if (error?.status === 404) await handlers.current.onGone?.(id)
          else delay = BACKOFF_MS
        }
      }
      if (!stopped) timer = window.setTimeout(tick, delay)
    }
    timer = window.setTimeout(tick, POLL_MS)
    const onVisible = () => {
      if (!document.hidden && !stopped) {
        window.clearTimeout(timer)
        timer = window.setTimeout(tick, 200)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ids])
}
