import { FileText, MapPinOff } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import './sourceRefs.css'

function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Clickable citation chips for SourceRefs. A ref with located='none' is labelled
 * honestly ("exact location could not be determined") instead of faking a link target.
 */
export function SourceRefChips({ refs = [], label, force = false }) {
  const { t } = useT()
  const env = useBlockEnv()
  if (!refs.length || (env.sourcesAtTop && !force)) return null
  return (
    <div className="src-refs">
      <span className="src-refs-label">{label || t('blocks.sources')}:</span>
      {refs.map((ref, i) => {
        const src = env.sourceById(ref.source_id)
        const parts = [src?.title || t('common.sourceKinds.pdf')]
        if (ref.page) parts.push(t('sources.refPage', { page: ref.page }))
        if (ref.time !== null && ref.time !== undefined) parts.push(clock(ref.time))
        const text = parts.join(', ')
        if (!src) {
          return (
            <span key={i} className="chip src-ref is-missing" title={ref.quote || ''}>
              <MapPinOff size={16} aria-hidden="true" />
              {t('common.located.none')}
            </span>
          )
        }
        const located = t(`common.located.${ref.located || 'none'}`)
        return (
          <button key={i} type="button" className="chip src-ref" title={ref.quote ? `“${ref.quote}” (${located})` : located} onClick={() => env.openSource(ref)}>
            {ref.located === 'none' ? <MapPinOff size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}
            <span className="src-ref-text">{text}</span>
          </button>
        )
      })}
    </div>
  )
}
