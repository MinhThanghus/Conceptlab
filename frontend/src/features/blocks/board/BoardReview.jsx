import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, CircleHelp, Plus, ScanText, Trash2, Undo2 } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Button, IconButton, MathTex, SelectField, TextArea, TextField } from '../../../components/ui/index.js'
import { ImageStage } from '../steps/MediaStage.jsx'
import { LIMITS, moveItem } from '../steps/lessonKit.js'
import { BOARD_KINDS, BOARD_LIMITS, BOARD_SURFACES, blankItem, highlightUncertain, isMathKind, itemText, oneLine, sheetTex, uncertainCount, unsureStillIn } from './boardModel.js'

const parseLabels = (text) =>
  String(text || '')
    .split(/[,;]/)
    .map(oneLine)
    .filter(Boolean)
    .slice(0, BOARD_LIMITS.labels)
    .map((label) => label.slice(0, LIMITS.short))

/** Words on a drawing, typed as "l, m, α": the draft keeps what is typed, the block gets the list. */
function LabelsField({ labels, onChange }) {
  const { t } = useT()
  const [draft, setDraft] = useState(null)
  return (
    <TextField
      label={t('board.item.labels')}
      hint={t('board.item.labelsHint')}
      value={draft ?? (labels || []).join(', ')}
      maxLength={LIMITS.medium}
      onChange={(event) => {
        setDraft(event.target.value)
        onChange(parseLabels(event.target.value))
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/** The numbered frames of the lines on the photo. Pointer only: keyboard users work in the list. */
function PhotoBoxes({ items, activeId, onActive, onPick }) {
  return (
    <div className="bd-boxes" aria-hidden="true">
      {items.map((item, i) => {
        if (!Array.isArray(item.bbox) || item.bbox.length !== 4) return null
        const [x0, y0, x1, y1] = item.bbox
        const unsure = !item.struck && (item.uncertain || []).some((w) => oneLine(w))
        const className = ['bd-box', item.id === activeId ? 'is-active' : '', item.struck ? 'is-struck' : '', unsure ? 'is-unsure' : ''].filter(Boolean).join(' ')
        return (
          <span
            key={item.id}
            className={className}
            style={{ left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${Math.max(0, x1 - x0) * 100}%`, height: `${Math.max(0, y1 - y0) * 100}%` }}
            onPointerEnter={() => onActive(item.id)}
            onPointerLeave={() => onActive(null)}
            onClick={() => onPick(item.id)}
          >
            <span className="bd-box-num">{i + 1}</span>
          </span>
        )
      })}
    </div>
  )
}

function UnsureLine({ item, onDone }) {
  const { t } = useT()
  const words = (item.uncertain || []).filter((w) => oneLine(w))
  if (!words.length) return null
  const segments = highlightUncertain(item.text, words)
  const elsewhere = words.filter((word) => !unsureStillIn(item.text, [word]).length)
  return (
    <div className="bd-unsure">
      <p className="bd-unsure-text">
        <span className="bd-unsure-label">
          <CircleHelp aria-hidden="true" />
          {t('board.item.unsure')}
        </span>{' '}
        {segments.map((segment, i) =>
          segment.unsure ? (
            <mark key={i} className="bd-unsure-word">
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
        {elsewhere.map((word) => (
          <span key={`x-${word}`}>
            {' '}
            <mark className="bd-unsure-word">{word}</mark>
          </span>
        ))}
      </p>
      <Button icon={Check} onClick={onDone}>
        {t('board.item.unsureDone')}
      </Button>
    </div>
  )
}

function ItemEditor({ item, index, count, active, onActive, onUpdate, onMove, onRemove, fieldRef, toolRef }) {
  const { t } = useT()
  const n = index + 1
  const math = isMathKind(item.kind)
  const drawing = item.kind === 'diagram'
  const kindName = t(`board.kinds.${BOARD_KINDS.includes(item.kind) ? item.kind : 'text'}`)
  const text = item.text || ''
  const className = ['bd-item', active ? 'is-active' : '', item.struck ? 'is-struck' : ''].filter(Boolean).join(' ')
  return (
    <li
      className={className}
      data-item-id={item.id}
      onPointerEnter={() => onActive(item.id)}
      onPointerLeave={() => onActive(null)}
      onFocus={() => onActive(item.id)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onActive(null)
      }}
    >
      <div className="bd-item-head">
        <span className="bd-num" aria-hidden="true">
          {n}
        </span>
        {item.struck ? (
          <p className="bd-item-kind">
            {kindName}
            <span className="badge badge-outline">{t('board.item.struckBadge')}</span>
          </p>
        ) : (
          <SelectField
            className="bd-kind"
            aria-label={t('board.item.kind', { n })}
            value={BOARD_KINDS.includes(item.kind) ? item.kind : 'text'}
            options={BOARD_KINDS.map((kind) => ({ value: kind, label: t(`board.kinds.${kind}`) }))}
            onChange={(event) => onUpdate({ kind: event.target.value })}
          />
        )}
        <span className="bd-item-tools">
          <IconButton ref={toolRef(`${item.id}:up`)} icon={ArrowUp} label={t('board.item.moveUp', { n })} disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton ref={toolRef(`${item.id}:down`)} icon={ArrowDown} label={t('board.item.moveDown', { n })} disabled={index >= count - 1} onClick={() => onMove(1)} />
          <IconButton ref={toolRef(`${item.id}:remove`)} icon={Trash2} label={t('board.item.remove', { n })} onClick={onRemove} />
        </span>
      </div>

      {item.struck ? (
        <div className="bd-struck">
          <p className="bd-struck-text">
            <s>{itemText(item) || t('board.item.emptyText')}</s>
          </p>
          <p className="lk-hint">{t('board.item.struck')}</p>
          <div>
            <Button icon={Undo2} onClick={() => onUpdate({ struck: false })}>
              {t('board.item.keep')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <TextArea
            ref={fieldRef}
            className="bd-text"
            label={drawing ? t('board.item.describe') : math ? t('board.item.line') : undefined}
            hint={drawing ? t('board.item.describeHint') : math ? t('board.item.lineHint') : undefined}
            aria-label={drawing || math ? undefined : t('board.item.text', { n })}
            rows={Math.min(5, Math.max(1, Math.ceil(text.length / 56)))}
            maxLength={LIMITS.medium}
            value={text}
            onChange={(event) => onUpdate({ text: event.target.value })}
            onKeyDown={(event) => {
              // one line a row: a new line is a new row ("Add a line")
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault()
            }}
          />
          <UnsureLine item={item} onDone={() => onUpdate({ uncertain: [] })} />
          {math ? (
            <div className="bd-math-edit">
              <div className="bd-math-fields">
                <TextField label={t('board.item.lead')} value={item.lead || ''} maxLength={LIMITS.short} onChange={(event) => onUpdate({ lead: event.target.value })} />
                <TextArea
                  className="bd-latex"
                  label={t('board.item.latex')}
                  hint={t('board.item.latexHint')}
                  rows={Math.min(4, Math.max(1, Math.ceil(String(item.latex || '').length / 44)))}
                  value={item.latex || ''}
                  maxLength={LIMITS.medium}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  onChange={(event) => onUpdate({ latex: event.target.value })}
                />
              </div>
              <div className="bd-math-preview" role="group" aria-label={t('board.item.preview')} data-kind={item.kind}>
                {oneLine(item.lead) ? <span className="bd-sheet-lead">{oneLine(item.lead)}</span> : null}
                {String(item.latex || '').trim() ? <MathTex tex={sheetTex(item.latex)} /> : <span className="lk-hint">{t('board.item.previewEmpty')}</span>}
              </div>
            </div>
          ) : null}
          {drawing ? <LabelsField labels={item.labels} onChange={(labels) => onUpdate({ labels })} /> : null}
        </>
      )}
    </li>
  )
}

/**
 * Stage 3 of the board editor: the photo with the frame of every line (hovering or focusing a line
 * lights its frame), the lines on the other side (they stack on narrow screens), the title and the
 * writing surface. `onPatch(patch | (block) => patch)` changes the block; `tools` sit by the heading.
 */
export function BoardReview({ block, photo, onPatch, disabled = false, headingRef, tools, notice, footer, onEmptied }) {
  const { t } = useT()
  const headingId = useId()
  const listId = useId()
  const items = block.items || []
  const [activeId, setActiveId] = useState(null)
  const [removed, setRemoved] = useState(null)
  const [announce, setAnnounce] = useState('')
  const fields = useRef({})
  const tools$ = useRef({})
  const pending = useRef(null)
  const unsure = uncertainCount(items)
  const struck = items.filter((item) => item.struck).length

  // after a move, an add or a delete, the keyboard focus lands where the teacher expects it
  useLayoutEffect(() => {
    const target = pending.current
    if (!target) return
    pending.current = null
    const el = target.field ? fields.current[target.id] : tools$.current[`${target.id}:${target.tool}`]
    const fallback = target.fallback ? tools$.current[target.fallback] || document.getElementById(target.fallback) : null
    const node = el && !el.disabled ? el : fallback
    node?.focus({ preventScroll: false })
  })

  const setItems = (fn) => onPatch((current) => ({ items: fn(current.items || []) }))
  const update = (id, change) =>
    setItems((list) =>
      list.map((item) => {
        if (item.id !== id) return item
        const next = { ...item, ...change }
        if (change.text !== undefined) {
          next.text = String(change.text).replace(/\s*\n+\s*/g, ' ')
          // a word the teacher rewrote is no longer one the model was unsure of
          next.uncertain = unsureStillIn(next.text, item.uncertain || [])
        }
        return next
      }),
    )
  const move = (index, delta) => {
    const item = items[index]
    const to = index + delta
    if (!item || to < 0 || to >= items.length) return
    pending.current = { id: item.id, tool: delta < 0 ? 'up' : 'down', fallback: `${item.id}:${delta < 0 ? 'down' : 'up'}` }
    setItems((list) => moveItem(list, index, to))
  }
  const remove = (index) => {
    const item = items[index]
    if (!item) return
    const next = items[index + 1] || items[index - 1]
    pending.current = next ? { id: next.id, tool: 'remove' } : { id: '', tool: '', fallback: `${listId}-add` }
    setRemoved({ item, index })
    setAnnounce(t('board.review.removed', { n: index + 1 }))
    if (items.length === 1) onEmptied?.()
    setItems((list) => list.filter((x) => x.id !== item.id))
  }
  const undo = () => {
    if (!removed) return
    const { item, index } = removed
    pending.current = { id: item.id, field: true }
    setRemoved(null)
    setAnnounce('')
    setItems((list) => {
      const copy = [...list]
      copy.splice(Math.min(index, copy.length), 0, item)
      return copy
    })
  }
  const add = () => {
    const item = blankItem(items)
    pending.current = { id: item.id, field: true }
    setRemoved(null)
    setItems((list) => [...list, item])
  }
  const pickBox = (id) => {
    const el = fields.current[id] || tools$.current[`${id}:remove`]
    el?.focus({ preventScroll: true })
    el?.closest('li')?.scrollIntoView?.({ block: 'nearest' })
  }

  return (
    <section className="lk-section bd-review" aria-labelledby={headingId}>
      <div className="bd-sec-head">
        <div className="bd-sec-text">
          <h4 id={headingId} ref={headingRef} tabIndex={-1} className="lk-section-title">
            <ScanText aria-hidden="true" />
            {t('board.review.title')}
          </h4>
          <p className="lk-hint">{t('board.review.lead')}</p>
        </div>
        {tools ? <div className="bd-sec-tools">{tools}</div> : null}
      </div>
      <ul className="bd-counts">
        <li className="badge badge-outline">{t('board.review.lines', { count: items.length - struck })}</li>
        {unsure ? (
          <li className="badge bd-count-unsure">
            <CircleHelp aria-hidden="true" />
            {t('board.review.unsure', { count: unsure })}
          </li>
        ) : null}
        {struck ? <li className="badge badge-outline">{t('board.review.struck', { count: struck })}</li> : null}
      </ul>
      {notice}

      <fieldset className="bd-fieldset" disabled={disabled}>
        <div className="bd-meta">
          <TextField label={t('board.review.titleLabel')} hint={t('board.review.titleHint')} value={block.title || ''} maxLength={LIMITS.short} onChange={(event) => onPatch({ title: event.target.value })} />
          <SelectField
            label={t('board.review.surfaceLabel')}
            value={BOARD_SURFACES.includes(block.surface) ? block.surface : 'other'}
            options={BOARD_SURFACES.map((surface) => ({ value: surface, label: t(`board.surfaces.${surface}`) }))}
            onChange={(event) => onPatch({ surface: event.target.value })}
          />
        </div>
        {oneLine(block.unreadable) ? (
          <Alert tone="warning" title={t('board.review.unreadableTitle')}>
            {block.unreadable}
          </Alert>
        ) : null}

        <div className="bd-review-grid">
          <div className="bd-photo">
            {photo.src ? (
              <>
                <ImageStage src={photo.src} alt={t('board.review.photoAlt')} size={photo.size} maxBlock="min(70vh, 44rem)" loading="eager">
                  <PhotoBoxes items={items} activeId={activeId} onActive={setActiveId} onPick={pickBox} />
                </ImageStage>
                <p className="lk-hint">{t('board.review.boxHint')}</p>
              </>
            ) : (
              <Alert tone="warning">{t('board.review.photoMissing')}</Alert>
            )}
          </div>
          <div className="bd-lines">
            {items.length ? (
              <ol className="bd-items" aria-label={t('board.review.listLabel')}>
                {items.map((item, index) => (
                  <ItemEditor
                    key={item.id}
                    item={item}
                    index={index}
                    count={items.length}
                    active={activeId === item.id}
                    onActive={setActiveId}
                    onUpdate={(change) => update(item.id, change)}
                    onMove={(delta) => move(index, delta)}
                    onRemove={() => remove(index)}
                    fieldRef={(el) => {
                      fields.current[item.id] = el
                    }}
                    toolRef={(key) => (el) => {
                      tools$.current[key] = el
                    }}
                  />
                ))}
              </ol>
            ) : (
              <p className="bd-empty">{t('board.review.empty')}</p>
            )}
            <p className="visually-hidden" role="status">
              {announce}
            </p>
            {removed ? (
              <div className="bd-undo">
                <span>{t('board.review.removed', { n: removed.index + 1 })}</span>
                <Button variant="ghost" icon={Undo2} onClick={undo}>
                  {t('board.review.undo')}
                </Button>
              </div>
            ) : null}
            <div className="bd-add">
              <Button id={`${listId}-add`} icon={Plus} onClick={add} disabled={items.length >= BOARD_LIMITS.items}>
                {t('board.review.add')}
              </Button>
              {items.length >= BOARD_LIMITS.items ? <p className="lk-hint">{t('board.review.limit', { max: BOARD_LIMITS.items })}</p> : null}
            </div>
          </div>
        </div>
      </fieldset>
      {footer}
    </section>
  )
}
