/**
 * Find each cited quote in the typeset page and measure its box.
 *
 * Text quotes are searched verbatim in the page's text (whitespace collapsed, nothing else
 * changed) and measured with a DOM Range, so a quote that is not on the page is reported
 * missing instead of guessed. A figure panel or a display formula is an element marked
 * `data-quote-key`: its box is the element's box, and its text must still contain the quote
 * when the quote is plain text (a formula's linear form is checked by the caller).
 */
function textIndex(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('[data-quote-skip]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  })
  let text = ''
  const map = [] // map[i] = [node, offset] for every char of `text`
  let lastSpace = true
  let lastBlock = null
  const blockOf = (node) => {
    let el = node.parentElement
    while (el && el !== root && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement
    return el
  }
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const s = node.nodeValue
    // a new block (heading, paragraph, caption) never glues onto the previous one
    const block = blockOf(node)
    if (lastBlock && block !== lastBlock && !lastSpace && map.length) {
      text += ' '
      map.push(map[map.length - 1])
      lastSpace = true
    }
    lastBlock = block
    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i]
      const space = /\s/.test(ch)
      if (space) {
        if (lastSpace) continue
        text += ' '
        map.push([node, i])
        lastSpace = true
      } else {
        text += ch
        map.push([node, i])
        lastSpace = false
      }
    }
  }
  return { text, map }
}

function union(rects) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    if (!r.width || !r.height) continue
    x0 = Math.min(x0, r.left)
    y0 = Math.min(y0, r.top)
    x1 = Math.max(x1, r.right)
    y1 = Math.max(y1, r.bottom)
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1]
}

export function measureQuotes(root, quotes, { width, height, padX = 7, padY = 5 } = {}) {
  const { text, map } = textIndex(root)
  const page = root.getBoundingClientRect()
  const out = {}
  const lines = {}
  const missing = []
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  for (const [key, quote] of Object.entries(quotes)) {
    const el = root.querySelector(`[data-quote-key="${key}"]`)
    let box = null
    if (el) {
      if (!el.dataset.quoteFormula && !norm(el.textContent).includes(norm(quote))) {
        missing.push(key)
        continue
      }
      box = union([el.getBoundingClientRect()])
    } else {
      const at = text.indexOf(norm(quote))
      if (at < 0) {
        missing.push(key)
        continue
      }
      const [n0, o0] = map[at]
      const [n1, o1] = map[at + norm(quote).length - 1]
      const range = document.createRange()
      range.setStart(n0, o0)
      range.setEnd(n1, o1 + 1)
      const rects = [...range.getClientRects()]
      box = union(rects)
      lines[key] = new Set(rects.filter((r) => r.width > 1).map((r) => Math.round(r.top))).size
    }
    const [x0, y0, x1, y1] = box
    const r4 = (v) => Math.round(v * 10000) / 10000
    out[key] = [
      r4(Math.max(0, x0 - page.left - padX) / width),
      r4(Math.max(0, y0 - page.top - padY) / height),
      r4(Math.min(width, x1 - page.left + padX) / width),
      r4(Math.min(height, y1 - page.top + padY) / height),
    ]
  }
  return { quotes: out, lines, missing }
}
