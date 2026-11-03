import { useEffect, useRef, useState } from 'react'
import { Check, Eye, LoaderCircle, PenLine, Pencil, ShieldCheck, Trash2, TriangleAlert, Users, X } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { del, patch } from '../../../../lib/api.js'
import { Button, ConfirmDialog, Dialog, ErrorMessage, IconButton, useErrorText, useToast } from '../../../../components/ui/index.js'
import { SourceThumb } from '../../../sources/SourceThumb.jsx'
import { sourceInUse } from '../../../sources/sourceMeta.js'
import { ConsentFields } from './ConsentFields.jsx'
import { DataSourceForm, NoteSourceForm, rowsFromData } from './SourceForms.jsx'

/** "Ảnh, 1240×1754, 175,4 KB": the kind first, then what the file is made of (commas, no dots). */
function metaLine(source, t, fmt) {
  const parts = [t(`common.sourceKinds.${source.kind}`)]
  if (source.kind === 'pdf' && source.page_count) parts.push(t('sources.meta.pages', { count: source.page_count }))
  if (source.kind === 'image' && source.width && source.height) parts.push(`${source.width}×${source.height}`)
  if (source.kind === 'video' && source.duration_ms) parts.push(fmt.duration(source.duration_ms))
  if (source.kind === 'data') parts.push(t('sources.meta.values', { count: Array.isArray(source.data) ? source.data.length : 0 }))
  if (source.kind === 'note' && source.text) parts.push(t('sources.meta.chars', { count: source.text.length }))
  if (source.size_bytes && ['pdf', 'image', 'video'].includes(source.kind)) parts.push(fmt.bytes(source.size_bytes))
  return parts.join(', ')
}

/**
 * One source of the lab: preview, inline rename, status, privacy, edit (data/note), delete.
 * `children`: extra actions the step offers for this source, shown under its badges.
 */
export function SourceCard({ source, lab, onOpen, onChanged, onDeleted, children }) {
  const { t, fmt, lang } = useT()
  const toast = useToast()
  const errorText = useErrorText()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(source.title)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null) // 'delete' | 'privacy' | 'edit'
  const [privacy, setPrivacy] = useState({ containsPeople: source.contains_people, consent: source.consent_confirmed, error: false })
  const inputRef = useRef(null)
  const renameBtn = useRef(null)

  useEffect(() => {
    if (!renaming) setDraft(source.title)
  }, [source.title, renaming])
  useEffect(() => {
    if (renaming) inputRef.current?.select()
  }, [renaming])

  const run = async (kind, fn) => {
    setBusy(kind)
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err)
      return false
    } finally {
      setBusy(null)
    }
  }

  const saveTitle = async () => {
    const title = draft.trim().slice(0, 200)
    if (!title || title === source.title) {
      setRenaming(false)
      setDraft(source.title)
      return
    }
    const ok = await run('rename', async () => onChanged(await patch(`/api/sources/${source.id}`, { title })))
    if (ok) {
      setRenaming(false)
      requestAnimationFrame(() => renameBtn.current?.focus())
    }
  }

  const remove = async () => {
    const ok = await run('delete', async () => {
      await del(`/api/sources/${source.id}`)
      await onDeleted(source.id)
    })
    if (ok) toast.success(t('sources.card.deleted', { title: source.title }))
    setDialog(null)
  }

  const savePrivacy = async () => {
    if (privacy.containsPeople && !privacy.consent) {
      setPrivacy((p) => ({ ...p, error: true }))
      return
    }
    const ok = await run('privacy', async () =>
      onChanged(await patch(`/api/sources/${source.id}`, { contains_people: privacy.containsPeople, consent_confirmed: Boolean(privacy.containsPeople && privacy.consent) })),
    )
    if (ok) {
      setDialog(null)
      toast.success(t('sources.privacy.saved'))
    }
  }

  const openPrivacy = () => {
    setPrivacy({ containsPeople: source.contains_people, consent: source.consent_confirmed, error: false })
    setDialog('privacy')
  }

  const inUse = sourceInUse(lab, source.id)
  const failed = source.status === 'failed'
  const processing = source.status === 'processing'
  const canView = !processing && !failed

  return (
    <li className={['au-source-card', failed ? 'is-failed' : ''].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="au-source-thumb"
        onClick={() => canView && onOpen(source)}
        disabled={!canView}
        aria-label={t('sources.card.viewNamed', { title: source.title })}
      >
        <SourceThumb source={source} />
      </button>
      <div className="au-source-body">
        {renaming ? (
          <form
            className="au-rename"
            onSubmit={(e) => {
              e.preventDefault()
              saveTitle()
            }}
          >
            <label className="visually-hidden" htmlFor={`rename-${source.id}`}>
              {t('sources.card.renameLabel')}
            </label>
            <input
              ref={inputRef}
              id={`rename-${source.id}`}
              className="input input-sm"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setRenaming(false)
                  setDraft(source.title)
                  requestAnimationFrame(() => renameBtn.current?.focus())
                }
              }}
            />
            <IconButton icon={Check} size="sm" bordered type="submit" label={t('common.actions.save')} disabled={busy === 'rename'} />
            <IconButton
              icon={X}
              size="sm"
              label={t('common.actions.cancel')}
              onClick={() => {
                setRenaming(false)
                setDraft(source.title)
              }}
            />
          </form>
        ) : (
          <p className="au-source-title break">{source.title}</p>
        )}
        <p className="au-source-meta">{metaLine(source, t, fmt)}</p>

        <div className="au-source-badges">
          {processing ? (
            <span className="badge">
              <LoaderCircle className="spin" aria-hidden="true" />
              {t('sources.status.processing')}
            </span>
          ) : null}
          {failed ? (
            <span className="badge badge-danger">
              <TriangleAlert aria-hidden="true" />
              {t('sources.status.failed')}
            </span>
          ) : null}
          {source.contains_people ? (
            <span className={`badge ${source.consent_confirmed ? 'badge-success' : 'badge-warning'}`}>
              <Users aria-hidden="true" />
              {source.consent_confirmed ? t('sources.privacy.badgeConsented') : t('sources.privacy.badgeNeedsConsent')}
            </span>
          ) : null}
          {inUse ? <span className="badge badge-outline">{t('sources.card.inUse')}</span> : null}
        </div>

        {processing ? <p className="au-source-note">{source.kind === 'video' ? t('sources.status.processingVideo') : t('sources.status.processingLong')}</p> : null}
        {failed ? (
          <p className="au-failed-reason">
            {errorText({ code: source.error_code || 'processing_failed' })} {t('sources.status.failedHint')}
          </p>
        ) : null}
        {source.contains_people && !source.consent_confirmed ? (
          <Button size="sm" variant="soft" icon={ShieldCheck} onClick={openPrivacy}>
            {t('sources.privacy.confirmNow')}
          </Button>
        ) : null}
        {error && !dialog ? <ErrorMessage error={error} /> : null}
        {children}

        <div className="au-source-actions">
          <Button size="sm" variant="ghost" icon={Eye} disabled={!canView} onClick={() => onOpen(source)} aria-label={t('sources.card.viewNamed', { title: source.title })}>
            {t('common.actions.view')}
          </Button>
          <span className="au-source-icons">
            {source.kind === 'data' || source.kind === 'note' ? (
              <IconButton icon={PenLine} size="sm" label={t('sources.card.editContentNamed', { title: source.title })} onClick={() => setDialog('edit')} />
            ) : null}
            <IconButton ref={renameBtn} icon={Pencil} size="sm" label={t('sources.card.renameNamed', { title: source.title })} onClick={() => setRenaming(true)} disabled={renaming} />
            {['image', 'video', 'pdf'].includes(source.kind) || source.contains_people ? (
              <IconButton icon={ShieldCheck} size="sm" label={t('sources.privacy.editNamed', { title: source.title })} onClick={openPrivacy} />
            ) : null}
            <IconButton icon={Trash2} size="sm" label={t('sources.card.deleteNamed', { title: source.title })} onClick={() => setDialog('delete')} />
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={remove}
        loading={busy === 'delete'}
        tone="danger"
        title={t('sources.card.deleteTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ marginTop: 0 }}>{t('sources.card.deleteBody', { title: source.title })}</p>
        {inUse ? <p className="small au-warn-text">{t('sources.card.deleteInUse')}</p> : null}
        {error && dialog === 'delete' ? <ErrorMessage error={error} /> : null}
      </ConfirmDialog>

      <Dialog
        open={dialog === 'privacy'}
        onClose={() => setDialog(null)}
        title={t('sources.privacy.dialogTitle')}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>{t('common.actions.cancel')}</Button>
            <Button variant="primary" loading={busy === 'privacy'} onClick={savePrivacy}>
              {t('common.actions.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted" style={{ margin: 0 }}>
            {source.title}
          </p>
          <ConsentFields
            containsPeople={privacy.containsPeople}
            consent={privacy.consent}
            error={privacy.error}
            onChange={({ containsPeople, consent }) => setPrivacy({ containsPeople, consent, error: false })}
          />
          {error && dialog === 'privacy' ? <ErrorMessage error={error} /> : null}
        </div>
      </Dialog>

      <Dialog open={dialog === 'edit'} onClose={() => setDialog(null)} title={source.kind === 'data' ? t('sources.data.editTitle') : t('sources.note.editTitle')} size={source.kind === 'data' ? 'wide' : undefined}>
        {dialog === 'edit' && source.kind === 'data' ? (
          <DataSourceForm
            initialTitle={source.title}
            initialRows={rowsFromData(source.data, lang)}
            initialNote={source.text || ''}
            submitLabel={t('common.actions.save')}
            onCancel={() => setDialog(null)}
            onSubmit={async ({ title, values, note }) => {
              await onChanged(await patch(`/api/sources/${source.id}`, { title, data: values, text: note || '' }))
              setDialog(null)
              toast.success(t('sources.data.updated'))
            }}
          />
        ) : null}
        {dialog === 'edit' && source.kind === 'note' ? (
          <NoteSourceForm
            initialTitle={source.title}
            initialText={source.text || ''}
            submitLabel={t('common.actions.save')}
            onCancel={() => setDialog(null)}
            onSubmit={async ({ title, text }) => {
              await onChanged(await patch(`/api/sources/${source.id}`, { title, text }))
              setDialog(null)
              toast.success(t('sources.note.updated'))
            }}
          />
        ) : null}
      </Dialog>
    </li>
  )
}
