/** Pure helpers for the class results screen (ResultsOut, docs/API.md). */

/** Correct rate 0..1, computed from counts when possible (robust to how `correct_rate` is encoded). */
export function questionRate(q) {
  if (q && Number(q.attempts) > 0 && Number.isFinite(Number(q.correct))) {
    return Math.max(0, Math.min(1, Number(q.correct) / Number(q.attempts)))
  }
  if (q && q.correct_rate !== null && q.correct_rate !== undefined && Number.isFinite(Number(q.correct_rate))) {
    const rate = Number(q.correct_rate)
    return Math.max(0, Math.min(1, rate > 1 ? rate / 100 : rate))
  }
  return null
}

/** Before/after comparison, or null when either phase has no attempts. Values are percentages 0..100. */
export function phaseComparison(byPhase) {
  const pre = byPhase?.pre
  const post = byPhase?.post
  const ok = (p) => p && Number(p.count) > 0 && p.avg_pct !== null && p.avg_pct !== undefined && Number.isFinite(Number(p.avg_pct))
  if (!ok(pre) || !ok(post)) return null
  return { pre: Number(pre.avg_pct), post: Number(post.avg_pct), diff: Number(post.avg_pct) - Number(pre.avg_pct), preCount: Number(pre.count), postCount: Number(post.count) }
}

/** Share of each star rating (5 → 1) from `feedback_distribution` {"1": n, …}. */
export function ratingShares(distribution) {
  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: Math.max(0, Number(distribution?.[String(n)]) || 0) }))
  const total = counts.reduce((sum, c) => sum + c.count, 0)
  return counts.map((c) => ({ ...c, share: total ? c.count / total : 0 }))
}
