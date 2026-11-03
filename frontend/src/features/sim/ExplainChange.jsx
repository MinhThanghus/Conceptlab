import { useEffect, useRef, useState } from 'react'
import { Info, MessageCircleQuestion } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { AIBadge, Button, ErrorMessage, RichText } from '../../components/ui/index.js'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'

/**
 * "Explain what changed" — asks Muse (POST env.aiPath('explain-change')) to explain the
 * difference between two states of an interactive block:
 *   { block_id, before: { params, features|outputs }, after: { … } } → { explanation }
 * When AI is not available the button is replaced by an honest note (never hidden silently).
 */
export function ExplainChange({ blockId, before, after, changed, compareLabel }) {
  const { t } = useT()
  const env = useBlockEnv()
  const path = env.aiPath ? env.aiPath('explain-change') : null
  const [status, setStatus] = useState('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [askedKey, setAskedKey] = useState(null)
  const abortRef = useRef(null)
  const key = JSON.stringify([before, after])

  useEffect(() => () => abortRef.current?.abort(), [])

  if (!env.aiAvailable || !path) {
    return (
      <p className="ix-ai-off">
        <Info aria-hidden="true" />
        <span>{t('sim.explain.unavailable')}</span>
      </p>
    )
  }

  const run = async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    setError(null)
    try {
      const res = await post(path, { block_id: blockId, before, after }, { signal: controller.signal })
      setText(String(res?.explanation || '').trim() || t('sim.explain.empty'))
      setAskedKey(key)
      setStatus('done')
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError(err)
      setStatus('error')
    }
  }

  const stale = status === 'done' && askedKey !== key
  return (
    <div className="stack-sm">
      <div className="row">
        <Button icon={MessageCircleQuestion} loading={status === 'loading'} disabled={!changed} onClick={run}>
          {status === 'done' ? t('sim.explain.again') : t('sim.explain.button')}
        </Button>
        <span className="ix-sub">{changed ? compareLabel : t('sim.explain.changeFirst')}</span>
      </div>
      {status === 'loading' ? (
        <p className="ix-sub" role="status">
          {t('common.ai.working')}
        </p>
      ) : null}
      {status === 'error' ? <ErrorMessage error={error} onRetry={run} /> : null}
      {status === 'done' ? (
        <div className="ix-ai-answer" aria-live="polite">
          <div className="row">
            <AIBadge label={t('sim.explain.aiLabel')} />
            {stale ? <span className="badge badge-warning">{t('sim.explain.stale')}</span> : null}
          </div>
          <RichText text={text} />
          <p className="ai-note">
            <Info aria-hidden="true" />
            {t('sim.explain.checkSources')}
          </p>
        </div>
      ) : null}
    </div>
  )
}
