import { createContext, useContext } from 'react'

/**
 * Actions and shared state of the paper workspace (provided by PaperStep):
 *   lab, paper, aiAvailable, buildPath
 *   select(kind, id), showRef(ref, label, short), showItem(kind, item)
 *   generate(types, key), gen                       — POST /ai/generate (blocks appended)
 *   explore(eq), exploreState[eqId], controlled[eqId], toggleControlled(eqId, symbol)
 *   addPreviewBlock(eqId), addAttention(key, item), added[key]
 *   saveEquation(eqId, nextEquation), applyAiEquation(eqId, equationFromAi)
 */
export const WorkspaceContext = createContext(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside the paper workspace')
  return ctx
}
