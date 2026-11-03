import { useEffect, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button } from '../../../components/ui/index.js'

const ROTATE_MS = 7000

/**
 * Honest waiting panel for long AI calls: an indeterminate bar (no fake percentage), the real
 * elapsed time, short messages about what the AI does (not a progress claim) and Cancel.
 * Screen readers hear the title once (no announcement every second).
 */
export function AiProgress({ title, messages = [], startedAt, note, onCancel, cancelLabel }) {
  const { t, fmt } = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const elapsed = Math.max(0, now - (startedAt || now))
  const message = messages.length ? messages[Math.floor(elapsed / ROTATE_MS) % messages.length] : null
  return (
    <section className="card au-progress" aria-busy="true">
      <p className="visually-hidden" role="status">
        {title}
      </p>
      <div className="au-progress-head">
        <LoaderCircle className="spin" aria-hidden="true" />
        <div style={{ minInlineSize: 0, flex: 1 }}>
          <h3 className="au-progress-title">{title}</h3>
          <p className="au-progress-time">{t('analyze.job.elapsed', { time: fmt.duration(elapsed) })}</p>
        </div>
        {onCancel ? (
          <Button icon={X} onClick={onCancel} className="au-progress-cancel">
            {cancelLabel || t('analyze.job.cancel')}
          </Button>
        ) : null}
      </div>
      <div className="au-indeterminate" aria-hidden="true">
        <span />
      </div>
      {message ? (
        <p className="au-progress-stage" aria-hidden="true" key={message}>
          {message}
        </p>
      ) : null}
      <p className="au-progress-note">{note}</p>
      <p className="au-progress-honest">{t('analyze.job.honest')}</p>
    </section>
  )
}
