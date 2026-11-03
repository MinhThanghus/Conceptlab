import { lazy } from 'react'
import {
  BookOpenCheck,
  Clapperboard,
  Code2,
  FileText,
  GitBranch,
  Goal,
  ListChecks,
  ListOrdered,
  ScanSearch,
  ScanText,
  Sigma,
  Timer,
} from 'lucide-react'

/**
 * Block type → { icon, Component }. Each component receives:
 *   { block, mode: 'edit' | 'view', onChange(nextBlock) }  and reads useBlockEnv().
 * In 'edit' mode it renders its editor; in 'view' mode the learner experience.
 * Components are code-split so the public pages stay light.
 */
export const BLOCK_REGISTRY = {
  steps: { icon: ListOrdered, Component: lazy(() => import('./steps/StepsBlock.jsx')) },
  flow: { icon: GitBranch, Component: lazy(() => import('./flow/FlowBlock.jsx')) },
  diagram: { icon: ScanSearch, Component: lazy(() => import('./diagram/DiagramBlock.jsx')) },
  graph: { icon: Sigma, Component: lazy(() => import('./graph/GraphBlock.jsx')) },
  simulation: { icon: Timer, Component: lazy(() => import('./simulation/SimulationBlock.jsx')) },
  algorithm: { icon: BookOpenCheck, Component: lazy(() => import('./algorithm/AlgorithmBlock.jsx')) },
  video: { icon: Clapperboard, Component: lazy(() => import('./video/VideoBlock.jsx')) },
  field: { icon: Goal, Component: lazy(() => import('./field/FieldBlock.jsx')) },
  quiz: { icon: ListChecks, Component: lazy(() => import('./quiz/QuizBlock.jsx')) },
  widget: { icon: Code2, Component: lazy(() => import('./widget/WidgetBlock.jsx')) },
  text: { icon: FileText, Component: lazy(() => import('./text/TextBlock.jsx')) },
  board: { icon: ScanText, Component: lazy(() => import('./board/BoardBlock.jsx')) },
}

export function blockIcon(type) {
  return BLOCK_REGISTRY[type]?.icon || FileText
}
