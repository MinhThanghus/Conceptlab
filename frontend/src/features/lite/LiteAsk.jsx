import { useEffect, useRef, useState } from 'react'
import { Mic, Send, Square } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { stream } from '../../lib/api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { plainParagraphs } from './liteUtils.js'
import { useVoiceQuestion } from '../tutor/useVoiceQuestion.js'

/**
 * Lite "Ask the AI": one question at a time over the share chat SSE, with voice input.
 * Citations are listed as text; Lite never fakes a location it cannot open.
 */
export default function LiteAsk({ code, lab }) {
  const { t, lang } = useT()
  const auth = useAuth()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [announce, setAnnounce] = useState('')
  const abortRef = useRef(null)
  const keywords = (lab?.spec?.glossary || []).flatMap((g) => [g?.vi, g?.en]).filter(Boolean).slice(0, 40)
  const voice = useVoiceQuestion({
    lang,
    keywords,
    shareCode: code,
    onTranscript: (text) => setInput((prev) => `${prev.trim()} ${text}`.trim().slice(0, 2000)),
  })

  useEffect(() => () => abortRef.current?.abort(), [])

  // Screen readers hear one line per step (thinking, then the finished answer), never each streamed piece.
  const say = (text) => {
    setAnnounce('')
    window.requestAnimationFrame(() => setAnnounce(text))
  }

  const configured = Boolean(auth.ai?.configured)
  const allowed = Boolean(lab?.allow_tutor)
  if (!configured) return <p className="lite-small">{t('lite.ask.notConfigured')}</p>
  if (!allowed) return <p className="lite-small">{t('lite.ask.disabled')}</p>

  const send = async () => {
    const question = input.trim().slice(0, 2000)
    if (!question || busy) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFailed(true)
      return
    }
    setFailed(false)
    setBusy(true)
    setInput('')
    const botId = `lite-a-${Date.now()}`
    setMessages((list) => [...list, { id: `lite-u-${Date.now()}`, role: 'user', content: question }, { id: botId, role: 'assistant', content: '', citations: [], streaming: true }])
    say(t('lite.ask.thinking'))
    const controller = new AbortController()
    abortRef.current = controller
    let finished = false
    let answer = ''
    try {
      for await (const { event, data } of stream(`/api/share/${encodeURIComponent(code)}/chat`, { message: question }, { signal: controller.signal })) {
        if (event === 'delta') {
          const piece = typeof data === 'string' ? data : data?.text || ''
          if (piece) {
            answer += piece
            setMessages((list) => list.map((m) => (m.id === botId ? { ...m, content: m.content + piece } : m)))
          }
        } else if (event === 'done') {
          finished = true
          const final = data && typeof data === 'object' ? data : {}
          if (typeof final.content === 'string') answer = final.content
          say(t('lite.ask.answerReady', { text: plainParagraphs(answer).join(' ') }))
          setMessages((list) =>
            list.map((m) =>
              m.id === botId
                ? { ...m, content: typeof final.content === 'string' ? final.content : m.content, citations: Array.isArray(final.citations) ? final.citations : [], streaming: false }
                : m,
            ),
          )
        } else if (event === 'error') {
          finished = true
          setMessages((list) => list.filter((m) => m.id !== botId))
          setInput(question)
          setFailed(true)
        }
      }
      if (!finished) {
        setFailed(true)
        setInput(question)
      }
      setMessages((list) => list.map((m) => (m.id === botId ? { ...m, streaming: false, incomplete: !finished } : m)))
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setMessages((list) => list.filter((m) => m.id !== botId))
        setInput(question)
        setFailed(true)
      } else {
        setMessages((list) => list.map((m) => (m.id === botId ? { ...m, streaming: false, incomplete: true } : m)))
        say(t('lite.ask.incomplete'))
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  const recording = voice.status === 'recording' || voice.status === 'starting'
  const transcribing = voice.status === 'transcribing'

  return (
    <div>
      <p className="lite-small">{t('lite.ask.lead')}</p>
      <div className="lite-chat-log">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="lite-msg lite-msg-user">
              <p>{m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="lite-msg lite-msg-ai" aria-busy={m.streaming || undefined}>
              {plainParagraphs(m.content).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {m.streaming ? <p className="lite-small">{t('lite.ask.thinking')}</p> : null}
              {m.incomplete ? <p className="lite-error">{t('lite.ask.incomplete')}</p> : null}
              {!m.streaming && m.citations?.length ? (
                <div>
                  <p>
                    <strong>{t('lite.ask.citations')}</strong>
                  </p>
                  <ul className="lite-list">
                    {m.citations.map((c, i) => (
                      <li key={i}>
                        [{c.n}] {c.title || ''} {c.page ? t('lite.sourcePage', { page: c.page }) : ''} ({t(`common.located.${c.located || 'none'}`)})
                        {c.quote ? `: ${c.quote}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {!m.streaming && !m.citations?.length && m.content ? <p className="lite-small">{t('lite.ask.noCitations')}</p> : null}
            </div>
          ),
        )}
      </div>
      <p className="lite-sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      {failed ? (
        <p className="lite-error" role="alert">
          {t('lite.ask.error')}
        </p>
      ) : null}
      {voice.error ? (
        <p className="lite-error" role="alert">
          {t('lite.ask.voiceFailed')}
        </p>
      ) : null}
      <label htmlFor="lite-ask-input">{t('lite.ask.label')}</label>
      <textarea
        id="lite-ask-input"
        className="lite-textarea"
        rows={3}
        maxLength={2000}
        value={input}
        placeholder={t('lite.ask.placeholder')}
        onChange={(e) => setInput(e.target.value)}
      />
      <p className="lite-small">{t('lite.ask.voiceHint')}</p>
      <div className="lite-top" style={{ justifyContent: 'flex-start' }}>
        {recording ? (
          <button type="button" className="lite-btn" onClick={() => voice.stop()}>
            <Square aria-hidden="true" size={24} /> {t('lite.ask.voiceStop')}
          </button>
        ) : transcribing ? (
          // aria-disabled, not disabled: the focused Voice button turns into this one, and a disabled
          // button would drop keyboard focus to the page
          <button type="button" className="lite-btn" aria-disabled="true">
            {t('lite.ask.voiceBusy')}
          </button>
        ) : (
          <button type="button" className="lite-btn" onClick={() => voice.start()}>
            <Mic aria-hidden="true" size={24} /> {t('lite.ask.voice')}
          </button>
        )}
        {busy ? (
          <button
            type="button"
            className="lite-btn"
            onClick={() => {
              abortRef.current?.abort()
            }}
          >
            <Square aria-hidden="true" size={24} /> {t('lite.ask.stop')}
          </button>
        ) : (
          // aria-disabled for the same reason: Stop turns back into Send with an empty box after a reply
          <button type="button" className="lite-btn lite-btn-primary" onClick={send} aria-disabled={!input.trim() || undefined}>
            <Send aria-hidden="true" size={24} /> {t('lite.ask.send')}
          </button>
        )}
      </div>
    </div>
  )
}
