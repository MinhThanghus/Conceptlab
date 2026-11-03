import { useRef } from 'react'
import { Camera, Check, FileText } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { ErrorMessage, ProgressBar } from '../../../components/ui/index.js'
import { previewUrl } from '../../sources/sourceMeta.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { usePicture } from '../diagram/usePicture.js'
import { NumberInput } from '../steps/LessonEditorKit.jsx'
import { ImageStage } from '../steps/MediaStage.jsx'
import { pictureOptions, pictureValue } from '../steps/lessonKit.js'

/**
 * Stage 1 of the board editor: the lab's photos and PDFs as thumbnails, a tile to take or upload
 * a photo (accept="image/*": a phone offers its camera), and the chosen picture large enough to
 * check it is the right page before reading. `value` is an ImageRef or null.
 */
export function BoardPhotoPicker({ value, onChoose, onUpload, upload, canUpload }) {
  const { t } = useT()
  const env = useBlockEnv()
  const inputRef = useRef(null)
  const options = pictureOptions(env.sources || [], [], { includeAssets: false })
  const current = pictureValue(value)
  const chosen = usePicture(value)
  const uploading = Boolean(upload && !upload.error)
  const pdf = chosen.source?.kind === 'pdf' ? chosen.source : null

  const pick = (source) => {
    const page = source.kind === 'pdf' ? (value?.source_id === source.id && value.page ? value.page : 1) : null
    onChoose({ source_id: source.id, page, asset_id: null })
  }

  return (
    <div className="bd-pick">
      <div className="bd-pick-grid" role="group" aria-label={t('board.pick.listLabel')}>
        {canUpload ? (
          <button type="button" className="bd-tile bd-tile-add" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <span className="bd-tile-add-icon" aria-hidden="true">
              <Camera />
            </span>
            <span className="bd-tile-name">{t('board.pick.upload')}</span>
          </button>
        ) : null}
        {options.map((option) => {
          const { source } = option
          const selected = option.value === current
          const thumb = previewUrl(source, { page: 1, scale: 0.5 })
          return (
            <button key={option.value} type="button" className="bd-tile" aria-pressed={selected} onClick={() => pick(source)}>
              <span className="bd-tile-img">
                {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" draggable={false} /> : <FileText aria-hidden="true" />}
                {selected ? (
                  <span className="bd-tile-check" aria-hidden="true">
                    <Check />
                  </span>
                ) : null}
              </span>
              <span className="bd-tile-name">{source.title}</span>
              {source.kind === 'pdf' ? <span className="bd-tile-meta">{t('board.pick.pdfPages', { count: source.page_count || 1 })}</span> : null}
            </button>
          )
        })}
      </div>
      {!options.length ? <p className="lk-hint">{t('board.pick.none')}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="board-upload-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onUpload(file)
        }}
      />
      {uploading ? <ProgressBar value={upload.progress} label={t('board.pick.uploading')} /> : null}
      <ErrorMessage error={upload?.error} title={t('board.pick.uploadFailed')} />
      {chosen.src ? (
        <div className="bd-chosen">
          <ImageStage src={chosen.src} alt={t('board.pick.chosenAlt', { title: chosen.source?.title || '' })} size={chosen.size} maxBlock="min(46vh, 26rem)" loading="eager" />
          {pdf ? (
            <NumberInput
              className="bd-page"
              label={t('board.pick.page')}
              hint={pdf.page_count ? t('board.pick.pageHint', { count: pdf.page_count }) : undefined}
              value={value?.page || 1}
              min={1}
              max={pdf.page_count || 10000}
              integer
              onCommit={(page) => onChoose({ source_id: pdf.id, page, asset_id: null })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
