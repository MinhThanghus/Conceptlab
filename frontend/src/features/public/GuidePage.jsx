import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { LinkButton, ProvenanceBadge } from '../../components/ui/index.js'
import { useDocumentTitle } from './hooks.js'
import './banner.css'
import './guide.css'

const TEACHER_STEPS = ['create', 'sources', 'analyze', 'review', 'build', 'preview', 'share', 'results']
const TEACHER_TIPS = [
  { key: 'pages', items: ['flat', 'light', 'parallel', 'onePage', 'check'] },
  { key: 'objects', items: ['background', 'whole', 'measure', 'select'] },
  { key: 'videos', items: ['short', 'steady', 'safe', 'consent', 'standard'] },
  { key: 'review', items: ['formula', 'order', 'assumptions', 'unknown', 'quiz'] },
  { key: 'share', items: ['code', 'qr', 'projector', 'weak', 'update'] },
]
const ACTIVE_STEPS = ['predict', 'change', 'run', 'compare', 'explain']
const PROVENANCE = ['document', 'user', 'assumption', 'unknown']
const FAQ = ['wrong', 'grading', 'simulation', 'modes', 'account', 'visibility', 'delete', 'offline', 'ranking']

/** A titled list of tips: a plain heading and its points. */
function TipList({ base, items, level = 4 }) {
  const { t } = useT()
  const Heading = `h${level}`
  return (
    <div className="gd-tip">
      <Heading>{t(`${base}.title`)}</Heading>
      <ul className="gd-list">
        {items.map((item) => (
          <li key={item}>{t(`${base}.items.${item}`)}</li>
        ))}
      </ul>
    </div>
  )
}

export default function GuidePage() {
  const { t } = useT()
  const { user } = useAuth()
  useDocumentTitle(t('guide.meta.title'))
  const toc = [
    { id: 'teachers', label: t('guide.toc.teachers') },
    { id: 'students', label: t('guide.toc.students') },
    { id: 'faq', label: t('guide.toc.faq') },
  ]
  return (
    <div className="guide">
      <header className="pb-banner gd-banner">
        <div className="pb-sheet" aria-hidden="true">
          <i />
        </div>
        <div className="container gd-banner-inner">
          <h1>{t('guide.title')}</h1>
          <p className="pb-lead">{t('guide.lead')}</p>
        </div>
      </header>

      <div className="container gd-layout">
        <nav className="gd-toc" aria-label={t('guide.toc.label')}>
          <p className="gd-toc-title">{t('guide.toc.label')}</p>
          <ul className="list-reset">
            {toc.map(({ id, label }) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="gd-doc">
          <section id="teachers" className="gd-section" aria-labelledby="guide-teachers-title">
            <h2 id="guide-teachers-title">{t('guide.teachers.title')}</h2>
            <p className="gd-intro">{t('guide.teachers.lead')}</p>

            <h3>{t('guide.teachers.stepsTitle')}</h3>
            <ol className="gd-steps">
              {TEACHER_STEPS.map((step) => (
                <li key={step}>
                  <p className="gd-step-title">{t(`guide.teachers.steps.${step}.title`)}</p>
                  <p>{t(`guide.teachers.steps.${step}.body`)}</p>
                </li>
              ))}
            </ol>

            <h3>{t('guide.teachers.tipsTitle')}</h3>
            <div className="gd-tips">
              {TEACHER_TIPS.map(({ key, items }) => (
                <TipList key={key} base={`guide.teachers.tips.${key}`} items={items} />
              ))}
            </div>
          </section>

          <section id="students" className="gd-section" aria-labelledby="guide-students-title">
            <h2 id="guide-students-title">{t('guide.students.title')}</h2>
            <p className="gd-intro">{t('guide.students.lead')}</p>

            <TipList base="guide.students.explore" items={['click', 'sliders', 'run', 'hide']} level={3} />

            <div className="gd-tip">
              <h3>{t('guide.students.active.title')}</h3>
              <ol className="gd-cycle">
                {ACTIVE_STEPS.map((step) => (
                  <li key={step}>{t(`guide.students.active.steps.${step}`)}</li>
                ))}
              </ol>
              <p className="gd-note">{t('guide.students.active.note')}</p>
            </div>

            <TipList base="guide.students.ask" items={['speak', 'context', 'citations', 'wrong']} level={3} />

            <div className="gd-tip">
              <h3>{t('guide.students.sources.title')}</h3>
              <p>{t('guide.students.sources.lead')}</p>
              <dl className="gd-prov">
                {PROVENANCE.map((kind) => (
                  <div key={kind}>
                    <dt>
                      <ProvenanceBadge value={kind} />
                    </dt>
                    <dd>{t(`common.provenance.${kind}Hint`)}</dd>
                  </div>
                ))}
              </dl>
              <p className="gd-note">{t('guide.students.sources.note')}</p>
            </div>
          </section>

          <section id="faq" className="gd-section" aria-labelledby="guide-faq-title">
            <h2 id="guide-faq-title">{t('guide.faq.title')}</h2>
            <p className="gd-intro">{t('guide.faq.lead')}</p>
            <div className="gd-faq">
              {FAQ.map((key) => (
                <details key={key}>
                  <summary>
                    <span>{t(`guide.faq.items.${key}.q`)}</span>
                    <span className="gd-faq-mark" aria-hidden="true" />
                  </summary>
                  <p>{t(`guide.faq.items.${key}.a`)}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="gd-close" aria-labelledby="guide-cta-title">
            <h2 id="guide-cta-title">{t('guide.cta.title')}</h2>
            <p>{t('guide.cta.body')}</p>
            <div className="gd-close-actions">
              <LinkButton to={user ? '/app/new' : '/register?next=%2Fapp%2Fnew'} variant="primary" size="lg">
                {t('guide.cta.create')}
              </LinkButton>
              <LinkButton to="/gallery" size="lg">
                {t('guide.cta.gallery')}
              </LinkButton>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
