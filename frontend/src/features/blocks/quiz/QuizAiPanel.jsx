import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDown, WandSparkles } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { Alert, Button, Checkbox, ErrorMessage, SelectField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { useOptionalLab } from '../steps/lessonHooks.js'
import { LIMITS } from '../steps/lessonKit.js'
import { KINDS, MAX_AI_COUNT } from './quizModel.js'

/**
 * "Create questions with AI": POST /api/labs/{id}/ai/quiz {count, kinds, block_ids?}.
 * The returned questions are appended unapproved (`onGenerated(list)` → {added, dropped, firstId}).
 */
export function QuizAiPanel({ block, questionCount, onGenerated, onReveal }) {
  const { t } = useT()
  const env = useBlockEnv()
  const studio = useOptionalLab()
  const titleId = useId()
  const [count, setCount] = useState(5)
  const [kinds, setKinds] = useState(['mcq', 'truefalse'])
  const [scope, setScope] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const request = useRef(null)

  useEffect(() => () => request.current?.abort(), [])

  const path = env.aiPath?.('quiz') || null
  const room = Math.max(0, LIMITS.questions - questionCount)
  const max = Math.min(MAX_AI_COUNT, room)
  const wanted = Math.max(1, Math.min(count, max))
  const lessonBlocks = (studio?.lab?.spec?.blocks || []).filter((b) => b && b.id !== block.id && b.type !== 'quiz' && b.type !== 'widget')
  const scopeIds = scope.filter((id) => lessonBlocks.some((b) => b.id === id))

  const toggleKind = (kind, on) => setKinds((prev) => KINDS.filter((k) => (k === kind ? on : prev.includes(k))))
  const toggleScope = (id, on) => setScope((prev) => (on ? [...prev.filter((x) => x !== id), id] : prev.filter((x) => x !== id)))

  const generate = async () => {
    if (busy || !path || !kinds.length || !max) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError(null)
    setOutcome(null)
    try {
      // the server reads the saved lab: send pending edits first
      if (studio?.flush) await studio.flush()
      if (controller.signal.aborted) return
      const body = { count: wanted, kinds }
      if (scopeIds.length) body.block_ids = scopeIds
      const res = await post(path, body, { signal: controller.signal })
      if (controller.signal.aborted) return
      const list = Array.isArray(res?.questions) ? res.questions : []
      const { added, dropped, firstId } = onGenerated(list)
      setOutcome({ added, dropped, firstId, requested: wanted })
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err)
    } finally {
      if (request.current === controller) {
        request.current = null
        setBusy(false)
      }
    }
  }

  const cancel = () => {
    request.current?.abort()
    request.current = null
    setBusy(false)
    setOutcome({ cancelled: true })
  }

  const available = Boolean(env.aiAvailable && path)

  return (
    <section className="lk-subcard qz-ai" aria-labelledby={titleId}>
      <h3 id={titleId} className="lk-subcard-title">
        <WandSparkles aria-hidden="true" />
        {t('quiz.ai.title')}
      </h3>
      <p className="lk-hint">{t('quiz.ai.intro')}</p>

      {!available ? (
        <Alert tone="neutral">{t('quiz.ai.unavailable')}</Alert>
      ) : !max ? (
        <p className="lk-hint">{t('quiz.ai.full', { max: LIMITS.questions })}</p>
      ) : (
        <>
          <div className="qz-ai-grid">
            <SelectField
              label={t('quiz.ai.count')}
              value={String(wanted)}
              disabled={busy}
              options={Array.from({ length: max }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              onChange={(event) => setCount(Number(event.target.value))}
            />
            <fieldset className="qz-fieldset" disabled={busy}>
              <legend className="field-label">{t('quiz.ai.kinds')}</legend>
              <div className="qz-check-grid">
                {KINDS.map((kind) => (
                  <Checkbox key={kind} label={t(`quiz.kinds.${kind}`)} checked={kinds.includes(kind)} onChange={(event) => toggleKind(kind, event.target.checked)} />
                ))}
              </div>
              {!kinds.length ? (
                <p className="field-error" role="alert">
                  {t('quiz.ai.kindsRequired')}
                </p>
              ) : null}
            </fieldset>
          </div>

          {lessonBlocks.length ? (
            <fieldset className="qz-fieldset" disabled={busy}>
              <legend className="field-label">{t('quiz.ai.scope')}</legend>
              <p className="lk-hint">{t('quiz.ai.scopeHint')}</p>
              <div className="qz-check-grid">
                {lessonBlocks.map((b) => (
                  <Checkbox
                    key={b.id}
                    label={b.title?.trim() || t(`blocks.types.${b.type}`)}
                    checked={scopeIds.includes(b.id)}
                    onChange={(event) => toggleScope(b.id, event.target.checked)}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="row">
            <Button variant="primary" icon={WandSparkles} loading={busy} disabled={!kinds.length} onClick={generate}>
              {busy ? t('quiz.ai.generating') : t('quiz.ai.generate', { count: wanted })}
            </Button>
            {busy ? (
              <Button variant="ghost" onClick={cancel}>
                {t('common.actions.cancel')}
              </Button>
            ) : null}
          </div>
          {busy ? (
            <p className="lk-hint" role="status">
              {t('quiz.ai.wait')}
            </p>
          ) : null}
        </>
      )}

      {outcome?.cancelled ? (
        <p className="lk-hint" role="status">
          {t('quiz.ai.cancelled')}
        </p>
      ) : outcome ? (
        outcome.added ? (
          <Alert tone="success" role="status" title={t('quiz.ai.addedTitle', { count: outcome.added })}>
            <p style={{ margin: 0 }}>
              {t('quiz.ai.addedBody')}
              {outcome.added < outcome.requested && !outcome.dropped ? ` ${t('quiz.ai.fewer', { count: outcome.added, requested: outcome.requested })}` : ''}
              {outcome.dropped ? ` ${t('quiz.ai.dropped', { count: outcome.dropped, max: LIMITS.questions })}` : ''}
            </p>
            {outcome.firstId ? (
              <Button size="sm" icon={ArrowDown} className="qz-ai-reveal" onClick={() => onReveal(outcome.firstId)}>
                {t('quiz.ai.reveal')}
              </Button>
            ) : null}
          </Alert>
        ) : (
          <Alert tone="warning" role="status">
            {t('quiz.ai.none')}
          </Alert>
        )
      ) : null}

      {error ? (
        error.code === 'analysis_required' ? (
          <Alert tone="warning" role="alert" title={t('quiz.ai.needContentTitle')}>
            {t('quiz.ai.needContentBody')}
          </Alert>
        ) : (
          <ErrorMessage error={error} onRetry={generate} />
        )
      ) : null}
    </section>
  )
}
