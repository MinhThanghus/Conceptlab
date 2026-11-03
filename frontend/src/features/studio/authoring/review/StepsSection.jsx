import { memo, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Alert, Button, IconButton, TextArea, TextField } from '../../../../components/ui/index.js'
import { newId } from '../../../lab/specUtils.js'
import { SourceRefChips } from '../../../sources/SourceRefChips.jsx'
import { itemKeys, moveInList, removeAt, replaceAt } from '../review.js'
import { focusById, ItemShell, MoveButtons, ReviewSection, useReview } from './shared.jsx'

const StepCard = memo(function StepCard({ step, index, count }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const change = useCallback((patch) => setResult((r) => ({ ...r, steps: replaceAt(r.steps, index, { ...r.steps[index], ...patch }) })), [setResult, index])
  const name = step.title || t('review.steps.untitled', { n: index + 1 })
  const move = (from, to) => {
    setResult((r) => ({ ...r, steps: moveInList(r.steps, from, to) }))
    announce(t('review.steps.moved', { name, position: to + 1, count }))
  }
  return (
    <ItemShell
      title={
        <>
          <span className="au-step-badge" aria-hidden="true">
            {index + 1}
          </span>
          <span className="visually-hidden">{t('review.steps.position', { n: index + 1 })} </span>
          {name}
        </>
      }
      confirmed={step.confirmed}
      onConfirm={(v) => change({ confirmed: v })}
      confirmLabel={t('review.steps.confirm')}
      actions={
        <>
          <MoveButtons index={index} count={count} name={name} onMove={move} />
          <IconButton
            icon={Trash2}
            size="sm"
            label={t('review.steps.remove', { name })}
            onClick={() => {
              setResult((r) => ({ ...r, steps: removeAt(r.steps, index) }))
              announce(t('review.removed', { name }))
            }}
          />
        </>
      }
    >
      <TextField id={`review-step-${step.id || index}-title`} label={t('review.steps.titleLabel')} maxLength={200} value={step.title || ''} onChange={(e) => change({ title: e.target.value })} />
      <TextArea label={t('review.steps.body')} rows={3} maxLength={12000} value={step.description || ''} onChange={(e) => change({ description: e.target.value })} />
      <SourceRefChips refs={step.source_refs || []} label={t('review.evidence')} />
    </ItemShell>
  )
})

export function StepsSection({ steps, sequenceClear, progress }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const keys = itemKeys(steps, 's')
  return (
    <ReviewSection
      id="steps"
      title={t('review.steps.title')}
      description={t('review.steps.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          disabled={steps.length >= 40}
          onClick={() => {
            const id = newId('s')
            setResult((r) => ({ ...r, steps: [...r.steps, { id, title: '', description: '', source_refs: [], confirmed: false }] }))
            announce(t('review.steps.added'))
            focusById(`review-step-${id}-title`)
          }}
        >
          {t('review.steps.add')}
        </Button>
      }
    >
      {steps.length >= 2 ? (
        <div className={['au-sequence', sequenceClear ? 'is-ok' : 'is-warn'].join(' ')}>
          {!sequenceClear ? (
            <Alert tone="warning" title={t('review.steps.unclearTitle')}>
              {t('review.steps.unclearBody')}
            </Alert>
          ) : null}
          <label className="check au-confirm">
            <input type="checkbox" checked={sequenceClear} onChange={(e) => setResult((r) => ({ ...r, sequence_clear: e.target.checked }))} />
            <span>
              {t('review.steps.confirmSequence')}
              <span className="field-hint" style={{ display: 'block' }}>
                {t('review.steps.confirmSequenceHint')}
              </span>
            </span>
          </label>
        </div>
      ) : null}
      {steps.length ? (
        <ol className="list-reset stack">
          {steps.map((s, i) => (
            <li key={keys[i]}>
              <StepCard step={s} index={i} count={steps.length} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.steps.empty')}
        </p>
      )}
    </ReviewSection>
  )
}

const RelationCard = memo(function RelationCard({ relation, index, listId }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const change = useCallback((patch) => setResult((r) => ({ ...r, relations: replaceAt(r.relations, index, { ...r.relations[index], ...patch }) })), [setResult, index])
  const name = relation.source || relation.target ? `${relation.source || '?'} → ${relation.target || '?'}` : t('review.relations.item', { n: index + 1 })
  return (
    <ItemShell
      title={name}
      confirmed={relation.confirmed}
      onConfirm={(v) => change({ confirmed: v })}
      confirmLabel={t('review.relations.confirm')}
      actions={
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('review.relations.remove', { name })}
          onClick={() => {
            setResult((r) => ({ ...r, relations: removeAt(r.relations, index) }))
            announce(t('review.removed', { name }))
          }}
        />
      }
    >
      <div className="au-two">
        <TextField id={`review-relation-${relation.id || index}-source`} label={t('review.relations.source')} maxLength={200} list={listId} value={relation.source || ''} onChange={(e) => change({ source: e.target.value })} />
        <TextField label={t('review.relations.target')} maxLength={200} list={listId} value={relation.target || ''} onChange={(e) => change({ target: e.target.value })} />
      </div>
      <TextArea label={t('review.relations.description')} rows={2} maxLength={2000} value={relation.description || ''} onChange={(e) => change({ description: e.target.value })} />
      <SourceRefChips refs={relation.source_refs || []} label={t('review.evidence')} />
    </ItemShell>
  )
})

export function RelationsSection({ relations, suggestions, progress }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const keys = itemKeys(relations, 'r')
  const listId = 'au-relation-suggestions'
  return (
    <ReviewSection
      id="relations"
      title={t('review.relations.title')}
      description={t('review.relations.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          disabled={relations.length >= 60}
          onClick={() => {
            const id = newId('r')
            setResult((r) => ({ ...r, relations: [...r.relations, { id, source: '', target: '', description: '', source_refs: [], confirmed: false }] }))
            announce(t('review.relations.added'))
            focusById(`review-relation-${id}-source`)
          }}
        >
          {t('review.relations.add')}
        </Button>
      }
    >
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {relations.length ? (
        <div className="stack">
          {relations.map((rel, i) => (
            <RelationCard key={keys[i]} relation={rel} index={i} listId={listId} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.relations.empty')}
        </p>
      )}
    </ReviewSection>
  )
}
