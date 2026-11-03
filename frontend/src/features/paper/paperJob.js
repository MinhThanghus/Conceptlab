import { useSyncExternalStore } from 'react'

/**
 * In-flight "paper structure" analyses, kept outside React so that a long AI run (tens of
 * seconds to minutes) survives switching between studio steps: the page re-attaches to the
 * running job when it mounts again, and the result is applied to the Lab even if the page
 * is not visible when it arrives. The last failure is kept so it can be shown with "Try again".
 */
const jobs = new Map() // labId -> { labId, body, meta, startedAt, promise, controller }
const failures = new Map() // labId -> { error, body, meta, at } | { canceled: true, body, meta, at }
const listeners = new Set()

function emit() {
  listeners.forEach((fn) => fn())
}

export function subscribePaperJobs(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getPaperJob(labId) {
  return jobs.get(labId) || null
}

export function getPaperFailure(labId) {
  return failures.get(labId) || null
}

export function clearPaperFailure(labId) {
  if (failures.delete(labId)) emit()
}

/**
 * Start (or join) the analysis for a lab. `run(signal)` performs the request and applies
 * the result; its rejection is recorded as the lab's last failure (and re-thrown). A run
 * stopped with cancelPaperJob() is recorded as `{ canceled: true }` instead of an error.
 */
export function startPaperJob(labId, { body, meta, run }) {
  const existing = jobs.get(labId)
  if (existing) return existing.promise
  failures.delete(labId)
  const controller = new AbortController()
  const job = { labId, body, meta, startedAt: Date.now(), promise: null, controller }
  job.promise = Promise.resolve()
    .then(() => run(controller.signal))
    .then(
      (result) => {
        jobs.delete(labId)
        emit()
        return result
      },
      (error) => {
        jobs.delete(labId)
        if (error?.name === 'AbortError' || controller.signal.aborted) failures.set(labId, { canceled: true, body, meta, at: Date.now() })
        else failures.set(labId, { error, body, meta, at: Date.now() })
        emit()
        throw error
      },
    )
  jobs.set(labId, job)
  emit()
  return job.promise
}

/** Stop the running analysis of a lab (the request is aborted; nothing is applied). */
export function cancelPaperJob(labId) {
  const job = jobs.get(labId)
  if (job?.controller && !job.controller.signal.aborted) job.controller.abort()
}

/** `{ job, failure }` for one lab, re-rendering when either changes. */
export function usePaperJob(labId) {
  const job = useSyncExternalStore(
    subscribePaperJobs,
    () => getPaperJob(labId),
    () => null,
  )
  const failure = useSyncExternalStore(
    subscribePaperJobs,
    () => getPaperFailure(labId),
    () => null,
  )
  return { job, failure }
}
