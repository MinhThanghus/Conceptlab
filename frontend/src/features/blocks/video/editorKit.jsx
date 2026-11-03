import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { AIBadge, Switch, TextArea, TextField } from '../../../components/ui/index.js'

/**
 * State for one AI request with cancel: { busy, error, run(fn(signal)), cancel, clearError }.
 * `run` resolves to the response, or null when it failed or was cancelled (error is kept).
 */
export function useAiTask() {
  const [state, setState] = useState({ busy: false, error: null })
  const ctrl = useRef(null)
  useEffect(() => () => ctrl.current?.abort(), [])
  const run = useCallback(async (fn) => {
    ctrl.current?.abort()
    const controller = new AbortController()
    ctrl.current = controller
    setState({ busy: true, error: null })
    try {
      const result = await fn(controller.signal)
      if (controller.signal.aborted) return null
      setState({ busy: false, error: null })
      return result
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        setState({ busy: false, error: null })
        return null
      }
      setState({ busy: false, error })
      return null
    } finally {
      if (ctrl.current === controller) ctrl.current = null
    }
  }, [])
  const cancel = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = null
    setState({ busy: false, error: null })
  }, [])
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), [])
  return { ...state, run, cancel, clearError }
}

/** Title, description and the teacher's "reviewed" flag shared by the video and field editors. */
export function BlockMetaFields({ block, onChange, confirmHint }) {
  const { t } = useT()
  return (
    <div className="stack-sm">
      <div className="grid-2" style={{ gap: 'var(--cl-space-3)' }}>
        <TextField label={t('blocks.titleLabel')} value={block.title || ''} maxLength={200} onChange={(e) => onChange({ ...block, title: e.target.value })} />
        <TextArea label={t('blocks.descriptionLabel')} rows={2} value={block.description || ''} maxLength={2000} onChange={(e) => onChange({ ...block, description: e.target.value })} />
      </div>
      <div className="row" style={{ gap: '0.5rem 0.75rem' }}>
        {block.ai_generated ? <AIBadge /> : null}
        <Switch label={t('blocks.confirmed')} checked={Boolean(block.confirmed)} onChange={(e) => onChange({ ...block, confirmed: e.target.checked })} />
        {confirmHint ? <span className="small muted">{confirmHint}</span> : null}
      </div>
    </div>
  )
}
