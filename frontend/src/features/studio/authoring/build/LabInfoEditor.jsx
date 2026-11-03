import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, Languages, Lightbulb, Plus, Target, Trash2 } from 'lucide-react'
import { useT } from '../../../../i18n/index.jsx'
import { Button, IconButton, TextArea } from '../../../../components/ui/index.js'
import { useLab } from '../../../lab/LabContext.jsx'
import { newId } from '../../../lab/specUtils.js'
import { normalizeResult, removeAt, replaceAt } from '../review.js'
import { focusById } from '../review/shared.jsx'

const LIMITS = { objectives: 12, glossary: 120, assumptions: 40 }

/**
 * Lab-level content shown to learners around the interactive parts: summary, learning
 * objectives, bilingual glossary (vi/en) and the assumptions the lab relies on.
 */
export function LabInfoEditor() {
  const { t } = useT()
  const { lab, updateSpec } = useLab()
  const spec = lab.spec || {}
  const objectives = spec.objectives || []
  const glossary = spec.glossary || []
  const assumptions = spec.assumptions || []
  const analysis = useMemo(() => (lab.analysis?.status === 'done' ? normalizeResult(lab.analysis.result) : null), [lab.analysis])
  const [open, setOpen] = useState(() => !(spec.blocks || []).length)
  const set = (key, value) => updateSpec((s) => ({ ...s, [key]: typeof value === 'function' ? value(s[key] || []) : value }))

  const summaryLine = [
    spec.summary ? t('build.info.hasSummary') : t('build.info.noSummary'),
    t('build.info.objectivesCount', { count: objectives.length }),
    t('build.info.glossaryCount', { count: glossary.length }),
    t('build.info.assumptionsCount', { count: assumptions.length }),
  ].join(', ')

  return (
    <section className="card au-info" aria-labelledby="au-info-title">
      <div className="au-card-head">
        <div>
          <h3 id="au-info-title">{t('build.info.title')}</h3>
          <p>{summaryLine}</p>
        </div>
        <Button size="sm" icon={open ? ChevronUp : ChevronDown} aria-expanded={open} aria-controls="au-info-body" onClick={() => setOpen((o) => !o)}>
          {open ? t('build.info.hide') : t('build.info.edit')}
        </Button>
      </div>
      <div id="au-info-body" hidden={!open} className="stack">
        {open ? (
          <>
            <div className="stack-sm">
              <TextArea
                label={t('build.info.summary')}
                hint={t('build.info.summaryHint')}
                rows={3}
                maxLength={12000}
                value={spec.summary || ''}
                onChange={(e) => set('summary', e.target.value)}
              />
              {!spec.summary && analysis?.summary ? (
                <div>
                  <Button size="sm" variant="soft" icon={BookOpen} onClick={() => set('summary', analysis.summary.slice(0, 12000))}>
                    {t('build.info.useAnalysisSummary')}
                  </Button>
                </div>
              ) : null}
            </div>

            <fieldset className="au-fieldset">
              <legend>
                <Target aria-hidden="true" className="au-legend-icon" />
                {t('build.info.objectives')}
              </legend>
              <p className="small muted" style={{ margin: 0 }}>
                {t('build.info.objectivesHint')}
              </p>
              {objectives.map((text, i) => (
                <div className="au-list-row" key={i}>
                  <label className="visually-hidden" htmlFor={`au-objective-${i}`}>
                    {t('build.info.objectiveN', { n: i + 1 })}
                  </label>
                  <span className="au-list-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <input
                    id={`au-objective-${i}`}
                    className="input"
                    maxLength={2000}
                    value={text}
                    placeholder={t('build.info.objectivePlaceholder')}
                    onChange={(e) => set('objectives', (list) => replaceAt(list, i, e.target.value))}
                  />
                  <IconButton icon={Trash2} size="sm" label={t('build.info.removeObjective', { n: i + 1 })} onClick={() => set('objectives', (list) => removeAt(list, i))} />
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  icon={Plus}
                  disabled={objectives.length >= LIMITS.objectives}
                  onClick={() => {
                    const index = objectives.length
                    set('objectives', (list) => [...list, ''])
                    focusById(`au-objective-${index}`)
                  }}
                >
                  {t('build.info.addObjective')}
                </Button>
              </div>
            </fieldset>

            <fieldset className="au-fieldset">
              <legend>
                <Languages aria-hidden="true" className="au-legend-icon" />
                {t('build.info.glossary')}
              </legend>
              <p className="small muted" style={{ margin: 0 }}>
                {t('build.info.glossaryHint')}
              </p>
              {glossary.length ? (
                <div className="au-gloss-head" aria-hidden="true">
                  <span>{t('build.info.vi')}</span>
                  <span>{t('build.info.en')}</span>
                  <span />
                </div>
              ) : null}
              {glossary.map((term, i) => (
                <div className="au-gloss-row" key={term.id || i}>
                  <label className="au-cell">
                    <span className="au-cell-label">{t('build.info.vi')}</span>
                    <input
                      id={`au-gloss-${i}-vi`}
                      className="input input-sm"
                      lang="vi"
                      maxLength={200}
                      value={term.vi || ''}
                      placeholder={i === 0 ? t('build.info.viPlaceholder') : ''}
                      onChange={(e) => set('glossary', (list) => replaceAt(list, i, { ...list[i], vi: e.target.value }))}
                    />
                  </label>
                  <label className="au-cell">
                    <span className="au-cell-label">{t('build.info.en')}</span>
                    <input
                      className="input input-sm"
                      lang="en"
                      maxLength={200}
                      value={term.en || ''}
                      placeholder={i === 0 ? t('build.info.enPlaceholder') : ''}
                      onChange={(e) => set('glossary', (list) => replaceAt(list, i, { ...list[i], en: e.target.value }))}
                    />
                  </label>
                  <IconButton icon={Trash2} size="sm" label={t('build.info.removeTerm', { term: term.vi || term.en || i + 1 })} onClick={() => set('glossary', (list) => removeAt(list, i))} />
                </div>
              ))}
              <div>
                <Button
                  size="sm"
                  icon={Plus}
                  disabled={glossary.length >= LIMITS.glossary}
                  onClick={() => {
                    const index = glossary.length
                    set('glossary', (list) => [...list, { id: newId('g'), vi: '', en: '', note: '' }])
                    focusById(`au-gloss-${index}-vi`)
                  }}
                >
                  {t('build.info.addTerm')}
                </Button>
              </div>
            </fieldset>

            <fieldset className="au-fieldset">
              <legend>
                <Lightbulb aria-hidden="true" className="au-legend-icon" />
                {t('build.info.assumptions')}
              </legend>
              <p className="small muted" style={{ margin: 0 }}>
                {t('build.info.assumptionsHint')}
              </p>
              {assumptions.map((a, i) => (
                <div className="au-assume-row" key={a.id || i}>
                  <label className="visually-hidden" htmlFor={`au-assume-${i}`}>
                    {t('build.info.assumptionN', { n: i + 1 })}
                  </label>
                  <input
                    id={`au-assume-${i}`}
                    className="input"
                    maxLength={2000}
                    value={a.text || ''}
                    placeholder={t('build.info.assumptionPlaceholder')}
                    onChange={(e) => set('assumptions', (list) => replaceAt(list, i, { ...list[i], text: e.target.value }))}
                  />
                  <label className="check au-confirm-mini">
                    <input type="checkbox" checked={Boolean(a.confirmed)} onChange={(e) => set('assumptions', (list) => replaceAt(list, i, { ...list[i], confirmed: e.target.checked }))} />
                    <span>{t('build.info.assumptionChecked')}</span>
                  </label>
                  <IconButton icon={Trash2} size="sm" label={t('build.info.removeAssumption', { n: i + 1 })} onClick={() => set('assumptions', (list) => removeAt(list, i))} />
                </div>
              ))}
              <div className="row" style={{ gap: '0.5rem' }}>
                <Button
                  size="sm"
                  icon={Plus}
                  disabled={assumptions.length >= LIMITS.assumptions}
                  onClick={() => {
                    const index = assumptions.length
                    set('assumptions', (list) => [...list, { id: newId('a'), text: '', confirmed: true }])
                    focusById(`au-assume-${index}`)
                  }}
                >
                  {t('build.info.addAssumption')}
                </Button>
                {!assumptions.length && analysis?.assumptions?.length ? (
                  <Button
                    size="sm"
                    variant="soft"
                    icon={Lightbulb}
                    onClick={() =>
                      set(
                        'assumptions',
                        analysis.assumptions.slice(0, LIMITS.assumptions).map((x) => ({ id: x.id || newId('a'), text: x.text || '', confirmed: Boolean(x.confirmed) })),
                      )
                    }
                  >
                    {t('build.info.useAnalysisAssumptions', { count: analysis.assumptions.length })}
                  </Button>
                ) : null}
              </div>
            </fieldset>
          </>
        ) : null}
      </div>
    </section>
  )
}
