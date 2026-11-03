import { useEffect, useId, useRef, useState } from 'react'
import { Bot, FileText, MapPinOff, MessageCircle, Send, Square, User, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { ApiError, stream } from '../../lib/api.js'
import { Alert, Button, ErrorMessage, IconButton, RichText } from '../../components/ui/index.js'

let seq = 0
const localId = () => {
  seq += 1
  return `m${seq}`
}

function CitationChips({ citations, onCite }) {
  const { t } = useT()
  if (!citations?.length) return null
  return (
    <div className="row" style={{ gap: '0.35rem' }}>
      <span className="small muted">{t('paper.chat.sources')}</span>
      {citations.map((c) => {
        const located = c.located || 'none'
        const parts = [`[${c.n}]`, c.title || t('common.sourceKinds.pdf')]
        if (c.page) parts.push(t('paper.pageShort', { page: c.page }))
        return (
          <button
            key={`${c.n}-${c.source_id || ''}-${c.page || ''}`}
            type="button"
            className="chip"
            title={[c.quote, t(`common.located.${located}`)].filter(Boolean).join('. ')}
            onClick={() => onCite?.(c)}
          >
            {located === 'none' ? <MapPinOff size={14} aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
            <span className="break">{parts.join(', ')}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Inline mini-chat about one item of the paper (figure, equation, table, method).
 * POST /api/labs/:labId/chat as Server-Sent Events: `delta` → text, `done` → final message
 * with citations (clickable `[n]` markers), `error` → translated error.
 *   context: ChatContext { item_id, selection, source_ref } (no other keys: the API forbids extras)
 */
export default function PaperItemChat({ labId, context, suggestions = [], onCite, aiAvailable, openLabel, title, defaultOpen = false, closable = true }) {
  const { t } = useT()
  const formId = useId()
  const [open, setOpen] = useState(Boolean(defaultOpen))
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const update = (id, fn) => setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)))

  const send = async (text) => {
    const question = String(text || '').trim().slice(0, 2000)
    if (!question || streaming || !aiAvailable) return
    const botId = localId()
    setMessages((list) => [...list, { id: localId(), role: 'user', content: question }, { id: botId, role: 'assistant', content: '', citations: [], status: 'streaming' }])
    setDraft('')
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const { event, data } of stream(`/api/labs/${labId}/chat`, { message: question, context }, { signal: controller.signal })) {
        if (event === 'delta') {
          const piece = typeof data === 'string' ? data : data?.text || ''
          if (piece) update(botId, (m) => ({ ...m, content: m.content + piece }))
        } else if (event === 'done') {
          update(botId, (m) => ({
            ...m,
            content: typeof data?.content === 'string' && data.content ? data.content : m.content,
            citations: Array.isArray(data?.citations) ? data.citations : [],
            status: 'done',
          }))
        } else if (event === 'error') {
          update(botId, (m) => ({ ...m, status: 'error', error: new ApiError({ code: data?.code || 'ai_upstream_error', message: data?.message || '' }) }))
        }
      }
      update(botId, (m) =>
        m.status === 'streaming'
          ? m.content
            ? { ...m, status: 'done' }
            : { ...m, status: 'error', error: new ApiError({ code: 'ai_bad_output', message: '' }) }
          : m,
      )
    } catch (err) {
      if (err?.name === 'AbortError') update(botId, (m) => ({ ...m, status: 'stopped' }))
      else update(botId, (m) => ({ ...m, status: 'error', error: err }))
    } finally {
      abortRef.current = null
      setStreaming(false)
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="soft" icon={MessageCircle} onClick={() => setOpen(true)} aria-expanded="false" aria-controls={formId}>
          {openLabel}
        </Button>
      </div>
    )
  }

  const lastQuestion = [...messages].reverse().find((m) => m.role === 'user')?.content
  return (
    <section className="paper-chat" id={formId} aria-label={title || openLabel}>
      <div className="row-between">
        <h4 className="panel-title" style={{ margin: 0 }}>
          <MessageCircle size={18} aria-hidden="true" />
          {title || openLabel}
        </h4>
        {closable ? (
          <IconButton
            icon={X}
            size="sm"
            label={t('paper.chat.close')}
            onClick={() => {
              abortRef.current?.abort()
              setOpen(false)
            }}
          />
        ) : null}
      </div>
      {!aiAvailable ? <Alert tone="info">{t('paper.aiOff')}</Alert> : null}
      {messages.length ? (
        <ol className="paper-chat-log list-reset" tabIndex={0} aria-label={t('paper.chat.log')}>
          {messages.map((m) =>
            m.role === 'user' ? (
              <li key={m.id} className="paper-chat-msg is-user">
                <span className="paper-chat-avatar" aria-hidden="true">
                  <User size={16} />
                </span>
                <div>
                  <span className="visually-hidden">{t('paper.chat.you')}: </span>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.content}</p>
                </div>
              </li>
            ) : (
              <li key={m.id} className="paper-chat-msg is-ai" aria-busy={m.status === 'streaming' ? 'true' : undefined}>
                <span className="paper-chat-avatar" aria-hidden="true">
                  <Bot size={16} />
                </span>
                <div className="stack-sm" style={{ minInlineSize: 0 }}>
                  <span className="visually-hidden">{t('paper.chat.ai')}: </span>
                  {m.content ? <RichText text={m.content} citations={m.citations} onCite={onCite} /> : null}
                  {m.status === 'streaming' && !m.content ? <span className="small muted">{t('paper.chat.thinking')}</span> : null}
                  {m.status === 'stopped' ? <span className="small muted">{t('paper.chat.stopped')}</span> : null}
                  {m.status === 'error' ? <ErrorMessage error={m.error} onRetry={lastQuestion && !streaming ? () => send(lastQuestion) : undefined} /> : null}
                  {m.status === 'done' ? <CitationChips citations={m.citations} onCite={onCite} /> : null}
                </div>
              </li>
            ),
          )}
        </ol>
      ) : suggestions.length ? (
        <div className="stack-sm">
          <span className="small muted">{t('paper.chat.try')}</span>
          <div className="row" style={{ gap: '0.4rem' }}>
            {suggestions.map((s) => (
              <button key={s} type="button" className="chip" disabled={!aiAvailable || streaming} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {streaming ? t('paper.chat.thinking') : messages.length ? t('paper.chat.answered') : ''}
      </p>
      <form
        className="paper-chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <label className="visually-hidden" htmlFor={`${formId}-input`}>
          {t('paper.chat.label')}
        </label>
        <textarea
          id={`${formId}-input`}
          ref={inputRef}
          className="textarea"
          rows={2}
          maxLength={2000}
          value={draft}
          disabled={!aiAvailable}
          placeholder={t('paper.chat.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send(draft)
            }
          }}
        />
        <div className="row">
          {streaming ? (
            <Button icon={Square} onClick={() => abortRef.current?.abort()}>
              {t('paper.chat.stop')}
            </Button>
          ) : (
            <Button type="submit" icon={Send} disabled={!aiAvailable || !draft.trim()}>
              {t('common.actions.send')}
            </Button>
          )}
          <span className="small muted">{t('paper.chat.enterHint')}</span>
        </div>
      </form>
      <p className="ai-note" style={{ margin: 0 }}>
        <Bot size={16} aria-hidden="true" />
        <span>{t('paper.chat.note')}</span>
      </p>
    </section>
  )
}
