import { useEffect, useMemo, useState } from 'react'
import { Dices, Eye, Settings, Shuffle, WandSparkles } from 'lucide-react'
import { translate, useT } from '../../../i18n/index.jsx'
import { Alert, Button, ConfirmDialog, RichText, SelectField, TabsWithPanels, TextArea, TextField } from '../../../components/ui/index.js'
import { ALGORITHMS } from '../../lab/specUtils.js'
import { useBlockEnv } from '../BlockEnv.jsx'
import { BlockMetaEditor } from '../../sim/BlockMetaEditor.jsx'
import { NumberInput } from '../../sim/NumberInput.jsx'
import { EXAMPLE_MATRICES, normalizeAttention, randomAttention } from './attention.js'
import { MAX_ITEMS, normalizeSort, randomArray, shuffled, sortInputIssue } from './sorting.js'
import { MAX_SEARCH_ITEMS, normalizeSearch, normalizeLinearSearch } from './binarySearch.js'
import { formatNumberList, listIssue, parseNumberList } from './algoUtils.js'
import { AttentionInputs, exampleTokens } from './AttentionView.jsx'
import { AlgorithmView } from './AlgorithmView.jsx'
import '../../sim/interactive.css'
import './algorithm.css'

const SORTS = ['bubble_sort', 'selection_sort', 'insertion_sort', 'quick_sort', 'merge_sort', 'heap_sort', 'counting_sort', 'radix_sort', 'bucket_sort']
const DEFAULT_SEARCH = { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 }

/** Config for a newly chosen algorithm, keeping what still makes sense (e.g. the array between sorts). */
export function configFor(next, current = {}, tokens = []) {
  const arr = Array.isArray(current.array) ? current.array.filter((v) => Number.isFinite(Number(v))).map(Number) : []
  if (next === 'attention') return normalizeAttention({ ...EXAMPLE_MATRICES, tokens })
  if (SORTS.includes(next)) return { array: arr.length >= 2 ? arr.slice(0, MAX_ITEMS) : [5, 2, 9, 1, 6] }
  if (next === 'linear_search') return normalizeLinearSearch(current)
  if (arr.length >= 1) {
    const sorted = [...arr].sort((a, b) => a - b).slice(0, MAX_SEARCH_ITEMS)
    const target = Number.isFinite(Number(current.target)) ? Number(current.target) : sorted[Math.floor(sorted.length / 2)]
    return { array: sorted, target }
  }
  return { ...DEFAULT_SEARCH, array: [...DEFAULT_SEARCH.array] }
}

/** Typed number list bound to config.array: commits only valid lists, shows problems inline. */
function ArrayEditor({ id, label, hint, values, onChange, min, max, validate }) {
  const { t, lang } = useT()
  const [text, setText] = useState(() => formatNumberList(values, lang))
  const parsed = parseNumberList(text)
  const issue = listIssue(parsed, { min, max }) || validate?.(parsed.values)
  const key = values.join(',')
  useEffect(() => {
    if (parseNumberList(text).values.join(',') !== key) setText(formatNumberList(values, lang))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (
    <TextField
      id={id}
      label={label}
      hint={hint}
      value={text}
      maxLength={240}
      spellCheck={false}
      autoComplete="off"
      error={issue ? t(`algorithm.list.${issue.code}`, issue.vars) : undefined}
      onChange={(e) => {
        setText(e.target.value)
        const p = parseNumberList(e.target.value)
        if (!listIssue(p, { min, max }) && !validate?.(p.values)) onChange(p.values)
      }}
    />
  )
}

export function AlgorithmEditor({ block, onChange }) {
  const { t, lang, fmt } = useT()
  const env = useBlockEnv()
  const [tab, setTab] = useState('setup')
  const [pending, setPending] = useState(null)
  const contentLang = env.language === 'en' || env.language === 'vi' ? env.language : lang
  const tl = (key, vars) => translate(contentLang, key, vars)
  const set = (patch) => onChange({ ...block, ...patch })
  const algo = ALGORITHMS.includes(block.algorithm) ? block.algorithm : null
  const config = block.config && typeof block.config === 'object' ? block.config : {}
  const configKey = JSON.stringify(config)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const attention = useMemo(() => (algo === 'attention' ? normalizeAttention(config) : null), [algo, configKey])
  const sortArray = SORTS.includes(algo) ? normalizeSort(config).array : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const search = useMemo(() => (algo === 'binary_search' ? normalizeSearch(config) : algo === 'linear_search' ? normalizeLinearSearch(config) : null), [algo, configKey])
  const searchUnsorted = algo === 'binary_search' && Array.isArray(config.array) && config.array.some((v, i, a) => i > 0 && Number(a[i - 1]) > Number(v))
  const targetMissing = algo === 'binary_search' && !Number.isFinite(Number(config.target ?? NaN))

  const applyAlgorithm = (next) => {
    set({ algorithm: next, config: configFor(next, config, exampleTokens(tl)) })
    setPending(null)
  }
  const requestAlgorithm = (next) => {
    if (!ALGORITHMS.includes(next) || next === algo) return
    const replaces = !algo || next === 'attention' || algo === 'attention'
    if (replaces && algo) setPending(next)
    else applyAlgorithm(next)
  }

  const setup = (
    <div className="ix-editor">
      <BlockMetaEditor block={block} onChange={onChange} />

      <section className="ix-editor-section">
        <h3>{t('algorithm.editor.algorithmTitle')}</h3>
        <SelectField
          label={t('algorithm.editor.algorithm')}
          value={algo || ''}
          placeholder={t('algorithm.editor.choose')}
          error={!algo ? t('algorithm.view.unknownBody', { name: String(block.algorithm || '?') }) : undefined}
          options={ALGORITHMS.map((a) => ({ value: a, label: t(`algorithm.names.${a}`) }))}
          onChange={(e) => requestAlgorithm(e.target.value)}
        />
        {algo ? <p className="small muted" style={{ margin: 0 }}>{t(`algorithm.about.${algo}`)}</p> : null}
      </section>

      {algo ? (
        <section className="ix-editor-section">
          <h3>{t('algorithm.editor.inputTitle')}</h3>
          {algo === 'attention' ? (
            <>
              <p className="small muted" style={{ margin: 0 }}>
                {t('algorithm.editor.attentionHint')}
              </p>
              <div className="ix-toolbar">
                <Button size="sm" icon={WandSparkles} onClick={() => set({ config: normalizeAttention({ ...EXAMPLE_MATRICES, tokens: exampleTokens(tl) }) })}>
                  {t('algorithm.editor.useExample')}
                </Button>
                <Button size="sm" icon={Dices} onClick={() => set({ config: normalizeAttention(randomAttention(attention.tokens, attention.Q[0].length)) })}>
                  {t('algorithm.attention.preset.random')}
                </Button>
              </div>
              <AttentionInputs cfg={attention} onChange={(next) => set({ config: next })} idPrefix={`ae-${block.id}`} />
            </>
          ) : null}
          {sortArray ? (
            <>
              <ArrayEditor
                id={`ae-${block.id}-arr`}
                label={t('algorithm.sort.arrayLabel', { max: MAX_ITEMS })}
                hint={t(algo === 'counting_sort' ? 'algorithm.list.countingHint' : algo === 'radix_sort' ? 'algorithm.list.radixHint' : algo === 'bucket_sort' ? 'algorithm.list.bucketHint' : 'algorithm.list.hint')}
                values={sortArray}
                min={2}
                max={MAX_ITEMS}
                validate={(values) => sortInputIssue(algo, values)}
                onChange={(values) => set({ config: { ...config, array: values } })}
              />
              <div className="ix-toolbar">
                <Button size="sm" icon={Shuffle} onClick={() => set({ config: { ...config, array: shuffled(sortArray) } })}>
                  {t('algorithm.sort.shuffle')}
                </Button>
                <Button size="sm" icon={Dices} onClick={() => set({ config: { ...config, array: randomArray(sortArray.length) } })}>
                  {t('algorithm.sort.random')}
                </Button>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {t('algorithm.editor.sortHint')}
              </p>
            </>
          ) : null}
          {search ? (
            <>
              <div className="ix-grid wide">
                <ArrayEditor
                  id={`ae-${block.id}-sarr`}
                  label={t('algorithm.search.arrayLabel', { max: MAX_SEARCH_ITEMS })}
                  hint={t(algo === 'linear_search' ? 'algorithm.search.linearHint' : 'algorithm.search.arrayHint')}
                  values={Array.isArray(config.array) ? config.array.filter((v) => Number.isFinite(Number(v))).map(Number) : search.array}
                  min={1}
                  max={MAX_SEARCH_ITEMS}
                  onChange={(values) => set({ config: { ...config, array: values } })}
                />
                <NumberInput
                  id={`ae-${block.id}-target`}
                  label={t('algorithm.search.target')}
                  value={Number.isFinite(Number(config.target ?? NaN)) ? Number(config.target) : null}
                  allowEmpty
                  error={targetMissing ? t('algorithm.editor.targetRequired') : undefined}
                  onChange={(v) => set({ config: { ...config, target: v } })}
                />
              </div>
              {searchUnsorted ? (
                <Alert
                  tone="info"
                  action={
                    <Button size="sm" onClick={() => set({ config: { ...config, array: [...search.array] } })}>
                      {t('algorithm.editor.sortNow')}
                    </Button>
                  }
                >
                  {t('algorithm.editor.unsorted', { list: formatNumberList(search.array, lang) })}
                </Alert>
              ) : null}
              {!search.array.includes(search.target) ? <p className="small muted" style={{ margin: 0 }}>{t('algorithm.editor.targetAbsent', { target: fmt.number(search.target, 4) })}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="ix-editor-section">
        <h3>{t('algorithm.editor.explanationTitle')}</h3>
        <TextArea label={t('algorithm.editor.explanation')} hint={t('algorithm.editor.explanationHint')} rows={4} maxLength={12000} value={block.explanation || ''} onChange={(e) => set({ explanation: e.target.value })} />
        {block.explanation ? (
          <div className="card-muted">
            <RichText text={block.explanation} />
          </div>
        ) : null}
      </section>
    </div>
  )

  return (
    <div className="stack">
      <TabsWithPanels
        label={t('algorithm.editor.tabsLabel')}
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'setup', label: t('algorithm.editor.tabSetup'), icon: Settings, content: <div style={{ paddingBlockStart: '1rem' }}>{setup}</div> },
          {
            id: 'preview',
            label: t('algorithm.editor.tabPreview'),
            icon: Eye,
            content: (
              <div className="alg-preview">
                <p className="alg-preview-label">{t('algorithm.editor.previewLabel')}</p>
                {tab === 'preview' ? <AlgorithmView block={block} /> : null}
              </div>
            ),
          },
        ]}
      />
      <ConfirmDialog open={Boolean(pending)} onClose={() => setPending(null)} onConfirm={() => applyAlgorithm(pending)} title={t('algorithm.editor.switchTitle')} confirmLabel={t('algorithm.editor.switchConfirm')}>
        <p style={{ margin: 0 }}>{pending ? t('algorithm.editor.switchBody', { name: t(`algorithm.names.${pending}`) }) : null}</p>
      </ConfirmDialog>
    </div>
  )
}
