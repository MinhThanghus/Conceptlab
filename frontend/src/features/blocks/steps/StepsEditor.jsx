import { useEffect, useId, useRef, useState } from 'react'
import { BookOpen, Crosshair, Eraser, Lightbulb, ListOrdered, Plus } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Alert, Badge, Button, Checkbox, ConfirmDialog, EmptyState, TextArea, TextField } from '../../../components/ui/index.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaFields, EditorItem, NumberInput, PicturePicker, SourceRefsEditor } from './LessonEditorKit.jsx'
import { DrawLayer, ImageStage } from './MediaStage.jsx'
import { LIMITS, knownSize, manualLocated, mediaUrl, moveItem, uniqueId } from './lessonKit.js'
import './lesson.css'
import './steps.css'

function hasContent(step) {
  return Boolean(step.title?.trim() || step.body?.trim() || step.check_question?.trim() || step.highlight || step.source_refs?.length)
}

/** Teacher editor for a steps block: order, text, check questions, sources and highlighted regions. */
export default function StepsEditor({ block, onChange }) {
  const { t } = useT()
  const steps = block.steps || []
  const listId = useId()
  const [openId, setOpenId] = useState(() => steps[0]?.id ?? null)
  const [pendingRemove, setPendingRemove] = useState(null)
  const titleInputs = useRef({})
  const focusStep = useRef(null)

  useEffect(() => {
    if (focusStep.current && titleInputs.current[focusStep.current]) {
      titleInputs.current[focusStep.current].focus()
      focusStep.current = null
    }
  })

  const set = (patch) => onChange({ ...block, ...patch })
  const setSteps = (next) => set({ steps: next })
  const updateStep = (id, patch) => setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const addStep = () => {
    if (steps.length >= LIMITS.steps) return
    const id = uniqueId('s', steps.map((s) => s.id))
    setSteps([...steps, { id, title: '', body: '', source_refs: [], highlight: null, check_question: null }])
    setOpenId(id)
    focusStep.current = id
  }
  const removeStep = (id) => {
    setSteps(steps.filter((s) => s.id !== id))
    if (openId === id) setOpenId(null)
  }

  return (
    <div className="lk-editor">
      <BlockMetaFields block={block} onChange={onChange}>
        <div className="lk-section">
          <Checkbox
            label={t('steps.edit.sequenceConfirmed')}
            hint={t('steps.edit.sequenceConfirmedHint')}
            checked={Boolean(block.sequence_confirmed)}
            onChange={(e) => set({ sequence_confirmed: e.target.checked })}
          />
          {!block.sequence_confirmed && block.ai_generated ? (
            <Alert tone="warning">{t('steps.edit.sequenceAiWarning')}</Alert>
          ) : null}
          <div className="lk-grid-2">
            <NumberInput
              label={t('steps.edit.autoplay')}
              hint={t('steps.edit.autoplayHint')}
              value={block.autoplay_seconds ?? 6}
              min={2}
              max={60}
              integer
              onCommit={(v) => set({ autoplay_seconds: v ?? 6 })}
            />
          </div>
        </div>
      </BlockMetaFields>

      <section className="lk-section" aria-labelledby={listId}>
        <h3 id={listId} className="lk-section-title">
          <ListOrdered aria-hidden="true" />
          {t('steps.edit.stepsTitle', { count: steps.length })}
        </h3>
        {steps.length ? (
          <ol className="list-reset stack-sm">
            {steps.map((step, i) => (
              <EditorItem
                key={step.id}
                index={i}
                count={steps.length}
                title={step.title?.trim()}
                emptyTitle={t('steps.edit.untitledStep', { n: i + 1 })}
                open={openId === step.id}
                onToggle={() => setOpenId(openId === step.id ? null : step.id)}
                onMove={(delta) => setSteps(moveItem(steps, i, i + delta))}
                onRemove={() => (hasContent(step) ? setPendingRemove(step) : removeStep(step.id))}
                flags={
                  <>
                    {step.highlight ? (
                      <Badge tone="info" icon={Crosshair} title={t('steps.edit.flagHighlight')}>
                        <span className="visually-hidden">{t('steps.edit.flagHighlight')}</span>
                      </Badge>
                    ) : null}
                    {step.check_question?.trim() ? (
                      <Badge tone="warning" icon={Lightbulb} title={t('steps.edit.flagQuestion')}>
                        <span className="visually-hidden">{t('steps.edit.flagQuestion')}</span>
                      </Badge>
                    ) : null}
                    {step.source_refs?.length ? (
                      <Badge icon={BookOpen} title={t('steps.edit.flagRefs', { count: step.source_refs.length })}>
                        {step.source_refs.length}
                        <span className="visually-hidden"> {t('steps.edit.flagRefs', { count: step.source_refs.length })}</span>
                      </Badge>
                    ) : null}
                  </>
                }
              >
                <StepFields
                  step={step}
                  index={i}
                  inputRef={(el) => {
                    titleInputs.current[step.id] = el
                  }}
                  onChange={(patch) => updateStep(step.id, patch)}
                />
              </EditorItem>
            ))}
          </ol>
        ) : (
          <EmptyState icon={ListOrdered} title={t('steps.edit.emptyTitle')}>
            {t('steps.edit.emptyBody')}
          </EmptyState>
        )}
        <Button icon={Plus} className="lk-add" onClick={addStep} disabled={steps.length >= LIMITS.steps}>
          {t('steps.edit.addStep')}
        </Button>
        {steps.length >= LIMITS.steps ? <p className="lk-limit">{t('steps.edit.limit', { max: LIMITS.steps })}</p> : null}
      </section>

      <ConfirmDialog
        open={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        onConfirm={() => {
          removeStep(pendingRemove.id)
          setPendingRemove(null)
        }}
        tone="danger"
        title={t('steps.edit.removeTitle')}
        confirmLabel={t('common.actions.delete')}
      >
        <p style={{ margin: 0 }}>{t('steps.edit.removeBody', { title: pendingRemove?.title?.trim() || t('steps.edit.untitledStep', { n: steps.findIndex((s) => s.id === pendingRemove?.id) + 1 }) })}</p>
      </ConfirmDialog>
    </div>
  )
}

function StepFields({ step, index, inputRef, onChange }) {
  const { t } = useT()
  return (
    <>
      <TextField ref={inputRef} label={t('steps.edit.stepTitle')} value={step.title || ''} maxLength={LIMITS.short} onChange={(e) => onChange({ title: e.target.value })} />
      <TextArea label={t('steps.edit.body')} hint={t('steps.edit.bodyHint')} rows={5} maxLength={LIMITS.long} value={step.body || ''} onChange={(e) => onChange({ body: e.target.value })} />
      <TextArea
        label={t('steps.edit.checkQuestion')}
        hint={t('steps.edit.checkQuestionHint')}
        rows={2}
        maxLength={LIMITS.medium}
        value={step.check_question || ''}
        onChange={(e) => onChange({ check_question: e.target.value || null })}
      />
      <HighlightEditor value={step.highlight} stepName={step.title?.trim() || t('steps.edit.untitledStep', { n: index + 1 })} onChange={(highlight) => onChange({ highlight })} />
      <SourceRefsEditor refs={step.source_refs || []} max={LIMITS.stepRefs} onChange={(source_refs) => onChange({ source_refs })} />
    </>
  )
}

function HighlightEditor({ value, stepName, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const source = value?.source_id ? env.sourceById(value.source_id) : null
  const src = mediaUrl({ source, page: value?.page })
  const picture = value?.source_id ? { source_id: value.source_id, page: value.page ?? null, asset_id: null } : null

  const choosePicture = (pic) => {
    if (!pic) return onChange(null)
    const nextSource = env.sourceById(pic.source_id)
    const same = value?.source_id === pic.source_id && (value?.page ?? null) === (pic.page ?? null)
    const next = {
      source_id: pic.source_id,
      page: pic.page ?? null,
      page_label: same ? value?.page_label ?? null : null,
      bbox: same ? value?.bbox ?? null : null,
      time: null,
      quote: value?.quote ?? null,
      located: 'none',
    }
    next.located = manualLocated(next, nextSource)
    return onChange(next)
  }

  return (
    <div className="lk-subcard">
      <p className="lk-subcard-title">
        <Crosshair aria-hidden="true" />
        {t('steps.edit.highlightTitle')}
      </p>
      <p className="lk-hint">{t('steps.edit.highlightHint')}</p>
      <PicturePicker value={picture} includeAssets={false} allowNone noneLabel={t('steps.edit.noHighlight')} label={t('steps.edit.highlightSource')} onChange={choosePicture} />
      {src ? (
        <>
          <ImageStage src={src} alt={t('steps.edit.highlightAlt', { name: stepName })} size={knownSize({ source })} maxBlock="60vh">
            <DrawLayer
              value={value?.bbox}
              label={t('steps.edit.drawLabel', { name: stepName })}
              onChange={(bbox) => {
                const next = { ...value, bbox }
                onChange({ ...next, located: bbox ? 'exact' : manualLocated(next, source) })
              }}
            />
          </ImageStage>
          <p className="lk-hint">{value?.bbox ? t('steps.kit.drawHelpEdit') : t('steps.kit.drawHelp')}</p>
          {value?.bbox ? (
            <div>
              <Button
                size="sm"
                variant="ghost"
                icon={Eraser}
                onClick={() => {
                  const next = { ...value, bbox: null }
                  onChange({ ...next, located: manualLocated(next, source) })
                }}
              >
                {t('steps.edit.clearRegion')}
              </Button>
            </div>
          ) : null}
        </>
      ) : value?.source_id && !source ? (
        <p className="lk-hint">{t('steps.kit.missingSource')}</p>
      ) : null}
    </div>
  )
}
