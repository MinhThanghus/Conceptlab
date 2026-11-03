import { useT } from '../../i18n/index.jsx'
import { ProvenanceBadge, SliderField } from '../../components/ui/index.js'
import { useBlockEnv } from '../blocks/BlockEnv.jsx'
import { effectiveRange, paramLabel } from './paramUtils.js'

/**
 * Learner-facing parameter sliders (slider + number box), each with its unit and a
 * provenance badge (spec §11). A "document" badge opens the cited source when known.
 * `labelOf(p)` customises the label (simulations show textbook symbols such as θ₀).
 */
export function ParamControls({ params = [], values = {}, onChange, idPrefix = 'p', disabled = false, hideSymbols = [], labelOf = paramLabel }) {
  const { t } = useT()
  const env = useBlockEnv()
  const visible = params.filter((p) => p && p.symbol && p.role !== 'output' && !hideSymbols.includes(p.symbol))
  if (!visible.length) return <p className="small muted">{t('sim.params.none')}</p>
  return (
    <div className="ix-params">
      {visible.map((p) => {
        const r = effectiveRange(p)
        const value = Number.isFinite(values[p.symbol]) ? values[p.symbol] : r.value
        const ref = p.source_ref && p.source_ref.source_id ? p.source_ref : null
        return (
          <SliderField
            key={p.symbol}
            id={`${idPrefix}-${p.symbol}`.replace(/[^A-Za-z0-9_-]/g, '_')}
            label={labelOf(p)}
            unit={p.unit}
            value={value}
            min={r.min}
            max={r.max}
            step={r.step}
            digits={r.digits}
            disabled={disabled}
            badge={<ProvenanceBadge value={p.provenance} onClick={ref ? () => env.openSource(ref) : undefined} />}
            hint={p.role === 'constant' ? t('sim.params.constantHint') : undefined}
            onChange={(v) => onChange?.(p.symbol, v)}
          />
        )
      })}
    </div>
  )
}
