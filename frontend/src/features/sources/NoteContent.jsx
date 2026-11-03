/** Render source notes as text with explicit HTTP(S) links; never interpret HTML. */
export function NoteContent({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s<>"']+)/gi)
  return parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>
    // Keep sentence punctuation outside the link and reject anything URL cannot parse.
    const match = part.match(/^(.*?)([.,;:!?]*)$/)
    const candidate = match?.[1] || ''
    try {
      const url = new URL(candidate)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return <span key={index}>{part}</span>
      return <span key={index}><a href={url.href} target="_blank" rel="noopener noreferrer">{candidate}</a>{match[2]}</span>
    } catch {
      return <span key={index}>{part}</span>
    }
  })
}
