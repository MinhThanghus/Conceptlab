import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button } from '../../../components/ui/index.js'

const DRAW_STEPS = ['stepDraw', 'stepCheck', 'stepFix']

/** Whole seconds since `startedAt` (kept by the task store, so a remounted editor keeps counting). */
function useElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return Math.max(0, Math.floor((now - (startedAt || now)) / 1000))
}

/**
 * The wait while the AI reads a photo (about 15 s) or redraws it (30 to 60 s): what is happening,
 * an indeterminate mint track (progress is mint), the elapsed time and a way out. Same language
 * as features/explorer/TranslationWait. A redraw names its stages; the server runs them in one
 * call, so the current one is estimated from the time (the third only happens on a mismatch).
 */
export function BoardWait({ kind, startedAt, photoSrc, onCancel }) {
  const { t } = useT()
  const titleId = useId()
  const headingRef = useRef(null)
  const seconds = useElapsed(startedAt)
  // The button that started the call made way for this wait: keep the keyboard here (and bring the
  // wait into view), but never take the focus from where the teacher already is.
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) headingRef.current?.focus()
  }, [])
  const drawing = kind === 'draw'
  const step = drawing ? (seconds < 26 ? 0 : seconds < 38 ? 1 : 2) : -1
  const slow = seconds >= (drawing ? 75 : 25)
  return (
    <div className="bd-wait" role="status" aria-busy="true" aria-labelledby={titleId} data-kind={kind}>
      {photoSrc ? (
        <div className="bd-wait-photo" aria-hidden="true">
          <img src={photoSrc} alt="" decoding="async" draggable={false} />
          <span className="bd-wait-scan" />
        </div>
      ) : null}
      <div className="bd-wait-body">
        <h4 id={titleId} ref={headingRef} tabIndex={-1} className="bd-wait-title">
          {drawing ? t('board.draw.waitTitle') : t('board.read.title')}
        </h4>
        <p className="bd-wait-text">{drawing ? t('board.draw.waitBody') : t('board.read.body')}</p>
        {drawing ? (
          <>
            <ol className="bd-wait-steps" aria-hidden="true">
              {DRAW_STEPS.map((key, i) => (
                <li key={key} className={i < step ? 'is-past' : i === step ? 'is-current' : undefined}>
                  <span className="bd-wait-dot" />
                  {t(`board.draw.${key}`)}
                </li>
              ))}
            </ol>
            <p className="visually-hidden">{t('board.draw.stepNow', { step: t(`board.draw.${DRAW_STEPS[step]}`) })}</p>
          </>
        ) : null}
        <div className="bd-track" aria-hidden="true">
          <span />
        </div>
        <p className="bd-elapsed" aria-hidden="true">
          {t('board.wait.elapsed', { n: seconds })}
        </p>
        {slow ? <p className="bd-slow">{drawing ? t('board.draw.slow') : t('board.read.slow')}</p> : null}
        <div className="bd-wait-actions">
          <Button icon={X} onClick={onCancel}>
            {t('common.actions.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
