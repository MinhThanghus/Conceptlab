import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import { AIBadge, Button, Checkbox, ErrorMessage, IconButton, InlineText, LocatedBadge, SelectField, TextArea, TextField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { LIMITS, clamp, cut, formatClock, manualLocated, parseClock, parseDecimal, pictureOptions, pictureValue, unionBox } from './lessonKit.js'
import './lesson.css'

/** Number shown in an input: no thousands grouping, decimal comma in Vietnamese. */
export function plainNumber(value, lang) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return ''
  const text = String(Number(value))
  return lang === 'vi' ? text.replace('.', ',') : text
}

/**
 * Text input for numbers that accepts "2,5" and "2.5". Valid values are committed while
 * typing; on blur the value is clamped to [min, max] (or restored when invalid).
 */
export function NumberInput({ label, hint, value, min = -Infinity, max = Infinity, integer = false, onCommit, allowEmpty = false, placeholder, className, inputClassName, id, required }) {
  const { lang } = useT()
  const [draft, setDraft] = useState(() => plainNumber(value, lang))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(plainNumber(value, lang))
  }, [value, lang])
  const accept = (n) => (integer ? Math.round(n) : n)
  return (
    <TextField
      id={id}
      className={className}
      inputClassName={inputClassName}
      label={label}
      hint={hint}
      required={required}
      placeholder={placeholder}
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(event) => {
        const text = event.target.value
        setDraft(text)
        if (!text.trim()) {
          if (allowEmpty) onCommit(null)
          return
        }
        const n = parseDecimal(text)
        if (n !== null && n >= min && n <= max) onCommit(accept(n))
      }}
      onBlur={() => {
        focused.current = false
        const n = parseDecimal(draft)
        if (n === null) {
          if (allowEmpty && !draft.trim()) {
            onCommit(null)
            setDraft('')
          } else setDraft(plainNumber(value, lang))
          return
        }
        const next = accept(clamp(n, min, max))
        onCommit(next)
        setDraft(plainNumber(next, lang))
      }}
    />
  )
}

/** Title, description, block-level sources and the "reviewed" checkbox shared by every lesson editor. */
export function BlockMetaFields({ block, onChange, children }) {
  const { t } = useT()
  return (
    <div className="lk-meta">
      <TextField label={t('blocks.titleLabel')} value={block.title || ''} maxLength={LIMITS.short} onChange={(e) => onChange({ ...block, title: e.target.value })} />
      <TextArea
        label={t('blocks.descriptionLabel')}
        hint={t('steps.kit.descriptionHint')}
        rows={2}
        maxLength={LIMITS.medium}
        value={block.description || ''}
        onChange={(e) => onChange({ ...block, description: e.target.value })}
      />
      {children}
      <SourceRefsEditor
        title={t('steps.kit.blockRefsTitle')}
        refs={block.source_refs || []}
        max={LIMITS.blockRefs}
        onChange={(source_refs) => onChange({ ...block, source_refs })}
      />
      <div className="lk-ai-row">
        {block.ai_generated ? <AIBadge /> : null}
        <Checkbox
          label={t('steps.kit.confirmedLabel')}
          hint={block.ai_generated ? t('steps.kit.confirmedHintAI') : t('steps.kit.confirmedHint')}
          checked={Boolean(block.confirmed)}
          onChange={(e) => onChange({ ...block, confirmed: e.target.checked })}
        />
      </div>
    </div>
  )
}

/**
 * Collapsible list item with move up / move down / delete. Keeps keyboard focus on the
 * button that was used after the item moves.
 */
export function EditorItem({ id, index, count, title, emptyTitle, open, onToggle, onMove, onRemove, flags, children, itemName }) {
  const { t } = useT()
  const bodyId = useId()
  const toggleRef = useRef(null)
  const upRef = useRef(null)
  const downRef = useRef(null)
  const pending = useRef(null)
  useLayoutEffect(() => {
    if (!pending.current) return
    const target = pending.current === 'up' ? upRef.current : downRef.current
    ;(target && !target.disabled ? target : toggleRef.current)?.focus({ preventScroll: true })
    pending.current = null
  }, [index])
  const name = itemName || title || emptyTitle
  return (
    <li id={id} className={['lk-item', open ? 'is-open' : ''].join(' ')}>
      <div className="lk-item-head" style={{ flexWrap: 'wrap' }}>
        <button ref={toggleRef} type="button" className="lk-item-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} style={{ flexBasis: '12rem' }}>
          <span className="lk-num" aria-hidden="true">
            {index + 1}
          </span>
          <span className={['lk-item-title', title ? '' : 'is-empty'].join(' ')}>{title ? <InlineText text={title} /> : emptyTitle}</span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        {flags ? <span className="lk-flags">{flags}</span> : null}
        <span className="lk-item-tools">
          <IconButton
            ref={upRef}
            icon={ArrowUp}
            size="sm"
            label={t('steps.kit.moveUp', { name })}
            disabled={index === 0}
            onClick={() => {
              pending.current = 'up'
              onMove(-1)
            }}
          />
          <IconButton
            ref={downRef}
            icon={ArrowDown}
            size="sm"
            label={t('steps.kit.moveDown', { name })}
            disabled={index >= count - 1}
            onClick={() => {
              pending.current = 'down'
              onMove(1)
            }}
          />
          <IconButton icon={Trash2} size="sm" label={t('steps.kit.remove', { name })} onClick={onRemove} />
        </span>
      </div>
      {open ? (
        <div id={bodyId} className="lk-item-body">
          {children}
        </div>
      ) : null}
    </li>
  )
}

/** "Ảnh: trang_38.png" style label for a source. */
export function sourceTitle(source, t) {
  if (!source) return t('steps.kit.missingSource')
  return `${t(`common.sourceKinds.${source.kind}`)}: ${source.title}`
}

/** One-line description of a SourceRef: title, page, time. */
export function refSummary(ref, source, t) {
  const parts = [source ? source.title : t('steps.kit.missingSource')]
  if (ref?.page) parts.push(t('steps.kit.pageN', { n: ref.page_label || ref.page }))
  if (Number.isFinite(ref?.time)) parts.push(formatClock(ref.time))
  return parts.join(', ')
}

function RefForm({ initial, sources, onSave, onCancel }) {
  const { t } = useT()
  const firstRef = useRef(null)
  const [sourceId, setSourceId] = useState(initial?.source_id && sources.some((s) => s.id === initial.source_id) ? initial.source_id : sources[0]?.id || '')
  const [page, setPage] = useState(initial?.page ?? null)
  const [time, setTime] = useState(Number.isFinite(initial?.time) ? formatClock(initial.time) : '')
  const [quote, setQuote] = useState(initial?.quote || '')
  const [found, setFound] = useState(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const [locateMiss, setLocateMiss] = useState(false)
  // Bumped on every locate and source change, so an answer for an earlier source is dropped.
  const locateSeq = useRef(0)
  const source = sources.find((s) => s.id === sourceId) || null
  const isPdf = source?.kind === 'pdf'
  const isVideo = source?.kind === 'video'
  const timeValue = parseClock(time)
  const timeInvalid = isVideo && time.trim() !== '' && timeValue === null

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  const changeSource = (id) => {
    locateSeq.current += 1
    setLocating(false)
    setSourceId(id)
    setPage(null)
    setTime('')
    setFound(null)
    setLocateMiss(false)
    setLocateError(null)
  }

  const locate = async () => {
    if (!source || !quote.trim()) return
    const mine = ++locateSeq.current
    setLocating(true)
    setLocateError(null)
    setLocateMiss(false)
    try {
      const res = await post(`/api/sources/${source.id}/locate`, { quote: quote.trim(), ...(page ? { page } : {}) })
      if (mine !== locateSeq.current) return
      const box = res?.located === 'exact' ? unionBox(res.rects) : null
      if (res?.located === 'exact' && res.page) {
        setFound({ page: res.page, bbox: box })
        setPage(res.page)
      } else {
        setFound(null)
        setLocateMiss(true)
      }
    } catch (err) {
      if (mine === locateSeq.current) setLocateError(err)
    } finally {
      if (mine === locateSeq.current) setLocating(false)
    }
  }

  const save = () => {
    if (!source || timeInvalid) return
    const pageNum = isPdf && page ? Math.round(page) : null
    const ref = {
      source_id: source.id,
      page: pageNum,
      page_label: initial?.page_label && initial.source_id === source.id && initial.page === pageNum ? initial.page_label : null,
      bbox: null,
      time: isVideo && timeValue !== null ? timeValue : null,
      quote: cut(quote.trim(), LIMITS.quote) || null,
      located: 'none',
    }
    const keepBox = initial?.bbox && initial.source_id === ref.source_id && (initial.page ?? null) === ref.page
    if (found && found.page === ref.page) {
      ref.bbox = found.bbox
      ref.located = 'exact'
    } else if (keepBox) {
      ref.bbox = initial.bbox
      ref.located = initial.located || manualLocated(ref, source)
    } else {
      ref.located = manualLocated(ref, source)
    }
    onSave(ref)
  }

  return (
    <div className="lk-subcard" role="group" aria-label={initial ? t('steps.kit.editRef') : t('steps.kit.addRef')}>
      <SelectField
        ref={firstRef}
        label={t('steps.kit.refSource')}
        value={sourceId}
        onChange={(e) => changeSource(e.target.value)}
        options={sources.map((s) => ({ value: s.id, label: sourceTitle(s, t) }))}
      />
      {isPdf ? (
        <NumberInput
          label={t('steps.kit.refPage')}
          hint={source.page_count ? t('steps.kit.refPageHint', { count: source.page_count }) : undefined}
          value={page}
          min={1}
          max={source.page_count || 10000}
          integer
          allowEmpty
          onCommit={(v) => setPage(v)}
        />
      ) : null}
      {isVideo ? (
        <TextField
          label={t('steps.kit.refTime')}
          hint={t('steps.kit.refTimeHint')}
          value={time}
          inputMode="numeric"
          error={timeInvalid ? t('steps.kit.refTimeInvalid') : undefined}
          onChange={(e) => setTime(e.target.value)}
        />
      ) : null}
      <TextArea
        label={t('steps.kit.refQuote')}
        hint={t('steps.kit.refQuoteHint')}
        rows={2}
        maxLength={LIMITS.quote}
        value={quote}
        onChange={(e) => {
          setQuote(e.target.value)
          setLocateMiss(false)
        }}
      />
      {isPdf ? (
        <div className="stack-sm">
          <div className="row">
            <Button size="sm" icon={Search} loading={locating} disabled={!quote.trim()} onClick={locate}>
              {t('steps.kit.locate')}
            </Button>
            {found ? <LocatedBadge located="exact" /> : null}
          </div>
          {found ? (
            <p className="lk-hint" role="status">
              {t('steps.kit.locateFound', { n: found.page })}
            </p>
          ) : null}
          {locateMiss ? (
            <p className="lk-hint" role="status">
              {t('steps.kit.locateMiss')}
            </p>
          ) : null}
          <ErrorMessage error={locateError} />
        </div>
      ) : null}
      <div className="row">
        <Button size="sm" variant="primary" onClick={save} disabled={!source || timeInvalid}>
          {initial ? t('common.actions.save') : t('steps.kit.addRefConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.actions.cancel')}
        </Button>
      </div>
    </div>
  )
}

/** Editable list of SourceRefs (pick a source, page/time and quote; find the quote in a PDF). */
export function SourceRefsEditor({ refs = [], onChange, max = 10, title }) {
  const { t } = useT()
  const env = useBlockEnv()
  const sources = env.sources || []
  const [editing, setEditing] = useState(null)
  const addRef = useRef(null)
  const save = (ref) => {
    if (editing === 'new') onChange([...refs, ref].slice(0, max))
    else onChange(refs.map((r, i) => (i === editing ? ref : r)))
    setEditing(null)
    requestAnimationFrame(() => addRef.current?.focus())
  }
  return (
    <div className="lk-subcard">
      <p className="lk-subcard-title">
        <BookOpen aria-hidden="true" />
        {title || t('steps.kit.refsTitle')}
      </p>
      {refs.length ? (
        <ul className="lk-ref-list">
          {refs.map((ref, i) => {
            const source = env.sourceById(ref.source_id)
            const summary = refSummary(ref, source, t)
            return (
              <li key={`${ref.source_id}-${i}`} className="lk-ref-row">
                <span className="lk-ref-text">
                  {summary}
                  {ref.quote ? <span className="lk-ref-quote">“{ref.quote}”</span> : null}
                </span>
                <LocatedBadge located={ref.located || 'none'} />
                <span className="lk-item-tools">
                  <IconButton icon={Pencil} size="sm" label={t('steps.kit.editRefNamed', { name: summary })} onClick={() => setEditing(i)} disabled={editing !== null} />
                  <IconButton icon={Trash2} size="sm" label={t('steps.kit.removeRefNamed', { name: summary })} onClick={() => onChange(refs.filter((_, j) => j !== i))} />
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="lk-hint">{t('steps.kit.refsEmpty')}</p>
      )}
      {editing !== null ? (
        <RefForm key={String(editing)} initial={editing === 'new' ? null : refs[editing]} sources={sources} onSave={save} onCancel={() => setEditing(null)} />
      ) : sources.length ? (
        <Button ref={addRef} size="sm" icon={Plus} className="lk-add" disabled={refs.length >= max} onClick={() => setEditing('new')}>
          {t('steps.kit.addRef')}
        </Button>
      ) : (
        <p className="lk-hint">{t('steps.kit.noSources')}</p>
      )}
      {refs.length >= max ? <p className="lk-limit">{t('steps.kit.refsLimit', { max })}</p> : null}
    </div>
  )
}

function assetTitle(asset, t) {
  const kind = t(`steps.kit.assetKinds.${asset.kind}`)
  const name = asset.meta?.title || asset.meta?.label || asset.meta?.phrase
  return name ? `${kind}: ${name}` : `${kind}: ${asset.id.slice(-6)}`
}

/**
 * Choose a picture: an image source, a PDF source + page, or an image asset.
 * value: { source_id, page, asset_id } | null
 */
export function PicturePicker({ value, onChange, includeAssets = true, allowNone = false, noneLabel, label, hint }) {
  const { t } = useT()
  const env = useBlockEnv()
  const options = pictureOptions(env.sources || [], env.assets || [], { includeAssets })
  const current = pictureValue(value)
  const selected = options.find((o) => o.value === current) || null
  const selectOptions = [
    ...(allowNone || !current ? [{ value: '', label: noneLabel || t('steps.kit.pickPicture'), disabled: !allowNone }] : []),
    ...(current && !selected ? [{ value: current, label: t('steps.kit.missingSource'), disabled: true }] : []),
    ...options.map((o) => ({
      value: o.value,
      label: o.asset ? assetTitle(o.asset, t) : o.source.kind === 'pdf' && o.source.page_count ? `${sourceTitle(o.source, t)} (${t('steps.kit.pages', { count: o.source.page_count })})` : sourceTitle(o.source, t),
    })),
  ]
  const choose = (v) => {
    if (!v) return onChange(null)
    const [kind, id] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)]
    if (kind === 'asset') return onChange({ source_id: null, page: null, asset_id: id })
    const source = options.find((o) => o.value === v)?.source
    return onChange({ source_id: id, page: source?.kind === 'pdf' ? (value?.source_id === id && value.page ? value.page : 1) : null, asset_id: null })
  }
  return (
    <div className="lk-grid-2">
      <SelectField label={label || t('steps.kit.picture')} hint={hint} value={current} onChange={(e) => choose(e.target.value)} options={selectOptions} />
      {selected?.source?.kind === 'pdf' ? (
        <NumberInput
          label={t('steps.kit.refPage')}
          hint={selected.source.page_count ? t('steps.kit.refPageHint', { count: selected.source.page_count }) : undefined}
          value={value?.page || 1}
          min={1}
          max={selected.source.page_count || 10000}
          integer
          onCommit={(page) => onChange({ ...value, page })}
        />
      ) : null}
    </div>
  )
}
