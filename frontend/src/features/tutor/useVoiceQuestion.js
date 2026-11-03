import { useCallback, useEffect, useRef, useState } from 'react'
import { upload } from '../../lib/api.js'
import { DEFAULT_MAX_SECONDS, RecordingError, recordingFileName, recordingSupport, startRecording } from '../../lib/audio.js'

/**
 * Spoken question → text (spec §10.4): record with the microphone (max 60 s), convert to
 * WAV PCM16 mono 24 kHz in the browser, send to POST /api/ai/transcribe (Muse Voice
 * Transcribe), and hand the transcript back for review before it is sent to the tutor.
 * A learner on a shared lesson passes `shareCode`: guests may transcribe only for a shared lab.
 *
 * status: 'idle' | 'starting' | 'recording' | 'transcribing'
 * error:  null | { kind: 'recording', code } | { kind: 'empty' } | { kind: 'api', error }
 */
export function useVoiceQuestion({ lang, keywords, shareCode, onTranscript, maxSeconds = DEFAULT_MAX_SECONDS }) {
  const [status, setStatus] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState(null)
  const [limitReached, setLimitReached] = useState(false)
  const recRef = useRef(null)
  const tickRef = useRef(null)
  const abortRef = useRef(null)
  const aliveRef = useRef(true)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript
  const paramsRef = useRef({ lang, keywords, shareCode })
  paramsRef.current = { lang, keywords, shareCode }

  const stopTicking = () => {
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = null
  }

  const finish = useCallback(async () => {
    const rec = recRef.current
    if (!rec) return
    recRef.current = null
    stopTicking()
    setLevel(0)
    setStatus('transcribing')
    try {
      const blob = await rec.stop()
      const file = new File([blob], recordingFileName(blob), { type: blob.type || 'audio/wav' })
      const controller = new AbortController()
      abortRef.current = controller
      const { lang: currentLang, keywords: words, shareCode: code } = paramsRef.current
      const fields = { lang: currentLang === 'en' ? 'en' : 'vi' }
      if (code) fields.code = String(code)
      const cleanWords = (words || []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 40)
      if (cleanWords.length) fields.keywords = cleanWords.join(', ')
      const out = await upload('/api/ai/transcribe', file, { fileField: 'audio', fields, signal: controller.signal })
      if (!aliveRef.current) return
      const text = String(out?.transcript || '').trim()
      if (!text) setError({ kind: 'empty' })
      else onTranscriptRef.current?.(text)
    } catch (err) {
      if (!aliveRef.current || err?.name === 'AbortError') return
      if (err instanceof RecordingError) setError({ kind: 'recording', code: err.code })
      else setError({ kind: 'api', error: err })
    } finally {
      abortRef.current = null
      if (aliveRef.current) setStatus('idle')
    }
  }, [])

  const start = useCallback(async () => {
    if (recRef.current) return
    setError(null)
    setLimitReached(false)
    const support = recordingSupport()
    if (!support.ok) {
      setError({ kind: 'recording', code: support.reason })
      return
    }
    setStatus('starting')
    try {
      const rec = await startRecording({
        maxSeconds,
        onLimit: () => {
          if (!aliveRef.current) return
          setLimitReached(true)
          finish()
        },
        onLevel: (value) => {
          if (aliveRef.current) setLevel(value)
        },
      })
      if (!aliveRef.current) {
        rec.cancel()
        return
      }
      recRef.current = rec
      setElapsed(0)
      setStatus('recording')
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.min(maxSeconds, (Date.now() - rec.startedAt) / 1000))
      }, 250)
    } catch (err) {
      if (!aliveRef.current) return
      setStatus('idle')
      setError({ kind: 'recording', code: err?.code || 'failed' })
    }
  }, [finish, maxSeconds])

  const cancel = useCallback(() => {
    recRef.current?.cancel()
    recRef.current = null
    abortRef.current?.abort()
    abortRef.current = null
    stopTicking()
    setLevel(0)
    setElapsed(0)
    setStatus('idle')
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      recRef.current?.cancel()
      abortRef.current?.abort()
      stopTicking()
    }
  }, [])

  return {
    status,
    elapsed,
    level,
    error,
    limitReached,
    maxSeconds,
    start,
    stop: finish,
    cancel,
    clearError: () => setError(null),
    busy: status !== 'idle',
  }
}
