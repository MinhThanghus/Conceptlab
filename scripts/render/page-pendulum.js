import katex from '/frontend/node_modules/katex/dist/katex.mjs'
import { fontsReady, job } from './lib.js'
import { measureQuotes } from './quotes.js'
import { renderPendulumFigure } from './figure-pendulum.js'

const SVG = 'http://www.w3.org/2000/svg'

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text) node.textContent = text
  return node
}

/** Letter the figure the way a textbook does: the vertical through O, the angle, L and m. */
function annotate(svg, pts) {
  const ink = '#1e2228'
  const accent = '#c8372d'
  const [px, py] = pts.pivot
  const [vx, vy] = pts.vertical
  svg.append(el('line', { x1: px, y1: py, x2: vx, y2: vy, stroke: ink, 'stroke-width': 1.6, 'stroke-dasharray': '7 6', opacity: 0.75 }))
  svg.append(el('path', { d: 'M' + pts.arc.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L'), fill: 'none', stroke: accent, 'stroke-width': 2.4 }))
  svg.append(el('circle', { cx: px, cy: py, r: 3.6, fill: ink }))
  svg.append(el('text', { x: px - 26, y: py - 14 }, 'O'))
  svg.append(el('text', { x: pts.alpha[0] - 7, y: pts.alpha[1] + 9, fill: accent, style: `fill:${accent}` }, 'α'))
  svg.append(el('text', { x: pts.stringMid[0] + 14, y: pts.stringMid[1] + 4 }, 'L'))
  const [bx, by] = pts.bob
  svg.append(el('text', { x: bx + pts.bobRadius + 10, y: by + 8 }, 'm'))
}

job(async () => {
  await fontsReady(['600 30px "Lexend Variable"', '400 25px "Be Vietnam Pro"', 'italic 400 25px "Be Vietnam Pro"', '600 25px "Be Vietnam Pro"'])
  katex.render(String.raw`T = 2\pi\sqrt{\dfrac{L}{g}}`, document.getElementById('formula'), { displayMode: false, throwOnError: true })

  const { url, pts } = await renderPendulumFigure({ width: 340, height: 560, ratio: 4 })
  const img = document.getElementById('fig-img')
  img.src = url
  await img.decode()
  annotate(document.getElementById('fig-svg'), pts)
  await document.fonts.ready

  return async ({ quotes }) => {
    const page = document.getElementById('page')
    const result = measureQuotes(page, quotes, { width: 1240, height: 1754 })
    return { ...result, figure: pts }
  }
})
