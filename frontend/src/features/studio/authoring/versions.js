/**
 * Version notes are written by the server in English ("Published", "AI analysis",
 * "Restored from v3"…) or by this app before a restore ("Before restoring v3"). Map the
 * known ones to i18n keys (`publish.versions.notes.*`); anything else is shown as written.
 */
const FIXED = {
  published: 'published',
  'ai analysis': 'aiAnalysis',
  'ai blocks': 'aiBlocks',
  'ai paper structure': 'aiPaper',
}

export function restoreNote(version) {
  return `Before restoring v${version}`
}

export function versionNote(note) {
  const text = String(note ?? '').trim()
  if (!text) return { key: 'auto', params: {} }
  const fixed = FIXED[text.toLowerCase()]
  if (fixed) return { key: fixed, params: {} }
  let m = /^restored from v(\d+)$/i.exec(text)
  if (m) return { key: 'restored', params: { n: Number(m[1]) } }
  m = /^before restoring v(\d+)$/i.exec(text)
  if (m) return { key: 'beforeRestore', params: { n: Number(m[1]) } }
  return { key: null, text }
}
