import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Columns2, Search, X } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, TextField } from '../../../components/ui/index.js'
import { NumberInput } from '../../sim/NumberInput.jsx'
import { MAX_ITEMS, SORT_TRACES } from './sorting.js'
import { binarySearchTrace, MAX_SEARCH_ITEMS, normalizeSearch } from './binarySearch.js'
import { formatNumberList, listIssue, parseNumberList } from './algoUtils.js'
import { useStepPlayer } from './useStepPlayer.js'
import { ListField, StepControls, stageKeys } from './stepKit.jsx'
import { counterVerdict, laneDone, laneFrame, linearComparisons, movesKey, SEARCH_PRESETS, searchPreset, searchPresetOf, SORT_PRESETS, sortCellState, sortPreset, sortPresetOf } from './compare.js'

/*
 * "Compare two small inputs" (spec §10.3): the same algorithm runs on input A and input B,
 * side by side, driven by one shared step player so the learner sees which input needs
 * more comparisons / swaps. Opt-in panel under the main walk-through.
 */

const LANES = ['A', 'B']
const MARK = { compare: '?', swap: '⇄', sorted: '✓', write: '↓' }

function LaneTag({ lane }) {
  return (
    <span className="alg-cmp-tag" data-lane={lane} aria-hidden="true">
      {lane}
    </span>
  )
}

/** Heading + open/close; the body renders only while comparing. Focus follows the change. */
function CompareShell({ hint, open, onOpen, onClose, focusRef, children }) {
  const { t } = useT()
  const uid = useId().replace(/[:]/g, '')
  const startRef = useRef(null)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (wasOpen.current === open) return
    wasOpen.current = open
    if (open) focusRef.current?.focus({ preventScroll: true })
    else startRef.current?.focus({ preventScroll: true })
  }, [open, focusRef])
  return (
    <section className="alg-cmp" aria-labelledby={`${uid}-title`}>
      <div className="alg-cmp-head">
        <h3 id={`${uid}-title`} className="ix-heading alg-heading">
          {t('algorithm.compare.title')}
        </h3>
        {open ? (
          <Button size="sm" variant="ghost" icon={X} onClick={onClose}>
            {t('algorithm.compare.stop')}
          </Button>
        ) : null}
      </div>
      {open ? (
        children
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {hint}
          </p>
          <div>
            <Button ref={startRef} size="sm" icon={Columns2} onClick={onOpen}>
              {t('algorithm.compare.start')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

function PresetChips({ lane, kinds, chosen, onPick }) {
  const { t } = useT()
  return (
    <div className="alg-presets" role="group" aria-label={t('algorithm.compare.presetsLabel', { lane })}>
      {kinds.map((kind) => (
        <button key={kind} type="button" className="chip" aria-pressed={kind === 'random' ? undefined : chosen === kind} onClick={() => onPick(kind)}>
          {t(`algorithm.compare.preset.${kind}`)}
        </button>
      ))}
    </div>
  )
}

function LaneStatus({ frames, index, extra }) {
  const { t } = useT()
  const done = laneDone(frames, index)
  return (
    <p className="alg-cmp-lane-head">
      {done ? (
        <span className="alg-cmp-done">{t('algorithm.compare.done', { count: frames.length })}</span>
      ) : (
        <span>
          {t('algorithm.controls.stepOf', {
            n: index + 1,
            total: frames.length,
          })}
        </span>
      )}
      {extra}
    </p>
  )
}

/** One-line message under the lanes: how to start, who finished first, then the verdict. */
function useCompareMessage(frames, index, verdicts) {
  const { t } = useT()
  const doneA = laneDone(frames.A, index)
  const doneB = laneDone(frames.B, index)
  if (doneA && doneB) {
    return verdicts
      .map(({ kind, v }) =>
        v.kind === 'same'
          ? t(`algorithm.compare.same.${kind}`, { n: v.count })
          : t(`algorithm.compare.more.${kind}`, {
              more: v.more,
              less: v.less,
              moreCount: v.moreCount,
              lessCount: v.lessCount,
            }),
      )
      .join(' ')
  }
  if (index === 0) return t('algorithm.compare.ready')
  if (doneA || doneB) {
    const first = doneA ? 'A' : 'B'
    return t('algorithm.compare.oneDone', {
      done: first,
      other: first === 'A' ? 'B' : 'A',
      count: (first === 'A' ? frames.A : frames.B).length,
    })
  }
  return t('algorithm.compare.running')
}

// ----------------------------------------------------------------------------- sorting
function SortLaneInput({ id, lane, values, mine, onApply }) {
  const { t, lang } = useT()
  const [text, setText] = useState(() => formatNumberList(values, lang))
  useEffect(() => setText(formatNumberList(values, lang)), [values, lang])
  const parsed = parseNumberList(text)
  const issue = listIssue(parsed, { min: 2, max: MAX_ITEMS })
  const dirty = !issue && parsed.values.join(',') !== values.join(',')
  return (
    <fieldset className="alg-cmp-input">
      <legend>
        <LaneTag lane={lane} />
        {t('algorithm.compare.lane', { lane })}
      </legend>
      <ListField id={id} label={t('algorithm.sort.arrayLabel', { max: MAX_ITEMS })} text={text} onText={setText} issue={issue} dirty={dirty} onApply={() => !issue && onApply(parsed.values)} />
      <PresetChips lane={lane} kinds={SORT_PRESETS} chosen={sortPresetOf(values, mine)} onPick={(kind) => onApply(sortPreset(kind, mine))} />
    </fieldset>
  )
}

function SortLane({ lane, frames, index, algorithm }) {
  const { t, fmt, lang } = useT()
  const frame = laneFrame(frames, index)
  const values = frame.array
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  const moves = movesKey(algorithm)
  const sep = lang === 'vi' && values.some((v) => !Number.isInteger(v)) ? '; ' : ', '
  return (
    <div className={['alg-cmp-lane', laneDone(frames, index) ? 'is-done' : ''].filter(Boolean).join(' ')}>
      <div className="alg-cmp-lane-title">
        <LaneTag lane={lane} />
        <span className="visually-hidden">{t('algorithm.compare.lane', { lane })}</span>
        <LaneStatus frames={frames} index={index} />
      </div>
      <div className="alg-bars" style={{ '--n': values.length }} aria-hidden="true">
        {values.map((v, i) => {
          const state = sortCellState(frame, i, algorithm)
          const h = (Math.abs(v) / span) * 100
          const bottom = v >= 0 ? zero : zero - h
          return (
            <div key={i} className={`alg-col${state ? ` is-${state}` : ''}`}>
              <div className="alg-plot">
                {lo < 0 ? <span className="alg-zero" style={{ bottom: `${zero}%` }} /> : null}
                <span className="alg-bar" style={{ '--b': bottom, '--h': h }} />
              </div>
              <span className="alg-mark">{MARK[state] || ''}</span>
            </div>
          )
        })}
      </div>
      <p className="alg-cmp-list">
        {values.map((v, i) => {
          const state = sortCellState(frame, i, algorithm)
          // the bars and marks above are hidden from screen readers, so the list says which cells are in play
          const live = state === 'compare' || state === 'swap' || state === 'write'
          return (
            <span key={i}>
              {i ? sep : ''}
              <span className={live ? `is-${state}` : undefined}>{fmt.number(v, 2)}</span>
              {live ? <span className="visually-hidden"> ({t(`algorithm.sort.cellState.${state}`)})</span> : null}
            </span>
          )
        })}
      </p>
      {Array.isArray(frame.buffer) ? <p className="small">{t('algorithm.sort.temporary')}: {frame.buffer.map((v) => fmt.number(v, 4)).join(', ') || t('algorithm.sort.emptyBuffer')}</p> : null}
      <dl className="alg-cmp-counts">
        <div>
          <dt>{t('algorithm.counters.comparisons')}</dt>
          <dd>{frame.comparisons}</dd>
        </div>
        <div>
          <dt>{t(`algorithm.counters.${moves}`)}</dt>
          <dd>{frame[moves]}</dd>
        </div>
      </dl>
    </div>
  )
}

export function SortCompare({ algorithm, mine, onReport }) {
  const { t } = useT()
  const uid = useId().replace(/[:]/g, '')
  const stageRef = useRef(null)
  const [lists, setLists] = useState(null)
  const [speed, setSpeed] = useState(1)
  const open = Boolean(lists)
  const trace = SORT_TRACES[algorithm]
  const frames = useMemo(() => (lists ? { A: trace(lists.A), B: trace(lists.B) } : { A: [], B: [] }), [lists, trace])
  const count = Math.max(frames.A.length, frames.B.length)
  const player = useStepPlayer(count, {
    speed,
    rootRef: stageRef,
    resetKey: `${algorithm}|${JSON.stringify(lists)}`,
  })
  const moves = movesKey(algorithm)
  const fa = laneFrame(frames.A, player.index)
  const fb = laneFrame(frames.B, player.index)
  const verdicts =
    fa && fb
      ? [
          {
            kind: 'comparisons',
            v: counterVerdict(fa.comparisons, fb.comparisons),
          },
          { kind: moves, v: counterVerdict(fa[moves], fb[moves]) },
        ]
      : []
  const message = useCompareMessage(frames, player.index, verdicts)

  const report = open
    ? {
        step: player.index + 1,
        steps: count,
        A: {
          input: lists.A,
          comparisons: fa.comparisons,
          [moves]: fa[moves],
          done: laneDone(frames.A, player.index),
        },
        B: {
          input: lists.B,
          comparisons: fb.comparisons,
          [moves]: fb[moves],
          done: laneDone(frames.B, player.index),
        },
      }
    : null
  const reportJson = JSON.stringify(report)
  const onReportRef = useRef(onReport)
  onReportRef.current = onReport
  useEffect(() => {
    onReportRef.current?.(reportJson === 'null' ? null : JSON.parse(reportJson))
  }, [reportJson])

  return (
    <CompareShell
      hint={t('algorithm.compare.hint')}
      open={open}
      onOpen={() =>
        setLists({
          A: sortPreset('ascending', mine),
          B: sortPreset('descending', mine),
        })
      }
      onClose={() => setLists(null)}
      focusRef={stageRef}
    >
      {open ? (
        <>
          <div
            ref={stageRef}
            className="alg-cmp-stage"
            role="group"
            tabIndex={0}
            aria-label={t('algorithm.compare.stageLabel', {
              name: t(`algorithm.names.${algorithm}`),
            })}
            aria-describedby={`${uid}-keys`}
            onKeyDown={stageKeys(player)}
          >
            {LANES.map((lane) => (
              <SortLane key={lane} lane={lane} frames={frames[lane]} index={player.index} algorithm={algorithm} />
            ))}
            <p id={`${uid}-keys`} className="visually-hidden">
              {t('algorithm.keysHint')}
            </p>
          </div>
          <StepControls player={player} count={count} speed={speed} onSpeed={setSpeed} label={t('algorithm.compare.controlsLabel')} primary={false} />
          <p className="alg-msg" aria-live="polite">
            {message}
          </p>
          <div className="alg-cmp-inputs">
            {LANES.map((lane) => (
              <SortLaneInput key={lane} id={`${uid}-${lane}`} lane={lane} values={lists[lane]} mine={mine} onApply={(next) => setLists((prev) => ({ ...prev, [lane]: next }))} />
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('algorithm.compare.note')}
          </p>
        </>
      ) : null}
    </CompareShell>
  )
}

// ----------------------------------------------------------------------------- binary search
function SearchLaneInput({ id, lane, value, mine, onApply }) {
  const { t, lang } = useT()
  const [text, setText] = useState(() => formatNumberList(value.array, lang))
  const [target, setTarget] = useState(value.target)
  useEffect(() => {
    setText(formatNumberList(value.array, lang))
    setTarget(value.target)
  }, [value, lang])
  const parsed = parseNumberList(text)
  const issue = listIssue(parsed, { min: 1, max: MAX_SEARCH_ITEMS })
  const dirty = !issue && Number.isFinite(target) && (parsed.values.join(',') !== value.array.join(',') || target !== value.target)
  return (
    <fieldset className="alg-cmp-input">
      <legend>
        <LaneTag lane={lane} />
        {t('algorithm.compare.lane', { lane })}
      </legend>
      <form
        className="alg-list-form search"
        onSubmit={(e) => {
          e.preventDefault()
          if (dirty) onApply(normalizeSearch({ array: parsed.values, target }))
        }}
      >
        <TextField
          id={id}
          label={t('algorithm.search.arrayLabel', { max: MAX_SEARCH_ITEMS })}
          value={text}
          maxLength={240}
          spellCheck={false}
          autoComplete="off"
          error={issue ? t(`algorithm.list.${issue.code}`, issue.vars) : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        <NumberInput id={`${id}-target`} label={t('algorithm.search.target')} value={target} required onChange={(v) => setTarget(v)} />
        <Button type="submit" icon={Search} disabled={!dirty}>
          {t('algorithm.search.run')}
        </Button>
      </form>
      <PresetChips lane={lane} kinds={SEARCH_PRESETS} chosen={searchPresetOf(value, mine)} onPick={(kind) => onApply(searchPreset(kind, mine))} />
    </fieldset>
  )
}

function SearchLane({ lane, input, frames, index }) {
  const { t, fmt } = useT()
  const frame = laneFrame(frames, index)
  const done = laneDone(frames, index)
  const last = frames[frames.length - 1]
  const result = done ? (last.found >= 0 ? t('algorithm.compare.foundAt', { index: last.found }) : t('algorithm.compare.notFound')) : null
  return (
    <div className={['alg-cmp-lane', done ? 'is-done' : ''].filter(Boolean).join(' ')}>
      <div className="alg-cmp-lane-title">
        <LaneTag lane={lane} />
        <span className="visually-hidden">{t('algorithm.compare.lane', { lane })}</span>
        <LaneStatus frames={frames} index={index} />
      </div>
      <p className="alg-cmp-target">
        {t('algorithm.search.lookingFor')} <strong className="alg-target-value">{fmt.number(input.target, 4)}</strong>
      </p>
      <ol className="alg-cmp-cells">
        {input.array.map((v, i) => {
          const out = frame.eliminated.includes(i)
          const found = frame.found === i
          const probe = frame.mid === i && !found
          const cls = ['alg-cell-box', out ? 'is-out' : '', frame.mid === i ? 'is-mid' : '', found ? 'is-found' : ''].filter(Boolean).join(' ')
          return (
            <li key={i} className={cls}>
              <span className="alg-box">
                {fmt.number(v, 2)}
                {out ? <span className="visually-hidden"> ({t('algorithm.search.eliminated')})</span> : null}
                {probe ? <span className="visually-hidden"> ({t('algorithm.search.mid')})</span> : null}
                {found ? <span className="visually-hidden"> ({t('algorithm.search.found')})</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
      {result ? <p className="alg-cmp-result">{result}</p> : null}
      <dl className="alg-cmp-counts">
        <div>
          <dt>{t('algorithm.counters.comparisons')}</dt>
          <dd>{frame.comparisons}</dd>
        </div>
        <div>
          <dt>{t('algorithm.counters.linear')}</dt>
          <dd>{done ? linearComparisons(input.array, last.found) : '…'}</dd>
        </div>
      </dl>
    </div>
  )
}

export function SearchCompare({ mine, onReport }) {
  const { t } = useT()
  const uid = useId().replace(/[:]/g, '')
  const stageRef = useRef(null)
  const [inputs, setInputs] = useState(null)
  const [speed, setSpeed] = useState(1)
  const open = Boolean(inputs)
  const frames = useMemo(
    () =>
      inputs
        ? {
            A: binarySearchTrace(inputs.A.array, inputs.A.target),
            B: binarySearchTrace(inputs.B.array, inputs.B.target),
          }
        : { A: [], B: [] },
    [inputs],
  )
  const count = Math.max(frames.A.length, frames.B.length)
  const player = useStepPlayer(count, {
    speed,
    rootRef: stageRef,
    resetKey: JSON.stringify(inputs),
  })
  const fa = laneFrame(frames.A, player.index)
  const fb = laneFrame(frames.B, player.index)
  const verdicts =
    fa && fb
      ? [
          {
            kind: 'comparisons',
            v: counterVerdict(fa.comparisons, fb.comparisons),
          },
        ]
      : []
  const message = useCompareMessage(frames, player.index, verdicts)

  const laneReport = (lane, f) => ({
    array: inputs[lane].array,
    target: inputs[lane].target,
    comparisons: f.comparisons,
    found: laneDone(frames[lane], player.index) ? frames[lane].at(-1).found : null,
  })
  const reportJson = JSON.stringify(
    open
      ? {
          step: player.index + 1,
          steps: count,
          A: laneReport('A', fa),
          B: laneReport('B', fb),
        }
      : null,
  )
  const onReportRef = useRef(onReport)
  onReportRef.current = onReport
  useEffect(() => {
    onReportRef.current?.(reportJson === 'null' ? null : JSON.parse(reportJson))
  }, [reportJson])

  return (
    <CompareShell
      hint={t('algorithm.compare.hintSearch')}
      open={open}
      onOpen={() =>
        setInputs({
          A: searchPreset('middle', mine),
          B: searchPreset('absent', mine),
        })
      }
      onClose={() => setInputs(null)}
      focusRef={stageRef}
    >
      {open ? (
        <>
          <div
            ref={stageRef}
            className="alg-cmp-stage"
            role="group"
            tabIndex={0}
            aria-label={t('algorithm.compare.stageLabel', {
              name: t('algorithm.names.binary_search'),
            })}
            aria-describedby={`${uid}-keys`}
            onKeyDown={stageKeys(player)}
          >
            {LANES.map((lane) => (
              <SearchLane key={lane} lane={lane} input={inputs[lane]} frames={frames[lane]} index={player.index} />
            ))}
            <p id={`${uid}-keys`} className="visually-hidden">
              {t('algorithm.keysHint')}
            </p>
          </div>
          <StepControls player={player} count={count} speed={speed} onSpeed={setSpeed} label={t('algorithm.compare.controlsLabel')} primary={false} />
          <p className="alg-msg" aria-live="polite">
            {message}
          </p>
          <div className="alg-cmp-inputs">
            {LANES.map((lane) => (
              <SearchLaneInput key={lane} id={`${uid}-${lane}`} lane={lane} value={inputs[lane]} mine={mine} onApply={(next) => setInputs((prev) => ({ ...prev, [lane]: next }))} />
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {t('algorithm.compare.note')}
          </p>
        </>
      ) : null}
    </CompareShell>
  )
}
