import { useEffect, useId, useMemo, useState } from 'react'
import { FileText, ImageOff, ScanText } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { AIBadge, Button, EmptyState, Segmented } from '../../../components/ui/index.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import { useReportState } from '../steps/lessonHooks.js'
import { boardTutorState } from '../../tutor/chatUtils.js'
import { usePicture } from '../diagram/usePicture.js'
import { altText, boardViews, defaultView, proofState } from './boardModel.js'
import { BoardSheet, sheetBody } from './BoardSheet.jsx'

/** A picture shown whole (object-fit: contain), with a way to try again when it fails to load. */
export function BoardImage({ src, alt, className, loading = 'eager' }) {
  const { t } = useT()
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => setFailed(false), [src])
  if (failed || !src) {
    return (
      <div className={['bd-img-error', className].filter(Boolean).join(' ')} role={src ? 'alert' : undefined}>
        <ImageOff aria-hidden="true" />
        <span>{t('board.view.imageError')}</span>
        {src ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setFailed(false)
              setAttempt((n) => n + 1)
            }}
          >
            {t('common.actions.retry')}
          </button>
        ) : null}
      </div>
    )
  }
  return (
    <img
      key={`${src}#${attempt}`}
      className={['bd-img', className].filter(Boolean).join(' ')}
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Learner view of a board: the clean copy redrawn by AI, the Text view (the checked transcription,
 * typeset) and the original photo. On a lesson slide it fills the sheet: the pictures are sized by
 * the height there is, the Text view scrolls inside its own frame.
 */
export function BoardView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const stageId = useId()
  const slides = env.presentation === 'slides'
  const photo = usePicture(block.image)
  const visual = usePicture(block.visual)
  const body = useMemo(() => sheetBody(block), [block])
  const alt = useMemo(() => altText(block), [block])
  // a title alone is not a Text view: a board nobody has read yet shows its empty state
  const hasText = body.length > 0
  const views = boardViews({ visual: Boolean(visual.src), text: hasText, photo: Boolean(photo.src) })
  const [picked, setPicked] = useState(null)
  const view = picked && views.includes(picked) ? picked : defaultView(block, { translated: Boolean(env.translatedLanguage), views })
  // the tutor gets the view and what the sheet says (visible lines and drawings, never struck ones)
  useReportState(block.id, boardTutorState(block, view))

  if (!hasText && !visual.src) {
    return (
      <BlockFrame block={block}>
        <EmptyState icon={ScanText} title={t('board.view.emptyTitle')}>
          {t('board.view.emptyBody')}
        </EmptyState>
      </BlockFrame>
    )
  }

  const proofOk = proofState(block.visual_proof) === 'ok'
  return (
    <BlockFrame block={block}>
      <div className={slides ? 'bd-view bd-slide' : 'bd-view'} data-view={view}>
        {views.length > 1 ? (
          <div className="bd-view-bar">
            <Segmented label={t('board.view.viewsLabel')} value={view} onChange={setPicked} options={views.map((value) => ({ value, label: t(`board.view.${value}`) }))} />
          </div>
        ) : null}
        {/* on a slide the Text view scrolls inside the stage: keyboard users can reach and scroll it */}
        <div id={stageId} className="bd-view-stage" {...(slides && view === 'text' ? { tabIndex: 0, role: 'region', 'aria-label': t('board.view.text') } : {})}>
          {view === 'visual' ? <BoardImage src={visual.src} alt={alt ? t('board.result.alt', { text: alt }) : t('board.view.redrawn')} /> : null}
          {view === 'text' ? <BoardSheet block={block} photo={photo} columns={slides} /> : null}
          {view === 'photo' ? <BoardImage src={photo.src} alt={alt ? t('board.view.photoAlt', { text: alt }) : t('board.view.photo')} /> : null}
        </div>
        {view === 'visual' ? (
          <div className="bd-view-foot">
            <AIBadge label={t('board.view.redrawn')} />
            {!proofOk && hasText ? (
              <p className="bd-view-note">
                <span>{t('board.view.compare')}</span>
                <Button variant="ghost" icon={FileText} className="bd-view-switch" aria-controls={stageId} onClick={() => setPicked('text')}>
                  {t('board.view.openText')}
                </Button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </BlockFrame>
  )
}
