import { useMemo, useRef, useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { SelectField } from '../../../components/ui/index.js'
import { PseudoCode, StepControls, stageKeys } from './stepKit.jsx'
import { useStepPlayer } from './useStepPlayer.js'
import { fibonacciTrace, GRAPH_EDGES, GRAPH_NODES, graphTrace, greedyTrace, hashTrace, knapsackTrace, queensTrace } from './advancedTraces.js'
import './advancedLab.css'

const COORD = { A: [50, 15], B: [20, 40], C: [80, 40], D: [50, 65], E: [30, 90], F: [85, 75] }
const CODE = {
  graph_bfs: ['seen = {start}; queue = [start]', 'while queue:', '    node = queue.pop_front(); visit(node)', '    for neighbor in sorted(adj[node]):', '        if neighbor not in seen:', '            seen.add(neighbor); queue.push_back(neighbor)'],
  graph_dfs: ['seen = set(); stack = [start]', 'while stack:', '    node = stack.pop()', '    if node in seen: continue', '    seen.add(node); visit(node)', '    for neighbor in reverse_sorted(adj[node]):', '        if neighbor not in seen: stack.push(neighbor)'],
  n_queens: ['place(row):', '    if row == n: return true', '    for col in range(n):', '        if safe(row, col):', '            put_queen(row, col)', '            if place(row + 1): return true', '            remove_queen(row, col)', '    return false'],
  fibonacci: ['F[0] = 0', 'if n >= 1: F[1] = 1', 'for i in range(2, n + 1):', '    F[i] = F[i - 1] + F[i - 2]'],
  hash_table: ['for key in keys:', '    start = key % table_size', '    for offset in range(table_size):', '        i = (start + offset) % table_size', '        if table[i] == key: break', '        if table[i] is empty: table[i] = key; break', '    else: report_table_full()'],
  greedy_coins: ['remaining = amount', 'for coin in coins_descending:', '    while coin <= remaining:', '        choose(coin); remaining -= coin', '# compare with the optimal dynamic-programming count'],
  knapsack: ['dp[0][capacity] = 0', 'for i in range(1, n + 1):', '    for c in range(capacity + 1):', '        skip = dp[i - 1][c]', '        take = value[i] + dp[i - 1][c - weight[i]]  # if it fits', '        dp[i][c] = max(skip, take)', '# backtrack through the table to recover items'],
}

export function AdvancedLab({ algorithm }) {
  const { t } = useT()
  const [root, setRoot] = useState('A')
  const [n, setN] = useState(4)
  const [fib, setFib] = useState(8)
  const [hashSize, setHashSize] = useState(7)
  const [hashExample, setHashExample] = useState('collide')
  const [coinExample, setCoinExample] = useState('counterexample')
  const [amount, setAmount] = useState(6)
  const [capacity, setCapacity] = useState(5)
  const [itemExample, setItemExample] = useState('first')
  const [speed, setSpeed] = useState(1)
  const stage = useRef(null)
  const graph = algorithm === 'graph_bfs' || algorithm === 'graph_dfs'
  const queens = algorithm === 'n_queens'
  const hash = algorithm === 'hash_table', greedy = algorithm === 'greedy_coins', knapsack = algorithm === 'knapsack'
  const keys = hashExample === 'collide' ? [1, 8, 15, 3] : [0, 1, 2, 3]
  const coins = coinExample === 'counterexample' ? [4, 3, 1] : [10, 5, 1]
  const items = itemExample === 'first' ? [{ weight: 2, value: 3 }, { weight: 3, value: 4 }, { weight: 4, value: 5 }] : [{ weight: 1, value: 2 }, { weight: 3, value: 5 }, { weight: 4, value: 6 }, { weight: 5, value: 8 }]
  const frames = useMemo(() => graph ? graphTrace(root, algorithm === 'graph_bfs' ? 'bfs' : 'dfs') : queens ? queensTrace(n) : hash ? hashTrace(hashSize, keys) : greedy ? greedyTrace(amount, coins) : knapsack ? knapsackTrace(capacity, items) : fibonacciTrace(fib), [algorithm, graph, queens, hash, greedy, knapsack, root, n, fib, hashSize, hashExample, coinExample, amount, capacity, itemExample])
  const player = useStepPlayer(frames.length, { rootRef: stage, speed, resetKey: `${algorithm}:${root}:${n}:${fib}:${hashSize}:${hashExample}:${coinExample}:${amount}:${capacity}:${itemExample}` })
  const frame = frames[player.index] || frames[0]
  const message = graph ? (frame.current ? t('algorithm.learn.graphVisit', { node: frame.current }) : frame.skipped ? t('algorithm.learn.graphSkipped', { node: frame.skipped }) : t('algorithm.learn.graphReady')) : queens
    ? t(`algorithm.learn.${{ start: 'startState', try: 'tryState', conflict: 'conflictState', place: 'placeState', backtrack: 'backtrackState', solution: 'solutionState', noSolution: 'noSolutionState' }[frame.event]}`, { row: frame.row + 1, col: frame.col + 1 })
    : hash ? t(`algorithm.learn.hash_${frame.event}`, { key: frame.key, index: frame.index, size: frame.size })
      : greedy ? t(`algorithm.learn.greedy_${frame.event}`, { coin: frame.coin, remaining: frame.remaining, count: frame.chosen.length, optimal: frame.optimal })
        : knapsack ? t(`algorithm.learn.knapsack_${frame.event}`, { row: frame.row, col: frame.col, skip: frame.skip, take: frame.take ?? t('algorithm.learn.knapsackDoesNotFit'), result: frame.result, chosen: frame.chosen?.join(', ') || t('algorithm.learn.none') })
        : t('algorithm.learn.fibStep', { index: frame.index, value: frame.table[frame.index] })

  return (
    <section className="card stack advanced-lab" aria-label={t(`algorithm.learn.${algorithm}`)}>
      <h2>{t(`algorithm.learn.${algorithm}`)}</h2>
      <p>{t(graph ? (algorithm === 'graph_dfs' ? 'algorithm.learn.graphDfsLead' : 'algorithm.learn.graphLead') : queens ? 'algorithm.learn.queensLead' : hash ? 'algorithm.learn.hashLead' : greedy ? 'algorithm.learn.greedyLead' : knapsack ? 'algorithm.learn.knapsackLead' : 'algorithm.learn.fibLead')}</p>
      {graph ? <SelectField label={t('algorithm.learn.start')} value={root} options={GRAPH_NODES.map((value) => ({ value, label: value }))} onChange={(event) => setRoot(event.target.value)} /> : queens
        ? <SelectField label={t('algorithm.learn.size')} value={String(n)} options={[3, 4, 5, 6].map((value) => ({ value: String(value), label: `${value} × ${value}` }))} onChange={(event) => setN(Number(event.target.value))} />
        : hash ? <div className="stack-sm"><SelectField label={t('algorithm.learn.hashSize')} value={String(hashSize)} options={[5, 7, 11].map((value) => ({ value: String(value), label: String(value) }))} onChange={(event) => setHashSize(Number(event.target.value))} /><SelectField label={t('algorithm.learn.hashKeys')} value={hashExample} options={[{ value: 'collide', label: '1, 8, 15, 3' }, { value: 'spread', label: '0, 1, 2, 3' }]} onChange={(event) => setHashExample(event.target.value)} /></div>
          : greedy ? <div className="stack-sm"><SelectField label={t('algorithm.learn.coinSet')} value={coinExample} options={[{ value: 'counterexample', label: '1, 3, 4' }, { value: 'standard', label: '1, 5, 10' }]} onChange={(event) => setCoinExample(event.target.value)} /><SelectField label={t('algorithm.learn.amount')} value={String(amount)} options={Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} onChange={(event) => setAmount(Number(event.target.value))} /></div>
          : knapsack ? <div className="stack-sm"><SelectField label={t('algorithm.learn.knapsackItems')} value={itemExample} options={[{ value: 'first', label: '(2, 3), (3, 4), (4, 5)' }, { value: 'second', label: '(1, 2), (3, 5), (4, 6), (5, 8)' }]} onChange={(event) => setItemExample(event.target.value)} /><SelectField label={t('algorithm.learn.knapsackCapacity')} value={String(capacity)} options={Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} onChange={(event) => setCapacity(Number(event.target.value))} /></div>
          : <SelectField label={t('algorithm.learn.target')} value={String(fib)} options={Array.from({ length: 21 }, (_, value) => ({ value: String(value), label: String(value) }))} onChange={(event) => setFib(Number(event.target.value))} />}
      <div ref={stage} tabIndex={0} onKeyDown={stageKeys(player)} aria-label={t('algorithm.controls.label')} className="advanced-stage">
        {graph ? <>
          <svg className="advanced-graph" viewBox="0 0 100 105" role="img" aria-label={t(`algorithm.learn.${algorithm}`)}>
            {GRAPH_EDGES.map(([a, b]) => <line key={a + b} x1={COORD[a][0]} y1={COORD[a][1]} x2={COORD[b][0]} y2={COORD[b][1]} />)}
            {GRAPH_NODES.map((node) => <g key={node} className={frame.current === node ? 'current' : frame.visited.includes(node) ? 'visited' : frame.seen.includes(node) ? 'frontier' : ''}><circle cx={COORD[node][0]} cy={COORD[node][1]} r="6" /><text x={COORD[node][0]} y={COORD[node][1] + 2} textAnchor="middle">{node}</text></g>)}
          </svg>
          <dl><dt>{t('algorithm.learn.visited')}</dt><dd>{frame.visited.join(' → ') || t('algorithm.learn.none')}</dd><dt>{t('algorithm.learn.frontier')}</dt><dd>{frame.frontier.join(', ') || t('algorithm.learn.none')}</dd></dl>
        </> : queens ? <table className="advanced-board"><caption>{t('algorithm.learn.board')}</caption><tbody>{Array.from({ length: frame.size }, (_, row) => <tr key={row}>{Array.from({ length: frame.size }, (_, col) => {
          const queen = frame.board[row] === col
          const candidate = frame.row === row && frame.col === col && ['try', 'conflict'].includes(frame.event)
          return <td key={col} className={candidate ? 'candidate' : ''} aria-label={`${t('algorithm.learn.row', { n: row + 1 })}, ${t('algorithm.learn.col', { n: col + 1 })}: ${t(queen ? 'algorithm.learn.queen' : candidate ? 'algorithm.learn.candidate' : 'algorithm.learn.empty')}`}>{queen ? '♛' : candidate ? '×' : ' '}</td>
        })}</tr>)}</tbody></table> : hash ? <table className="advanced-table"><caption>{t('algorithm.learn.hashTable')}</caption><tbody><tr><th scope="row">i</th>{frame.table.map((_, i) => <td key={i}>{i}</td>)}</tr><tr><th scope="row">{t('algorithm.learn.hashValue')}</th>{frame.table.map((value, i) => <td key={i} className={frame.index === i ? 'candidate' : ''}>{value ?? '—'}</td>)}</tr></tbody></table> : greedy ? <dl><dt>{t('algorithm.learn.coinChosen')}</dt><dd>{frame.chosen.join(', ') || t('algorithm.learn.none')}</dd><dt>{t('algorithm.learn.coinRemaining')}</dt><dd>{frame.remaining}</dd>{frame.event === 'done' ? <><dt>{t('algorithm.learn.coinOptimal')}</dt><dd>{frame.optimal ?? t('algorithm.learn.none')}</dd></> : null}</dl> : knapsack ? <table className="advanced-table"><caption>{t('algorithm.learn.knapsackTable')}</caption><thead><tr><th scope="col">i / c</th>{Array.from({ length: frame.capacity + 1 }, (_, i) => <th scope="col" key={i}>{i}</th>)}</tr></thead><tbody>{frame.table.map((row, i) => <tr key={i}><th scope="row">{i}</th>{row.map((value, col) => <td key={col} className={frame.row === i && frame.col === col ? 'candidate' : ''}>{value ?? '·'}</td>)}</tr>)}</tbody></table> : <table className="advanced-table"><caption>{t('algorithm.learn.fibTable')}</caption><tbody><tr><th scope="row">n</th>{frame.table.map((_, i) => <td key={i}>{i}</td>)}</tr><tr><th scope="row">F(n)</th>{frame.table.map((value, i) => <td key={i}>{value}</td>)}</tr></tbody></table>}
      </div>
      <p aria-live="polite">{message}</p>
      <StepControls player={player} count={frames.length} speed={speed} onSpeed={setSpeed} label={t('algorithm.controls.label')} />
      <PseudoCode lines={CODE[algorithm]} current={null} label={t('algorithm.codeTitle')} />
      <p className="small muted">{t('algorithm.learn.complexity')}</p>
    </section>
  )
}
