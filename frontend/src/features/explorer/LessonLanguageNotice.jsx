import { useT } from '../../i18n/index.jsx'

/** The interface language does not translate material authored in another language. */
export default function LessonLanguageNotice({ language, className }) {
  const { lang, t } = useT()
  if (!['vi', 'en'].includes(language) || language === lang) return null
  return <p className={className}>{t(`explorer.shared.contentLanguage.${language}`)}</p>
}
