import { useSyncExternalStore } from 'react'

/**
 * The AI calls of board blocks live outside React. A reading (about 15 s) or a redraw (30 to 60 s)
 * keeps going and lands in its block when the editor unmounts (the card is folded, the teacher
 * opens another step); an editor that mounts again shows the wait it left; a block never runs two
 * calls at once, which also keeps StrictMode's double effects from starting a second reading.
 *
 *   runBoardTask(blockId, 'read' | 'draw', async (signal) => outcome)  → false when one is running
 *   useBoardTask(blockId) → { job: { kind, startedAt } | null, outcome: { kind, tone, message, error, … } | null }
 */
const EMPTY = Object.freeze({ job: null, outcome: null })
const tasks = new Map()
const editors = new Map()
const autoReads = new Set()
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function update(blockId, change) {
  tasks.set(blockId, { ...(tasks.get(blockId) || EMPTY), ...change })
  emit()
}

export function boardTask(blockId) {
  return tasks.get(blockId) || EMPTY
}

export function useBoardTask(blockId) {
  return useSyncExternalStore(
    subscribe,
    () => boardTask(blockId),
    () => EMPTY,
  )
}

/**
 * The mounted editor of a block says how to read and change the block; a call that ends after its
 * editor unmounted still uses the last one registered (the block card's onChange stays valid).
 */
export function registerEditor(blockId, entry) {
  editors.set(blockId, entry)
}

export function editorOf(blockId) {
  return editors.get(blockId) || null
}

export function runBoardTask(blockId, kind, work, meta = {}) {
  if (boardTask(blockId).job) return false
  const controller = new AbortController()
  const job = { ...meta, kind, startedAt: Date.now(), controller }
  update(blockId, { job, outcome: null })
  // the work starts now (its request leaves with the click); a synchronous throw is caught too
  new Promise((resolve) => resolve(work(controller.signal)))
    .catch((error) => (error?.name === 'AbortError' ? null : { error }))
    .then((outcome) => {
      if (boardTask(blockId).job !== job) return
      update(blockId, { job: null, outcome: outcome ? { kind, at: Date.now(), ...outcome } : null })
    })
  return true
}

export function cancelBoardTask(blockId) {
  boardTask(blockId).job?.controller.abort()
}

export function clearBoardOutcome(blockId) {
  if (boardTask(blockId).outcome) update(blockId, { outcome: null })
}

/** Drop the "move focus here" flags of an outcome once the editor has used them. */
export function settleBoardOutcome(blockId) {
  const { outcome } = boardTask(blockId)
  if (outcome && (outcome.read || outcome.drawn)) update(blockId, { outcome: { ...outcome, read: false, drawn: false } })
}

/** True once per block and page load: the Sources step's "read at once" runs a single time. */
export function claimAutoRead(blockId) {
  if (autoReads.has(blockId)) return false
  autoReads.add(blockId)
  return true
}

// ----------------------------------------------------------------------------- the drawn version
// What each redrawn sheet was drawn from (boardModel.drawKey), so editing the text afterwards marks
// the sheet as out of date. Kept per browser: the spec has no field for it (extra fields are dropped).
const drawn = new Map()
const DRAWN_KEY = (assetId) => `cl.board.drawn.${assetId}`

export function rememberDrawKey(assetId, key) {
  if (!assetId) return
  drawn.set(assetId, key)
  try {
    window.localStorage.setItem(DRAWN_KEY(assetId), key)
  } catch {
    /* storage unavailable: the mark lasts until the page reloads */
  }
}

export function drawnKeyOf(assetId) {
  if (!assetId) return null
  if (drawn.has(assetId)) return drawn.get(assetId)
  let key = null
  try {
    key = window.localStorage.getItem(DRAWN_KEY(assetId))
  } catch {
    key = null
  }
  drawn.set(assetId, key)
  return key
}

// The asset a redraw returned, until the lab in LabContext lists it.
const assets = new Map()

export function rememberAsset(asset) {
  if (asset?.id) assets.set(asset.id, asset)
}

export function knownAsset(assetId) {
  return (assetId && assets.get(assetId)) || null
}

/** Tests only: forget every task, editor and memory. */
export function resetBoardTasks() {
  tasks.clear()
  editors.clear()
  autoReads.clear()
  drawn.clear()
  assets.clear()
  emit()
}
