import { memo, useCallback } from 'react'
import { Plus, ScanSearch, Scissors, Trash2, X } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Button, IconButton, TextArea, TextField } from '../../../../components/ui/index.js'
import { newId } from '../../../lab/specUtils.js'
import { SourceRefChips } from '../../../sources/SourceRefChips.jsx'
import { itemKeys, removeAt, replaceAt } from '../review.js'
import { focusById, ItemShell, ReviewSection, useReview } from './shared.jsx'

const ObjectCard = memo(function ObjectCard({ object, index, samReason }) {
  const { t } = useT()
  const { setResult, announce, openSam, assetUrl, sourceTitle } = useReview()
  const change = useCallback((patch) => setResult((r) => ({ ...r, objects: replaceAt(r.objects, index, { ...r.objects[index], ...patch }) })), [setResult, index])
  const name = object.name || t('review.objects.item', { n: index + 1 })
  const idBase = `review-object-${object.id || index}`
  const url = object.asset_id ? assetUrl(object.asset_id) : null
  return (
    <ItemShell
      title={name}
      confirmed={object.confirmed}
      onConfirm={(v) => change({ confirmed: v })}
      confirmLabel={t('review.objects.confirm')}
      actions={
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('review.objects.remove', { name })}
          onClick={() => {
            setResult((r) => ({ ...r, objects: removeAt(r.objects, index) }))
            announce(t('review.removed', { name }))
          }}
        />
      }
    >
      <div className="au-object-grid">
        <div className="au-object-media">
          {url ? (
            <figure className="au-cutout">
              <img src={url} alt={t('review.objects.cutoutAlt', { name })} loading="lazy" />
              <figcaption className="tiny muted">
                {object.source_id ? t('review.objects.cutoutFrom', { title: sourceTitle(object.source_id) }) : t('review.objects.cutout')}
              </figcaption>
            </figure>
          ) : (
            <div className="au-cutout-empty">
              <Scissors aria-hidden="true" />
              <span className="small">{t('review.objects.noCutout')}</span>
            </div>
          )}
          <Button size="sm" icon={ScanSearch} variant={url ? undefined : 'soft'} disabled={Boolean(samReason)} onClick={() => openSam(index)}>
            {url ? t('review.objects.reselect') : t('review.objects.select')}
          </Button>
          {url ? (
            <Button size="sm" variant="ghost" icon={X} onClick={() => change({ asset_id: null, source_id: null })}>
              {t('review.objects.clearCutout')}
            </Button>
          ) : null}
          {samReason ? <p className="tiny muted" style={{ margin: 0 }}>{samReason}</p> : null}
        </div>
        <div className="stack-sm">
          <TextField id={`${idBase}-name`} label={t('review.objects.name')} maxLength={200} value={object.name || ''} onChange={(e) => change({ name: e.target.value })} />
          <TextArea label={t('review.objects.description')} rows={2} maxLength={2000} value={object.description || ''} onChange={(e) => change({ description: e.target.value })} />
          <TextField
            label={t('review.objects.samPhrase')}
            hint={t('review.objects.samPhraseHint')}
            inputClassName="mono"
            maxLength={200}
            value={object.sam_phrase || ''}
            onChange={(e) => change({ sam_phrase: e.target.value })}
          />
          <SourceRefChips refs={object.source_refs || []} label={t('review.evidence')} />
        </div>
      </div>
    </ItemShell>
  )
})

export function ObjectsSection({ objects, progress, samReason }) {
  const { t } = useT()
  const { setResult, announce } = useReview()
  const keys = itemKeys(objects, 'o')
  return (
    <ReviewSection
      id="objects"
      title={t('review.objects.title')}
      description={t('review.objects.desc')}
      progress={progress}
      footer={
        <Button
          icon={Plus}
          disabled={objects.length >= 40}
          onClick={() => {
            const id = newId('o')
            setResult((r) => ({ ...r, objects: [...r.objects, { id, name: '', description: '', sam_phrase: '', asset_id: null, source_id: null, source_refs: [], confirmed: false }] }))
            announce(t('review.objects.added'))
            focusById(`review-object-${id}-name`)
          }}
        >
          {t('review.objects.add')}
        </Button>
      }
    >
      <p className="small au-sam-explain" style={{ margin: 0 }}>
        {t('review.objects.samExplain')}
      </p>
      {objects.length ? (
        <div className="stack">
          {objects.map((o, i) => (
            <ObjectCard key={keys[i]} object={o} index={i} samReason={samReason} />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          {t('review.objects.empty')}
        </p>
      )}
    </ReviewSection>
  )
}
