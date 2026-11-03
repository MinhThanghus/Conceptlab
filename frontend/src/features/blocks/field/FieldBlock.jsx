import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Info, Lightbulb, MessageCircleQuestion, RotateCcw } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, LoadingBlock, Segmented, TextArea } from '../../../components/ui/index.js'
import { newId } from '../../lab/specUtils.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'
import FieldWorkspace from './FieldWorkspace.jsx'
import { SPORTS } from './courts.js'
import { cloneFrames, sanitizeFrames, tutorState } from './fieldUtils.js'
import './field.css'

// Teachers only: the editor is split out so learners on slow networks never download it.
const FieldEditor = lazy(() => import('./FieldEditor.jsx'))

/** Deterministic ids for frames that arrive without them (same input → same ids). */
function sequentialIds() {
  let n = 0
  return (prefix) => {
    n += 1
    return `${prefix}_s${n}`
  }
}

function readStore(key) {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStore(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or disabled: the scratch copy simply is not kept */
  }
}

/**
 * Interactive sports field (spec §8.4, §10.3, Demo 2).
 *   view: learners move players/ball and draw runs/passes on a scratch copy (never saved to
 *         the server), replay the scenario, explain their option and compare it with the
 *         teacher's solution (ghost overlay or side by side).
 *   edit: the teacher builds frames, a solution and can ask Muse for a scenario.
 */
export default function FieldBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="16rem" />}>
        <FieldEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <FieldView block={block} />
}

function FieldView({ block }) {
  const { t } = useT()
  const env = useBlockEnv()
  const sport = SPORTS.includes(block.sport) ? block.sport : 'football'
  const base = useMemo(() => sanitizeFrames(block.frames, sequentialIds()), [block.frames])
  const solution = useMemo(() => sanitizeFrames(block.solution_frames, sequentialIds()), [block.solution_frames])
  const baseKey = useMemo(() => JSON.stringify(base), [base])
  const storeKey = `cl.field.${env.shareCode || env.labId || 'local'}.${block.id}`
  const [stored] = useState(() => {
    const saved = readStore(storeKey)
    return saved && saved.baseKey === baseKey ? saved : null
  })
  const [scratch, setScratch] = useState(() => (stored?.scratch?.length ? stored.scratch : cloneFrames(base)))
  const [explanation, setExplanation] = useState(() => stored?.explanation || '')
  const [compare, setCompare] = useState('off')
  const lastBase = useRef(baseKey)
  const live = useRef({ index: 0, frame: null, total: 0 })
  const envRef = useRef(env)
  envRef.current = env
  const timer = useRef(0)

  // The teacher changed the scenario (e.g. live preview while editing): start again from it.
  useEffect(() => {
    if (lastBase.current === baseKey) return
    lastBase.current = baseKey
    setScratch(cloneFrames(base))
  }, [baseKey, base])

  useEffect(() => {
    writeStore(storeKey, { baseKey, scratch, explanation })
  }, [storeKey, baseKey, scratch, explanation])

  const report = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const { index, frame, total } = live.current
      envRef.current?.reportState?.(block.id, { ...tutorState({ sport, frame, index, total, solutionVisible: compare !== 'off' }), explanation: explanation.trim().slice(0, 600) })
    }, 400)
  }, [block.id, sport, compare, explanation])

  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    report()
  }, [report])

  const onStateChange = useCallback(
    (state) => {
      live.current = state
      report()
    },
    [report],
  )

  const changed = JSON.stringify(scratch) !== baseKey
  const askAi = () => {
    const { index, frame, total } = live.current
    env.ask({
      block_id: block.id,
      item_id: frame?.id,
      selection: explanation.trim().slice(0, 2000),
      state: tutorState({ sport, frame, index, total, solutionVisible: compare !== 'off' }),
      prompt: t('field.view.askPrompt'),
    })
  }

  return (
    <BlockFrame block={block}>
      {block.prompt ? (
        <div className="fb-task">
          <Lightbulb aria-hidden="true" />
          <div>
            <strong>{t('field.view.task')}</strong>
            <p>{block.prompt}</p>
          </div>
        </div>
      ) : null}

      <FieldWorkspace
        mode="learn"
        sport={sport}
        frames={scratch}
        onFramesChange={setScratch}
        ghostFrames={compare === 'ghost' ? solution : null}
        sideFrames={compare === 'side' ? solution : null}
        makeId={newId}
        onStateChange={onStateChange}
        extraActions={
          <Button size="sm" icon={RotateCcw} onClick={() => setScratch(cloneFrames(base))} disabled={!changed}>
            {t('field.view.reset')}
          </Button>
        }
      />
      <p className="small muted row" style={{ gap: '0.4rem', margin: 0, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <Info size={16} aria-hidden="true" style={{ flex: 'none', marginBlockStart: '0.2rem' }} />
        <span>{t('field.view.scratchNote')}</span>
      </p>

      {solution.length ? (
        <div className="stack-sm">
          <span className="field-label">{t('field.view.compareLabel')}</span>
          <Segmented
            value={compare}
            onChange={setCompare}
            label={t('field.view.compareLabel')}
            options={[
              { value: 'off', label: t('field.view.compareOff') },
              { value: 'ghost', label: t('field.view.compareGhost') },
              { value: 'side', label: t('field.view.compareSide') },
            ]}
          />
          <span className="small muted">{t('field.view.compareHint')}</span>
        </div>
      ) : null}

      <TextArea
        label={t('field.view.explainLabel')}
        hint={t('field.view.explainHint')}
        placeholder={t('field.view.explainPlaceholder')}
        rows={3}
        maxLength={1500}
        value={explanation}
        onChange={(e) => setExplanation(e.target.value)}
      />
      {env.aiAvailable ? (
        <div className="row">
          <Button variant="soft" icon={MessageCircleQuestion} onClick={askAi} disabled={!explanation.trim()}>
            {t('field.view.askAi')}
          </Button>
          {!explanation.trim() ? <span className="small muted">{t('field.view.askAiHint')}</span> : null}
        </div>
      ) : null}
    </BlockFrame>
  )
}
