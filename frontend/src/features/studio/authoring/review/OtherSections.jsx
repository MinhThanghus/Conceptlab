import { memo, useCallback, useState } from 'react'
import { CircleCheck, CircleHelp, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Button, IconButton, ProvenanceBadge, TextArea, TextField } from '../../../../components/ui/index.js'
import { newId } from '../../../lab/specUtils.js'
import { DecimalInput } from '../DecimalInput.jsx'
import { itemKeys, nameSourceRefs, removeAt, reopenMissing, replaceAt, resolveMissing } from '../review.js'
import { focusById, ItemShell, ReviewSection, useReview } from './shared.jsx'

export function TopicSection({ topic, summary, confirmed, onConfirm, progress }) {
  const { t } = useT()
  const { setResult } = useReview()
  return (
    <ReviewSection id="topic" title={t('review.topic.title')} description={t('review.topic.desc')} progress={progress}>
      <ItemShell title={t('review.topic.item')} confirmed={confirmed} onConfirm={onConfirm} confirmLabel={t('review.topic.confirm')}>
        <TextField label={t('review.topic.topicLabel')} maxLength={200} value={topic} onChange={(e) => setResult((r) => ({ ...r, topic: e.target.value }))} />
        <TextArea label={t('review.topic.summaryLabel')} rows={4} maxLength={12000} value={summary} onChange={(e) => setResult((r) => ({ ...r, summary: e.target.value }))} />
      </ItemShell>
    </ReviewSection>
  )
}

const MissingCard = memo(function MissingCard({ item, index, unitFor, valueFor, titles }) {
  const { t, fmt } = useT()
  const { setResult, announce } = useReview()
  const [symbol, setSymbol] = useState(item.symbol || '')
  const [value, setValue] = useState(null)
  const [unit, setUnit] = useState(() => unitFor(item.symbol) || '')
  const [error, setError] = useState(null)
  const idBase = `review-missing-${item.id || index}`

  const text = nameSourceRefs(item.text, titles)
  if (item.resolved) {
    const used = item.symbol ? valueFor?.(item.symbol) : null
    return (
      <div className="au-missing is-resolved">
        <CircleCheck aria-hidden="true" />
        <div style={{ minInlineSize: 0, flex: 1 }}>
          <p style={{ margin: 0 }}>{text}</p>
          <p className="tiny muted" style={{ margin: 0 }}>
            {used
              ? t('review.missing.resolvedValue', { symbol: item.symbol, value: [fmt.number(used.value), used.unit].filter(Boolean).join(/^[°%]$/.test(used.unit || '') ? '' : ' ') })
              : item.symbol
                ? t('review.missing.resolvedWith', { symbol: item.symbol })
                : t('review.missing.resolved')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={RotateCcw}
          onClick={() => {
            setResult((r) => reopenMissing(r, index))
            announce(t('review.missing.reopened'))
          }}
        >
          {t('review.missing.reopen')}
        </Button>
      </div>
    )
  }

  const applyValue = () => {
    const sym = symbol.trim()
    if (!sym) {
      setError(t('review.missing.errSymbol'))
      return
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      setError(t('review.missing.errValue'))
      return
    }
    setError(null)
    setResult((r) => resolveMissing(r, index, { symbol: sym, value, unit: unit.trim() }))
    announce(t('review.missing.used', { symbol: sym }))
  }

  return (
    <article className="au-missing" aria-labelledby={`${idBase}-text`}>
      <p className="au-missing-text" id={`${idBase}-text`}>
        <CircleHelp aria-hidden="true" />
        <span>{text}</span>
      </p>
      <div className="au-missing-form">
        <label className="au-cell">
          <span className="au-cell-label is-visible">{t('review.variables.symbol')}</span>
          <input className="input input-sm mono" value={symbol} maxLength={200} onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <label className="au-cell">
          <span className="au-cell-label is-visible">{t('review.variables.value')}</span>
          <DecimalInput className="input-sm" value={value} onChange={setValue} invalid={Boolean(error && error === t('review.missing.errValue'))} />
        </label>
        <label className="au-cell">
          <span className="au-cell-label is-visible">{t('review.variables.unit')}</span>
          <input className="input input-sm" value={unit} maxLength={40} onChange={(e) => setUnit(e.target.value)} />
        </label>
        <Button size="sm" onClick={applyValue}>
          {t('review.missing.use')}
        </Button>
      </div>
      {error ? (
        <p className="field-error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="row-between" style={{ gap: '0.5rem' }}>
        <span className="tiny muted au-prov-inline">
          {t('review.missing.labelNote')} <ProvenanceBadge value="user" />
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setResult((r) => resolveMissing(r, index, {}))
            announce(t('review.missing.markedResolved'))
          }}
        >
          {t('review.missing.notNeeded')}
        </Button>
      </div>
    </article>
  )
})

export function MissingSection({ missing, unitFor, valueFor, titles, progress }) {
  const { t } = useT()
  const keys = itemKeys(missing, 'm')
  return (
    <ReviewSection id="missing" title={t('review.missing.title')} description={t('review.missing.desc')} progress={progress}>
      {missing.length ? (
        <div className="stack-sm">
          {missing.map((m, i) => (
            <MissingCard key={keys[i]} item={m} index={i} unitFor={unitFor} valueFor={valueFor} titles={titles} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.missing.empty')}
        </p>
      )}
    </ReviewSection>
  )
}

const AssumptionRow = memo(function AssumptionRow({ item, index }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const change = useCallback((patch) => setResult((r) => ({ ...r, assumptions: replaceAt(r.assumptions, index, { ...r.assumptions[index], ...patch }) })), [setResult, index])
  const name = item.text ? (item.text.length > 40 ? `${item.text.slice(0, 40)}…` : item.text) : t('review.assumptions.item', { n: index + 1 })
  return (
    <ItemShell
      title={t('review.assumptions.item', { n: index + 1 })}
      confirmed={item.confirmed}
      onConfirm={(v) => change({ confirmed: v })}
      confirmLabel={t('review.assumptions.confirm')}
      actions={
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('review.assumptions.remove', { name })}
          onClick={() => {
            setResult((r) => ({ ...r, assumptions: removeAt(r.assumptions, index) }))
            announce(t('review.removed', { name }))
          }}
        />
      }
    >
      <TextArea id={`review-assumption-${item.id || index}`} label={t('review.assumptions.text')} rows={2} maxLength={2000} value={item.text || ''} onChange={(e) => change({ text: e.target.value })} />
    </ItemShell>
  )
})

export function AssumptionsSection({ assumptions, progress }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const keys = itemKeys(assumptions, 'a')
  return (
    <ReviewSection
      id="assumptions"
      title={t('review.assumptions.title')}
      description={t('review.assumptions.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          disabled={assumptions.length >= 30}
          onClick={() => {
            const id = newId('a')
            setResult((r) => ({ ...r, assumptions: [...r.assumptions, { id, text: '', confirmed: false }] }))
            announce(t('review.assumptions.added'))
            focusById(`review-assumption-${id}`)
          }}
        >
          {t('review.assumptions.add')}
        </Button>
      }
    >
      <p className="small muted" style={{ margin: 0 }}>
        <ProvenanceBadge value="assumption" /> {t('review.assumptions.examples')}
      </p>
      {assumptions.length ? (
        <div className="stack">
          {assumptions.map((a, i) => (
            <AssumptionRow key={keys[i]} item={a} index={i} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.assumptions.empty')}
        </p>
      )}
    </ReviewSection>
  )
}

export function WarningsSection({ warnings, titles }) {
  const { t } = useT()
  if (!warnings.length) return null
  return (
    <ReviewSection id="warnings" title={t('review.warnings.title')} description={t('review.warnings.desc')}>
      <ul className="au-warning-list">
        {warnings.map((w, i) => (
          <li key={i}>
            <TriangleAlert aria-hidden="true" />
            <span>{nameSourceRefs(w, titles)}</span>
          </li>
        ))}
      </ul>
    </ReviewSection>
  )
}
