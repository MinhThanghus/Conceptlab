import { lazy, Suspense } from 'react'
import { LoadingBlock } from '../../../components/ui/index.js'
import { SimulationView } from './SimulationView.jsx'

// Teachers only: the editor is split out so learners on slow networks never download it.
const SimulationEditor = lazy(() => import('./SimulationEditor.jsx').then((m) => ({ default: m.SimulationEditor })))

/**
 * Dynamic simulation (spec §5.4, §6.2–6.3, §10.2–10.3): pendulum, projectile, compound
 * interest or spring–mass with sliders, run/pause/step/replay, live values, a plot, two
 * scenarios, reference checks and the "simulation under stated assumptions — not a
 * measurement" note. The moving object can be a SAM cut-out from the class photo.
 * Edit mode configures the model, parameters, object image, reference cases, notes and
 * the active-learning challenge.
 */
export default function SimulationBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <SimulationEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <SimulationView block={block} />
}
