import { useT } from '../../../i18n/index.jsx'
import { LinkButton } from '../../../components/ui/index.js'
import { useLab } from '../../lab/LabContext.jsx'

/**
 * Heading of an authoring step: the step's title, one line on what it does, and its actions.
 * The stepper above already names the step and its number, so nothing sits above the title.
 */
export function StepHeader({ step, title, description, actions }) {
  return (
    <header className="au-step-header" data-step={step}>
      <div className="au-step-text">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="au-step-actions">{actions}</div> : null}
    </header>
  )
}

/**
 * The way on to the next step, at the foot of a step: a hairline, a line of text and a button.
 * `primary` makes the button the screen's one pear action (only when nothing else on the
 * screen is); a disabled next step is always card stock.
 */
export function NextStepCard({ to, step, description, label, disabled, note, noteTone = 'warning', onNavigate, primary = false }) {
  const { t } = useT()
  const { flush } = useLab()
  return (
    <section className="au-next" aria-label={t('build.shared.nextAria')}>
      <div>
        <p className="au-next-title">
          <span>{t('build.shared.next')}:</span> {t(`studio.steps.${step}`)}
        </p>
        {description ? <p className="au-next-desc">{description}</p> : null}
        {note ? <p className={['au-next-note', noteTone === 'success' ? 'is-success' : ''].filter(Boolean).join(' ')}>{note}</p> : null}
      </div>
      <LinkButton
        to={to}
        variant={primary && !disabled ? 'primary' : undefined}
        onClick={() => {
          flush().catch(() => {})
          onNavigate?.()
        }}
      >
        {label || t('build.shared.goTo', { step: t(`studio.steps.${step}`) })}
      </LinkButton>
    </section>
  )
}
