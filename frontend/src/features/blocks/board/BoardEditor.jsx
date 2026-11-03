import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useInRouterContext, useLocation } from 'react-router-dom'
import { Check, ImageUp, RotateCcw, ScanText, WandSparkles } from 'lucide-react'
import { translate, useT } from '../../../i18n/index.jsx'
import { ApiError, post, upload } from '../../../lib/api.js'
import { compressImage } from '../../../lib/image.js'
import { Alert, Button, ConfirmDialog, ErrorMessage } from '../../../components/ui/index.js'
import { defaultTitle } from '../../sources/sourceMeta.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { usePicture } from '../diagram/usePicture.js'
import { useLatest, useOptionalLab } from '../steps/lessonHooks.js'
import { mediaUrl } from '../steps/lessonKit.js'
import { altText, applyRead, BOARD_LIMITS, drawChars, drawKey, isVisible, photoPatch, samePhoto, uncertainCount, visualRequest } from './boardModel.js'
import {
  boardTask,
  cancelBoardTask,
  claimAutoRead,
  clearBoardOutcome,
  drawnKeyOf,
  editorOf,
  knownAsset,
  registerEditor,
  rememberAsset,
  rememberDrawKey,
  runBoardTask,
  settleBoardOutcome,
  useBoardTask,
} from './boardTasks.js'
import { BoardPhotoPicker } from './BoardPhotoPicker.jsx'
import { BoardResult } from './BoardResult.jsx'
import { BoardReview } from './BoardReview.jsx'
import { BoardWait } from './BoardWait.jsx'
import '../steps/lesson.css'
import './board.css'

const STEPS = ['photo', 'review', 'draw']

/** Titles that only mean "nothing chosen yet": a reading may replace them with the board's own. */
const defaultTitles = () => ['vi', 'en'].flatMap((lang) => [translate(lang, 'board.blankTitle'), translate(lang, 'blocks.types.board')])

const upsert = (list, item) => {
  const items = [...(list || [])]
  const i = items.findIndex((x) => x.id === item.id)
  if (i >= 0) items[i] = item
  else items.push(item)
  return items
}

/**
 * Sources and assets come from their own endpoints, so the lab in LabContext adopts them without
 * losing pending edits (the studio's useLabSync pattern): save the edits, then take the saved lab
 * with the new item. Without a studio lab (tests, a preview) there is nothing to adopt.
 */
async function adopt(lab, mutate) {
  if (!lab?.flush || !lab?.replaceLab) return
  let base = null
  try {
    base = await lab.flush()
  } catch {
    base = null
  }
  if (base) lab.replaceLab(mutate(base))
  else await lab.reload?.()
}

/** The block the Sources step's "Clean up handwriting" shortcut asked to read at once (router state). */
function useAutoReadId() {
  const inRouter = useInRouterContext()
  // An editor never moves in or out of a router, so this hook runs in the same order every render.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const location = inRouter ? useLocation() : null
  return location?.state?.boardAutoRead ?? null
}

const prefersReducedMotion = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false)

function BoardSteps({ current }) {
  const { t } = useT()
  return (
    <ol className="bd-steps" aria-label={t('board.steps.label')}>
      {STEPS.map((key, i) => (
        <li key={key} className={i < current ? 'is-done' : i === current ? 'is-current' : undefined} aria-current={i === current ? 'step' : undefined}>
          <span className="bd-step-num" aria-hidden="true">
            {i < current ? <Check /> : i + 1}
          </span>
          <span className="bd-step-label">{t(`board.steps.${key}`)}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Teacher editor of a board block, one primary action a stage:
 *   1. a photo (the lab's pictures, a PDF page, or a new upload) → "Read the handwriting"
 *   2. the reading wait (about 15 s)
 *   3. review: the photo with the frame of every line beside the editable lines → "Draw the clean copy"
 *   4. the drawing wait (30 to 60 s: redraw, then proofreading)
 *   5. the result: the sheet, the proof, the view learners open first, "Redraw"
 * The AI calls run in boardTasks.js, so folding the card never loses a result.
 */
export default function BoardEditor({ block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const lab = useOptionalLab()
  const pickTitleId = useId()
  const rootRef = useRef(null)
  const reviewHeadingRef = useRef(null)
  const resultHeadingRef = useRef(null)
  const pickHeadingRef = useRef(null)
  const blockRef = useLatest(block)
  const onChangeRef = useLatest(onChange)
  const labRef = useLatest(lab)
  const tRef = useLatest(t)
  const task = useBoardTask(block.id)
  const autoReadId = useAutoReadId()
  const photo = usePicture(block.image)
  const items = block.items || []
  const [changing, setChanging] = useState(false)
  const [draft, setDraft] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'replace' | 'again', image }
  const [uploadState, setUploadState] = useState(null) // { progress, error }
  const [keepReview, setKeepReview] = useState(false)

  useLayoutEffect(() => {
    registerEditor(block.id, { block: () => blockRef.current, onChange: (next) => onChangeRef.current?.(next) })
  })

  const set = (patch) => {
    const current = blockRef.current
    onChange({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) })
  }

  const { job, outcome } = task
  const reading = job?.kind === 'read'
  const drawing = job?.kind === 'draw'
  const hasItems = items.length > 0
  const stage = reading ? 'reading' : changing || (!hasItems && !keepReview) ? 'pick' : 'review'
  const canRead = Boolean(env.aiAvailable && env.aiPath('board-read'))

  const visualId = block.visual?.asset_id || null
  const visualSrc = mediaUrl({ asset: visualId ? env.assetById(visualId) || knownAsset(visualId) : null })
  const currentKey = useMemo(() => drawKey(block), [block])
  const drawnFrom = drawnKeyOf(visualId)
  const stale = Boolean(visualId && drawnFrom && drawnFrom !== currentKey)
  const visibleCount = items.filter(isVisible).length
  const unsure = uncertainCount(items)
  const chars = drawChars(block)
  const canDraw = Boolean(env.aiAvailable && env.aiPath('board-visual') && block.image?.source_id && photo.source && visibleCount > 0)

  // ------------------------------------------------------------------ AI calls
  /** Read `image`; with `replace` the reading starts a new board for a new photo (kept only on success). */
  const read = useCallback(
    (image, { replace = false } = {}) => {
      const blockId = blockRef.current.id
      const path = env.aiPath('board-read')
      if (!image?.source_id || !path) return
      const startImage = blockRef.current.image
      runBoardTask(
        blockId,
        'read',
        async (signal) => {
          const res = await post(path, { source_id: image.source_id, page: image.page ?? null }, { signal })
          const editor = editorOf(blockId)
          const current = editor?.block()
          const tt = tRef.current
          if (!current || !samePhoto(current.image, replace ? startImage : image)) return { tone: 'info', message: tt('board.read.stale') }
          const notes = String(res?.notes || '').trim()
          const count = Array.isArray(res?.items) ? res.items.length : 0
          if (!count) return { tone: 'info', message: tt('board.read.nothing'), notes }
          const base = replace ? { ...current, ...photoPatch(image) } : current
          editor.onChange(applyRead(base, res, { defaultTitles: defaultTitles() }))
          return { tone: 'success', message: tt('board.read.done', { count }), notes, read: true }
        },
        { image },
      )
    },
    [env, blockRef, tRef],
  )

  const draw = useCallback(() => {
    const b = blockRef.current
    const blockId = b.id
    const path = env.aiPath('board-visual')
    if (!path || !b.image?.source_id) return
    clearBoardOutcome(blockId)
    runBoardTask(blockId, 'draw', async (signal) => {
      const key = drawKey(b)
      const res = await post(path, visualRequest(b), { signal })
      const assetId = res?.visual?.asset_id || res?.asset?.id
      if (!assetId) throw new ApiError({ code: 'ai_bad_output' })
      if (res.asset) {
        rememberAsset(res.asset)
        await adopt(labRef.current, (l) => ({ ...l, assets: upsert(l.assets, res.asset) }))
      }
      rememberDrawKey(assetId, key)
      const editor = editorOf(blockId)
      const current = editor?.block()
      if (!current) return null
      editor.onChange({ ...current, visual: { source_id: null, page: null, asset_id: assetId }, visual_proof: res.proof || null })
      return { tone: 'success', message: tRef.current('board.draw.done'), drawn: true }
    })
  }, [env, blockRef, labRef, tRef])

  // The Sources step made this block for a photo and opened it here: read once, at once.
  useEffect(() => {
    const b = blockRef.current
    if (!autoReadId || autoReadId !== b.id) return
    if ((b.items || []).length || !b.image?.source_id || !canRead) return
    if (boardTask(b.id).job || !claimAutoRead(b.id)) return
    read(b.image)
  }, [autoReadId, block.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A finished reading or drawing takes the keyboard focus to its result, unless the teacher is
  // working somewhere else meanwhile (a redraw can take a minute).
  useEffect(() => {
    if (!outcome || (!outcome.read && !outcome.drawn)) return
    const target = outcome.drawn ? resultHeadingRef.current : reviewHeadingRef.current
    if (!target) return
    settleBoardOutcome(block.id)
    const active = document.activeElement
    const here = !active || active === document.body || rootRef.current?.contains(active)
    if (!here) return
    target.focus({ preventScroll: true })
    target.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [outcome, block.id, hasItems, visualId])

  // ------------------------------------------------------------------ photo
  const pickImage = changing ? draft || block.image : block.image
  const choose = (image) => {
    clearBoardOutcome(block.id)
    if (changing && hasItems) {
      setDraft(image)
      return
    }
    if (!samePhoto(image, blockRef.current.image)) set(photoPatch(image))
  }
  const onUpload = async (file) => {
    if (!file || !env.labId) return
    setUploadState({ progress: 0, error: null })
    try {
      const prepared = await compressImage(file)
      const source = await upload(`/api/labs/${env.labId}/sources`, prepared, {
        fields: { title: defaultTitle(file, t('board.pick.photoTitle')), contains_people: false, consent_confirmed: false },
        onProgress: (progress) => setUploadState((state) => (state ? { ...state, progress } : state)),
      })
      await adopt(labRef.current, (l) => ({ ...l, sources: upsert(l.sources, source) }))
      setUploadState(null)
      choose({ source_id: source.id, page: source.kind === 'pdf' ? 1 : null, asset_id: null })
    } catch (error) {
      setUploadState(error?.name === 'AbortError' ? null : { progress: 0, error })
    }
  }
  const startRead = () => {
    const image = pickImage
    if (!image?.source_id) return
    if (changing && hasItems) {
      setConfirm({ kind: samePhoto(image, block.image) ? 'again' : 'replace', image })
      return
    }
    read(image)
  }
  const confirmRead = () => {
    const { kind, image } = confirm
    setConfirm(null)
    setChanging(false)
    setDraft(null)
    read(image, { replace: kind === 'replace' })
  }
  const startChange = () => {
    clearBoardOutcome(block.id)
    setChanging(true)
    setDraft(null)
    window.requestAnimationFrame(() => pickHeadingRef.current?.focus({ preventScroll: true }))
  }
  const cancelChange = () => {
    setChanging(false)
    setDraft(null)
    window.requestAnimationFrame(() => reviewHeadingRef.current?.focus({ preventScroll: true }))
  }

  // ------------------------------------------------------------------ messages
  const readOutcome = outcome?.kind === 'read' ? outcome : null
  const drawOutcome = outcome?.kind === 'draw' ? outcome : null
  const readNotes = readOutcome?.notes ? <Alert tone="info">{readOutcome.notes}</Alert> : null
  const drawErrorText = (error) => {
    if (error?.code === 'board_too_long') return t('board.draw.tooLong', { count: error.extra?.chars ?? chars, max: error.extra?.max_chars ?? BOARD_LIMITS.drawChars })
    if (error?.code === 'board_nothing_to_draw') return t('board.draw.nothing')
    return ''
  }
  const drawError = drawOutcome?.error ? (
    drawErrorText(drawOutcome.error) ? (
      <Alert tone="warning" role="alert" title={t('board.draw.failed')}>
        {drawErrorText(drawOutcome.error)}
      </Alert>
    ) : (
      <ErrorMessage error={drawOutcome.error} title={t('board.draw.failed')} onRetry={canDraw ? draw : undefined} />
    )
  ) : null

  const jobImage = job?.image
  const jobSrc = jobImage ? mediaUrl({ source: env.sourceById(jobImage.source_id), page: jobImage.page }) : photo.src
  const stepIndex = stage === 'review' ? (drawing || (visualId && !stale) ? 2 : 1) : 0

  const drawBar =
    !drawing && (!visualId || stale) ? (
      <div className="bd-draw">
        <div className="bd-draw-text">
          <p className="bd-draw-lead">{t('board.draw.lead')}</p>
          {unsure && visibleCount ? <p className="bd-draw-note">{t('board.draw.unsureLeft', { count: unsure })}</p> : null}
          {chars > BOARD_LIMITS.drawChars ? <p className="bd-draw-note">{t('board.draw.long', { count: chars, max: BOARD_LIMITS.drawChars })}</p> : null}
          {!visibleCount ? <p className="bd-draw-note">{t('board.draw.nothing')}</p> : null}
          {visibleCount && !photo.source ? <p className="bd-draw-note">{t('board.draw.noPhoto')}</p> : null}
          {!env.aiAvailable ? <p className="bd-draw-note">{t('common.ai.notConfigured')}</p> : null}
        </div>
        <Button variant="primary" icon={WandSparkles} onClick={draw} disabled={!canDraw}>
          {stale ? t('board.draw.redrawEdited') : t('board.draw.action')}
        </Button>
      </div>
    ) : null

  return (
    <div className="bd-editor" ref={rootRef}>
      <BoardSteps current={stepIndex} />
      <p className="visually-hidden" role="status">
        {outcome?.message || ''}
      </p>

      {stage === 'reading' ? <BoardWait kind="read" startedAt={job.startedAt} photoSrc={jobSrc} onCancel={() => cancelBoardTask(block.id)} /> : null}

      {stage === 'pick' ? (
        <section className="lk-section bd-stage" aria-labelledby={pickTitleId}>
          <div className="bd-sec-text">
            <h4 id={pickTitleId} ref={pickHeadingRef} tabIndex={-1} className="lk-section-title">
              <ImageUp aria-hidden="true" />
              {t('board.pick.title')}
            </h4>
            <p className="lk-hint">
              {t('board.pick.lead')} {t('board.pick.hint')}
            </p>
          </div>
          {readOutcome?.error ? <ErrorMessage error={readOutcome.error} title={t('board.read.failed')} onRetry={pickImage?.source_id && canRead ? startRead : undefined} /> : null}
          {readOutcome?.tone === 'info' ? (
            <Alert tone="info">
              {readOutcome.message}
              {readOutcome.notes ? <span className="bd-alert-more">{readOutcome.notes}</span> : null}
            </Alert>
          ) : null}
          <BoardPhotoPicker value={pickImage} onChoose={choose} onUpload={onUpload} upload={uploadState} canUpload={Boolean(env.labId)} />
          <div className="bd-actions">
            <Button variant="primary" icon={ScanText} onClick={startRead} disabled={!pickImage?.source_id || !canRead}>
              {t('board.pick.read')}
            </Button>
            {changing && hasItems ? (
              <Button variant="ghost" onClick={cancelChange}>
                {t('board.pick.keepOld')}
              </Button>
            ) : null}
            <p className="lk-hint bd-actions-hint">{!env.aiAvailable ? t('common.ai.notConfigured') : pickImage?.source_id ? t('board.pick.readHint') : t('board.pick.needPhoto')}</p>
          </div>
        </section>
      ) : null}

      {stage === 'review' ? (
        <>
          {drawing ? (
            <BoardWait kind="draw" startedAt={job.startedAt} photoSrc={photo.src} onCancel={() => cancelBoardTask(block.id)} />
          ) : visualId ? (
            <BoardResult
              block={block}
              src={visualSrc}
              alt={t('board.result.alt', { text: altText(block) })}
              stale={stale}
              headingRef={resultHeadingRef}
              onShow={(show) => set({ show })}
              onRedraw={draw}
              canRedraw={canDraw}
            />
          ) : null}
          {drawError}
          <BoardReview
            block={block}
            photo={photo}
            onPatch={set}
            disabled={drawing}
            headingRef={reviewHeadingRef}
            onEmptied={() => setKeepReview(true)}
            notice={readNotes}
            tools={
              <>
                <Button variant="ghost" icon={ImageUp} onClick={startChange} disabled={drawing}>
                  {t('board.review.changePhoto')}
                </Button>
                <Button variant="ghost" icon={RotateCcw} onClick={() => setConfirm({ kind: 'again', image: block.image })} disabled={drawing || !canRead || !photo.source}>
                  {t('board.read.again')}
                </Button>
              </>
            }
            footer={drawBar}
          />
        </>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={confirmRead}
        title={confirm?.kind === 'again' ? t('board.read.againTitle') : t('board.pick.replaceTitle')}
        confirmLabel={confirm?.kind === 'again' ? t('board.read.againConfirm') : t('board.pick.replaceConfirm')}
      >
        <p className="bd-dialog-text">{confirm?.kind === 'again' ? t('board.read.againBody') : t('board.pick.replaceBody')}</p>
      </ConfirmDialog>
    </div>
  )
}
