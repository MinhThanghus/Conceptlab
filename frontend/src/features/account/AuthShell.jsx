import './auth.css'

/**
 * Frame for the sign-in and sign-up pages: the form on a sheet of card stock, what comes after it
 * (the student's way in) on the paper below, and a column of plain reasons beside it.
 */
export default function AuthShell({ title, lead, children, after, asideTitle, asidePoints = [], asideNote }) {
  return (
    <div className="container auth-page">
      <div className="auth-grid">
        <div className="auth-main">
          <section className="auth-card" aria-labelledby="auth-title">
            <h1 id="auth-title">{title}</h1>
            {lead ? <p className="auth-lead">{lead}</p> : null}
            {children}
          </section>
          {after ? <div className="auth-after">{after}</div> : null}
        </div>
        {asideTitle ? (
          <aside className="auth-aside" aria-labelledby="auth-aside-title">
            <h2 id="auth-aside-title">{asideTitle}</h2>
            <ul className="list-reset auth-points">
              {asidePoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {asideNote ? <div className="auth-aside-note">{asideNote}</div> : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
