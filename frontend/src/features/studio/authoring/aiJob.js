import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Long AI calls (analysis 20–60 s, generation) survive navigation between studio steps:
 * the request lives in this module, keyed by lab + feature. A step that mounts while the
 * job is running shows the progress again instead of offering a second (paid) run.
 *
 *   const job = useAiJob(`analyze:${labId}`, (finished) => { ... })
 *   job.start(async (signal) => { ...; return res })   // the run function must apply its own
 *                                                       // lasting effects (e.g. replaceLab)
 *   job.running · job.startedAt · job.status ('running'|'done'|'error'|'canceled') · job.error · job.cancel()
 */
const jobs = new Map()

function snapshot(job) {
  return job ? { status: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt || null, error: job.error, result: job.result } : null
}

export function getJob(key) {
  return jobs.get(key) || null
}

export function startJob(key, run) {
  const existing = jobs.get(key)
  if (existing && existing.status === 'running') return existing
  const controller = new AbortController()
  const job = { key, status: 'running', startedAt: Date.now(), finishedAt: null, controller, result: null, error: null, listeners: new Set() }
  jobs.set(key, job)
  job.promise = Promise.resolve()
    .then(() => run(controller.signal))
    .then(
      (result) => {
        job.status = 'done'
        job.result = result
      },
      (error) => {
        job.status = error?.name === 'AbortError' ? 'canceled' : 'error'
        job.error = error
      },
    )
    .finally(() => {
      job.finishedAt = Date.now()
      const watched = job.listeners.size > 0
      job.listeners.forEach((fn) => fn(job))
      // Nobody on screen: keep the outcome so the step shows it when it mounts again.
      if (watched && jobs.get(key) === job) jobs.delete(key)
    })
  return job
}

export function useAiJob(key, onFinish) {
  const [state, setState] = useState(() => snapshot(getJob(key)))
  const finishRef = useRef(onFinish)
  const unsubRef = useRef(null)

  useEffect(() => {
    finishRef.current = onFinish
  })

  const subscribe = useCallback((job) => {
    const listener = (j) => {
      setState(snapshot(j))
      if (j.status !== 'running') finishRef.current?.(snapshot(j), { late: false })
    }
    job.listeners.add(listener)
    return () => job.listeners.delete(listener)
  }, [])

  useEffect(() => {
    const job = getJob(key)
    if (job) {
      if (job.status === 'running') {
        unsubRef.current = subscribe(job)
        setState(snapshot(job))
      } else {
        // finished while this step was not on screen
        jobs.delete(key)
        setState(snapshot(job))
        finishRef.current?.(snapshot(job), { late: true })
      }
    }
    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  }, [key, subscribe])

  const start = useCallback(
    (run) => {
      const job = startJob(key, run)
      unsubRef.current?.()
      unsubRef.current = subscribe(job)
      setState(snapshot(job))
      return job.promise
    },
    [key, subscribe],
  )

  const cancel = useCallback(() => {
    getJob(key)?.controller.abort()
  }, [key])

  const dismiss = useCallback(() => setState(null), [])

  return {
    status: state?.status || 'idle',
    running: state?.status === 'running',
    startedAt: state?.startedAt || null,
    error: state?.status === 'error' ? state.error : null,
    result: state?.status === 'done' ? state.result : null,
    canceled: state?.status === 'canceled',
    start,
    cancel,
    dismiss,
  }
}
