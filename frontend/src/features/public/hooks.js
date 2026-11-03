import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { get } from '../../lib/api.js'

/** Sets the document title while the page is mounted ("<title> · ConceptLab AI"). */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined
    const previous = document.title
    document.title = `${title} · ConceptLab AI`
    return () => {
      document.title = previous
    }
  }, [title])
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(id)
  }, [value, delay])
  return debounced
}

/** true when the user asked the OS to reduce motion (animations must pause or skip). */
export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia(query)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/**
 * GET a JSON resource. While a new path loads, the previous data stays available
 * (`stale` is true) so lists can dim instead of flashing skeletons on every filter change.
 * Pass `null` as path to skip.
 */
export function useFetch(path, { scope } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: Boolean(path), loadedPath: null })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!path) {
      setState((s) => ({ ...s, loading: false }))
      return undefined
    }
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    get(path, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ data, error: null, loading: false, loadedPath: path, loadedScope: scope }) })
      .catch((error) => {
        if (controller.signal.aborted || error?.name === 'AbortError') return
        setState((s) => ({ ...s, data: scope !== undefined && s.loadedScope !== scope ? undefined : s.data, error, loading: false, loadedPath: path, loadedScope: scope }))
      })
    return () => controller.abort()
  }, [path, nonce, scope])
  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), [])
  const differentScope = scope !== undefined && state.loadedPath !== null && state.loadedScope !== scope
  const data = differentScope ? undefined : state.data
  const error = differentScope ? null : state.error
  const loading = differentScope ? Boolean(path) : state.loading
  return {
    data,
    error,
    loading,
    /** true while data from a previous request is shown during a refetch */
    stale: loading && data !== undefined,
    /** true until the first response (or error) arrives */
    initial: data === undefined && !error,
    reload,
    setData,
  }
}

/** Build "?a=1&b=x" from an object, skipping empty values. */
export function queryString(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

/**
 * Filters kept in the URL (shareable, survive reload and the back button).
 *   const [filters, setFilters] = useUrlFilters({ q: '', status: '', page: '1' })
 *   setFilters({ status: 'draft' })   // resets page unless `page` is in the patch
 * Values equal to their default are removed from the URL.
 */
export function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams()
  const defaultsRef = useRef(defaults)
  const values = useMemo(() => {
    const out = {}
    Object.entries(defaultsRef.current).forEach(([key, fallback]) => {
      out[key] = params.get(key) ?? fallback
    })
    return out
  }, [params])
  const update = useCallback(
    (patch) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '' || value === defaultsRef.current[key]) next.delete(key)
            else next.set(key, String(value))
          })
          if (!('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )
  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])
  return [values, update, clear]
}

/** Positive integer page from a URL value (falls back to 1). */
export function pageFrom(value) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 1
}

/**
 * The last page that has rows when the requested `page` lies past the end of a non-empty
 * list (an old bookmark, a shared "?page=5" link, rows removed meanwhile) — otherwise null.
 */
export function pastLastPage({ page, total, pageSize, itemCount }) {
  if (!total || itemCount > 0 || !pageSize) return null
  const last = Math.max(1, Math.ceil(total / pageSize))
  return page > last ? last : null
}

/**
 * Jumps back to the last real page instead of showing "nothing here yet" next to a
 * non-zero total. Returns true while that correction is pending (render a loading state).
 */
export function useClampedPage({ page, total, pageSize, itemCount, loading, setFilters }) {
  const setRef = useRef(setFilters)
  setRef.current = setFilters
  const target = loading ? null : pastLastPage({ page, total, pageSize, itemCount })
  useEffect(() => {
    if (target !== null) setRef.current({ page: String(target) })
  }, [target])
  return target !== null
}

/**
 * Search box bound to a URL filter with debounce: typing updates local state at once,
 * the URL (and therefore the request) after `delay` ms; back/forward resyncs the box.
 */
export function useDebouncedSearch(urlValue, onCommit, delay = 400) {
  const [text, setText] = useState(urlValue || '')
  const debounced = useDebouncedValue(text, delay)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const lastUrl = useRef(urlValue || '')
  useEffect(() => {
    if ((urlValue || '') !== lastUrl.current) {
      lastUrl.current = urlValue || ''
      setText(urlValue || '')
    }
  }, [urlValue])
  useEffect(() => {
    const value = debounced.trim()
    if (value !== (lastUrl.current || '').trim()) {
      lastUrl.current = value
      commitRef.current(value)
    }
  }, [debounced])
  return [text, setText]
}
