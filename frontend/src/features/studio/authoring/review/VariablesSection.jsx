import { memo, useCallback, useState } from 'react'
import { CircleCheck, CircleDashed, Plus, SlidersHorizontal, Trash2, User } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Button, IconButton, ProvenanceBadge } from '../../../../components/ui/index.js'
import { PROVENANCES } from '../../../lab/specUtils.js'
import { SourceRefChips } from '../../../sources/SourceRefChips.jsx'
import { DecimalInput } from '../DecimalInput.jsx'
import { blankVariable, removeAt, replaceAt } from '../review.js'
import { focusById, ReviewSection, useReview } from './shared.jsx'

const ROLES = ['input', 'output', 'constant']

const VariableRow = memo(function VariableRow({ variable, index }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const [rangeOpen, setRangeOpen] = useState(false)
  const [editedDocValue, setEditedDocValue] = useState(false)
  const v = variable
  const change = useCallback((patch) => setResult((r) => ({ ...r, variables: replaceAt(r.variables, index, { ...r.variables[index], ...patch }) })), [setResult, index])
  const name = v.symbol || t('review.variables.unnamed')
  const rowId = `review-var-${index}`
  const hasRef = Boolean(v.source_ref?.source_id)

  return (
    <div className={['au-var-row', v.confirmed ? 'is-confirmed' : ''].filter(Boolean).join(' ')} role="group" aria-label={t('review.variables.rowLabel', { symbol: name })}>
      <label className="au-cell vr-symbol">
        <span className="au-cell-label">{t('review.variables.symbol')}</span>
        <input id={`${rowId}-symbol`} className="input input-sm mono" value={v.symbol || ''} maxLength={200} onChange={(e) => change({ symbol: e.target.value })} />
      </label>
      <label className="au-cell vr-name">
        <span className="au-cell-label">{t('review.variables.name')}</span>
        <input className="input input-sm" value={v.name || ''} maxLength={200} onChange={(e) => change({ name: e.target.value })} />
      </label>
      <label className="au-cell vr-value">
        <span className="au-cell-label">{t('review.variables.value')}</span>
        <DecimalInput
          className="input-sm"
          value={v.value}
          onChange={(n) => {
            if (v.provenance === 'document') setEditedDocValue(true)
            change({ value: n })
          }}
        />
      </label>
      <label className="au-cell vr-unit">
        <span className="au-cell-label">{t('review.variables.unit')}</span>
        <input className="input input-sm" value={v.unit || ''} maxLength={40} onChange={(e) => change({ unit: e.target.value })} />
      </label>
      <label className="au-cell vr-role">
        <span className="au-cell-label">{t('review.variables.role')}</span>
        <select className="select input-sm" value={v.role || 'input'} onChange={(e) => change({ role: e.target.value })}>
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`review.variables.roles.${role}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="au-cell vr-prov">
        <label className="au-prov-select">
          <span className="au-cell-label">{t('review.variables.provenance')}</span>
          <select
            className="select input-sm"
            value={PROVENANCES.includes(v.provenance) ? v.provenance : 'unknown'}
            onChange={(e) => {
              setEditedDocValue(false)
              change({ provenance: e.target.value })
            }}
          >
            {PROVENANCES.map((p) => (
              <option key={p} value={p}>
                {t(`common.provenance.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <ProvenanceBadge compact value={PROVENANCES.includes(v.provenance) ? v.provenance : 'unknown'} />
      </div>
      <div className="au-cell vr-actions">
        <label className="check au-confirm-mini">
          <input type="checkbox" checked={Boolean(v.confirmed)} onChange={(e) => change({ confirmed: e.target.checked })} />
          <span>
            {v.confirmed ? <CircleCheck aria-hidden="true" className="au-ok-icon" /> : <CircleDashed aria-hidden="true" className="au-wait-icon" />}
            {t('review.variables.checked')}
          </span>
        </label>
        <IconButton icon={SlidersHorizontal} size="sm" label={t('review.variables.range', { name })} aria-expanded={rangeOpen} pressed={rangeOpen} onClick={() => setRangeOpen((o) => !o)} />
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('review.variables.remove', { name })}
          onClick={() => {
            setResult((r) => ({ ...r, variables: removeAt(r.variables, index) }))
            announce(t('review.removed', { name }))
          }}
        />
      </div>
      {hasRef ? (
        <div className="vr-ref">
          <SourceRefChips refs={[v.source_ref]} label={t('review.evidence')} />
        </div>
      ) : null}
      {editedDocValue && v.provenance === 'document' ? (
        <div className="vr-hint au-inline-warn" role="status">
          <span>{t('review.variables.editedDocument')}</span>
          <Button
            size="sm"
            icon={User}
            onClick={() => {
              change({ provenance: 'user' })
              setEditedDocValue(false)
            }}
          >
            {t('review.variables.markUser')}
          </Button>
        </div>
      ) : null}
      {rangeOpen ? (
        <div className="vr-range" role="group" aria-label={t('review.variables.rangeLabel', { name })}>
          <p className="tiny muted" style={{ margin: 0 }}>
            {t('review.variables.rangeHint')}
          </p>
          <div className="vr-range-fields">
            {['min', 'max', 'step'].map((key) => (
              <label key={key} className="au-cell">
                <span className="au-cell-label is-visible">{t(`review.variables.${key}`)}</span>
                <DecimalInput className="input-sm" value={v[key]} onChange={(n) => change({ [key]: n })} />
              </label>
            ))}
          </div>
          {typeof v.min === 'number' && typeof v.max === 'number' && v.min >= v.max ? <p className="field-error" style={{ margin: 0 }}>{t('review.variables.rangeError')}</p> : null}
          {typeof v.value === 'number' && ((typeof v.min === 'number' && v.value < v.min) || (typeof v.max === 'number' && v.value > v.max)) ? (
            <p className="small au-warn" style={{ margin: 0 }}>
              {t('review.variables.outOfRange')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
})

export function VariablesSection({ variables, progress }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const duplicates = variables.map((v) => v?.symbol).filter((s, i, list) => s && list.indexOf(s) !== i)
  return (
    <ReviewSection
      id="variables"
      title={t('review.variables.title')}
      description={t('review.variables.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          disabled={variables.length >= 40}
          onClick={() => {
            const index = variables.length
            setResult((r) => ({ ...r, variables: [...r.variables, blankVariable('', { provenance: 'user' })] }))
            announce(t('review.variables.added'))
            focusById(`review-var-${index}-symbol`)
          }}
        >
          {t('review.variables.add')}
        </Button>
      }
    >
      {variables.length ? (
        <div className="au-var-table">
          <div className="au-var-head" aria-hidden="true">
            <span>{t('review.variables.symbol')}</span>
            <span>{t('review.variables.name')}</span>
            <span>{t('review.variables.value')}</span>
            <span>{t('review.variables.unit')}</span>
            <span>{t('review.variables.role')}</span>
            <span>{t('review.variables.provenance')}</span>
            <span />
          </div>
          {variables.map((v, i) => (
            <VariableRow key={i} variable={v} index={i} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.variables.empty')}
        </p>
      )}
      {duplicates.length ? <p className="small au-warn" style={{ margin: 0 }}>{t('review.variables.duplicates', { list: [...new Set(duplicates)].join(', ') })}</p> : null}
    </ReviewSection>
  )
}
