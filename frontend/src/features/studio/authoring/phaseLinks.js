/**
 * Class links that tag quiz attempts as "pre" (before the lesson) or "post" (after it).
 * The quiz block reads `?phase=pre|post` from the page URL (quizModel.phaseFromSearch).
 */
export const PHASE_LINKS = ['pre', 'post']

export function phaseLink(shareUrl, phase) {
  if (!shareUrl) return ''
  if (!PHASE_LINKS.includes(phase)) return shareUrl
  const [base, hash = ''] = String(shareUrl).split('#')
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}phase=${phase}${hash ? `#${hash}` : ''}`
}
