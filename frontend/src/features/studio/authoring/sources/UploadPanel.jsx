import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CircleCheck, FilePlus2, RotateCcw, TriangleAlert, Upload, X } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { upload } from '../../../../lib/api.js'
import { compressImage } from '../../../../lib/image.js'
import { Button, IconButton, ProgressBar, useErrorText, useToast } from '../../../../components/ui/index.js'
import { newId } from '../../../lab/specUtils.js'
import { ACCEPT_FILES, defaultTitle, fileKind, overSoftLimit, SOFT_LIMITS_MB, sourceIcon } from '../../../sources/sourceMeta.js'
import { ConsentFields } from './ConsentFields.jsx'

const MAX_QUEUE = 20

function QueueItem({ item, onChange, onRemove, onRetry, onCancel }) {
  const { t, fmt } = useT()
  const errorText = useErrorText()
  const Icon = sourceIcon(item.kind === 'unknown' ? 'pdf' : item.kind)
  const locked = item.status === 'uploading'
  const shrunk = item.preparedSize < item.originalSize
  return (
    <li className={['au-queue-item', `is-${item.status}`].join(' ')}>
      <span className="au-queue-thumb" aria-hidden="true">
        {item.previewUrl ? <img src={item.previewUrl} alt="" /> : <Icon />}
      </span>
      <div className="au-queue-body">
        <div className="au-queue-top">
          <label className="au-queue-title">
            <span className="visually-hidden">{t('sources.upload.titleLabel', { name: item.file.name })}</span>
            <input
              className="input input-sm"
              value={item.title}
              maxLength={200}
              disabled={locked || item.status === 'unsupported'}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          {locked ? (
            <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>
              {t('common.actions.cancel')}
            </Button>
          ) : (
            <IconButton icon={X} size="sm" label={t('sources.upload.removeFromList', { name: item.file.name })} onClick={onRemove} />
          )}
        </div>
        <p className="small muted au-queue-meta">
          <span className="badge badge-outline">{item.kind === 'unknown' ? t('sources.upload.unknownKind') : t(`common.sourceKinds.${item.kind}`)}</span>
          <span className="break">{item.file.name}</span>
          <span>
            {item.status === 'preparing'
              ? t('sources.upload.compressing')
              : shrunk
                ? t('sources.upload.compressed', { from: fmt.bytes(item.originalSize), to: fmt.bytes(item.preparedSize) })
                : fmt.bytes(item.originalSize)}
          </span>
        </p>
        {item.status === 'unsupported' ? (
          <p className="field-error" style={{ margin: 0 }}>
            <TriangleAlert size={16} aria-hidden="true" />
            {t('sources.upload.unsupported')}
          </p>
        ) : null}
        {item.tooLarge ? (
          <p className="small au-warn" style={{ margin: 0 }}>
            <TriangleAlert size={16} aria-hidden="true" />
            {t('sources.upload.tooLarge', { max: SOFT_LIMITS_MB[item.kind] })}
          </p>
        ) : null}
        {item.status !== 'unsupported' && (item.kind === 'image' || item.kind === 'video') ? (
          <ConsentFields
            containsPeople={item.containsPeople}
            consent={item.consent}
            error={item.consentError}
            disabled={locked}
            onChange={({ containsPeople, consent }) => onChange({ containsPeople, consent, consentError: false })}
          />
        ) : null}
        {item.status === 'uploading' ? (
          <ProgressBar value={item.progress} label={t('sources.upload.progress', { percent: Math.round(item.progress * 100) })} />
        ) : null}
        {item.status === 'error' ? (
          <div className="au-queue-error" role="alert">
            <span>{errorText(item.error) || t('errors.generic')}</span>
            <Button size="sm" icon={RotateCcw} onClick={onRetry}>
              {t('common.actions.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Add files: drag & drop, file picker (several at once), phone camera, or paste a screenshot.
 * Images are compressed in the browser first; each file has its own privacy answers and
 * upload progress. Uploads run one after another (kinder to slow connections).
 */
export function UploadPanel({ labId, onUploaded, hasSources = false, onQueueChange }) {
  const { t } = useT()
  const toast = useToast()
  const fileInput = useRef(null)
  const cameraInput = useRef(null)
  const dragDepth = useRef(0)
  const objectUrls = useRef(new Set())
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState([])
  const itemsRef = useRef(items)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls.clear()
      itemsRef.current.forEach((it) => it.controller?.abort())
    }
  }, [])

  const update = useCallback((key, patch) => {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it)))
  }, [])

  const dropItem = useCallback((key) => {
    setItems((list) => {
      const item = list.find((it) => it.key === key)
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl)
        objectUrls.current.delete(item.previewUrl)
      }
      return list.filter((it) => it.key !== key)
    })
  }, [])

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).slice(0, MAX_QUEUE)
      if (!files.length) return
      const fresh = files.map((file) => {
        const kind = fileKind(file)
        return {
          key: newId('q'),
          file,
          prepared: null,
          kind,
          status: kind === 'unknown' ? 'unsupported' : kind === 'image' ? 'preparing' : 'ready',
          progress: 0,
          error: null,
          title: defaultTitle(file, t('sources.upload.untitled')),
          containsPeople: false,
          consent: false,
          consentError: false,
          previewUrl: null,
          originalSize: file.size,
          preparedSize: file.size,
          tooLarge: overSoftLimit(kind, file.size),
          controller: null,
        }
      })
      setItems((list) => [...list, ...fresh])
      const unsupported = fresh.filter((it) => it.status === 'unsupported').length
      const supported = fresh.length - unsupported
      setNotice(
        [supported ? t('sources.upload.added', { count: supported }) : '', unsupported ? t('sources.upload.addedUnsupported', { count: unsupported }) : '']
          .filter(Boolean)
          .join(' '),
      )
      for (const item of fresh.filter((it) => it.kind === 'image')) {
        const prepared = await compressImage(item.file)
        let previewUrl = null
        try {
          previewUrl = URL.createObjectURL(prepared)
          objectUrls.current.add(previewUrl)
        } catch {
          previewUrl = null
        }
        const tooLarge = overSoftLimit('image', prepared.size)
        setItems((list) => {
          if (!list.some((it) => it.key === item.key)) {
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            return list
          }
          return list.map((it) => (it.key === item.key ? { ...it, prepared, preparedSize: prepared.size, previewUrl, tooLarge, status: 'ready' } : it))
        })
      }
    },
    [t],
  )

  // Paste a screenshot (Ctrl+V) anywhere on the page, except into text fields.
  useEffect(() => {
    const onPaste = (event) => {
      const target = event.target
      if (target && (target.closest?.('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return
      const files = Array.from(event.clipboardData?.files || []).filter((f) => fileKind(f) === 'image')
      if (!files.length) return
      event.preventDefault()
      addFiles(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addFiles])

  const uploadOne = async (item) => {
    const controller = new AbortController()
    update(item.key, { status: 'uploading', progress: 0, error: null, controller })
    try {
      const fields = {
        title: (item.title || '').trim().slice(0, 200) || defaultTitle(item.file, t('sources.upload.untitled')),
        contains_people: Boolean(item.containsPeople),
        consent_confirmed: Boolean(item.containsPeople && item.consent),
      }
      const source = await upload(`/api/labs/${labId}/sources`, item.prepared || item.file, {
        fields,
        signal: controller.signal,
        onProgress: (p) => update(item.key, { progress: p }),
      })
      await onUploaded(source)
      dropItem(item.key)
      return true
    } catch (error) {
      if (error?.name === 'AbortError') update(item.key, { status: 'ready', progress: 0, controller: null })
      else update(item.key, { status: 'error', error, controller: null })
      return false
    }
  }

  const uploadAll = async () => {
    if (running) return
    const queue = itemsRef.current.filter((it) => it.status === 'ready' || it.status === 'error')
    const blocked = queue.filter((it) => it.containsPeople && !it.consent)
    blocked.forEach((it) => update(it.key, { consentError: true }))
    const toSend = queue.filter((it) => !(it.containsPeople && !it.consent))
    if (!toSend.length) {
      if (blocked.length) setNotice(t('sources.upload.consentBlocked', { count: blocked.length }))
      return
    }
    setRunning(true)
    let ok = 0
    for (const item of toSend) {
      const current = itemsRef.current.find((it) => it.key === item.key)
      if (!current) continue
      // eslint-disable-next-line no-await-in-loop
      if (await uploadOne(current)) ok += 1
    }
    setRunning(false)
    if (ok) {
      toast.success(t('sources.upload.done', { count: ok }))
      setNotice(t('sources.upload.done', { count: ok }))
    }
    if (blocked.length) setNotice(t('sources.upload.consentBlocked', { count: blocked.length }))
  }

  const pending = items.filter((it) => it.status === 'ready' || it.status === 'error')
  const preparing = items.some((it) => it.status === 'preparing')
  // The step's one pear action follows the work: pick files first, then upload them.
  const waiting = pending.length + (preparing ? 1 : 0)
  useEffect(() => {
    onQueueChange?.(waiting)
  }, [waiting, onQueueChange])
  const onPick = (e) => {
    addFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="stack">
      <p className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </p>
      <div
        className={['dropzone', 'au-dropzone', dragging ? 'dragging' : ''].filter(Boolean).join(' ')}
        onDragEnter={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
          e.preventDefault()
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(e) => {
          if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (!dragDepth.current) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addFiles(e.dataTransfer?.files)
        }}
      >
        <div>
          <p className="au-dropzone-title">{dragging ? t('sources.upload.dropNow') : t('sources.upload.dropTitle')}</p>
          <p className="small muted" style={{ margin: 0 }}>
            {t('sources.upload.dropHint')}
          </p>
        </div>
        <div className="au-dropzone-actions">
          <Button variant={hasSources || items.length ? undefined : 'primary'} icon={FilePlus2} onClick={() => fileInput.current?.click()}>
            {t('sources.upload.pick')}
          </Button>
          <Button icon={Camera} onClick={() => cameraInput.current?.click()}>
            {t('sources.upload.camera')}
          </Button>
        </div>
        <p className="au-dropzone-types">{t('sources.upload.types')}</p>
        <input ref={fileInput} type="file" multiple accept={ACCEPT_FILES} className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onPick} />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={onPick} />
      </div>

      {items.length ? (
        <section className="stack-sm" aria-label={t('sources.upload.queueTitle')}>
          <div className="au-queue-head">
            <h4>{t('sources.upload.queueTitle')}</h4>
            <span className="small muted">{t('sources.upload.queueHint')}</span>
          </div>
          <ul className="list-reset au-queue">
            {items.map((item) => (
              <QueueItem
                key={item.key}
                item={item}
                onChange={(patch) => update(item.key, patch)}
                onRemove={() => dropItem(item.key)}
                onCancel={() => item.controller?.abort()}
                onRetry={async () => {
                  if (item.containsPeople && !item.consent) {
                    update(item.key, { consentError: true })
                    return
                  }
                  if (running) return
                  setRunning(true)
                  const ok = await uploadOne(item)
                  setRunning(false)
                  if (ok) toast.success(t('sources.upload.done', { count: 1 }))
                }}
              />
            ))}
          </ul>
          <div className="au-queue-actions">
            <Button variant="primary" icon={Upload} loading={running} disabled={!pending.length || preparing} onClick={uploadAll}>
              {preparing ? t('sources.upload.preparing') : pending.length ? t('sources.upload.uploadAll', { count: pending.length }) : t('sources.upload.uploadNothing')}
            </Button>
            {!running && items.length ? (
              <Button
                variant="ghost"
                onClick={() => {
                  items.forEach((it) => {
                    if (it.previewUrl) {
                      URL.revokeObjectURL(it.previewUrl)
                      objectUrls.current.delete(it.previewUrl)
                    }
                  })
                  setItems([])
                }}
              >
                {t('sources.upload.clear')}
              </Button>
            ) : null}
            {running ? (
              <span className="small muted">
                <CircleCheck size={14} aria-hidden="true" /> {t('sources.upload.keepOpen')}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
