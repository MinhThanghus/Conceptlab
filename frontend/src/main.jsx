import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable font (no CDN): Lexend, with its Vietnamese subset; the browser fetches
// only the subsets a page uses (latin, latin-ext, vietnamese).
import '@fontsource-variable/lexend/wght.css'
import 'katex/dist/katex.min.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/layout.css'
import App from './app/App.jsx'
import { ensureDict, initialLang } from './i18n/index.jsx'

function render() {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// Load the reader's language first (one small chunk), then render; on a failed download fall
// back to Vietnamese, and render anyway so the app's own error screens can speak.
ensureDict(initialLang())
  .catch(() => ensureDict('vi'))
  .catch(() => {})
  .finally(render)
