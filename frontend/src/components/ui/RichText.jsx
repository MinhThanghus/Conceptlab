import { Fragment, useEffect, useMemo, useState } from 'react'
import { NoteContent } from '../../features/sources/NoteContent.jsx'

// KaTeX (~270 KB) is loaded on first use so pages without formulas stay light on slow networks.
let katexModule = null
let katexPromise = null
function loadKatex() {
  if (!katexPromise) {
    katexPromise = import('katex').then((mod) => {
      katexModule = mod.default || mod
      return katexModule
    })
  }
  return katexPromise
}

function useKatex() {
  const [lib, setLib] = useState(katexModule)
  useEffect(() => {
    if (lib) return undefined
    let alive = true
    loadKatex()
      .then((mod) => alive && setLib(mod))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [lib])
  return lib
}

/**
 * KaTeX formula. Until KaTeX loads (or if the TeX is invalid) the raw TeX is shown in
 * monospace. katex output is generated HTML from a trusted library with `trust: false`.
 */
export function MathTex({ tex, display = false, className }) {
  const katex = useKatex()
  const html = useMemo(() => {
    if (!tex || !katex) return null
    try {
      return katex.renderToString(String(tex), { displayMode: display, throwOnError: true, trust: false, strict: 'ignore', output: 'htmlAndMathml' })
    } catch {
      return null
    }
  }, [tex, display, katex])
  if (html === null) return <code className={className}>{tex}</code>
  const Tag = display ? 'div' : 'span'
  return <Tag className={['formula', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: html }} />
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\$[^$\n]+\$|\[\d{1,2}\])/g

function renderInline(text, opts = {}, keyBase = 'i') {
  const { onCite, citations } = opts
  const parts = String(text).split(INLINE)
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`
    if (!part) return null
    // An emphasis run is read like any other text: math, code, citations and links keep working
    // inside it ("**chiều dài dây $L$**"). Its inside holds no asterisk, so this never nests twice.
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={key}>{renderInline(part.slice(2, -2), opts, key)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={key}>{part.slice(1, -1)}</code>
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) return <MathTex key={key} tex={part.slice(1, -1)} />
    if (/^\[\d{1,2}\]$/.test(part)) {
      const n = Number(part.slice(1, -1))
      const cite = citations?.find((c) => c.n === n)
      if (cite && onCite) {
        return (
          <button key={key} type="button" className="cite" onClick={() => onCite(cite)} aria-label={`[${n}] ${cite.title || ''}`}>
            {n}
          </button>
        )
      }
      return <Fragment key={key}>{part}</Fragment>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={key}>{renderInline(part.slice(1, -1), opts, key)}</em>
    return <NoteContent key={key} text={part} />
  })
}

/**
 * Safe "markdown-lite" renderer for AI and teacher text: paragraphs, bullet/numbered
 * lists, ### headings, **bold**, *italic*, `code`, $inline math$, $$display math$$,
 * and [n] citation markers (clickable when `citations` + `onCite` are given).
 * Never injects raw HTML from the text.
 */
export function RichText({ text, citations, onCite, className }) {
  const blocks = useMemo(() => {
    const out = []
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (!line.trim()) {
        i += 1
        continue
      }
      if (line.trim().startsWith('$$')) {
        let body = line.trim().slice(2)
        if (body.endsWith('$$')) {
          out.push({ type: 'math', tex: body.slice(0, -2) })
          i += 1
          continue
        }
        i += 1
        while (i < lines.length && !lines[i].includes('$$')) {
          body += `\n${lines[i]}`
          i += 1
        }
        if (i < lines.length) body += `\n${lines[i].replace('$$', '')}`
        out.push({ type: 'math', tex: body })
        i += 1
        continue
      }
      if (/^#{1,4}\s/.test(line)) {
        out.push({ type: 'h', text: line.replace(/^#{1,4}\s/, '') })
        i += 1
        continue
      }
      if (/^\s*[-*•]\s+/.test(line)) {
        const items = []
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*•]\s+/, ''))
          i += 1
        }
        out.push({ type: 'ul', items })
        continue
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = []
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
          i += 1
        }
        out.push({ type: 'ol', items })
        continue
      }
      const para = [line]
      i += 1
      while (i < lines.length && lines[i].trim() && !/^(\s*[-*•]\s+|\s*\d+[.)]\s+|#{1,4}\s|\s*\$\$)/.test(lines[i])) {
        para.push(lines[i])
        i += 1
      }
      out.push({ type: 'p', text: para.join('\n') })
    }
    return out
  }, [text])

  const opts = { onCite, citations }
  return (
    <div className={['prose', className].filter(Boolean).join(' ')}>
      {blocks.map((block, idx) => {
        if (block.type === 'math') return <MathTex key={idx} tex={block.tex} display />
        if (block.type === 'h') return <h4 key={idx}>{renderInline(block.text, opts, `h${idx}`)}</h4>
        if (block.type === 'ul')
          return (
            <ul key={idx}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, opts, `u${idx}-${j}`)}</li>
              ))}
            </ul>
          )
        if (block.type === 'ol')
          return (
            <ol key={idx}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item, opts, `o${idx}-${j}`)}</li>
              ))}
            </ol>
          )
        return (
          <p key={idx} style={{ whiteSpace: 'pre-line' }}>
            {renderInline(block.text, opts, `p${idx}`)}
          </p>
        )
      })}
    </div>
  )
}
