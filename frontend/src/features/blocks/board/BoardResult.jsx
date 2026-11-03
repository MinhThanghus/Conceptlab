import { useId } from 'react'
import { CircleCheck, CircleHelp, PencilLine, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { AIBadge, Button, Segmented } from '../../../components/ui/index.js'
import { proofCount, proofIssues, proofState } from './boardModel.js'
import { BoardImage } from './BoardView.jsx'

/** Did the words of the redrawn picture match the checked reading (BoardProof)? */
export function ProofStatus({ proof }) {
  const { t } = useT()
  const state = proofState(proof)
  if (state === 'ok') {
    return (
      <div className="bd-proof is-ok">
        <CircleCheck aria-hidden="true" />
        <p className="bd-proof-title">{t('board.result.proofOk')}</p>
      </div>
    )
  }
  if (state === 'unchecked') {
    return (
      <div className="bd-proof is-unchecked">
        <CircleHelp aria-hidden="true" />
        <div className="bd-proof-body">
          <p className="bd-proof-title">{t('board.result.proofUnchecked')}</p>
          <p>{t('board.result.proofUncheckedBody')}</p>
        </div>
      </div>
    )
  }
  const issues = proofIssues(proof)
  return (
    <div className="bd-proof is-issues">
      <TriangleAlert aria-hidden="true" />
      <div className="bd-proof-body">
        <p className="bd-proof-title">{t('board.result.proofIssues', { count: Math.max(1, proofCount(proof)) })}</p>
        {proofCount(proof) ? (
          <ul className="bd-proof-list">
            {issues.differences.map((d, i) => (
              <li key={`d${i}`}>{d.found ? t('board.result.diff', { expected: d.expected, found: d.found }) : t('board.result.missing', { text: d.expected })}</li>
            ))}
            {issues.missing.map((text, i) => (
              <li key={`m${i}`}>{t('board.result.missing', { text })}</li>
            ))}
            {issues.extra.map((text, i) => (
              <li key={`e${i}`}>{t('board.result.extra', { text })}</li>
            ))}
          </ul>
        ) : null}
        <p className="bd-proof-hint">{t('board.result.issuesHint')}</p>
      </div>
    </div>
  )
}

/**
 * Stage 5 of the board editor: the redrawn sheet, whether its words match the reading, which view
 * learners open first and "Redraw". Editing the text afterwards marks the sheet out of date (it is
 * kept until a redraw replaces it).
 */
export function BoardResult({ block, src, alt, stale, headingRef, onShow, onRedraw, canRedraw }) {
  const { t } = useT()
  const headingId = useId()
  const proof = block.visual_proof
  return (
    <section className="bd-result" aria-labelledby={headingId}>
      <div className="bd-result-head">
        <h4 id={headingId} ref={headingRef} tabIndex={-1} className="lk-section-title">
          <Sparkles aria-hidden="true" />
          {t('board.result.title')}
        </h4>
        {stale ? (
          <span className="badge badge-warning">
            <PencilLine aria-hidden="true" />
            {t('board.result.stale')}
          </span>
        ) : null}
      </div>
      <div className="bd-result-grid">
        <figure className="bd-result-fig">
          <BoardImage src={src} alt={alt} className="bd-result-img" />
          <figcaption>
            <AIBadge label={t('board.result.redrawn')} />
          </figcaption>
        </figure>
        <div className="bd-result-side">
          {/* the proof compared the picture with the words as they were when it was drawn: once the
              words change it says nothing true about them, so the out-of-date note takes its place */}
          {stale ? (
            <p className="bd-stale">{t('board.result.staleBody')}</p>
          ) : (
            <>
              <ProofStatus proof={proof} />
              {proof?.attempts > 1 ? <p className="lk-hint">{t('board.result.attempts', { count: proof.attempts })}</p> : null}
            </>
          )}
          <div className="bd-show">
            <p className="field-label" id={`${headingId}-show`}>
              {t('board.result.showLabel')}
            </p>
            <Segmented
              label={t('board.result.showLabel')}
              value={block.show === 'text' ? 'text' : 'visual'}
              onChange={onShow}
              options={[
                { value: 'visual', label: t('board.view.visual') },
                { value: 'text', label: t('board.view.text') },
              ]}
            />
            <p className="field-hint">{t('board.result.showHint')}</p>
          </div>
          <div className="bd-result-actions">
            <Button icon={RefreshCw} onClick={onRedraw} disabled={!canRedraw}>
              {t('board.draw.redraw')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
