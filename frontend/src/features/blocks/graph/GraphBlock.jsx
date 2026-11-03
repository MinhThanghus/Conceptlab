import { lazy, Suspense } from 'react'
import { LoadingBlock } from '../../../components/ui/index.js'
import { GraphView } from './GraphView.jsx'

// Teachers only: the editor is split out so learners on slow networks never download it.
const GraphEditor = lazy(() => import('./GraphEditor.jsx').then((m) => ({ default: m.GraphEditor })))

/**
 * Interactive graph (spec §5.3, §9.2, §10.2–10.3): y = f(x; params) with sliders,
 * live plot, key features in plain language, A/B comparison, "explain what changed"
 * (Muse) and an active-learning flow. Edit mode configures formula, ranges, params.
 */
export default function GraphBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <GraphEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <GraphView block={block} />
}
