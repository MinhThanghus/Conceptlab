import { lazy, Suspense } from 'react'
import { LoadingBlock } from '../../../components/ui/index.js'
import { BoardView } from './BoardView.jsx'
import './board.css'

// The editor (photo picker, review, redraw) is only for teachers: learners never download it.
const BoardEditor = lazy(() => import('./BoardEditor.jsx'))

/**
 * Board block: a photo of a board or a notebook page, read by Muse Spark into a reviewed
 * transcription and redrawn clean by Muse Image (backend services/board.py). Registry entry.
 */
export default function BoardBlock({ block, mode, onChange }) {
  if (mode === 'edit') {
    return (
      <Suspense fallback={<LoadingBlock lines={4} height="14rem" />}>
        <BoardEditor block={block} onChange={onChange} />
      </Suspense>
    )
  }
  return <BoardView block={block} />
}
