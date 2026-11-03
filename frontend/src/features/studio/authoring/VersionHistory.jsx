import { useCallback, useEffect, useState } from 'react'
import { History, RefreshCw, RotateCcw } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { get, post } from '../../../lib/api.js'
import { Button, ConfirmDialog, ErrorMessage, LoadingBlock, useToast } from '../../../components/ui/index.js'
import { useLab } from '../../lab/LabContext.jsx'
import { restoreNote, versionNote } from './versions.js'

const PAGE = 8

/**
 * "Lịch sử phiên bản": snapshots the server keeps (on publish, before and after AI changes and
 * every few minutes of editing) with a safe restore: the current state is saved as a new
 * version first, so a restore can always be undone.
 */
export default function VersionHistory() {
  const { t, fmt } = useT()
  const toast = useToast()
  const { lab, flush, saveNow, replaceLab } = useLab()
  const [state, setState] = useState({ status: 'loading', items: [], error: null })
  const [shown, setShown] = useState(PAGE)
  const [target, setTarget] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState(null)

  const load = useCallback(
    (signal) => {
      setState((s) => ({ ...s, status: s.items.length ? 'refreshing' : 'loading', error: null }))
      get(`/api/labs/${lab.id}/versions`, { signal })
        .then((items) => setState({ status: 'ready', items: Array.isArray(items) ? items : [], error: null }))
        .catch((error) => {
          if (error?.name === 'AbortError') return
          setState((s) => ({ ...s, status: 'error', error }))
        })
    },
    [lab.id],
  )

  // Reload when the lab is published/unpublished (each publish adds a version).
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, lab.published_at, lab.status])

  const restore = async () => {
    if (!target) return
    setRestoring(true)
    setRestoreError(null)
    try {
      await flush()
      // Keep what is on screen now as its own version, so the restore can be undone.
      await saveNow(restoreNote(target.version))
      const out = await post(`/api/labs/${lab.id}/versions/${target.version}/restore`)
      replaceLab(out)
      toast.success(t('publish.versions.restored', { n: target.version }))
      setTarget(null)
      load()
    } catch (err) {
      setRestoreError(err)
    } finally {
      setRestoring(false)
    }
  }

  const items = state.items
  const visible = items.slice(0, shown)
  return (
    <section className="card stack" aria-labelledby="pub-versions-title" aria-busy={state.status === 'loading' || state.status === 'refreshing' || undefined}>
      <div className="row-between">
        <h2 id="pub-versions-title" className="pub-card-title">
          <History aria-hidden="true" />
          {t('publish.versions.title')}
        </h2>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => load()} loading={state.status === 'refreshing'}>
          {t('publish.versions.refresh')}
        </Button>
      </div>
      <p className="small muted" style={{ margin: 0, maxInlineSize: '75ch' }}>
        {t('publish.versions.lead')}
      </p>
      {state.status === 'loading' ? <LoadingBlock lines={3} /> : null}
      {state.status === 'error' ? <ErrorMessage error={state.error} title={t('publish.versions.loadError')} onRetry={() => load()} /> : null}
      {state.status !== 'loading' && state.status !== 'error' && !items.length ? (
        <p className="small muted" style={{ margin: 0 }}>
          {t('publish.versions.empty')}
        </p>
      ) : null}
      {visible.length ? (
        <ol className="list-reset au-versions">
          {visible.map((v) => {
            const note = versionNote(v.note)
            const current = v.version === lab.version
            const shared = lab.status === 'published' && v.version === lab.published_version
            return (
              <li key={v.version} className="au-version">
                <div style={{ minInlineSize: 0 }}>
                  <p className="au-version-title">{t('publish.versions.item', { n: v.version })}</p>
                  <p className="au-version-note">{note.key ? t(`publish.versions.notes.${note.key}`, note.params) : note.text}</p>
                  {v.created_at || v.created_by_name ? (
                    <p className="au-version-when">
                      {v.created_at ? <time dateTime={v.created_at}>{fmt.dateTime(v.created_at)}</time> : null}
                      {v.created_by_name ? <span>{v.created_by_name}</span> : null}
                    </p>
                  ) : null}
                  {current || shared ? (
                    <p className="au-version-badges">
                      {current ? <span className="badge badge-outline">{t('publish.versions.current')}</span> : null}
                      {shared ? <span className="badge badge-success">{t('publish.versions.shared')}</span> : null}
                    </p>
                  ) : null}
                </div>
                {current ? null : (
                  <Button
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => {
                      setRestoreError(null)
                      setTarget(v)
                    }}
                  >
                    {t('publish.versions.restore')}
                    <span className="visually-hidden"> {t('publish.versions.item', { n: v.version })}</span>
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      ) : null}
      {items.length > shown ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
            {t('publish.versions.more', { count: items.length - shown })}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(target)}
        onClose={() => (restoring ? null : setTarget(null))}
        onConfirm={restore}
        loading={restoring}
        title={t('publish.versions.confirmTitle', { n: target?.version ?? '' })}
        confirmLabel={t('publish.versions.confirm')}
      >
        <div className="stack-sm">
          <p style={{ margin: 0 }}>
            {t('publish.versions.confirmBody', { time: target?.created_at ? fmt.dateTime(target.created_at) : t('publish.versions.unknownTime') })}
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            {lab.status === 'published' ? t('publish.versions.confirmShared') : t('publish.versions.confirmSafe')}
          </p>
          {restoreError ? <ErrorMessage error={restoreError} /> : null}
        </div>
      </ConfirmDialog>
    </section>
  )
}
