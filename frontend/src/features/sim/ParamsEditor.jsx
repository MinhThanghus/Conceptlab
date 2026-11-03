import { Plus, Trash2 } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button, Checkbox, IconButton, ProvenanceBadge, SelectField, TextField } from '../../components/ui/index.js'
import { PROVENANCES } from '../lab/specUtils.js'
import { SourceRefChips } from '../sources/SourceRefChips.jsx'
import { NumberInput } from './NumberInput.jsx'
import { paramIssues } from './paramUtils.js'

const ROLES = ['input', 'constant', 'output']
const LETTERS = 'abcdkmnpqrsuvwhjABCDKMNPQRS'.split('')

/** A fresh slider parameter with a symbol that is not used yet. */
export function newParam(existing = [], symbol) {
  const used = new Set(existing.map((p) => p.symbol))
  const sym = symbol || LETTERS.find((l) => !used.has(l)) || `p${existing.length + 1}`
  return { symbol: sym, name: '', unit: '', value: 1, min: -10, max: 10, step: 0.1, role: 'input', provenance: 'user', source_ref: null, confirmed: true }
}

/**
 * Teacher editor for Quantity params (symbol, name, unit, value, min, max, step, role,
 * provenance, confirmed). `locked` (simulations): symbol, unit and role are fixed by the
 * model and parameters cannot be added or removed.
 */
export function ParamsEditor({ params = [], onChange, locked = false, maxParams = 12, idPrefix = 'pe' }) {
  const { t } = useT()
  const update = (index, patch) => onChange(params.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  const remove = (index) => onChange(params.filter((_, i) => i !== index))
  const issueText = (issues, field) => {
    const hit = issues.find((i) => i.field === field)
    return hit ? t(`sim.paramEditor.issues.${hit.code}`) : undefined
  }

  return (
    <div className="stack">
      {!params.length ? <p className="small muted">{t('sim.paramEditor.empty')}</p> : null}
      {params.map((p, index) => {
        const issues = paramIssues(p, params)
        const base = `${idPrefix}-${index}`
        return (
          <fieldset key={index} className="ix-param-card" data-invalid={issues.length ? 'true' : undefined} style={{ margin: 0 }}>
            <legend className="visually-hidden">{t('sim.paramEditor.cardLabel', { symbol: p.symbol || '?' })}</legend>
            <header>
              <div className="row">
                <span className="ix-symbol" aria-hidden="true">
                  {p.symbol || '?'}
                </span>
                <strong className="break">{p.name || t('sim.paramEditor.unnamed')}</strong>
                <ProvenanceBadge value={p.provenance} />
              </div>
              {!locked ? <IconButton icon={Trash2} size="sm" label={t('sim.paramEditor.remove', { symbol: p.symbol || '?' })} onClick={() => remove(index)} /> : null}
            </header>
            <div className="ix-grid">
              {locked ? (
                <div className="field">
                  <span className="field-label">{t('sim.paramEditor.symbol')}</span>
                  <span className="mono">{p.symbol}</span>
                </div>
              ) : (
                <TextField
                  id={`${base}-symbol`}
                  label={t('sim.paramEditor.symbol')}
                  value={p.symbol || ''}
                  maxLength={20}
                  inputClassName="mono"
                  error={issueText(issues, 'symbol')}
                  onChange={(e) => update(index, { symbol: e.target.value.trim() })}
                />
              )}
              <TextField id={`${base}-name`} label={t('sim.paramEditor.name')} value={p.name || ''} maxLength={200} onChange={(e) => update(index, { name: e.target.value })} />
              {locked ? (
                <div className="field">
                  <span className="field-label">{t('sim.paramEditor.unit')}</span>
                  <span>{p.unit || t('sim.view.noValue')}</span>
                </div>
              ) : (
                <TextField id={`${base}-unit`} label={t('sim.paramEditor.unit')} value={p.unit || ''} maxLength={40} onChange={(e) => update(index, { unit: e.target.value })} />
              )}
              <NumberInput id={`${base}-value`} label={t('sim.paramEditor.value')} value={p.value} allowEmpty error={issueText(issues, 'value')} onChange={(v) => update(index, { value: v })} />
              <NumberInput id={`${base}-min`} label={t('sim.paramEditor.min')} value={p.min} allowEmpty onChange={(v) => update(index, { min: v })} />
              <NumberInput id={`${base}-max`} label={t('sim.paramEditor.max')} value={p.max} allowEmpty error={issueText(issues, 'max')} onChange={(v) => update(index, { max: v })} />
              <NumberInput id={`${base}-step`} label={t('sim.paramEditor.step')} value={p.step} allowEmpty error={issueText(issues, 'step')} onChange={(v) => update(index, { step: v })} />
              {locked ? null : (
                <SelectField
                  id={`${base}-role`}
                  label={t('sim.paramEditor.role')}
                  value={p.role || 'input'}
                  options={ROLES.map((r) => ({ value: r, label: t(`sim.paramEditor.roles.${r}`) }))}
                  onChange={(e) => update(index, { role: e.target.value })}
                />
              )}
              <SelectField
                id={`${base}-prov`}
                className="ix-wide-field"
                label={t('sim.paramEditor.provenance')}
                value={PROVENANCES.includes(p.provenance) ? p.provenance : 'unknown'}
                options={PROVENANCES.map((v) => ({ value: v, label: t(`common.provenance.${v}`) }))}
                onChange={(e) => update(index, { provenance: e.target.value })}
              />
            </div>
            <div className="row-between">
              <Checkbox id={`${base}-confirmed`} label={t('sim.paramEditor.confirmed')} checked={Boolean(p.confirmed)} onChange={(e) => update(index, { confirmed: e.target.checked })} />
              {p.source_ref ? <SourceRefChips refs={[p.source_ref]} label={t('sim.paramEditor.source')} /> : null}
            </div>
          </fieldset>
        )
      })}
      {!locked ? (
        <div>
          <Button icon={Plus} disabled={params.length >= maxParams} onClick={() => onChange([...params, newParam(params)])}>
            {t('sim.paramEditor.add')}
          </Button>
          {params.length >= maxParams ? <p className="field-hint">{t('sim.paramEditor.maxReached', { max: maxParams })}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
