import { lazy, Suspense } from 'react'
import { LoadingBlock } from '../../../components/ui/index.js'
import { AlgorithmView } from './AlgorithmView.jsx'

// Teachers only: the editor is split out so learners on slow networks never download it.
const AlgorithmEditor = lazy(() => import('./AlgorithmEditor.jsx').then((m) => ({ default: m.AlgorithmEditor })))

/**
 * Algorithm illustration (spec §9.3, §7 Tin học): scaled dot-product attention on a tiny
 * example (Q, K, V → scores → ÷√dₖ → softmax heatmap → output), bubble / selection /
 * insertion sort with bars and pseudo-code, and binary search with low/mid/high.
 * Learners can change the small inputs; edit mode configures the algorithm, its input
 * and the explanation.
 */
export default function AlgorithmBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <AlgorithmEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <AlgorithmView block={block} />
}
