import { useT } from '../../../i18n/index.jsx'
import { Alert } from '../../../components/ui/index.js'
import { ALGORITHMS } from '../../lab/specUtils.js'
import { BlockFrame } from '../BlockRenderer.jsx'
import { AttentionView } from './AttentionView.jsx'
import { SearchView, SortView } from './StepViews.jsx'
import '../../sim/interactive.css'
import './algorithm.css'

/** Learner view: attention heatmap walk-through, sorting bars or binary search pointers. */
export function AlgorithmView({ block }) {
  const { t } = useT()
  const algo = ALGORITHMS.includes(block.algorithm) ? block.algorithm : null
  return (
    <BlockFrame block={block}>
      {!algo ? (
        <Alert tone="warning" title={t('algorithm.view.unknownTitle')}>
          {t('algorithm.view.unknownBody', { name: String(block.algorithm || '?') })}
        </Alert>
      ) : (
        <>
          <p className="alg-about">
            <strong>{t(`algorithm.names.${algo}`)}.</strong> {t(`algorithm.about.${algo}`)}
          </p>
          {algo === 'attention' ? <AttentionView block={block} /> : ['binary_search', 'linear_search'].includes(algo) ? <SearchView key={algo} block={block} /> : <SortView key={algo} block={block} algorithm={algo} />}
        </>
      )}
    </BlockFrame>
  )
}
