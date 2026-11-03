import { useEffect, useId, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Button, ErrorMessage, IconButton, ProvenanceBadge, TextArea, TextField } from '../../../../components/ui/index.js'
import { formatDecimalInput, parseDecimal } from '../numbers.js'

const MAX_ROWS = 40
const emptyRow = () => ({ symbol: '', name: '', value: '', unit: '' })

/** Title state that follows a changing default (e.g. the UI language) until the user types. */
function useTitleDraft(initialTitle) {
  const [title, setTitle] = useState(initialTitle)
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current) setTitle(initialTitle)
  }, [initialTitle])
  const set = (value) => {
    touched.current = true
    setTitle(value)
  }
  return [title, set]
}

/** Rows of measured values from a data source (numbers → editable text). */
export function rowsFromData(data, lang) {
  const rows = Array.isArray(data) ? data : []
  return rows.length
    ? rows.map((r) => ({ symbol: r.symbol || '', name: r.name || '', value: formatDecimalInput(r.value, lang), unit: r.unit || '' }))
    : [emptyRow()]
}

/**
 * Measured values typed by a student or teacher (spec §6.2) → POST /sources/data or PATCH.
 * Every value is labelled "user-provided". Accepts a decimal comma.
 */
export function DataSourceForm({ initialTitle = '', initialRows, initialNote = '', submitLabel, onSubmit, onCancel }) {
  const { t, lang } = useT()
  const id = useId().replace(/[:]/g, '')
  const [title, setTitle] = useTitleDraft(initialTitle)
  const [rows, setRows] = useState(() => initialRows || [emptyRow()])
  const [note, setNote] = useState(initialNote)
  const [errors, setErrors] = useState(null)
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState(null)

  const setRow = (i, patch) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const validate = () => {
    const rowErrors = {}
    const values = []
    rows.forEach((r, i) => {
      const blank = !r.symbol.trim() && !r.name.trim() && !String(r.value).trim() && !r.unit.trim()
      if (blank) return
      const e = {}
      if (!r.symbol.trim()) e.symbol = t('sources.data.errSymbol')
      const v = parseDecimal(r.value)
      if (v === null) e.value = t('sources.data.errValueRequired')
      else if (Number.isNaN(v)) e.value = t('sources.data.errValueNumber')
      if (Object.keys(e).length) rowErrors[i] = e
      else values.push({ symbol: r.symbol.trim().slice(0, 40), name: r.name.trim().slice(0, 120), value: v, unit: r.unit.trim().slice(0, 40) })
    })
    const titleError = title.trim() ? null : t('sources.data.errTitle')
    const emptyError = !values.length && !Object.keys(rowErrors).length ? t('sources.data.errEmpty') : null
    const ok = !titleError && !emptyError && !Object.keys(rowErrors).length
    setErrors(ok ? null : { rows: rowErrors, title: titleError, empty: emptyError })
    return ok ? values : null
  }

  const submit = async (e) => {
    e.preventDefault()
    const values = validate()
    if (!values) return
    setBusy(true)
    setApiError(null)
    try {
      await onSubmit({ title: title.trim().slice(0, 200), values, note: note.trim() || null })
    } catch (err) {
      setApiError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="au-provenance-note">
        <ProvenanceBadge value="user" />
        <span className="small">{t('sources.data.provenanceNote')}</span>
      </div>
      <TextField
        label={t('sources.data.titleLabel')}
        value={title}
        maxLength={200}
        required
        placeholder={t('sources.data.titlePlaceholder')}
        error={errors?.title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="au-data-table" role="group" aria-labelledby={`${id}-values`}>
        <p className="field-label" id={`${id}-values`} style={{ margin: 0 }}>
          {t('sources.data.valuesLabel')}
        </p>
        <div className="au-data-head" aria-hidden="true">
          <span>{t('sources.data.symbol')}</span>
          <span>{t('sources.data.name')}</span>
          <span>{t('sources.data.value')}</span>
          <span>{t('sources.data.unit')}</span>
          <span />
        </div>
        {rows.map((r, i) => {
          const e = errors?.rows?.[i] || {}
          return (
            <div className="au-data-row" key={i}>
              <label className="au-cell">
                <span className="au-cell-label">{t('sources.data.symbol')}</span>
                <input className="input input-sm mono" value={r.symbol} maxLength={40} placeholder={i === 0 ? 'L' : ''} aria-invalid={e.symbol ? 'true' : undefined} onChange={(ev) => setRow(i, { symbol: ev.target.value })} />
              </label>
              <label className="au-cell au-cell-wide">
                <span className="au-cell-label">{t('sources.data.name')}</span>
                <input className="input input-sm" value={r.name} maxLength={120} placeholder={i === 0 ? t('sources.data.namePlaceholder') : ''} onChange={(ev) => setRow(i, { name: ev.target.value })} />
              </label>
              <label className="au-cell">
                <span className="au-cell-label">{t('sources.data.value')}</span>
                <input
                  className="input input-sm"
                  inputMode="decimal"
                  value={r.value}
                  placeholder={i === 0 ? formatDecimalInput(0.75, lang) : ''}
                  aria-invalid={e.value ? 'true' : undefined}
                  onChange={(ev) => setRow(i, { value: ev.target.value })}
                />
              </label>
              <label className="au-cell">
                <span className="au-cell-label">{t('sources.data.unit')}</span>
                <input className="input input-sm" value={r.unit} maxLength={40} placeholder={i === 0 ? 'm' : ''} onChange={(ev) => setRow(i, { unit: ev.target.value })} />
              </label>
              <div className="au-cell au-cell-action">
                <IconButton
                  icon={Trash2}
                  size="sm"
                  label={t('sources.data.removeRow', { n: i + 1 })}
                  disabled={rows.length === 1}
                  onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
                />
              </div>
              {e.symbol || e.value ? (
                <p className="field-error au-row-error" style={{ margin: 0 }}>
                  {[e.symbol, e.value].filter(Boolean).join(' ')}
                </p>
              ) : null}
            </div>
          )
        })}
        <div>
          <Button size="sm" icon={Plus} disabled={rows.length >= MAX_ROWS} onClick={() => setRows((list) => [...list, emptyRow()])}>
            {t('sources.data.addRow')}
          </Button>
        </div>
        {errors?.empty ? <p className="field-error" style={{ margin: 0 }}>{errors.empty}</p> : null}
        <p className="field-hint" style={{ margin: 0 }}>
          {t('sources.data.decimalHint')}
        </p>
      </div>
      <TextArea label={t('sources.data.noteLabel')} hint={t('sources.data.noteHint')} rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
      <ErrorMessage error={apiError} />
      <div className="row">
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel || t('sources.data.submit')}
        </Button>
        {onCancel ? <Button onClick={onCancel}>{t('common.actions.cancel')}</Button> : null}
      </div>
    </form>
  )
}

/** Teacher note or question attached to the lab (POST /sources/note or PATCH). */
export function NoteSourceForm({ initialTitle = '', initialText = '', submitLabel, onSubmit, onCancel }) {
  const { t } = useT()
  const [title, setTitle] = useTitleDraft(initialTitle)
  const [text, setText] = useState(initialText)
  const [errors, setErrors] = useState(null)
  const [busy, setBusy] = useState(false)
  const [apiError, setApiError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    const next = { title: title.trim() ? null : t('sources.note.errTitle'), text: text.trim() ? null : t('sources.note.errText') }
    if (next.title || next.text) {
      setErrors(next)
      return
    }
    setErrors(null)
    setBusy(true)
    setApiError(null)
    try {
      await onSubmit({ title: title.trim().slice(0, 200), text: text.trim().slice(0, 8000) })
    } catch (err) {
      setApiError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <TextField label={t('sources.note.titleLabel')} value={title} maxLength={200} required placeholder={t('sources.note.titlePlaceholder')} error={errors?.title} onChange={(e) => setTitle(e.target.value)} />
      <TextArea
        label={t('sources.note.textLabel')}
        hint={t('sources.note.textHint')}
        rows={5}
        value={text}
        maxLength={8000}
        required
        error={errors?.text}
        placeholder={t('sources.note.textPlaceholder')}
        onChange={(e) => setText(e.target.value)}
      />
      <ErrorMessage error={apiError} />
      <div className="row">
        <Button type="submit" variant="primary" loading={busy}>
          {submitLabel || t('sources.note.submit')}
        </Button>
        {onCancel ? <Button onClick={onCancel}>{t('common.actions.cancel')}</Button> : null}
      </div>
    </form>
  )
}
