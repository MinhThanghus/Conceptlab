import { useLocation } from 'react-router-dom'
import { useT } from '../../i18n/index.jsx'
import { LinkButton } from '../../components/ui/index.js'
import { useDocumentTitle } from './hooks.js'
import './notfound.css'

export default function NotFoundPage() {
  const { t } = useT()
  const location = useLocation()
  useDocumentTitle(t('home.notFound.title'))
  return (
    <div className="container nf">
      <h1>{t('home.notFound.title')}</h1>
      <p className="nf-body">{t('home.notFound.body')}</p>
      <p className="nf-path">
        <code className="break">{location.pathname}</code>
      </p>
      <div className="nf-actions">
        <LinkButton to="/" variant="primary" size="lg">
          {t('home.notFound.home')}
        </LinkButton>
        <LinkButton to="/join" size="lg">
          {t('home.notFound.join')}
        </LinkButton>
        <LinkButton to="/gallery" variant="ghost" size="lg">
          {t('home.notFound.gallery')}
        </LinkButton>
      </div>
    </div>
  )
}
