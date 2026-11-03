import { useCallback, useRef } from 'react'
import { useLab } from '../../lab/LabContext.jsx'

/**
 * Sources and assets are changed through their own endpoints (not PATCH /labs), so the lab in
 * LabContext must adopt them without losing pending edits:
 *   1. flush() saves pending edits and returns the newest lab (with the server's version),
 *   2. replaceLab(mutate(thatLab)) adopts the change without scheduling a save.
 * If saving fails (conflict, offline) the lab is reloaded from the server instead.
 *
 *   const syncLab = useLabSync()
 *   await syncLab((lab) => ({ ...lab, sources: [...lab.sources, created] }))
 */
export function useLabSync() {
  const { flush, replaceLab, reload } = useLab()
  const ref = useRef(null)
  ref.current = { flush, replaceLab, reload }
  return useCallback(async (mutate) => {
    const api = ref.current
    let base = null
    try {
      base = await api.flush()
    } catch {
      base = null
    }
    if (base) api.replaceLab(mutate(base))
    else await api.reload()
  }, [])
}

export const upsertById = (list, item) => {
  const items = [...(list || [])]
  const i = items.findIndex((x) => x.id === item.id)
  if (i >= 0) items[i] = item
  else items.push(item)
  return items
}

export const withoutId = (list, id) => (list || []).filter((x) => x.id !== id)
