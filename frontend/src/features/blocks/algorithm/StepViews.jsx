import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Dices, RotateCcw, Search, Shuffle } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, TextField } from '../../../components/ui/index.js'
import { NumberInput } from '../../sim/NumberInput.jsx'
import { useReportState } from '../../sim/useReportState.js'
import { MAX_ITEMS, normalizeSort, PSEUDOCODE, randomArray, shuffled, SORT_TRACES, sortInputIssue } from './sorting.js'
import { binarySearchTrace, linearSearchTrace, MAX_SEARCH_ITEMS, normalizeLinearSearch, normalizeSearch, SEARCH_PSEUDOCODE, LINEAR_PSEUDOCODE } from './binarySearch.js'
import { formatNumberList, listIssue, parseNumberList } from './algoUtils.js'
import { useStepPlayer } from './useStepPlayer.js'
import { ExplanationSection, ListField, PseudoCode, StepControls, stageKeys, useFrameText } from './stepKit.jsx'
import { SearchCompare, SortCompare } from './AlgoCompare.jsx'
import { sortCellState } from './compare.js'

export { ExplanationSection, PseudoCode, StepControls, stageKeys, useFrameText }

// ----------------------------------------------------------------------------- sorting
export function SortView({ block, algorithm }) {
  const { t, fmt, lang } = useT()
  const uid = useId().replace(/[:]/g, '')
  const frameText = useFrameText()
  const stageRef = useRef(null)
  const configKey = JSON.stringify(block.config?.array ?? null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => normalizeSort(block.config || {}).array, [configKey])
  const [array, setArray] = useState(initial)
  const [text, setText] = useState(() => formatNumberList(initial, lang))
  const [speed, setSpeed] = useState(1)
  const [compare, setCompare] = useState(null)

  useEffect(() => {
    setArray(initial)
    setText(formatNumberList(initial, lang))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const frames = useMemo(() => SORT_TRACES[algorithm](array), [algorithm, array])
  const player = useStepPlayer(frames.length, {
    speed,
    rootRef: stageRef,
    resetKey: `${algorithm}|${array.join(',')}`,
  })
  const frame = frames[player.index] || frames[0]
  const parsed = parseNumberList(text)
  const issue = listIssue(parsed, { min: 2, max: MAX_ITEMS }) || sortInputIssue(algorithm, parsed.values)
  const dirty = !issue && parsed.values.join(',') !== array.join(',')
  const setBoth = (next) => {
    setArray(next)
    setText(formatNumberList(next, lang))
  }

  useReportState(block.id, {
    type: 'algorithm',
    algorithm,
    input: array,
    step: player.index + 1,
    steps: frames.length,
    array: frame.array,
    comparing: frame.compare,
    swapped: frame.swap,
    sorted_positions: frame.sorted,
    comparisons: frame.comparisons,
    swaps: frame.swaps,
    shifts: frame.shifts,
    writes: frame.writes,
    message: frameText(frame.msg),
    compare: compare || undefined,
  })

  const values = frame.array
  const lo = Math.min(0, ...values)
  const hi = Math.max(0, ...values)
  const span = hi - lo || 1
  const zero = (-lo / span) * 100
  const pointersAt = (i) =>
    Object.entries(frame.pointers || {})
      .filter(([, idx]) => idx === i)
      .map(([name]) => name)
  const stateOf = (i) => sortCellState(frame, i, algorithm)
  const insertion = algorithm === 'insertion_sort'
  const writing = insertion || ['merge_sort', 'counting_sort', 'radix_sort', 'bucket_sort'].includes(algorithm)
  const bounded = ['counting_sort', 'radix_sort', 'bucket_sort'].includes(algorithm)

  return (
    <div className="ix-root stack">
      <div className="alg-input-row">
        <ListField
          id={`${uid}-list`}
          label={t('algorithm.sort.arrayLabel', { max: MAX_ITEMS })}
          hint={t(bounded ? (algorithm === 'counting_sort' ? 'algorithm.list.countingHint' : algorithm === 'radix_sort' ? 'algorithm.list.radixHint' : 'algorithm.list.bucketHint') : 'algorithm.list.hint')}
          text={text}
          onText={setText}
          issue={issue}
          dirty={dirty}
          onApply={() => !issue && setArray(parsed.values)}
        />
        <div className="ix-toolbar">
          <Button size="sm" icon={Shuffle} onClick={() => setBoth(shuffled(array))}>
            {t('algorithm.sort.shuffle')}
          </Button>
          <Button size="sm" icon={Dices} onClick={() => setBoth(randomArray(array.length))}>
            {t('algorithm.sort.random')}
          </Button>
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={array.join(',') === initial.join(',')} onClick={() => setBoth(initial)}>
            {t('algorithm.restoreExample')}
          </Button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="alg-stage"
        role="group"
        tabIndex={0}
        aria-label={t('algorithm.sort.stageLabel', {
          name: t(`algorithm.names.${algorithm}`),
        })}
        aria-describedby={`${uid}-keys`}
        onKeyDown={stageKeys(player)}
      >
        {insertion ? (
          <p className="alg-key" aria-hidden={frame.key === null}>
            {frame.key !== null ? (
              <>
                <span>{t('algorithm.sort.insertionValue')}</span> = <strong>{fmt.number(frame.key, 4)}</strong>
              </>
            ) : (
              ' '
            )}
          </p>
        ) : null}
        <div className="alg-bars" style={{ '--n': values.length }}>
          {values.map((v, i) => {
            const state = stateOf(i)
            const h = (Math.abs(v) / span) * 100
            const bottom = v >= 0 ? zero : zero - h
            return (
              <div key={i} className={`alg-col${state ? ` is-${state}` : ''}`}>
                <div className="alg-plot">
                  {lo < 0 ? <span className="alg-zero" style={{ bottom: `${zero}%` }} aria-hidden="true" /> : null}
                  <span className="alg-bar" style={{ '--b': bottom, '--h': h }} aria-hidden="true" />
                  <span className={`alg-value${v < 0 ? ' neg' : ''}`} style={{ '--lift': v >= 0 ? zero + h : bottom }}>
                    <span>{fmt.number(v, 2)}</span>
                  </span>
                </div>
                <span className="alg-mark" aria-hidden="true">
                  {state === 'compare' ? '?' : state === 'swap' ? '⇄' : state === 'sorted' ? '✓' : state === 'write' ? '↓' : ''}
                </span>
                <span className="alg-index">{i}</span>
                <span className="alg-pointer mono">{pointersAt(i).join(' ')}</span>
              </div>
            )
          })}
        </div>
        <p id={`${uid}-keys`} className="visually-hidden">
          {t('algorithm.keysHint')}
        </p>
      </div>

      <ul className="alg-legend" aria-label={t('algorithm.legend.title')}>
        <li>
          <span className="key compare" aria-hidden="true">
            ?
          </span>
          {t('algorithm.legend.compare')}
        </li>
        {writing ? (
          <li>
            <span className="key write" aria-hidden="true">
              ↓
            </span>
            {t('algorithm.legend.shift')}
          </li>
        ) : (
          <li>
            <span className="key swap" aria-hidden="true">
              ⇄
            </span>
            {t('algorithm.legend.swap')}
          </li>
        )}
        <li>
          <span className="key sorted" aria-hidden="true">
            ✓
          </span>
          {insertion ? t('algorithm.legend.sortedPart') : t('algorithm.legend.sorted')}
        </li>
      </ul>

      {Array.isArray(frame.buffer) ? <p className="small">{t('algorithm.sort.temporary')}: <strong>{frame.buffer.map((v) => fmt.number(v, 4)).join(', ') || t('algorithm.sort.emptyBuffer')}</strong></p> : null}
      {Array.isArray(frame.counts) ? <p className="small">{t('algorithm.sort.remainingCounts')}: {frame.counts.map(({ value, count }) => `${fmt.number(value, 0)}: ${count}`).join('; ') || t('algorithm.sort.emptyBuffer')}</p> : null}
      {Array.isArray(frame.buckets) ? <div className="small"><p>{frame.bucketRange ? t('algorithm.sort.bucketRanges', { min: fmt.number(frame.bucketRange[0], 4), max: fmt.number(frame.bucketRange[1], 4) }) : t('algorithm.sort.radixOffset', { offset: frame.offset, place: frame.place })}</p>{frame.bucketKey !== undefined ? <p>{t('algorithm.sort.bucketKey', { value: fmt.number(frame.bucketKey, 4) })}</p> : null}<ul>{frame.buckets.map((bucket, i) => bucket.length ? <li key={i}>{i}: {bucket.map((v) => fmt.number(v, frame.bucketRange ? 4 : 0)).join(', ')}</li> : null)}</ul></div> : null}
      <p className="alg-msg" aria-live="polite">
        {frameText(frame.msg)}
      </p>

      <StepControls player={player} count={frames.length} speed={speed} onSpeed={setSpeed} label={t('algorithm.controls.label')} />

      <dl className="alg-counters">
        <div>
          <dt>{t('algorithm.counters.comparisons')}</dt>
          <dd>{frame.comparisons}</dd>
        </div>
        {writing ? (
          <div>
            <dt>{t(insertion ? 'algorithm.counters.shifts' : 'algorithm.counters.writes')}</dt>
            <dd>{insertion ? frame.shifts : frame.writes}</dd>
          </div>
        ) : (
          <div>
            <dt>{t('algorithm.counters.swaps')}</dt>
            <dd>{frame.swaps}</dd>
          </div>
        )}
        <div>
          <dt>{t('algorithm.counters.size')}</dt>
          <dd>{values.length}</dd>
        </div>
      </dl>

      <PseudoCode lines={PSEUDOCODE[algorithm]} current={frame.line} label={t('algorithm.codeTitle')} />
      {!bounded ? <SortCompare algorithm={algorithm} mine={array} onReport={setCompare} /> : null}
      <ExplanationSection text={block.explanation} />
    </div>
  )
}

// ----------------------------------------------------------------------------- binary search
export function SearchView({ block }) {
  const { t, fmt, lang } = useT()
  const sequential = block.algorithm === 'linear_search'
  const normalize = sequential ? normalizeLinearSearch : normalizeSearch
  const uid = useId().replace(/[:]/g, '')
  const frameText = useFrameText()
  const stageRef = useRef(null)
  const configKey = JSON.stringify([block.config?.array ?? null, block.config?.target ?? null])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => normalize(block.config || {}), [configKey, sequential])
  const [input, setInput] = useState(initial)
  const [text, setText] = useState(() => formatNumberList(initial.array, lang))
  const [target, setTarget] = useState(initial.target)
  const [speed, setSpeed] = useState(1)
  const [sortedNote, setSortedNote] = useState(false)
  const [compare, setCompare] = useState(null)

  useEffect(() => {
    setInput(initial)
    setText(formatNumberList(initial.array, lang))
    setTarget(initial.target)
    setSortedNote(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  const frames = useMemo(() => (sequential ? linearSearchTrace : binarySearchTrace)(input.array, input.target), [input, sequential])
  const player = useStepPlayer(frames.length, {
    speed,
    rootRef: stageRef,
    resetKey: JSON.stringify(input),
  })
  const frame = frames[player.index] || frames[0]
  const parsed = parseNumberList(text)
  const issue = listIssue(parsed, { min: 1, max: MAX_SEARCH_ITEMS })
  const dirty = !issue && Number.isFinite(target) && (parsed.values.join(',') !== input.array.join(',') || target !== input.target)
  const apply = () => {
    if (issue || !Number.isFinite(target)) return
    const next = normalize({ array: parsed.values, target })
    const wasSorted = parsed.values.every((v, i, a) => i === 0 || a[i - 1] <= v)
    setSortedNote(!sequential && !wasSorted)
    setInput(next)
    setText(formatNumberList(next.array, lang))
  }
  const restore = () => {
    setInput(initial)
    setText(formatNumberList(initial.array, lang))
    setTarget(initial.target)
    setSortedNote(false)
  }

  const finalFrame = frames[frames.length - 1]
  const foundAt = finalFrame.found
  const linear = foundAt >= 0 ? foundAt + 1 : input.array.length

  useReportState(block.id, {
    type: 'algorithm',
    algorithm: sequential ? 'linear_search' : 'binary_search',
    array: input.array,
    target: input.target,
    step: player.index + 1,
    steps: frames.length,
    low: frame.low,
    mid: frame.mid,
    high: frame.high,
    found: frame.found,
    comparisons: frame.comparisons,
    message: frameText(frame.msg),
    compare: compare || undefined,
  })

  const pointerNames = (i) => {
    const names = []
    if (sequential) return i === frame.mid ? ['i'] : names
    if (frame.found === null || frame.found === -1 || frame.found === i) {
      if (i === frame.low && frame.low <= frame.high) names.push('low')
      if (i === frame.mid) names.push('mid')
      if (i === frame.high && frame.low <= frame.high) names.push('high')
    }
    return names
  }

  return (
    <div className="ix-root stack">
      <div className="alg-input-row">
        <form
          className="alg-list-form search"
          onSubmit={(e) => {
            e.preventDefault()
            apply()
          }}
        >
          <TextField
            id={`${uid}-list`}
            label={t('algorithm.search.arrayLabel', { max: MAX_SEARCH_ITEMS })}
            hint={t(sequential ? 'algorithm.search.linearHint' : 'algorithm.search.arrayHint')}
            value={text}
            maxLength={240}
            spellCheck={false}
            autoComplete="off"
            error={issue ? t(`algorithm.list.${issue.code}`, issue.vars) : undefined}
            onChange={(e) => setText(e.target.value)}
          />
          <NumberInput id={`${uid}-target`} label={t('algorithm.search.target')} value={target} required onChange={(v) => setTarget(v)} />
          <Button type="submit" icon={Search} disabled={!dirty}>
            {t('algorithm.search.run')}
          </Button>
        </form>
        <div className="ix-toolbar">
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={JSON.stringify(input) === JSON.stringify(initial)} onClick={restore}>
            {t('algorithm.restoreExample')}
          </Button>
        </div>
        {sortedNote ? (
          <p className="small muted" style={{ margin: 0 }}>
            {t('algorithm.search.sortedNote')}
          </p>
        ) : null}
      </div>

      <div
        ref={stageRef}
        className="alg-stage alg-search-stage"
        role="group"
        tabIndex={0}
        aria-label={t(sequential ? 'algorithm.search.linearStageLabel' : 'algorithm.search.stageLabel', {
          target: fmt.number(input.target, 4),
        })}
        aria-describedby={`${uid}-keys`}
        onKeyDown={stageKeys(player)}
      >
        <p className="alg-target">
          {t('algorithm.search.lookingFor')} <strong className="alg-target-value">{fmt.number(input.target, 4)}</strong>
        </p>
        <div className="alg-cells-scroll">
          <ol className="alg-cells" style={{ '--n': input.array.length }}>
            {input.array.map((v, i) => {
              const out = frame.eliminated.includes(i)
              const isMid = frame.mid === i
              const found = frame.found === i
              const cls = ['alg-cell-box', out ? 'is-out' : '', isMid ? 'is-mid' : '', found ? 'is-found' : ''].filter(Boolean).join(' ')
              const names = pointerNames(i)
              return (
                <li key={i} className={cls}>
                  <span className="alg-box">
                    {fmt.number(v, 2)}
                    {out ? <span className="visually-hidden"> ({t('algorithm.search.eliminated')})</span> : null}
                    {found ? <span className="visually-hidden"> ({t('algorithm.search.found')})</span> : null}
                  </span>
                  <span className="alg-index">{i}</span>
                  <span className="alg-pointer mono">{names.join(' ')}</span>
                </li>
              )
            })}
          </ol>
        </div>
        <p id={`${uid}-keys`} className="visually-hidden">
          {t('algorithm.keysHint')}
        </p>
      </div>

      <ul className="alg-legend" aria-label={t('algorithm.legend.title')}>
        <li>
          <span className="key mid" aria-hidden="true" />
          {t(sequential ? 'algorithm.legend.current' : 'algorithm.legend.mid')}
        </li>
        <li>
          <span className="key out" aria-hidden="true" />
          {t('algorithm.legend.eliminated')}
        </li>
        <li>
          <span className="key sorted" aria-hidden="true">
            ✓
          </span>
          {t('algorithm.legend.found')}
        </li>
      </ul>

      <p className="alg-msg" aria-live="polite">
        {frameText(frame.msg)}
      </p>

      <StepControls player={player} count={frames.length} speed={speed} onSpeed={setSpeed} label={t('algorithm.controls.label')} />

      <dl className="alg-counters">
        <div>
          <dt>{t('algorithm.counters.comparisons')}</dt>
          <dd>{frame.comparisons}</dd>
        </div>
        {!sequential ? <div>
          <dt>{t('algorithm.counters.linear')}</dt>
          <dd>{linear}</dd>
        </div> : null}
        <div>
          <dt>{t('algorithm.counters.size')}</dt>
          <dd>{input.array.length}</dd>
        </div>
      </dl>
      {!sequential ? <p className="small muted" style={{ margin: 0 }}>
        {t('algorithm.search.linearNote', {
          count: linear,
          binary: finalFrame.comparisons,
        })}
      </p> : null}

      <PseudoCode lines={sequential ? LINEAR_PSEUDOCODE : SEARCH_PSEUDOCODE} current={frame.line} label={t('algorithm.codeTitle')} />
      {!sequential ? <SearchCompare mine={input} onReport={setCompare} /> : null}
      <ExplanationSection text={block.explanation} />
    </div>
  )
}
