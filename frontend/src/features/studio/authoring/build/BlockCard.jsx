import { memo, useCallback, useState } from 'react'
import { ChevronDown, ChevronUp, CircleCheck, CircleDashed, Sparkles, Trash2 } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { AIBadge, ConfirmDialog, IconButton, Switch } from '../../../../components/ui/index.js'
import { BlockRenderer } from '../../../blocks/BlockRenderer.jsx'
import { blockIcon } from '../../../blocks/registry.js'
import { MoveButtons } from '../review/shared.jsx'

/**
 * One interactive part in the Build step: header (type, title, AI badge, "checked" switch,
 * move, delete, collapse) + the block's own editor. Anchor id `block-<id>` for deep links.
 * `actions` must be stable: { update(id, block), move(id, delta), remove(id), setConfirmed(id, v) }.
 */
export const BlockCard = memo(function BlockCard({ block, index, count, collapsed, onToggle, actions }) {
  const { t } = useT()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const Icon = blockIcon(block.type)
  const typeName = t(`blocks.types.${block.type}`)
  const name = block.title || typeName
  const onChange = useCallback((next) => actions.update(block.id, next), [actions, block.id])
  const needsReview = block.ai_generated && !block.confirmed
  return (
    <article
      id={`block-${block.id}`}
      className={['au-block', needsReview ? 'is-ai' : '', block.confirmed ? 'is-confirmed' : ''].filter(Boolean).join(' ')}
      aria-labelledby={`block-${block.id}-title`}
    >
      <header className="au-block-head">
        <span className="au-block-num" aria-hidden="true">
          {index + 1}
        </span>
        <div className="au-block-heading">
          <h3 id={`block-${block.id}-title`} tabIndex={-1} className="break">
            {name}
          </h3>
          <div className="au-block-badges">
            <span className="badge badge-outline">
              <Icon aria-hidden="true" />
              {typeName}
            </span>
            {block.ai_generated ? <AIBadge /> : null}
            <span className={`badge ${block.confirmed ? 'badge-success' : 'badge-outline'}`}>
              {block.confirmed ? <CircleCheck aria-hidden="true" /> : <CircleDashed aria-hidden="true" />}
              {block.confirmed ? t('blocks.confirmed') : t('blocks.notConfirmed')}
            </span>
          </div>
        </div>
        <div className="au-block-tools">
          <Switch label={t('build.blocks.checked')} checked={Boolean(block.confirmed)} onChange={(e) => actions.setConfirmed(block.id, e.target.checked)} />
          <span className="au-block-buttons">
            <MoveButtons index={index} count={count} name={name} onMove={(from, to) => actions.move(block.id, to - from)} />
            <IconButton icon={Trash2} size="sm" label={t('build.blocks.remove', { name })} onClick={() => setConfirmDelete(true)} />
            <IconButton
              icon={collapsed ? ChevronDown : ChevronUp}
              size="sm"
              label={collapsed ? t('build.blocks.expand', { name }) : t('build.blocks.collapse', { name })}
              aria-expanded={!collapsed}
              aria-controls={`block-${block.id}-body`}
              onClick={() => onToggle(block.id)}
            />
          </span>
        </div>
      </header>
      {needsReview ? (
        <p className="ai-note au-block-ai" style={{ margin: 0 }}>
          <Sparkles size={16} aria-hidden="true" />
          {t('build.blocks.aiReview')}
        </p>
      ) : null}
      <div id={`block-${block.id}-body`} className="au-block-body" hidden={collapsed}>
        {!collapsed ? <BlockRenderer block={block} mode="edit" onChange={onChange} /> : null}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          actions.remove(block.id)
        }}
        tone="danger"
        title={t('build.blocks.removeTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ margin: 0 }}>{t('blocks.deleteConfirm', { title: name })}</p>
        <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
          {t('build.blocks.removeHint')}
        </p>
      </ConfirmDialog>
    </article>
  )
})
