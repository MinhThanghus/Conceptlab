import { createContext, useContext } from 'react'

/**
 * Environment every block component reads with `useBlockEnv()`.
 * Provided by the Studio (edit/preview) and by the Explorer (learner view).
 *
 * {
 *   mode: 'edit' | 'view',
 *   labId: string | null,          // studio: owner API (/api/labs/:id/...)
 *   shareCode: string | null,      // learner view: share API (/api/share/:code/...)
 *   language, level, subject, grade, space,
 *   sources: SourceOut[], assets: AssetOut[],
 *   sourceById(id), assetById(id),
 *   aiPath(name): string            // e.g. aiPath('explain-change') → /api/labs/:id/ai/explain-change
 *                                    //   or /api/share/:code/ai/explain-change
 *   aiAvailable: boolean,
 *   openSource(ref): void           // open the source viewer at a SourceRef {source_id, page, bbox, time}
 *   ask(context): void              // open the AI tutor with {block_id, item_id, selection, state, prompt?}
 *   reportState(blockId, state)     // share live interactive state (params, outputs, step) with the tutor
 *   glossary: [{id, vi, en}]        // bilingual terms
 *   assumptions: [{id, text}]        // lesson-wide assumptions (spec.assumptions)
 *   activeMode?: boolean             // lesson-wide "Học chủ động" switch; undefined = follow each block
 * }
 */
const noop = () => {}

export const defaultBlockEnv = {
  mode: 'view',
  labId: null,
  shareCode: null,
  language: 'vi',
  level: 'simple',
  subject: 'other',
  grade: '10',
  space: 'school2lab',
  sources: [],
  assets: [],
  sourceById: () => null,
  assetById: () => null,
  aiPath: () => null,
  aiAvailable: false,
  openSource: noop,
  ask: noop,
  reportState: noop,
  glossary: [],
  assumptions: [],
  sourcesAtTop: false,
  presentation: 'reading',
  visualContext: null,
}

export const BlockEnvContext = createContext(defaultBlockEnv)

export function BlockEnvProvider({ value, children }) {
  return <BlockEnvContext.Provider value={{ ...defaultBlockEnv, ...value }}>{children}</BlockEnvContext.Provider>
}

export function useBlockEnv() {
  return useContext(BlockEnvContext)
}

/** Build aiPath() for a studio lab or a shared lab. */
export function makeAiPath({ labId, shareCode, translatedLanguage }) {
  return (name) => {
    if (labId) return `/api/labs/${labId}/ai/${name}`
    if (shareCode) {
      const lang = translatedLanguage && ['explain-change', 'prediction-feedback'].includes(name) ? `?lang=${encodeURIComponent(translatedLanguage)}` : ''
      return `/api/share/${shareCode}/ai/${name}${lang}`
    }
    return null
  }
}
