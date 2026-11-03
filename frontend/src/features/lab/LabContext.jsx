import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { get, patch } from '../../lib/api.js'

const LabContext = createContext(null)
const AUTOSAVE_MS = 900

/**
 * Loads one lab (GET /api/labs/:id) and autosaves edits with optimistic concurrency.
 *
 *   const { lab, saveState, updateSpec, updateBlock, addBlock, removeBlock, moveBlock,
 *           updateAnalysis, updateFields, flush, saveNow, replaceLab, reload } = useLab()
 *
 * - Local edits apply immediately; a debounced PATCH sends {version, spec?, analysis?, fields}.
 * - The server response's `version` is adopted; if more edits happened during the save,
 *   another save follows (no edit is lost, none is overwritten by a stale response).
 * - 409 version_conflict → saveState 'conflict' (UI offers reload).
 * - Call `await flush()` before AI actions that read the lab on the server.
 * - `replaceLab(serverLab)` adopts a lab returned by an AI endpoint.
 */
export function LabProvider({ labId, children }) {
  const [lab, setLab] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState('saved') // saved | unsaved | saving | error | conflict
  const [saveError, setSaveError] = useState(null)
  const labRef = useRef(null)
  const dirty = useRef({ spec: false, analysis: false, fields: {} })
  const timer = useRef(null)
  const inflight = useRef(null)
  // Bumped whenever the whole lab is reloaded or replaced; responses from an older epoch are dropped.
  const epoch = useRef(0)

  const setLabBoth = useCallback((next) => {
    labRef.current = typeof next === 'function' ? next(labRef.current) : next
    setLab(labRef.current)
  }, [])

  const reload = useCallback(async () => {
    const mine = ++epoch.current
    setLoading(true)
    setError(null)
    try {
      const data = await get(`/api/labs/${labId}`)
      if (mine !== epoch.current) return labRef.current
      dirty.current = { spec: false, analysis: false, fields: {} }
      setLabBoth(data)
      setSaveState('saved')
      return data
    } catch (err) {
      if (mine === epoch.current) setError(err)
      return null
    } finally {
      if (mine === epoch.current) setLoading(false)
    }
  }, [labId, setLabBoth])

  useEffect(() => {
    reload()
    return () => window.clearTimeout(timer.current)
  }, [reload])

  const hasDirty = () => dirty.current.spec || dirty.current.analysis || Object.keys(dirty.current.fields).length > 0

  const doSave = useCallback(
    async (note) => {
      if (inflight.current) {
        await inflight.current.catch(() => {})
      }
      if (!labRef.current || (!hasDirty() && !note)) return labRef.current
      const current = labRef.current
      const mine = epoch.current
      const body = { version: current.version, ...dirty.current.fields }
      if (dirty.current.spec) body.spec = current.spec
      if (dirty.current.analysis) body.analysis = current.analysis
      if (note) body.note = note
      dirty.current = { spec: false, analysis: false, fields: {} }
      setSaveState('saving')
      setSaveError(null)
      const run = (async () => {
        try {
          const saved = await patch(`/api/labs/${current.id}`, body)
          if (mine !== epoch.current) return saved
          const editedMeanwhile = hasDirty()
          if (editedMeanwhile) {
            // keep the newer local edits, adopt the server version/metadata for the rest
            setLabBoth((l) => ({
              ...saved,
              spec: dirty.current.spec ? l.spec : saved.spec,
              analysis: dirty.current.analysis ? l.analysis : saved.analysis,
              ...dirty.current.fields,
              version: saved.version,
            }))
            setSaveState('unsaved')
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => doSave(), AUTOSAVE_MS)
          } else {
            setLabBoth(saved)
            setSaveState('saved')
          }
          return saved
        } catch (err) {
          if (mine !== epoch.current) throw err
          // restore dirty flags so nothing is silently dropped; a field edited again since keeps its newer value
          if (body.spec) dirty.current.spec = true
          if (body.analysis) dirty.current.analysis = true
          Object.keys(body).forEach((key) => {
            if (!['version', 'spec', 'analysis', 'note'].includes(key) && !(key in dirty.current.fields)) dirty.current.fields[key] = body[key]
          })
          setSaveError(err)
          setSaveState(err?.code === 'version_conflict' ? 'conflict' : 'error')
          throw err
        } finally {
          inflight.current = null
        }
      })()
      inflight.current = run
      return run
    },
    [setLabBoth],
  )

  const schedule = useCallback(() => {
    setSaveState('unsaved')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      doSave().catch(() => {})
    }, AUTOSAVE_MS)
  }, [doSave])

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current)
    if (inflight.current) await inflight.current.catch(() => {})
    if (hasDirty()) return doSave()
    return labRef.current
  }, [doSave])

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (hasDirty() || inflight.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const value = useMemo(() => {
    const updateSpec = (updater) => {
      setLabBoth((l) => ({ ...l, spec: typeof updater === 'function' ? updater(l.spec) : updater }))
      dirty.current.spec = true
      schedule()
    }
    const updateAnalysis = (updater) => {
      setLabBoth((l) => ({ ...l, analysis: typeof updater === 'function' ? updater(l.analysis) : updater }))
      dirty.current.analysis = true
      schedule()
    }
    const updateFields = (fields) => {
      setLabBoth((l) => ({ ...l, ...fields }))
      Object.assign(dirty.current.fields, fields)
      schedule()
    }
    const updateBlock = (blockId, patchOrFn) =>
      updateSpec((spec) => ({
        ...spec,
        blocks: (spec.blocks || []).map((b) => (b.id === blockId ? (typeof patchOrFn === 'function' ? patchOrFn(b) : { ...b, ...patchOrFn }) : b)),
      }))
    const addBlock = (block, index) =>
      updateSpec((spec) => {
        const blocks = [...(spec.blocks || [])]
        blocks.splice(index ?? blocks.length, 0, block)
        return { ...spec, blocks }
      })
    const removeBlock = (blockId) => updateSpec((spec) => ({ ...spec, blocks: (spec.blocks || []).filter((b) => b.id !== blockId) }))
    const moveBlock = (blockId, delta) =>
      updateSpec((spec) => {
        const blocks = [...(spec.blocks || [])]
        const i = blocks.findIndex((b) => b.id === blockId)
        const j = i + delta
        if (i < 0 || j < 0 || j >= blocks.length) return spec
        ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
        return { ...spec, blocks }
      })
    const replaceLab = (serverLab) => {
      epoch.current += 1
      window.clearTimeout(timer.current)
      setLoading(false)
      dirty.current = { spec: false, analysis: false, fields: {} }
      setLabBoth(serverLab)
      setSaveState('saved')
    }
    return {
      lab,
      loading,
      error,
      saveState,
      saveError,
      reload,
      flush,
      saveNow: (note) => doSave(note || undefined),
      replaceLab,
      updateSpec,
      updateAnalysis,
      updateFields,
      updateBlock,
      addBlock,
      removeBlock,
      moveBlock,
      sourceById: (id) => lab?.sources?.find((s) => s.id === id) || null,
      assetById: (id) => lab?.assets?.find((a) => a.id === id) || null,
    }
  }, [lab, loading, error, saveState, saveError, reload, flush, doSave, schedule, setLabBoth])

  return <LabContext.Provider value={value}>{children}</LabContext.Provider>
}

export function useLab() {
  const ctx = useContext(LabContext)
  if (!ctx) throw new Error('useLab must be used inside <LabProvider>')
  return ctx
}
