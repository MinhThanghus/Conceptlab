import { useState } from 'react'
import { useT } from '../../../i18n/index.jsx'
import { SelectField } from '../../../components/ui/index.js'
import { ALGORITHMS } from '../../lab/specUtils.js'
import { BlockEnvProvider } from '../BlockEnv.jsx'
import { AlgorithmView } from './AlgorithmView.jsx'
import { AdvancedLab } from './AdvancedLab.jsx'

const ADVANCED = ['graph_bfs', 'graph_dfs', 'n_queens', 'fibonacci', 'knapsack', 'hash_table', 'greedy_coins']

/** A public learning space: real traces on small, editable inputs. */
export default function AlgorithmsPage() {
  const { t, lang } = useT()
  const [algorithm, setAlgorithm] = useState('bubble_sort')
  const block = {
    id: 'algorithm-lesson', type: 'algorithm', algorithm,
    title: t(`algorithm.names.${algorithm}`), description: '', explanation: '', source_refs: [],
    config: algorithm === 'linear_search'
      ? { array: [7, 2, 9, 3, 5], target: 3 }
      : algorithm === 'binary_search'
        ? { array: [2, 5, 8, 12, 16, 23, 38, 56], target: 23 }
        : { array: [7, 3, 9, 1, 5, 2] },
  }
  return (
    <div className="container page stack">
      <header className="stack-sm">
        <h1>{t('algorithm.learn.title')}</h1>
        <p>{t('algorithm.learn.lead')}</p>
        <p className="small muted">{t('algorithm.learn.sample')}</p>
      </header>
      <SelectField label={t('algorithm.learn.choose')} value={algorithm} options={[...ALGORITHMS.map((value) => ({ value, label: t(`algorithm.names.${value}`) })), ...ADVANCED.map((value) => ({ value, label: t(`algorithm.learn.${value}`) }))]} onChange={(event) => setAlgorithm(event.target.value)} />
      {ADVANCED.includes(algorithm) ? <AdvancedLab key={algorithm} algorithm={algorithm} /> : <BlockEnvProvider value={{ language: lang, mode: 'view' }}>
        <AlgorithmView key={algorithm} block={block} />
      </BlockEnvProvider>}
      <p><a href="https://www.hello-algo.com/en/chapter_hello_algo/" target="_blank" rel="noreferrer">{t('algorithm.learn.reference')}</a></p>
    </div>
  )
}
