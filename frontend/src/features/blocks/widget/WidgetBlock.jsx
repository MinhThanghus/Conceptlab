import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Code2,
  Copy,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  WandSparkles,
  Wrench,
  X,
} from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { AIBadge, Alert, Badge, Button, ErrorMessage, Switch, TextArea, TextField } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { useLab } from '../../lab/LabContext.jsx'
import {
  DEFAULT_FRAME_HEIGHT,
  MAX_PROMPT,
  WIDGET_SANDBOX,
  applyRuntimeResult,
  hashString,
  htmlStats,
  initialStatus,
  isLearnerVisible,
  normalizeErrors,
  parseWidgetMessage,
  repairErrors,
  runtimeChanges,
  staticState,
  widgetSrc,
} from './widgetUtils.js'
import { formatElapsed } from '../../paper/paperUtils.js'
import './widget.css'

/** Wait after the HTML changes before reloading the preview (the render route reads the SAVED spec). */
const RELOAD_DEBOUNCE_MS = 1500
/** A widget that throws right after "ready" (e.g. in its first animation frame) must not validate. */
const READY_GRACE_MS = 1200
/** No harness message this long after load → tell the teacher instead of guessing. */
const SILENT_AFTER_MS = 10000
const MAX_HTML = 80000
const RUNTIME_FALLBACK_ERROR = 'The sandbox reported a runtime error without details.'
const IDLE_RUNTIME = { state: 'idle', errors: [] }
const EXAMPLE_KEYS = ['softmax', 'sine', 'sorting']

/** LabContext is available in the studio only; the learner view renders without it. */
function useOptionalLab() {
  try {
    return useLab()
  } catch {
    return null
  }
}

/**
 * Sandboxed preview of a widget. The HTML never enters the app DOM: the iframe loads the
 * render route (CSP sandbox, opaque origin, no network). Listens only to messages whose
 * source is this iframe's window and whose type is 'cl-widget'.
 */
export function WidgetFrame({ src, title, onSignal, onSilent }) {
  const frameRef = useRef(null)
  const signalled = useRef(false)
  const timer = useRef(null)
  const handlers = useRef({ onSignal, onSilent })
  const [height, setHeight] = useState(DEFAULT_FRAME_HEIGHT)

  useLayoutEffect(() => {
    handlers.current = { onSignal, onSilent }
  })

  useEffect(() => {
    const listener = (event) => {
      const win = frameRef.current?.contentWindow
      if (!win || event.source !== win) return
      const msg = parseWidgetMessage(event.data)
      if (!msg) return
      signalled.current = true
      window.clearTimeout(timer.current)
      if (msg.height !== null) setHeight(msg.height)
      if (msg.status) handlers.current.onSignal?.(msg)
    }
    window.addEventListener('message', listener)
    return () => {
      window.removeEventListener('message', listener)
      window.clearTimeout(timer.current)
    }
  }, [])

  const onLoad = () => {
    window.clearTimeout(timer.current)
    if (signalled.current) return
    timer.current = window.setTimeout(() => {
      if (!signalled.current) handlers.current.onSilent?.()
    }, SILENT_AFTER_MS)
  }

  return (
    <iframe
      ref={frameRef}
      className="widget-frame"
      src={src}
      title={title}
      sandbox={WIDGET_SANDBOX}
      referrerPolicy="no-referrer"
      loading="lazy"
      onLoad={onLoad}
      style={{ blockSize: `${height}px` }}
    />
  )
}

function CheckIcon({ status }) {
  if (status === 'pass') return <CircleCheck aria-hidden="true" />
  if (status === 'fail') return <CircleAlert aria-hidden="true" />
  if (status === 'warn') return <TriangleAlert aria-hidden="true" />
  return <LoaderCircle className="spin" aria-hidden="true" />
}

function StatusBadgeForWidget({ status }) {
  const { t } = useT()
  if (status === 'validated') return <Badge tone="success" icon={ShieldCheck}>{t('widget.status.validated')}</Badge>
  if (status === 'failed') return <Badge tone="danger" icon={CircleAlert}>{t('widget.status.failed')}</Badge>
  return <Badge tone="warning" icon={Info}>{t('widget.status.draft')}</Badge>
}

/**
 * Sandbox run result. `runtime` is this session's live result for the current HTML;
 * `stored` is the last result saved in the block (validation.runtime), shown while waiting.
 */
function RuntimeRow({ runtime, stored, waitingReason }) {
  const { t, fmt } = useT()
  let status = 'pending'
  let text = t('widget.runtime.loading')
  let errors = []
  if (runtime.state === 'ready') {
    status = 'pass'
    text = t('widget.runtime.ready')
  } else if (runtime.state === 'error') {
    status = 'fail'
    text = t('widget.runtime.error')
    errors = runtime.errors
  } else if (runtime.state === 'silent') {
    status = 'warn'
    text = t('widget.runtime.silent')
  } else if (waitingReason) {
    status = waitingReason === 'blocked' ? 'warn' : 'pending'
    text = t(`widget.runtime.${waitingReason}`)
  }
  const live = ['ready', 'error', 'silent'].includes(runtime.state)
  const storedText =
    !live && stored?.at ? t(stored.ok ? 'widget.runtime.storedOk' : 'widget.runtime.storedError', { when: fmt.relative(stored.at) }) : null
  return (
    <li className={`widget-check is-${status}`}>
      <CheckIcon status={status} />
      <div style={{ minInlineSize: 0 }}>
        <strong>{t('widget.runtime.label')}</strong> <span>{text}</span>
        {storedText ? <span className="small muted widget-stored">{storedText}</span> : null}
        {errors.length ? (
          <ul className="widget-errors">
            {errors.slice(0, 8).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

function CodeView({ html }) {
  const { t, fmt } = useT()
  const [copied, setCopied] = useState(false)
  const stats = useMemo(() => htmlStats(html), [html])
  useEffect(() => {
    if (!copied) return undefined
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <details className="widget-details">
      <summary>
        <Code2 size={18} aria-hidden="true" />
        {t('widget.code.summary')}
        <span className="small muted">{t('widget.code.stats', { lines: fmt.number(stats.lines, 0), size: fmt.bytes(stats.bytes) })}</span>
        <ChevronDown size={18} aria-hidden="true" className="widget-details-chevron" />
      </summary>
      <div className="stack-sm" style={{ marginBlockStart: '0.5rem' }}>
        <div className="row-between">
          <span className="small muted">{t('widget.code.readOnly')}</span>
          <Button size="sm" icon={Copy} onClick={copy}>
            {copied ? t('common.actions.copied') : t('widget.code.copy')}
          </Button>
        </div>
        <pre className="widget-code" tabIndex={0} aria-label={t('widget.code.summary')}>
          <code>{html}</code>
        </pre>
      </div>
    </details>
  )
}

function WidgetEditor({ block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const lab = useOptionalLab()
  const html = block.html || ''
  const targetHash = useMemo(() => hashString(html), [html])
  const checks = Array.isArray(block.validation?.checks) ? block.validation.checks : []
  const staticResult = staticState(checks)
  const headingId = useId()

  const [busy, setBusy] = useState(null) // 'generate' | 'repair'
  const [busySince, setBusySince] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const controllerRef = useRef(null)
  const [error, setError] = useState(null)
  const [failedAction, setFailedAction] = useState(null) // what "Try again" repeats
  const [notice, setNotice] = useState('') // local problems that are not API errors
  const [revoked, setRevoked] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [frame, setFrame] = useState({ hash: null, nonce: 0 })
  const [settled, setSettled] = useState(true)
  const [runtime, setRuntime] = useState({ state: 'idle', errors: [] }) // idle | loading | ready | error | silent
  const latest = useRef({ block, onChange })
  const lastHash = useRef(targetHash)
  const readyTimer = useRef(null)

  useLayoutEffect(() => {
    latest.current = { block, onChange }
  })
  useEffect(() => () => window.clearTimeout(readyTimer.current), [])
  // Elapsed time of a running AI call (generation takes about a minute).
  useEffect(() => {
    if (!busy) return undefined
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [busy])

  // Debounce reloads after the HTML changes (generation, repair, undo…).
  useEffect(() => {
    if (lastHash.current === targetHash) return undefined
    lastHash.current = targetHash
    setSettled(false)
    const id = window.setTimeout(() => setSettled(true), RELOAD_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [targetHash])

  // The render route serves the SAVED spec: load the new HTML only once the Lab is saved.
  const saveState = lab?.saveState
  const saved = !lab || saveState === 'saved'
  useEffect(() => {
    if (!html || !settled || !saved || frame.hash === targetHash) return
    window.clearTimeout(readyTimer.current)
    setFrame((f) => ({ hash: targetHash, nonce: f.nonce + 1 }))
    setRuntime({ state: 'loading', errors: [] })
  }, [html, settled, saved, targetHash, frame.hash])

  const frameCurrent = Boolean(html) && frame.hash === targetHash

  // Turn sandbox results into the block status (validated only with passing static checks).
  useEffect(() => {
    if (!frameCurrent) return
    const { block: current, onChange: change } = latest.current
    let result = null
    if (runtime.state === 'ready') result = { ok: true }
    else if (runtime.state === 'error') result = { ok: false, errors: runtime.errors.length ? runtime.errors : [RUNTIME_FALLBACK_ERROR] }
    if (result && runtimeChanges(current, result)) {
      if (!result.ok && current.approved) setRevoked(true)
      change(applyRuntimeResult(current, result))
    }
  }, [runtime, frameCurrent])

  const onSignal = (msg) => {
    if (frame.hash !== targetHash) return // message from an older version of the HTML
    if (msg.status === 'error') {
      window.clearTimeout(readyTimer.current)
      setRuntime((r) => ({ state: 'error', errors: normalizeErrors([...(r.state === 'error' ? r.errors : []), ...msg.errors]) }))
    } else if (msg.status === 'ready') {
      window.clearTimeout(readyTimer.current)
      readyTimer.current = window.setTimeout(() => {
        setRuntime((r) => (r.state === 'error' ? r : { state: 'ready', errors: [] }))
      }, READY_GRACE_MS)
    }
  }
  const onSilent = () => setRuntime((r) => (r.state === 'loading' ? { state: 'silent', errors: [] } : r))

  const applyOutput = (out) => {
    const nextHtml = typeof out?.html === 'string' ? out.html : ''
    // An empty answer must never wipe the widget the teacher already has.
    if (!nextHtml.trim()) {
      setNotice(t('widget.edit.emptyResult'))
      return
    }
    if (nextHtml.length > MAX_HTML) {
      setNotice(t('widget.edit.tooLarge'))
      return
    }
    const { block: current, onChange: change } = latest.current
    change({
      ...current,
      html: nextHtml,
      status: initialStatus(out),
      validation: { checks: Array.isArray(out?.checks) ? out.checks : [], generated_at: new Date().toISOString() },
      approved: false,
      confirmed: false,
      ai_generated: true,
    })
    window.clearTimeout(readyTimer.current)
    setRevoked(false)
    setRuntime({ state: 'idle', errors: [] })
  }

  /**
   * Runs an AI action with shared busy/error handling; the Lab is saved first (flush).
   * `request(signal)` must pass the signal on so "Hủy" really stops the call.
   */
  const runAction = async (name, request) => {
    // One action at a time: a newer run supersedes an unfinished one, whose answer is then ignored.
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(name)
    setBusySince(Date.now())
    setNow(Date.now())
    setError(null)
    setFailedAction(null)
    setNotice('')
    try {
      if (lab) await lab.flush()
      const out = await request(controller.signal)
      if (controllerRef.current === controller && !controller.signal.aborted) applyOutput(out)
    } catch (err) {
      if (controllerRef.current !== controller) return
      if (err?.name === 'AbortError' || controller.signal.aborted) {
        setNotice(t('widget.edit.canceled'))
      } else {
        setError(err)
        setFailedAction(name)
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setBusy(null)
      }
    }
  }
  const cancelAction = () => controllerRef.current?.abort()
  const elapsed = busy ? formatElapsed(now - busySince) : ''

  const generate = () => {
    const description = String(block.prompt || '').trim()
    if (description.length < 5) {
      setPromptError(t('widget.edit.promptTooShort'))
      return
    }
    setPromptError('')
    runAction('generate', (signal) => post(env.aiPath('widget'), { description, block_id: block.id }, { signal }))
  }

  const errorsForRepair = repairErrors(block, frameCurrent && runtime.state === 'error' ? runtime.errors : null)
  const repair = () => {
    if (!errorsForRepair.length) return
    runAction('repair', (signal) => post(env.aiPath('widget/repair'), { html, errors: errorsForRepair }, { signal }))
  }

  const reloadPreview = async () => {
    setError(null)
    setFailedAction(null)
    try {
      if (lab) await lab.flush()
    } catch (err) {
      setError(err)
      setFailedAction('reload')
      return
    }
    window.clearTimeout(readyTimer.current)
    setFrame((f) => ({ hash: targetHash, nonce: f.nonce + 1 }))
    setRuntime({ state: 'loading', errors: [] })
  }
  const retry = { generate, repair, reload: reloadPreview }[failedAction]

  const update = (patch) => onChange({ ...block, ...patch })
  const canApprove = block.status === 'validated'
  const waitingReason = !html
    ? null
    : frameCurrent
      ? null
      : lab && (saveState === 'error' || saveState === 'conflict')
        ? 'blocked'
        : 'saving'
  const src = frame.hash ? widgetSrc({ labId: env.labId, blockId: block.id, version: frame.hash }) : null
  const aiDisabled = !env.aiAvailable || Boolean(busy)

  return (
    <div className="stack widget-editor">
      <TextField label={t('blocks.titleLabel')} value={block.title || ''} maxLength={200} onChange={(e) => update({ title: e.target.value })} />

      <section className="widget-step" aria-labelledby={`${headingId}-describe`}>
        <h3 className="widget-step-title" id={`${headingId}-describe`}>
          <span className="widget-step-num" aria-hidden="true">
            1
          </span>
          {t('widget.edit.describeTitle')}
        </h3>
        <TextArea
          label={t('widget.edit.promptLabel')}
          hint={t('widget.edit.promptHint')}
          error={promptError || undefined}
          rows={4}
          maxLength={MAX_PROMPT}
          value={block.prompt || ''}
          onChange={(e) => {
            if (promptError) setPromptError('')
            update({ prompt: e.target.value })
          }}
        />
        <div className="stack-sm">
          <span className="small muted">{t('widget.edit.examplesLabel')}</span>
          <div className="widget-examples">
            {EXAMPLE_KEYS.map((key) => (
              <button key={key} type="button" className="chip" onClick={() => update({ prompt: t(`widget.examples.${key}`) })}>
                {t(`widget.examples.${key}Short`)}
              </button>
            ))}
          </div>
        </div>
        {!env.aiAvailable ? <Alert tone="info">{t('widget.edit.aiOff')}</Alert> : null}
        {html ? <p className="small muted" style={{ margin: 0 }}>{t('widget.edit.regenerateNote')}</p> : null}
        <div className="row">
          <Button variant="paper" icon={WandSparkles} loading={busy === 'generate'} disabled={aiDisabled && busy !== 'generate'} onClick={generate}>
            {html ? t('widget.edit.regenerate') : t('widget.edit.generate')}
          </Button>
          {busy === 'generate' ? (
            <>
              <span className="small muted" role="status">
                {t('widget.edit.generating')} {t('widget.edit.elapsed', { time: elapsed })}
              </span>
              <Button size="sm" icon={X} onClick={cancelAction}>
                {t('common.actions.cancel')}
              </Button>
            </>
          ) : null}
        </div>
        {notice ? (
          <Alert tone="warning" role="alert">
            {notice}
          </Alert>
        ) : null}
        <ErrorMessage error={error} onRetry={retry && !busy ? retry : undefined} />
      </section>

      {!html ? (
        <div className="card-muted row" style={{ gap: '0.6rem', alignItems: 'flex-start' }}>
          <Lock size={18} aria-hidden="true" style={{ flex: 'none', marginBlockStart: '0.2rem', color: 'var(--color-ink-2)' }} />
          <p className="small" style={{ margin: 0 }}>
            {t('widget.edit.emptyNote')}
          </p>
        </div>
      ) : (
        <>
          <section className="widget-step" aria-labelledby={`${headingId}-checks`}>
            <div className="row-between">
              <h3 className="widget-step-title" id={`${headingId}-checks`}>
                <span className="widget-step-num" aria-hidden="true">
                  2
                </span>
                {t('widget.checks.title')}
              </h3>
              <div className="row" style={{ gap: '0.4rem' }}>
                {block.ai_generated && !block.approved ? <AIBadge /> : null}
                <StatusBadgeForWidget status={block.status} />
              </div>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {t('widget.checks.intro')}
            </p>
            <ul className="widget-checks list-reset" aria-live="polite">
              {checks.length ? (
                checks.map((check, i) => (
                  <li key={`${check.code || 'check'}-${i}`} className={`widget-check is-${check.status}`}>
                    <CheckIcon status={check.status} />
                    <div style={{ minInlineSize: 0 }}>
                      <strong>{t(`widget.checks.${check.status === 'fail' ? 'fail' : check.status === 'warn' ? 'warn' : 'pass'}`)}</strong>{' '}
                      <span className="break">{check.message || check.code}</span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="widget-check is-warn">
                  <CheckIcon status="warn" />
                  <span>{t('widget.checks.none')}</span>
                </li>
              )}
              <RuntimeRow runtime={frameCurrent ? runtime : IDLE_RUNTIME} stored={block.validation?.runtime} waitingReason={waitingReason} />
            </ul>
            {block.status === 'failed' ? (
              <div className="stack-sm">
                <p className="small" style={{ margin: 0 }}>
                  {staticResult === 'fail' ? t('widget.checks.staticFailedHelp') : t('widget.checks.runtimeFailedHelp')}
                </p>
                <div className="row">
                  <Button
                    icon={Wrench}
                    loading={busy === 'repair'}
                    disabled={(aiDisabled && busy !== 'repair') || !errorsForRepair.length}
                    onClick={repair}
                  >
                    {t('widget.checks.repair')}
                  </Button>
                  {busy === 'repair' ? (
                    <>
                      <span className="small muted" role="status">
                        {t('widget.checks.repairing')} {t('widget.edit.elapsed', { time: elapsed })}
                      </span>
                      <Button size="sm" icon={X} onClick={cancelAction}>
                        {t('common.actions.cancel')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>

          <section className="widget-step" aria-labelledby={`${headingId}-preview`}>
            <div className="row-between">
              <h3 className="widget-step-title" id={`${headingId}-preview`}>
                <span className="widget-step-num" aria-hidden="true">
                  3
                </span>
                {t('widget.preview.title')}
              </h3>
              <Button size="sm" icon={RefreshCw} onClick={reloadPreview} disabled={!html}>
                {t('widget.preview.reload')}
              </Button>
            </div>
            <div className="widget-stage">
              {src && frameCurrent ? (
                <WidgetFrame
                  key={`${frame.hash}-${frame.nonce}`}
                  src={src}
                  title={t('widget.frameTitle', { title: block.title || t('blocks.types.widget') })}
                  onSignal={onSignal}
                  onSilent={onSilent}
                />
              ) : (
                <div className="widget-waiting" role="status">
                  {waitingReason === 'blocked' ? <TriangleAlert aria-hidden="true" /> : <LoaderCircle className="spin" aria-hidden="true" />}
                  <span>{t(waitingReason === 'blocked' ? 'widget.preview.blocked' : 'widget.preview.waiting')}</span>
                </div>
              )}
            </div>
            {runtime.state === 'silent' && frameCurrent ? <Alert tone="warning">{t('widget.preview.silentHelp')}</Alert> : null}
            <p className="ai-note" style={{ margin: 0 }}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>{t('widget.preview.sandboxNote')}</span>
            </p>
            <CodeView html={html} />
          </section>

          <section className="widget-step" aria-labelledby={`${headingId}-approve`}>
            <h3 className="widget-step-title" id={`${headingId}-approve`}>
              <span className="widget-step-num" aria-hidden="true">
                4
              </span>
              {t('widget.approve.title')}
            </h3>
            <Switch
              label={t('widget.approve.label')}
              checked={Boolean(block.approved) && canApprove}
              disabled={!canApprove}
              onChange={(e) => update({ approved: e.target.checked, confirmed: e.target.checked ? true : Boolean(block.confirmed) })}
            />
            <p className="small muted" style={{ margin: 0 }}>
              {canApprove ? (block.approved ? t('widget.approve.onHint') : t('widget.approve.readyHint')) : t('widget.approve.lockedHint')}
            </p>
            {revoked && !block.approved ? (
              <Alert tone="warning" role="alert">
                {t('widget.approve.revoked')}
              </Alert>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

function WidgetView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const [nonce, setNonce] = useState(0)
  const [runtime, setRuntime] = useState('loading')
  const visible = isLearnerVisible(block)
  const version = useMemo(() => hashString(block.html || ''), [block.html])
  const src = visible ? widgetSrc({ labId: env.labId, shareCode: env.shareCode, blockId: block.id, version }) : null
  const { reportState } = env

  useEffect(() => {
    if (!visible) return
    reportState?.(block.id, { kind: 'widget', description: String(block.prompt || '').slice(0, 500), status: runtime })
  }, [visible, runtime, block.id, block.prompt, reportState])

  if (!src) {
    return (
      <BlockFrame block={block}>
        <Alert tone="neutral" title={t('widget.view.unavailableTitle')}>
          {t('widget.view.unavailable')}
        </Alert>
      </BlockFrame>
    )
  }
  return (
    <BlockFrame block={block}>
      <WidgetFrame
        key={nonce}
        src={src}
        title={t('widget.frameTitle', { title: block.title || t('blocks.types.widget') })}
        onSignal={(msg) => setRuntime(msg.status === 'error' ? 'error' : 'ready')}
        onSilent={() => setRuntime((r) => (r === 'loading' ? 'silent' : r))}
      />
      {runtime === 'error' || runtime === 'silent' ? (
        <Alert
          tone="warning"
          action={
            <Button
              size="sm"
              icon={RefreshCw}
              onClick={() => {
                setRuntime('loading')
                setNonce((n) => n + 1)
              }}
            >
              {t('common.actions.reload')}
            </Button>
          }
        >
          {t(runtime === 'error' ? 'widget.view.runtimeError' : 'widget.view.silent')}
        </Alert>
      ) : null}
      <p className="ai-note" style={{ margin: 0 }}>
        <ShieldCheck size={16} aria-hidden="true" />
        <span>{t('widget.view.note')}</span>
      </p>
    </BlockFrame>
  )
}

/**
 * AI-built interface (spec §9.5). Edit: describe → generate (Muse) → static checks →
 * sandbox run → teacher approval. View: approved + validated widgets only, in a sandboxed iframe.
 */
export default function WidgetBlock({ block, mode, onChange }) {
  if (mode === 'edit') return <WidgetEditor block={block} onChange={onChange} />
  return <WidgetView block={block} />
}
