import { CircleHelp, FileText, Lightbulb, MapPin, MapPinOff, Sparkles, User } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'

const PROV_ICONS = { document: FileText, user: User, assumption: Lightbulb, unknown: CircleHelp }

/** Provenance label (spec §11). Always icon + text, never colour alone. */
export function ProvenanceBadge({ value = 'unknown', onClick, compact }) {
  const { t } = useT()
  const kind = PROV_ICONS[value] ? value : 'unknown'
  const Icon = PROV_ICONS[kind]
  const label = t(`common.provenance.${kind}`)
  const hint = t(`common.provenance.${kind}Hint`)
  const content = (
    <>
      <Icon aria-hidden="true" />
      {compact ? <span className="visually-hidden">{label}</span> : label}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={`prov prov-${kind}`} onClick={onClick} title={hint}>
        {content}
      </button>
    )
  }
  return (
    <span className={`prov prov-${kind}`} title={hint}>
      {content}
    </span>
  )
}

export function LocatedBadge({ located = 'none' }) {
  const { t } = useT()
  const Icon = located === 'none' ? MapPinOff : MapPin
  const tone = located === 'exact' ? 'badge-info' : located === 'approximate' ? 'badge-warning' : 'badge-outline'
  return (
    <span className={`badge ${tone}`}>
      <Icon aria-hidden="true" />
      {t(`common.located.${located}`)}
    </span>
  )
}

export function SubjectBadge({ subject }) {
  const { t } = useT()
  return (
    <span className="badge badge-outline">{t(`common.subjects.${subject}`)}</span>
  )
}

export function StatusBadge({ status }) {
  const { t } = useT()
  const tone = status === 'published' ? 'badge-success' : status === 'archived' ? 'badge-outline' : 'badge-warning'
  return <span className={`badge ${tone}`}>{t(`common.status.${status}`)}</span>
}

export function SpaceBadge({ space }) {
  const { t } = useT()
  return <span className={`badge ${space === 'paper2explorer' ? 'badge-paper' : 'badge-primary'}`}>{t(`common.spaces.${space}`)}</span>
}

export function AIBadge({ label }) {
  const { t } = useT()
  return (
    <span className="badge badge-paper" title={t('common.ai.generatedLabel')}>
      <Sparkles aria-hidden="true" />
      {label || t('blocks.aiGenerated')}
    </span>
  )
}

export function Badge({ tone, children, icon: Icon, title }) {
  return (
    <span className={['badge', tone && `badge-${tone}`].filter(Boolean).join(' ')} title={title}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
