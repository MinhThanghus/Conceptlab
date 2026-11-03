import { useEffect, useId, useMemo, useState } from 'react'
import { BookOpen, Brain, ChevronDown, FileText, Image, LoaderCircle, Lightbulb, ListTree, Sigma, Table2, Workflow, X } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Alert, Button, Switch, TextField } from '../../components/ui/index.js'
import PaperPageViewer from './PaperPageViewer.jsx'
import { DEFAULT_PAGE_COUNT, MAX_PAGES_PER_RUN, defaultPageText, formatElapsed, formatPageRanges, modelLabel, parsePageRanges, tocRanges } from './paperUtils.js'

export const KIND_ICONS = {
  sections: ListTree,
  equations: Sigma,
  figures: Image,
  tables: Table2,
  methods: Workflow,
  candidates: Lightbulb,
}

/** State of the "analyse the paper" form: PDF source, pages, deep analysis. */
export function usePaperSetup(lab) {
  const pdfs = useMemo(() => (lab?.sources || []).filter((s) => s.kind === 'pdf'), [lab?.sources])
  const ready = useMemo(() => pdfs.filter((s) => s.status === 'ready'), [pdfs])
  const analysed = lab?.analysis?.source_ids || []
  const preferred = analysed.find((id) => ready.some((s) => s.id === id)) || ready[0]?.id || ''
  const [sourceId, setSourceId] = useState(preferred)
  const source = ready.find((s) => s.id === sourceId) || null
  const [pagesText, setPagesText] = useState(() => defaultPageText(source?.page_count))
  const [deep, setDeep] = useState(false)

  // A source finished processing or was deleted: fall back to a ready one.
  useEffect(() => {
    if (source || !preferred) return
    setSourceId(preferred)
    setPagesText(defaultPageText(ready.find((s) => s.id === preferred)?.page_count))
  }, [source, preferred, ready])

  const parsed = useMemo(() => parsePageRanges(pagesText, source?.page_count), [pagesText, source?.page_count])
  const chooseSource = (id) => {
    setSourceId(id)
    setPagesText(defaultPageText(ready.find((s) => s.id === id)?.page_count))
  }
  const valid = Boolean(source) && !parsed.error && parsed.pages.length > 0
  const body = valid ? { source_id: source.id, pages: parsed.pages, deep: Boolean(deep) } : null
  return { pdfs, ready, source, sourceId, chooseSource, pagesText, setPagesText, deep, setDeep, parsed, valid, body }
}

function pageError(t, error) {
  if (!error) return ''
  if (error.code === 'empty') return t('paper.setup.errors.empty')
  if (error.code === 'syntax') return t('paper.setup.errors.syntax', { token: error.token })
  if (error.code === 'tooMany') return t('paper.setup.errors.tooMany', { count: error.count, max: error.max })
  return t('paper.setup.errors.range', { page: error.page, count: error.count ?? '—' })
}

/** Model the run will use (shown to the teacher; privacy differs between modes). */
export function runModel(ai, lab, deep) {
  const models = ai?.models || {}
  if (deep) return modelLabel(models.deep || 'muse-wonder')
  return modelLabel(models[lab?.ai_mode] || models.contributor || '')
}

/** Form used before the first analysis and in the "re-run" dialog. */
export function PaperSetupForm({ lab, setup, ai }) {
  const { t, fmt } = useT()
  const ids = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPage, setPreviewPage] = useState(1)
  const { source, parsed } = setup
  const pageCount = Number(source?.page_count) || 0
  const toc = useMemo(() => tocRanges(source?.toc, pageCount).filter((r) => r.to - r.from + 1 <= MAX_PAGES_PER_RUN), [source?.toc, pageCount])

  const quick = []
  if (pageCount > DEFAULT_PAGE_COUNT) quick.push({ key: 'first', label: t('paper.setup.firstPages', { count: DEFAULT_PAGE_COUNT }), text: defaultPageText(pageCount) })
  if (pageCount > 1 && pageCount <= MAX_PAGES_PER_RUN) quick.push({ key: 'all', label: t('paper.setup.allPages', { count: pageCount }), text: `1-${pageCount}` })

  return (
    <div className="stack">
      <fieldset className="paper-fieldset">
        <legend className="field-label">{t('paper.setup.chooseSource')}</legend>
        <div className="paper-source-list">
          {setup.pdfs.map((s) => {
            const disabled = s.status !== 'ready'
            return (
              <label key={s.id} className={['paper-source-option', disabled && 'is-disabled'].filter(Boolean).join(' ')}>
                <input
                  type="radio"
                  name={`${ids}-source`}
                  value={s.id}
                  checked={setup.sourceId === s.id}
                  disabled={disabled}
                  onChange={() => setup.chooseSource(s.id)}
                />
                <FileText size={20} aria-hidden="true" className="paper-source-icon" />
                <span className="paper-source-text">
                  <strong className="break">{s.title}</strong>
                  <span className="small muted">
                    {s.status === 'processing'
                      ? t('paper.setup.processing')
                      : s.status === 'failed'
                        ? t('paper.setup.failed')
                        : [t('paper.setup.pageCount', { count: s.page_count || 0 }), fmt.bytes(s.size_bytes)].join(', ')}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {source ? (
        <div className="stack-sm">
          {pageCount > DEFAULT_PAGE_COUNT ? (
            <Alert tone="info" title={t('paper.setup.longTitle', { count: pageCount })}>
              {t('paper.setup.longBody', { max: MAX_PAGES_PER_RUN })}
            </Alert>
          ) : null}
          <TextField
            label={t('paper.setup.pagesLabel')}
            hint={t('paper.setup.pagesHint', { count: pageCount || '—' })}
            error={pageError(t, parsed.error) || undefined}
            value={setup.pagesText}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            maxLength={200}
            onChange={(e) => setup.setPagesText(e.target.value)}
          />
          {quick.length || toc.length ? (
            <div className="stack-sm">
              <span className="small muted">{t('paper.setup.quickPick')}</span>
              <div className="row" style={{ gap: '0.4rem' }}>
                {quick.map((q) => (
                  <button key={q.key} type="button" className="chip paper-chip" aria-pressed={setup.pagesText === q.text} onClick={() => setup.setPagesText(q.text)}>
                    {q.label}
                  </button>
                ))}
                {toc.slice(0, 12).map((r) => {
                  const text = r.from === r.to ? String(r.from) : `${r.from}-${r.to}`
                  return (
                    <button key={`${r.title}-${r.from}`} type="button" className="chip paper-chip" aria-pressed={setup.pagesText === text} onClick={() => setup.setPagesText(text)}>
                      <BookOpen size={14} aria-hidden="true" />
                      <span className="break">{t('paper.setup.tocChip', { title: r.title, pages: r.from === r.to ? String(r.from) : `${r.from}-${r.to}` })}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
          {!parsed.error && parsed.pages.length ? (
            <p className="small" style={{ margin: 0 }} aria-live="polite">
              {t('paper.setup.selected', { count: parsed.pages.length, list: formatPageRanges(parsed.pages) })}
            </p>
          ) : null}
          <div className="paper-preview-toggle">
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={previewOpen} onClick={() => setPreviewOpen((o) => !o)}>
              <ChevronDown size={18} aria-hidden="true" style={{ transform: previewOpen ? 'rotate(180deg)' : undefined }} />
              {previewOpen ? t('paper.setup.hidePreview') : t('paper.setup.showPreview')}
            </button>
            {previewOpen ? <PaperPageViewer source={source} page={previewPage} onPageChange={setPreviewPage} focus={null} /> : null}
          </div>
        </div>
      ) : null}

      {ai?.deep_enabled ? (
        <div className="stack-sm">
          <Switch label={t('paper.setup.deepLabel')} checked={setup.deep} onChange={(e) => setup.setDeep(e.target.checked)} />
          <span className="field-hint">{t('paper.setup.deepHint')}</span>
        </div>
      ) : null}

      <p className="ai-note" style={{ margin: 0 }}>
        <Brain size={16} aria-hidden="true" />
        <span>
          {t('paper.setup.modelNote', { model: runModel(ai, lab, setup.deep) || t('analyze.summary.unknownModel') })}{' '}
          {!setup.deep && lab?.ai_mode === 'contributor' ? t('common.aiMode.contributorHint') : t('common.aiMode.standardHint')}
        </span>
      </p>
    </div>
  )
}

/** What the analysis produces, shown next to the setup form. */
export function WhatYouGet() {
  const { t } = useT()
  return (
    <aside className="card-muted stack-sm paper-get" aria-labelledby="paper-get-title">
      <h3 id="paper-get-title" className="panel-title" style={{ margin: 0 }}>
        {t('paper.get.title')}
      </h3>
      <ul className="list-reset stack-sm">
        {Object.entries(KIND_ICONS).map(([kind, Icon]) => (
          <li key={kind} className="paper-get-item">
            <span className="paper-get-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <span>
              <strong>{t(`paper.kinds.${kind}`)}</strong>
              <span className="small muted" style={{ display: 'block' }}>
                {t(`paper.get.${kind}`)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="small muted" style={{ margin: 0 }}>
        {t('paper.get.note')}
      </p>
    </aside>
  )
}

/** Honest progress for one long request: elapsed time and what the AI is looking for, no fake percentage. */
export function ProgressPanel({ job, lab, onCancel }) {
  const { t } = useT()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const source = (lab?.sources || []).find((s) => s.id === job?.body?.source_id)
  const pages = job?.body?.pages || []
  return (
    <section className="card stack paper-progress" aria-labelledby="paper-progress-title">
      <div className="paper-progress-head">
        <LoaderCircle className="spin" aria-hidden="true" />
        <div style={{ minInlineSize: 0, flex: 1 }}>
          <h2 id="paper-progress-title" role="status" className="paper-progress-title">
            {t('paper.progress.title')}
          </h2>
          <p className="small muted break" style={{ margin: 'var(--space-3xs) 0 0' }}>
            {[source?.title, t('paper.setup.pageCount', { count: pages.length }), job?.meta?.model].filter(Boolean).join(', ')}
          </p>
        </div>
        {onCancel ? (
          <Button icon={X} onClick={onCancel} className="paper-progress-cancel">
            {t('paper.progress.cancel')}
          </Button>
        ) : null}
      </div>
      <div className="paper-indeterminate" aria-hidden="true" />
      <p className="small" style={{ margin: 0 }}>
        <strong>{t('paper.progress.elapsed', { time: formatElapsed(now - (job?.startedAt || now)) })}</strong>
        {pages.length ? <span className="muted">, {t('paper.progress.pages', { list: formatPageRanges(pages) })}</span> : null}
      </p>
      <div className="stack-sm">
        <span className="small muted">{t('paper.progress.looking')}</span>
        <ul className="paper-progress-list list-reset">
          {Object.entries(KIND_ICONS).map(([kind, Icon]) => (
            <li key={kind}>
              <Icon size={16} aria-hidden="true" />
              {t(`paper.kinds.${kind}`)}
            </li>
          ))}
        </ul>
      </div>
      <Alert tone="neutral">
        {t('paper.progress.note')} {t('paper.progress.stay')}
      </Alert>
    </section>
  )
}
