import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
}

/**
 * Bilingual terms (spec §10.4): Vietnamese and English pairs from spec.glossary, so learners
 * can connect the textbook word with the term used in papers, videos and the wider web.
 */
export default function GlossaryPanel({ glossary }) {
  const { t, lang } = useT()
  const [query, setQuery] = useState('')
  const terms = useMemo(() => (glossary || []).filter((g) => g && (g.vi || g.en)), [glossary])
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return terms
    return terms.filter((g) => normalize(`${g.vi} ${g.en} ${g.note || ''}`).includes(q))
  }, [terms, query])
  const first = lang === 'en' ? 'en' : 'vi'
  const second = first === 'vi' ? 'en' : 'vi'
  return (
    <section className="xp-glossary" aria-labelledby="xp-glossary-title">
      <div className="xp-glossary-head">
        <div className="xp-glossary-titles">
          <h2 id="xp-glossary-title" className="xp-section-title">
            {t('explorer.glossary.title')}
          </h2>
          <p className="xp-glossary-count">{t('explorer.glossary.count', { count: terms.length })}</p>
        </div>
        {terms.length > 8 ? (
          <label className="xp-glossary-search">
            <Search size={16} aria-hidden="true" />
            <span className="visually-hidden">{t('explorer.glossary.search')}</span>
            <input className="input input-sm" type="search" value={query} placeholder={t('explorer.glossary.search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
        ) : null}
      </div>
      {filtered.length ? (
        <dl className="xp-terms">
          {filtered.map((g) => (
            <div key={g.id || `${g.vi}-${g.en}`} className="xp-term">
              <dt>
                <span lang={first}>{g[first] || g[second]}</span>
              </dt>
              <dd>
                {g[second] ? (
                  <span className="xp-term-other" lang={second}>
                    {g[second]}
                  </span>
                ) : (
                  <span className="xp-term-missing">{t('explorer.glossary.missing')}</span>
                )}
                {g.note ? <span className="xp-term-note">{g.note}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="small muted" role="status">
          {t('explorer.glossary.empty')}
        </p>
      )}
    </section>
  )
}
