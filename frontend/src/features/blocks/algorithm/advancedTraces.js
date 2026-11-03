/** Small, deterministic algorithms for learning; generated locally without model calls. */
export const GRAPH_NODES = ['A', 'B', 'C', 'D', 'E', 'F']
export const GRAPH_EDGES = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E'], ['C', 'F']]

/** BFS marks on enqueue; DFS marks on pop, so its order matches recursive DFS. */
export function graphTrace(start, method = 'bfs') {
  const root = GRAPH_NODES.includes(start) ? start : 'A'
  const adj = Object.fromEntries(GRAPH_NODES.map((v) => [v, []]))
  for (const [a, b] of GRAPH_EDGES) { adj[a].push(b); adj[b].push(a) }
  for (const list of Object.values(adj)) list.sort()
  const seen = new Set(method === 'dfs' ? [] : [root]), frontier = [root], visited = [], frames = []
  const snapshot = (current = null) => ({ current, frontier: frontier.slice(), visited: visited.slice(), seen: [...new Set([...seen, ...frontier])] })
  frames.push(snapshot())
  while (frontier.length) {
    const current = method === 'dfs' ? frontier.pop() : frontier.shift()
    if (method === 'dfs') {
      if (seen.has(current)) { frames.push({ ...snapshot(), skipped: current }); continue }
      seen.add(current)
    }
    visited.push(current)
    const neighbors = method === 'dfs' ? [...adj[current]].reverse() : adj[current]
    for (const node of neighbors) if (!seen.has(node)) { if (method !== 'dfs') seen.add(node); frontier.push(node) }
    frames.push(snapshot(current))
  }
  return frames
}

/** Place one queen per row, trying columns left to right; stop at the first solution. */
export function queensTrace(n) {
  const size = Math.min(6, Math.max(3, Math.trunc(n) || 4)), board = [], frames = []
  const snapshot = (event, row = null, col = null) => ({ board: board.slice(), size, event, row, col })
  frames.push(snapshot('start'))
  function place(row) {
    if (row === size) { frames.push(snapshot('solution')); return true }
    for (let col = 0; col < size; col += 1) {
      const safe = board.every((other, r) => other !== col && Math.abs(other - col) !== row - r)
      frames.push(snapshot(safe ? 'try' : 'conflict', row, col))
      if (!safe) continue
      board.push(col); frames.push(snapshot('place', row, col))
      if (place(row + 1)) return true
      board.pop(); frames.push(snapshot('backtrack', row, col))
    }
    return false
  }
  if (!place(0)) frames.push(snapshot('noSolution'))
  return frames
}

/** Bottom-up Fibonacci, retaining the full table so each dependency is visible. */
export function fibonacciTrace(n) {
  const target = Math.min(20, Math.max(0, Math.trunc(n) || 0)), table = [0], frames = [{ table: [0], index: 0 }]
  if (target >= 1) { table.push(1); frames.push({ table: table.slice(), index: 1 }) }
  for (let i = 2; i <= target; i += 1) { table.push(table[i - 1] + table[i - 2]); frames.push({ table: table.slice(), index: i }) }
  return frames
}

/** Insert integers into an open-addressed hash set, resolving collisions by linear probing. */
export function hashTrace(size, keys) {
  const n = [5, 7, 11].includes(size) ? size : 7, table = Array(n).fill(null), frames = []
  const snapshot = (event, key = null, index = null) => ({ event, key, index, table: table.slice(), size: n })
  frames.push(snapshot('start'))
  for (const key of keys) {
    let placed = false
    const initial = ((key % n) + n) % n
    for (let offset = 0; offset < n; offset += 1) {
      const index = (initial + offset) % n
      frames.push(snapshot('probe', key, index))
      if (table[index] === key) { frames.push(snapshot('duplicate', key, index)); placed = true; break }
      if (table[index] === null) { table[index] = key; frames.push(snapshot('placed', key, index)); placed = true; break }
      frames.push(snapshot('collision', key, index))
    }
    if (!placed) frames.push(snapshot('full', key))
  }
  frames.push(snapshot('done'))
  return frames
}

/** Largest-first coin change, with an independently calculated optimal DP comparison. */
export function greedyTrace(amount, coins) {
  const target = Math.min(20, Math.max(1, Math.trunc(amount) || 1))
  const denominations = [...new Set(coins)].filter((x) => Number.isInteger(x) && x > 0).sort((a, b) => b - a)
  let remaining = target
  const chosen = [], frames = [{ remaining, chosen: [], event: 'start' }]
  for (const coin of denominations) while (remaining >= coin) {
    remaining -= coin; chosen.push(coin)
    frames.push({ remaining, chosen: chosen.slice(), event: 'choose', coin })
  }
  const dp = Array(target + 1).fill(Infinity); dp[0] = 0
  for (let i = 1; i <= target; i += 1) for (const coin of denominations) if (coin <= i) dp[i] = Math.min(dp[i], dp[i - coin] + 1)
  frames.push({ remaining, chosen: chosen.slice(), event: 'done', optimal: Number.isFinite(dp[target]) ? dp[target] : null })
  return frames
}

/** 0/1 knapsack: each item may be used at most once; table rows retain prior items. */
export function knapsackTrace(capacity, items) {
  const cap = Math.min(8, Math.max(1, Math.trunc(capacity) || 1))
  const list = items.slice(0, 4).filter(({ weight, value }) => Number.isInteger(weight) && weight > 0 && Number.isFinite(value) && value >= 0)
  const dp = Array.from({ length: list.length + 1 }, () => Array(cap + 1).fill(null))
  dp[0].fill(0)
  const frames = [{ event: 'start', table: dp.map((row) => row.slice()), items: list, capacity: cap }]
  for (let i = 1; i <= list.length; i += 1) {
    const item = list[i - 1]
    for (let c = 0; c <= cap; c += 1) {
      const skip = dp[i - 1][c]
      const take = item.weight <= c ? item.value + dp[i - 1][c - item.weight] : null
      dp[i][c] = take === null ? skip : Math.max(skip, take)
      frames.push({ event: 'cell', table: dp.map((row) => row.slice()), items: list, capacity: cap, row: i, col: c, skip, take, result: dp[i][c] })
    }
  }
  let remaining = cap
  const chosen = []
  for (let i = list.length; i > 0; i -= 1) {
    if (dp[i][remaining] !== dp[i - 1][remaining]) { chosen.unshift(i); remaining -= list[i - 1].weight }
  }
  frames.push({ event: 'done', table: dp.map((row) => row.slice()), items: list, capacity: cap, result: dp[list.length][cap], chosen })
  return frames
}
