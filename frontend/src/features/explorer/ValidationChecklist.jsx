import { Link } from 'react-router-dom'
import { CircleCheck, CircleMinus, CircleX, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button, ErrorMessage, LoadingBlock } from '../../components/ui/index.js'
import './studio-steps.css'

/** Check codes produced by backend/app/services/validation.py (docs/API.md). */
export const CHECK_CODES = [
  'consent',
  'blocks_present',
  'expression_parses',
  'expression_vars',
  'expression_finite',
  'param_ranges',
  'units_consistent',
  'slider_effect',
  'sim_reference',
  'quiz_answers',
  'widget_status',
  'sources_cited',
  'sequence_confirmed',
  'markers_confirmed',
  'media_available',
  'active_learning',
  'block_ids_unique',
  'board_text',
  'board_visual',
]

const STATUS_ORDER = { fail: 0, warn: 1, pass: 2, skip: 3 }
const STATUS_ICON = { pass: CircleCheck, warn: TriangleAlert, fail: CircleX, skip: CircleMinus }

/** Count checks by status. */
export function summarize(report) {
  const out = { pass: 0, warn: 0, fail: 0, skip: 0 }
  for (const check of report?.checks || []) if (out[check.status] !== undefined) out[check.status] += 1
  return out
}

function CheckItem({ check, lab }) {
  const { t } = useT()
  const known = CHECK_CODES.includes(check.code)
  const Icon = STATUS_ICON[check.status] || CircleMinus
  const block = check.block_id ? (lab.spec?.blocks || []).find((b) => b.id === check.block_id) : null
  const blockTitle = block ? block.title || t(`blocks.types.${block.type}`) : null
  const problem = check.status === 'fail' || check.status === 'warn'
  const sourceIds = Array.isArray(check.detail?.source_ids) ? check.detail.source_ids : []
  const sourceTitles = sourceIds.map((id) => (lab.sources || []).find((s) => s.id === id)?.title).filter(Boolean)
  const toSources = check.code === 'consent' || (sourceIds.length && !check.block_id)
  return (
    <li className={`pub-check pub-check-${check.status}`}>
      <span className="pub-check-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div className="pub-check-body">
        <p className="pub-check-title">
          {known ? t(`publish.codes.${check.code}.title`) : check.message || check.code}
          <span className="visually-hidden">, {t(`publish.check.status.${check.status}`)}</span>
        </p>
        {problem && known ? <p className="pub-check-fix">{t(`publish.codes.${check.code}.fix`)}</p> : null}
        {sourceTitles.length ? <p className="pub-check-meta">{t('publish.check.sourcesList', { list: sourceTitles.join(', ') })}</p> : null}
        <div className="pub-check-links">
          {block ? (
            <Link to={`/app/labs/${lab.id}/build#block-${check.block_id}`} className="chip">
              {t('publish.check.inBlock', { title: blockTitle })}
            </Link>
          ) : problem && check.code === 'blocks_present' ? (
            <Link to={`/app/labs/${lab.id}/build`} className="chip">
              {t('publish.check.fixInBuild')}
            </Link>
          ) : null}
          {problem && toSources ? (
            <Link to={`/app/labs/${lab.id}/sources`} className="chip">
              {t('publish.check.fixSources')}
            </Link>
          ) : null}
        </div>
        {problem && known && check.message ? (
          <details className="pub-check-details">
            <summary>{t('publish.check.details')}</summary>
            <p lang="en">{check.message}</p>
          </details>
        ) : null}
      </div>
    </li>
  )
}

/** Pre-publication checklist (spec §11 "Kiểm tra trước khi trình bày"). */
export default function ValidationChecklist({ lab, report, checking, error, onRerun }) {
  const { t, fmt } = useT()
  const counts = summarize(report)
  const checks = [...(report?.checks || [])].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
  const problems = checks.filter((c) => c.status === 'fail' || c.status === 'warn')
  const others = checks.filter((c) => c.status !== 'fail' && c.status !== 'warn')
  return (
    <section className="card pub-checks" aria-labelledby="pub-checks-title" aria-busy={checking || undefined}>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="stack-sm" style={{ flex: '1 1 16rem' }}>
          <h2 id="pub-checks-title" className="pub-card-title">
            <ShieldCheck aria-hidden="true" />
            {t('publish.check.title')}
          </h2>
          {report && !checking ? (
            <p className="pub-summary" role="status">
              <span className="pub-count pub-count-pass">
                <CircleCheck size={16} aria-hidden="true" />
                {t('publish.check.countPass', { count: counts.pass })}
              </span>
              <span className="pub-count pub-count-warn">
                <TriangleAlert size={16} aria-hidden="true" />
                {t('publish.check.countWarn', { count: counts.warn })}
              </span>
              <span className="pub-count pub-count-fail">
                <CircleX size={16} aria-hidden="true" />
                {t('publish.check.countFail', { count: counts.fail })}
              </span>
            </p>
          ) : null}
        </div>
        <Button size="sm" icon={RefreshCw} onClick={onRerun} loading={checking}>
          {t('publish.check.rerun')}
        </Button>
      </div>

      {checking && !report ? <LoadingBlock lines={4} /> : null}
      {error ? <ErrorMessage error={error} title={t('publish.check.error')} onRetry={onRerun} /> : null}

      {report ? (
        <>
          <div className={['pub-verdict', counts.fail ? 'is-fail' : counts.warn ? 'is-warn' : 'is-pass'].join(' ')}>
            {counts.fail ? t('publish.check.hasFail', { count: counts.fail }) : counts.warn ? t('publish.check.hasWarn', { count: counts.warn }) : t('publish.check.allGood')}
          </div>
          {problems.length ? (
            <ul className="list-reset pub-check-list">
              {problems.map((check, i) => (
                <CheckItem key={`${check.code}-${check.block_id || ''}-${i}`} check={check} lab={lab} />
              ))}
            </ul>
          ) : null}
          {others.length ? (
            <details className="pub-passed">
              <summary>{t('publish.check.passedGroup', { count: others.length })}</summary>
              <ul className="list-reset pub-check-list">
                {others.map((check, i) => (
                  <CheckItem key={`${check.code}-${check.block_id || ''}-${i}`} check={check} lab={lab} />
                ))}
              </ul>
            </details>
          ) : null}
          <p className="pub-check-note">
            {report.checked_at ? `${t('publish.check.checkedAt', { time: fmt.dateTime(report.checked_at) })}. ` : ''}
            {t('publish.check.note')}
          </p>
        </>
      ) : null}
    </section>
  )
}
