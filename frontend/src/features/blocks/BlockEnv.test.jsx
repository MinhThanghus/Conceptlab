import { expect, it } from 'vitest'
import { makeAiPath } from './BlockEnv.jsx'

it('requests translated explanations for a translated shared lesson only', () => {
  const shared = makeAiPath({ shareCode: 'TPEND6', translatedLanguage: 'en' })
  expect(shared('explain-change')).toBe('/api/share/TPEND6/ai/explain-change?lang=en')
  expect(shared('prediction-feedback')).toBe('/api/share/TPEND6/ai/prediction-feedback?lang=en')
  expect(shared('other')).toBe('/api/share/TPEND6/ai/other')
  expect(makeAiPath({ labId: 'a', translatedLanguage: 'en' })('explain-change')).toBe('/api/labs/a/ai/explain-change')
})
