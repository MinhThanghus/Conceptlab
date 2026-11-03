import { ArrowRight, Compass, KeyRound, Layers3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import LabCover from '../labs/LabCover.jsx'
import { useDocumentTitle, useFetch } from '../public/hooks.js'
import './student.css'

/** A learning-first landing page for student accounts. Creating/editing remains available. */
export default function StudentHome() {
  const { t, lang } = useT()
  const { user } = useAuth()
  useDocumentTitle(t('student.home'))
  const { data, loading, error } = useFetch(`/api/public/featured?lang=${lang}`, { scope: lang })
  const lessons = Array.isArray(data) ? data.filter((lab) => lab?.share_code).slice(0, 4) : []

  return (
    <div className="student-home">
      <div className="container student-content">
        <section className="student-hero" aria-labelledby="student-welcome">
          <div>
            <p className="student-kicker"><Compass size={17} aria-hidden="true" /> {t('student.home')}</p>
            <h1 id="student-welcome">{t('student.welcome', { name: user?.name || '' })}</h1>
            <p>{t('student.lead')}</p>
            <Link to="/gallery" className="student-primary">{t('student.browse')} <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className="student-hero-art" aria-hidden="true">
            <span className="student-orbit orbit-one" /><span className="student-orbit orbit-two" />
            <span className="student-planet"><Compass size={42} strokeWidth={1.4} /></span>
            <span className="student-star">✦</span>
          </div>
        </section>
        <nav className="student-quick" aria-label={t('student.home')}>
          <Link to="/join"><span className="student-quick-icon"><KeyRound size={22} /></span><span><strong>{t('student.join')}</strong><small>{t('student.joinHint')}</small></span><ArrowRight size={19} /></Link>
          <Link to="/learn"><span className="student-quick-icon"><Layers3 size={22} /></span><span><strong>{t('student.visual')}</strong><small>{t('student.visualHint')}</small></span><ArrowRight size={19} /></Link>
        </nav>
        <section className="student-lessons" aria-labelledby="student-lessons-title">
          <div className="student-section-heading"><div><h2 id="student-lessons-title">{t('student.featured')}</h2><p>{t('student.featuredHint')}</p></div><Link to="/gallery">{t('student.allLessons')} <ArrowRight size={16} aria-hidden="true" /></Link></div>
          {loading ? <p role="status">{t('common.states.loading')}</p> : error || !lessons.length ? <p>{t('student.unavailable')}</p> : (
            <div className="student-lesson-grid">
              {lessons.map((lab) => (
                <Link key={lab.share_code} className="student-lesson" to={`/s/${encodeURIComponent(lab.share_code)}`}>
                  <div className="student-lesson-cover"><LabCover lab={lab} /></div>
                  <div className="student-lesson-text"><span>{t(`common.subjects.${lab.subject}`)} · {t(`common.grades.${lab.grade}`)}</span><strong lang={lab.display_language === lang && lab.display_title ? lang : lab.language}>{lab.display_language === lang && lab.display_title ? lab.display_title : lab.title}</strong><span className="student-lesson-action">{t('student.openLesson')} <ArrowRight size={15} aria-hidden="true" /></span></div>
                </Link>
              ))}
            </div>
          )}
        </section>
        <p className="student-manage"><Link to="/app/manage">{t('student.manage')}</Link></p>
      </div>
    </div>
  )
}
