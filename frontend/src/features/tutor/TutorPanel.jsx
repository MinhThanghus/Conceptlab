import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Bot, CircleStop, FileText, LoaderCircle, MapPin, MapPinOff, Mic, RotateCcw, Send, Sparkles, Square, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { get, stream } from '../../lib/api.js'
import { Alert, Button, EmptyState, IconButton, LoadingBlock, RichText, useErrorText } from '../../components/ui/index.js'
import { buildChatContext, DEFAULT_SUGGESTIONS, MESSAGE_MAX, plainText, shareCodeFromChatPath } from './chatUtils.js'
import { useVoiceQuestion } from './useVoiceQuestion.js'
import './tutor.css'

const FLUSH_MS = 60

function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** One citation chip under an answer: opens the source at the cited page/region, or says honestly that the location is unknown. */
function CitationChip({ citation, onOpen, title }) {
  const { t } = useT()
  const located = citation.located || 'none'
  const parts = [title || citation.title || t('common.sourceKinds.pdf')]
  if (citation.page) parts.push(t('tutor.page', { page: citation.page }))
  if (citation.time !== null && citation.time !== undefined) parts.push(formatClock(citation.time))
  const label = parts.join(', ')
  if (!citation.source_id) {
    return (
      <span className="chip tutor-cite-chip" title={citation.quote || ''}>
        <span className="tutor-cite-n">{citation.n}</span>
        <MapPinOff size={16} aria-hidden="true" />
        <span className="break">{t('tutor.citeUnknown', { n: citation.n })}</span>
      </span>
    )
  }
  const Icon = located === 'none' ? MapPinOff : located === 'exact' ? MapPin : FileText
  return (
    <button
      type="button"
      className="chip tutor-cite-chip"
      onClick={() => onOpen(citation)}
      title={citation.quote ? `“${citation.quote}” (${t(`common.located.${located}`)})` : t(`common.located.${located}`)}
      aria-label={t('tutor.citeOpen', { n: citation.n, title: label })}
    >
      <span className="tutor-cite-n" aria-hidden="true">
        {citation.n}
      </span>
      <Icon size={16} aria-hidden="true" />
      <span className="break">{label}</span>
      {located === 'none' ? <span className="tutor-cite-note">({t('common.located.none')})</span> : null}
    </button>
  )
}

function AssistantMessage({ message, onOpenSource, onRetry, errorText, sourceTitles }) {
  const { t } = useT()
  const citations = message.citations || []
  const streaming = message.status === 'streaming'
  return (
    <div className="tutor-msg assistant">
      <div className="tutor-bubble">
        <span className="visually-hidden">{t('tutor.assistant')}: </span>
        {streaming ? (
          message.content ? (
            // formatted while it streams (bold, lists, formulas) instead of raw **…** and $…$ until the end;
            // [n] markers become clickable once the citations arrive with the final message
            <div className="tutor-stream-text">
              <RichText text={message.content} />
              <span className="tutor-caret" aria-hidden="true" />
            </div>
          ) : (
            <p className="tutor-thinking" role="status">
              <span className="tutor-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {t('tutor.thinking')}
            </p>
          )
        ) : message.content ? (
          <RichText text={message.content} citations={citations} onCite={onOpenSource} />
        ) : null}
        {message.status === 'done' ? (
          citations.length ? (
            <div className="tutor-cites">
              <span className="tutor-cites-label">{t('tutor.sources')}</span>
              <div className="tutor-cites-list">
                {citations.map((c) => (
                  <CitationChip key={`${c.n}-${c.source_id || 'x'}`} citation={c} onOpen={onOpenSource} title={sourceTitles?.[c.source_id]} />
                ))}
              </div>
            </div>
          ) : (
            <p className="tutor-nocite">{t('tutor.noCitations')}</p>
          )
        ) : null}
        {message.status === 'stopped' ? <p className="tutor-note">{t('tutor.stopped')}</p> : null}
        {message.status === 'error' ? (
          <div className="tutor-error" role="alert">
            <p>{message.error ? errorText(message.error) : t('tutor.incomplete')}</p>
            {message.retryText ? (
              <Button size="sm" icon={RotateCcw} onClick={() => onRetry(message)}>
                {t('tutor.retry')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * AI tutor chat (spec §10.1, §10.4): streams answers over SSE, cites sources, accepts a
 * spoken question. Props:
 *   endpoint            POST/GET chat URL (/api/labs/:id/chat or /api/share/:code/chat)
 *   available           AI configured and tutor allowed
 *   unavailableReason   'not_configured' | 'disabled'
 *   context             active context chip {block_id, item_id?, selection?, state?, source_ref?, nonce?, title?}
 *   onDismissContext()  remove the chip
 *   prefill             {text, nonce} placed in the input (from ask({prompt}))
 *   focusSignal         change to move focus into the input
 *   getReportedStates() live states reported by blocks (blockId → state)
 *   openSource(ref)     open the Sources tab at a citation
 *   keywords            glossary terms to bias speech recognition
 *   sourceTitles        source id → title in the lesson's current language (citations carry the original title)
 */
export default function TutorPanel({
  endpoint,
  available,
  unavailableReason,
  context,
  onDismissContext,
  prefill,
  focusSignal,
  getReportedStates,
  openSource,
  keywords,
  sourceTitles,
  suggestions = DEFAULT_SUGGESTIONS,
}) {
  const { t, lang } = useT()
  const errorText = useErrorText()
  const inputId = useId()
  const hintId = useId()
  const [messages, setMessages] = useState([])
  const [history, setHistory] = useState({ status: 'idle', error: null })
  const [historyKey, setHistoryKey] = useState(0)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [announce, setAnnounce] = useState('')
  const [voiceNote, setVoiceNote] = useState('')
  const streamingRef = useRef(false)
  const abortRef = useRef(null)
  const logRef = useRef(null)
  const inputRef = useRef(null)
  const stickRef = useRef(true)
  const stopRef = useRef(null)
  // A different lesson's chat starts empty instead of keeping the last lesson's unsent or local messages.
  const [chatFor, setChatFor] = useState(endpoint)
  if (chatFor !== endpoint) {
    setChatFor(endpoint)
    setMessages([])
    setSendError(null)
    setVoiceNote('')
  }

  const say = useCallback((text) => {
    setAnnounce('')
    window.requestAnimationFrame(() => setAnnounce(text))
  }, [])

  // ------------------------------------------------------------------ history
  useEffect(() => {
    if (!endpoint || !available) {
      setHistory({ status: 'idle', error: null })
      return undefined
    }
    const controller = new AbortController()
    setHistory({ status: 'loading', error: null })
    get(endpoint, { signal: controller.signal })
      .then((list) => {
        setMessages((current) => {
          const loaded = (Array.isArray(list) ? list : []).map((m) => ({ ...m, status: 'done' }))
          // keep anything sent while the history was loading
          return [...loaded, ...current.filter((m) => m.local)]
        })
        setHistory({ status: 'ready', error: null })
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setHistory({ status: err?.code === 'tutor_disabled' ? 'disabled' : 'error', error: err })
      })
    return () => controller.abort()
  }, [endpoint, available, historyKey])

  // Leaving a lesson (or the panel) stops its answer.
  useEffect(() => () => abortRef.current?.abort(), [endpoint])

  // ------------------------------------------------------------------ prefill & focus
  useEffect(() => {
    if (!prefill?.text) return
    setInput(prefill.text)
  }, [prefill])

  useEffect(() => {
    if (!focusSignal) return undefined
    const id = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(id)
  }, [focusSignal])

  // ------------------------------------------------------------------ autoscroll
  const onLogScroll = () => {
    const el = logRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useLayoutEffect(() => {
    const el = logRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  // ------------------------------------------------------------------ textarea autosize
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.blockSize = 'auto'
    el.style.blockSize = `${Math.min(el.scrollHeight + 2, 160)}px`
  }, [input])

  // ------------------------------------------------------------------ voice
  const voice = useVoiceQuestion({
    lang,
    keywords,
    shareCode: shareCodeFromChatPath(endpoint),
    onTranscript: (text) => {
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text).slice(0, MESSAGE_MAX))
      setVoiceNote(t('tutor.voice.done'))
      say(t('tutor.voice.done'))
      window.requestAnimationFrame(() => inputRef.current?.focus())
    },
  })
  useEffect(() => {
    if (voice.status === 'recording') window.requestAnimationFrame(() => stopRef.current?.focus())
  }, [voice.status])

  const voiceErrorText = (err) => {
    if (!err) return ''
    if (err.kind === 'empty') return t('tutor.voice.empty')
    if (err.kind === 'recording') return t(`tutor.voice.errors.${['unsupported', 'insecure', 'denied', 'no_device', 'busy', 'empty'].includes(err.code) ? err.code : 'failed'}`)
    return errorText(err.error)
  }

  // ------------------------------------------------------------------ send / stop
  const chipTitle = context?.title || ''

  const send = useCallback(
    async (rawText, { contextOverride } = {}) => {
      const text = String(rawText ?? '').trim().slice(0, MESSAGE_MAX)
      if (!text || streamingRef.current || !endpoint || !available) return
      const ctx = contextOverride !== undefined ? contextOverride : buildChatContext(context, getReportedStates?.() || {})
      const stamp = Date.now()
      const userId = `local-u-${stamp}`
      const botId = `local-a-${stamp}`
      stickRef.current = true
      setMessages((list) => [
        ...list,
        { id: userId, role: 'user', content: text, local: true, contextTitle: ctx?.block_id ? chipTitle : '' },
        { id: botId, role: 'assistant', content: '', citations: [], status: 'streaming', local: true },
      ])
      setInput('')
      setVoiceNote('')
      setSendError(null)
      streamingRef.current = true
      setStreaming(true)
      const controller = new AbortController()
      abortRef.current = controller
      let buffer = ''
      let timer = null
      let received = false
      let finished = false
      const patchBot = (fn) => setMessages((list) => list.map((m) => (m.id === botId ? fn(m) : m)))
      const flush = () => {
        timer = null
        if (!buffer) return
        const chunk = buffer
        buffer = ''
        patchBot((m) => ({ ...m, content: m.content + chunk }))
      }
      const body = ctx ? { message: text, context: ctx } : { message: text }
      try {
        for await (const { event, data } of stream(endpoint, body, { signal: controller.signal })) {
          if (event === 'delta') {
            const piece = typeof data === 'string' ? data : data?.text || ''
            if (piece) {
              received = true
              buffer += piece
              if (!timer) timer = window.setTimeout(flush, FLUSH_MS)
            }
          } else if (event === 'done') {
            window.clearTimeout(timer)
            timer = null
            const final = data && typeof data === 'object' ? data : {}
            const pending = buffer
            buffer = ''
            finished = true
            patchBot((m) => ({
              ...m,
              ...final,
              id: final.id || botId,
              role: 'assistant',
              content: typeof final.content === 'string' ? final.content : m.content + pending,
              citations: Array.isArray(final.citations) ? final.citations : [],
              status: 'done',
              local: false,
            }))
            // the server has both now, so a history reload must not show the question twice
            setMessages((list) => list.map((m) => (m.id === userId ? { ...m, local: false } : m)))
            say(t('tutor.answerReady', { text: plainText(final.content || '') }))
          } else if (event === 'error') {
            window.clearTimeout(timer)
            flush()
            finished = true
            const err = { code: data?.code || 'ai_upstream_error', message: data?.message || '', extra: data || null }
            patchBot((m) => ({ ...m, status: 'error', error: err, retryText: text, retryContext: ctx ?? null }))
            say(t('tutor.answerError'))
          }
        }
        if (!finished) {
          window.clearTimeout(timer)
          flush()
          patchBot((m) => ({ ...m, status: 'error', error: null, retryText: text, retryContext: ctx ?? null }))
          say(t('tutor.answerError'))
        }
      } catch (err) {
        window.clearTimeout(timer)
        if (err?.name === 'AbortError') {
          flush()
          patchBot((m) => ({ ...m, status: 'stopped' }))
        } else if (received) {
          flush()
          patchBot((m) => ({ ...m, status: 'error', error: err, retryText: text, retryContext: ctx ?? null }))
          say(t('tutor.answerError'))
        } else {
          // Nothing was answered (e.g. rate limit, tutor disabled): give the question back.
          setMessages((list) => list.filter((m) => m.id !== botId && m.id !== userId))
          setInput(text)
          setSendError(err)
          if (err?.code === 'tutor_disabled') setHistory({ status: 'disabled', error: err })
        }
      } finally {
        streamingRef.current = false
        abortRef.current = null
        setStreaming(false)
      }
    },
    [endpoint, available, context, getReportedStates, chipTitle, say, t],
  )

  const stop = () => abortRef.current?.abort()

  const retry = (message) => {
    setMessages((list) => {
      const index = list.findIndex((m) => m.id === message.id)
      if (index < 0) return list
      const before = list[index - 1]
      const drop = new Set([message.id])
      if (before && before.role === 'user') drop.add(before.id)
      return list.filter((m) => !drop.has(m.id))
    })
    window.setTimeout(() => send(message.retryText, { contextOverride: message.retryContext ?? undefined }), 0)
  }

  const onKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    // Do not send while an input method (e.g. Vietnamese Telex on a phone) is composing.
    if (event.nativeEvent?.isComposing || event.keyCode === 229) return
    event.preventDefault()
    send(input)
  }

  const rateLimitText = (err) => {
    const seconds = Number(err?.extra?.retry_after)
    if (err?.code === 'rate_limited' && Number.isFinite(seconds) && seconds > 0) return t('tutor.rateLimited', { minutes: Math.max(1, Math.ceil(seconds / 60)) })
    return errorText(err)
  }

  // ------------------------------------------------------------------ render
  const disabledByTeacher = unavailableReason === 'disabled' || history.status === 'disabled'
  if (!available || disabledByTeacher) {
    const key = disabledByTeacher ? 'disabled' : 'notConfigured'
    return (
      <div className="tutor tutor-unavailable">
        <EmptyState icon={Bot} title={t(`tutor.unavailable.${key}Title`)}>
          <p>{t(`tutor.unavailable.${key}`)}</p>
        </EmptyState>
      </div>
    )
  }

  const empty = messages.length === 0
  const recording = voice.status === 'recording' || voice.status === 'starting'
  const transcribing = voice.status === 'transcribing'
  const chars = input.length
  const showSuggestions = !streaming && messages.filter((m) => m.role === 'user').length < 1

  return (
    <div className="tutor">
      <div className="tutor-log" ref={logRef} onScroll={onLogScroll}>
        {history.status === 'loading' && empty ? (
          <div className="tutor-history-loading">
            <LoadingBlock lines={3} />
            <span className="visually-hidden">{t('tutor.historyLoading')}</span>
          </div>
        ) : null}
        {history.status === 'error' ? (
          <Alert
            tone="warning"
            action={
              <Button size="sm" onClick={() => setHistoryKey((k) => k + 1)}>
                {t('common.actions.retry')}
              </Button>
            }
          >
            {t('tutor.historyError')}
          </Alert>
        ) : null}
        {empty && history.status !== 'loading' ? (
          <div className="tutor-welcome">
            <p className="tutor-welcome-title">{t('tutor.welcomeTitle')}</p>
            <p className="tutor-welcome-body">{t('tutor.welcomeBody')}</p>
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="tutor-msg user">
              <div className="tutor-bubble">
                <span className="visually-hidden">{t('tutor.you')}: </span>
                {message.contextTitle ? <span className="tutor-msg-context">{t('tutor.contextLabel', { title: message.contextTitle })}</span> : null}
                <p className="tutor-user-text">{message.content}</p>
              </div>
            </div>
          ) : (
            <AssistantMessage key={message.id} message={message} onOpenSource={openSource} onRetry={retry} errorText={errorText} sourceTitles={sourceTitles} />
          ),
        )}
      </div>

      <div className="tutor-composer">
        {showSuggestions ? (
          <div className="tutor-suggestions" role="group" aria-label={t('tutor.suggestionsLabel')}>
            {suggestions.map((key) => (
              <button
                key={key}
                type="button"
                className="chip tutor-suggestion"
                onClick={() => {
                  setInput(t(`tutor.suggestions.${key}`))
                  window.requestAnimationFrame(() => inputRef.current?.focus())
                }}
              >
                {t(`tutor.suggestions.${key}`)}
              </button>
            ))}
          </div>
        ) : null}

        {context && chipTitle ? (
          <div className="tutor-context">
            <span className="tutor-context-text break">
              {t('tutor.contextLabel', { title: chipTitle })}
              {context.selection ? <span className="tutor-context-quote">“{plainText(context.selection, 60)}”</span> : null}
            </span>
            <IconButton icon={X} size="sm" label={t('tutor.contextRemove', { title: chipTitle })} onClick={onDismissContext} />
          </div>
        ) : null}

        {sendError ? (
          <Alert tone="danger" role="alert">
            {rateLimitText(sendError)}
          </Alert>
        ) : null}

        {recording || transcribing ? (
          <div className={['tutor-rec', transcribing && 'is-busy'].filter(Boolean).join(' ')} role="group" aria-label={t('tutor.voice.recording')}>
            {transcribing ? (
              <span className="tutor-rec-label" role="status">
                <LoaderCircle size={20} className="spin" aria-hidden="true" />
                {t('tutor.voice.transcribing')}
              </span>
            ) : (
              <>
                <span className="tutor-rec-label">
                  <Mic size={20} className="tutor-rec-icon" aria-hidden="true" />
                  {voice.status === 'starting' ? t('tutor.voice.starting') : t('tutor.voice.recording')}
                  <span className="tutor-rec-time" aria-hidden="true">
                    {t('tutor.voice.elapsed', { elapsed: formatClock(voice.elapsed), max: formatClock(voice.maxSeconds) })}
                  </span>
                </span>
                <span className="tutor-meter" role="meter" aria-label={t('tutor.voice.level')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(voice.level * 100)}>
                  <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, voice.level))})` }} />
                </span>
              </>
            )}
            <div className="tutor-rec-actions">
              {!transcribing ? (
                <Button ref={stopRef} size="sm" variant="danger" icon={Square} onClick={voice.stop} disabled={voice.status !== 'recording'}>
                  {t('tutor.voice.stop')}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={voice.cancel}>
                {t('tutor.voice.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="tutor-form"
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <label className="visually-hidden" htmlFor={inputId}>
              {t('tutor.inputLabel')}
            </label>
            <textarea
              ref={inputRef}
              id={inputId}
              className="textarea tutor-input"
              rows={1}
              value={input}
              maxLength={MESSAGE_MAX}
              placeholder={t('tutor.placeholder')}
              aria-describedby={hintId}
              enterKeyHint="send"
              onChange={(e) => {
                setInput(e.target.value)
                if (sendError) setSendError(null)
              }}
              onKeyDown={onKeyDown}
            />
            <div className="tutor-form-row">
              <IconButton icon={Mic} label={t('tutor.voice.start')} bordered onClick={voice.start} disabled={streaming} />
              <span id={hintId} className="tutor-hint">
                {chars > MESSAGE_MAX - 200 ? t('tutor.charCount', { count: chars, max: MESSAGE_MAX }) : t('tutor.hint')}
              </span>
              {streaming ? (
                <Button type="button" size="sm" icon={CircleStop} onClick={stop}>
                  {t('tutor.stop')}
                </Button>
              ) : (
                // aria-disabled, not disabled: this is the same <button> as Stop, and a disabled
                // button drops keyboard focus to the page when an answer is stopped or finishes
                <Button type="submit" size="sm" icon={Send} className="tutor-send" aria-disabled={!input.trim() || undefined}>
                  {t('common.actions.send')}
                </Button>
              )}
            </div>
          </form>
        )}

        {voice.error ? (
          <Alert tone={voice.error.kind === 'recording' && ['unsupported', 'insecure'].includes(voice.error.code) ? 'info' : 'warning'} role="alert">
            {voiceErrorText(voice.error)}
          </Alert>
        ) : null}
        {voice.limitReached && voice.status === 'idle' && !voice.error ? <p className="tutor-note">{t('tutor.voice.limitReached', { seconds: voice.maxSeconds })}</p> : null}
        {voiceNote && !voice.error ? <p className="tutor-note">{voiceNote}</p> : null}

        {recording ? <p className="tutor-note">{t('tutor.voice.privacy')}</p> : null}
        <p className="ai-note tutor-disclaimer">
          <Sparkles size={16} aria-hidden="true" />
          <span>{t('tutor.disclaimer')}</span>
        </p>
      </div>

      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  )
}

