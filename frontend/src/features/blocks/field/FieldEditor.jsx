import { useState } from 'react'
import { Check, Save, Target, Trash2, WandSparkles, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { post } from '../../../lib/api.js'
import {
  AIBadge,
  Alert,
  Button,
  Checkbox,
  ConfirmDialog,
  ErrorMessage,
  SelectField,
  Spinner,
  Switch,
  TextArea,
  useToast,
} from '../../../components/ui/index.js'
import { newId } from '../../lab/specUtils.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaFields, useAiTask } from '../video/editorKit.jsx'
import FieldWorkspace from './FieldWorkspace.jsx'
import { courtOf, SPORTS } from './courts.js'
import { blankFrame, cloneFrames, sanitizeFrames } from './fieldUtils.js'
import './field.css'

/** Teacher editor for a field block (spec §8.4). Lazy-loaded by FieldBlock in edit mode. */
export default function FieldEditor({ block, onChange }) {
  const { t, fmt } = useT()
  const toast = useToast()
  const sport = SPORTS.includes(block.sport) ? block.sport : 'football'
  const frames = block.frames || []
  const solution = block.solution_frames || []
  const [showGhost, setShowGhost] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const size = courtOf(sport)

  const saveSolution = () => {
    const copy = cloneFrames(frames.length ? frames : [blankFrame(newId('f'))])
    onChange({ ...block, solution_frames: copy })
    setConfirmReplace(false)
    toast.success(t('field.solution.saved', { count: copy.length }))
  }
  const clearSolution = () => {
    onChange({ ...block, solution_frames: [] })
    setShowGhost(false)
    setConfirmClear(false)
    toast.info(t('field.solution.cleared'))
  }

  return (
    <div className="stack fb-editor">
      <BlockMetaFields block={block} onChange={onChange} confirmHint={t('field.editor.confirmHint')} />

      <div className="grid-2" style={{ gap: 'var(--cl-space-3)' }}>
        <SelectField
          label={t('field.editor.sport')}
          hint={t('field.editor.sportHint', { length: fmt.number(size.length, 1), width: fmt.number(size.width, 1) })}
          value={sport}
          options={SPORTS.map((s) => ({ value: s, label: t(`field.sports.${s}`) }))}
          onChange={(e) => onChange({ ...block, sport: e.target.value })}
        />
        <TextArea
          label={t('field.editor.prompt')}
          hint={t('field.editor.promptHint')}
          placeholder={t('field.editor.promptPlaceholder')}
          rows={3}
          maxLength={2000}
          value={block.prompt || ''}
          onChange={(e) => onChange({ ...block, prompt: e.target.value })}
        />
      </div>

      <AiScenario sport={sport} block={block} onChange={onChange} />

      <section className="fb-section" aria-labelledby={`${block.id}-board-h`}>
        <h3 id={`${block.id}-board-h`}>{t('field.editor.boardTitle')}</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {t('field.editor.boardHint')}
        </p>
        <FieldWorkspace
          mode="edit"
          sport={sport}
          frames={frames}
          onFramesChange={(next) => onChange({ ...block, frames: next })}
          ghostFrames={showGhost ? solution : null}
          makeId={newId}
        />
      </section>

      <section className="fb-section card-muted" aria-labelledby={`${block.id}-sol-h`}>
        <h3 id={`${block.id}-sol-h`}>{t('field.solution.title')}</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {t('field.solution.hint')}
        </p>
        <p style={{ margin: 0 }}>{solution.length ? t('field.solution.has', { count: solution.length }) : t('field.solution.none')}</p>
        <div className="row">
          <Button icon={Save} onClick={() => (solution.length ? setConfirmReplace(true) : saveSolution())}>
            {t('field.solution.save')}
          </Button>
          {solution.length ? <Switch label={t('field.solution.showGhost')} checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} /> : null}
          {solution.length ? (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirmClear(true)}>
              {t('field.solution.clear')}
            </Button>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirmReplace}
        onClose={() => setConfirmReplace(false)}
        onConfirm={saveSolution}
        title={t('field.solution.replaceTitle')}
        confirmLabel={t('field.solution.replaceConfirm')}
      >
        <p style={{ margin: 0 }}>{t('field.solution.replaceBody', { count: frames.length || 1 })}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearSolution}
        title={t('field.solution.clearTitle')}
        confirmLabel={t('field.solution.clearConfirm')}
        tone="danger"
      >
        <p style={{ margin: 0 }}>{t('field.solution.clearBody')}</p>
      </ConfirmDialog>
    </div>
  )
}

/** Describe a play in words → Muse proposes frames (POST …/ai/field-scenario) → preview → apply. */
function AiScenario({ sport, block, onChange }) {
  const { t } = useT()
  const env = useBlockEnv()
  const toast = useToast()
  const task = useAiTask()
  const [desc, setDesc] = useState('')
  const [result, setResult] = useState(null)
  const [usePrompt, setUsePrompt] = useState(true)
  const [empty, setEmpty] = useState(false)
  const path = env.aiPath('field-scenario')
  const aiReady = Boolean(env.aiAvailable && path)
  const hasContent = (block.frames || []).some((f) => (f.players || []).length || (f.arrows || []).length)

  const run = async (event) => {
    event?.preventDefault()
    const text = desc.trim()
    if (text.length < 3 || !aiReady) return
    setEmpty(false)
    const res = await task.run((signal) => post(path, { sport, description: text.slice(0, 2000) }, { signal }))
    if (!res) return
    const frames = sanitizeFrames(res.frames, newId)
    if (!frames.length) {
      setResult(null)
      setEmpty(true)
      return
    }
    setResult({ sport, prompt: String(res.prompt || '').slice(0, 2000), frames })
    setUsePrompt(!(block.prompt || '').trim())
  }

  const apply = () => {
    if (!result) return
    onChange({
      ...block,
      sport: result.sport,
      frames: result.frames,
      prompt: usePrompt && result.prompt ? result.prompt : block.prompt,
      ai_generated: true,
      confirmed: false,
    })
    setResult(null)
    toast.success(t('field.ai.applied'))
  }
  const applyAsSolution = () => {
    if (!result) return
    onChange({ ...block, sport: result.sport, solution_frames: result.frames, ai_generated: true, confirmed: false })
    setResult(null)
    toast.success(t('field.ai.appliedSolution'))
  }

  return (
    <section className="fb-section card-muted" aria-labelledby={`${block.id}-ai-h`}>
      <h3 id={`${block.id}-ai-h`}>{t('field.ai.title')}</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {t('field.ai.intro')}
      </p>
      <form className="stack-sm" onSubmit={run}>
        <TextArea
          label={t('field.ai.descLabel')}
          hint={t('field.ai.descHint')}
          placeholder={t(`field.ai.placeholders.${sport}`)}
          rows={3}
          maxLength={2000}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={task.busy}
        />
        <div className="row">
          <Button type="submit" variant="soft" icon={WandSparkles} loading={task.busy} disabled={!aiReady || desc.trim().length < 3}>
            {t('field.ai.run')}
          </Button>
          {task.busy ? (
            <Button size="sm" onClick={task.cancel}>
              {t('common.actions.cancel')}
            </Button>
          ) : null}
          {!aiReady ? <span className="small muted">{t('common.ai.notConfigured')}</span> : null}
        </div>
      </form>
      {task.busy ? <Spinner label={t('field.ai.working')} /> : null}
      <ErrorMessage error={task.error} onRetry={run} />
      {empty ? (
        <Alert tone="warning" role="alert">
          {t('field.ai.empty')}
        </Alert>
      ) : null}
      {result ? (
        <div className="stack-sm">
          <div className="row" style={{ gap: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>{t('field.ai.previewTitle')}</h4>
            <AIBadge />
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('field.ai.reviewHint')}
          </p>
          {result.prompt ? (
            <p style={{ margin: 0 }}>
              <strong>{t('field.ai.suggestedPrompt')}</strong> {result.prompt}
            </p>
          ) : null}
          <FieldWorkspace mode="preview" sport={result.sport} frames={result.frames} makeId={newId} boardLabel={t('field.ai.previewBoard')} />
          {result.prompt ? <Checkbox label={t('field.ai.usePrompt')} checked={usePrompt} onChange={(e) => setUsePrompt(e.target.checked)} /> : null}
          <div className="row">
            <Button variant="primary" icon={Check} onClick={apply}>
              {t('field.ai.apply')}
            </Button>
            <Button icon={Target} onClick={applyAsSolution}>
              {t('field.ai.applySolution')}
            </Button>
            <Button variant="ghost" icon={X} onClick={() => setResult(null)}>
              {t('field.ai.discard')}
            </Button>
          </div>
          {hasContent ? (
            <p className="small muted" style={{ margin: 0 }}>
              {t('field.ai.replaceNote')}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
