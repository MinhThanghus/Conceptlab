import { useCallback, useEffect, useState } from 'react'
import { post } from '../../lib/api.js'

/** Translate the published snapshot for display, without changing the author's lesson. */
export function useTranslatedLesson(original, code, lang, offline = false) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  const [fallback, setFallback] = useState(null)
  const originalLanguage = original?.translated_language || original?.language
  const needsTranslation = Boolean(original && ['vi', 'en'].includes(originalLanguage) && originalLanguage !== lang)

  useEffect(() => {
    if (!needsTranslation || offline) return undefined
    // Switching back to a translation of the same published snapshot should be
    // immediate. A different original object still triggers a fresh request.
    if (result?.original === original && result?.lang === lang && result?.status === 'ready') return undefined
    const controller = new AbortController()
    setResult({ original, lang, status: 'loading', lab: null, error: null })
    post(`/api/share/${encodeURIComponent(code)}/translate`, { target: lang }, { signal: controller.signal })
      .then((lab) => {
        if (!controller.signal.aborted) {
          if (!lab || lab.translated_language !== lang) throw new Error('Translation response is incomplete')
          setResult({ original, lang, status: 'ready', lab, error: null })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ original, lang, status: 'error', lab: null, error })
      })
    return () => controller.abort()
  }, [original, code, lang, needsTranslation, offline, attempt])

  const retry = useCallback(() => { setFallback(null); setResult(null); setAttempt((n) => n + 1) }, [])
  const viewOriginal = useCallback(() => setFallback({ original, lang }), [original, lang])
  if (!original) return { lab: original, status: 'ready', retry, viewOriginal }
  if (!needsTranslation || (fallback?.original === original && fallback?.lang === lang)) return { lab: original, status: 'ready', retry, viewOriginal }
  if (offline) return { lab: null, status: 'offline', retry, viewOriginal }
  if (result?.original !== original || result?.lang !== lang) return { lab: null, status: 'loading', retry, viewOriginal }
  return { ...result, retry, viewOriginal }
}
