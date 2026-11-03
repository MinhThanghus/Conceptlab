/**
 * circulatory_diagram.png: a schematic of the double circulation, drawn as an SVG diagram of the
 * real system (no printed words; the lab names the parts and runs the self-test).
 *
 * Anatomical convention: the person faces the reader, so the right heart (right atrium, right
 * ventricle) is on the left of the picture. Pulmonary circuit: right ventricle → pulmonary trunk
 * (passing in front of the atria) → both lungs → pulmonary veins → left atrium. Systemic circuit:
 * left ventricle (thickest wall) → aorta → the capillary bed of the body's organs → vena cava →
 * right atrium. Blue = blood poor in oxygen, red = blood rich in oxygen, purple = capillaries
 * where it changes. Every part carries data-part so it can be rendered alone as a mask.
 */
import { job } from './lib.js'

const W = 1200
const H = 1000
const RED = '#d8343f'
const RED_DARK = '#a01f2b'
const RED_LIGHT = '#f2848a'
const BLUE = '#3a68c9'
const BLUE_DARK = '#22468f'
const BLUE_LIGHT = '#86a6ee'

const VESSELS = {
  // pulmonary trunk: from the top of the right ventricle, up in front of the atria, then a branch to each lung
  pa: { color: 'blue', width: 30, d: 'M 598 512 C 600 480, 600 450, 600 420 L 600 336' },
  paL: { color: 'blue', width: 22, d: 'M 600 344 C 598 300, 572 272, 562 244 C 557 230, 556 216, 556 205' },
  paR: { color: 'blue', width: 22, d: 'M 600 344 C 602 300, 628 272, 638 244 C 643 230, 644 216, 644 205' },
  // pulmonary veins: back from each lung to the left atrium (the left lung's vein passes behind the trunk)
  pvL: { color: 'red', width: 20, d: 'M 522 254 C 516 300, 534 350, 580 360 C 615 365, 640 372, 652 398' },
  pvR: { color: 'red', width: 20, d: 'M 680 254 C 690 300, 712 340, 708 398' },
  // aorta: from the left ventricle out to the body's organs
  ao: { color: 'red', width: 30, d: 'M 742 612 C 800 612, 880 612, 922 640 C 958 664, 962 712, 962 760 L 962 820 C 962 862, 935 880, 896 880 L 846 880' },
  // vena cava: from the organs back up to the right atrium
  vc: { color: 'blue', width: 30, d: 'M 354 880 L 300 880 C 262 880, 238 860, 238 820 L 238 520 C 238 478, 262 458, 302 458 L 452 458' },
}

function vessel(key, { part }) {
  const v = VESSELS[key]
  const c = v.color === 'red' ? [RED_DARK, RED, RED_LIGHT] : [BLUE_DARK, BLUE, BLUE_LIGHT]
  return `<g data-part="${part}" class="vessel" data-flow="${key}">
    <path d="${v.d}" fill="none" stroke="${c[0]}" stroke-width="${v.width + 5}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${v.d}" fill="none" stroke="${c[1]}" stroke-width="${v.width}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${v.d}" fill="none" stroke="${c[2]}" stroke-width="${Math.max(3, v.width * 0.22)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.75" transform="translate(-${v.width * 0.18} -${v.width * 0.18})"/>
  </g>`
}

/** A lung: outer convex side, the hilum on the side facing the heart, fissures between lobes. mirror = -1 for the left of the picture. */
function lung(cx, mirror, { notch }) {
  const s = (x) => cx + mirror * x
  const outline = `M ${s(-28)} 70 C ${s(30)} 48, ${s(118)} 92, ${s(150)} 168 C ${s(172)} 222, ${s(170)} 258, ${s(150)} 268
    C ${s(110)} 282, ${s(60)} 272, ${s(18)} 262 C ${s(notch ? 2 : -8)} 238, ${s(notch ? -18 : -24)} 216, ${s(-30)} 190
    C ${s(-42)} 150, ${s(-46)} 96, ${s(-28)} 70 Z`
  const fissures = notch
    ? `<path d="M ${s(-22)} 130 C ${s(40)} 150, ${s(100)} 190, ${s(140)} 250" fill="none" stroke="#c98078" stroke-width="2.4" opacity="0.7"/>`
    : `<path d="M ${s(-26)} 118 C ${s(40)} 140, ${s(100)} 176, ${s(148)} 240" fill="none" stroke="#c98078" stroke-width="2.4" opacity="0.7"/>
       <path d="M ${s(46)} 154 C ${s(80)} 156, ${s(120)} 150, ${s(150)} 168" fill="none" stroke="#c98078" stroke-width="2.4" opacity="0.7"/>`
  return { outline, fissures }
}

/** Capillary tree inside a lung: blue twigs out from the hilum, red twigs back, a purple mesh where they meet. */
function lungVessels(art, vein, mirror, seed) {
  let a = seed
  const r = () => {
    a = (a * 9301 + 49297) % 233280
    return a / 233280
  }
  const twigs = []
  const branch = (x, y, ang, len, w, depth, color) => {
    const x2 = x + Math.cos(ang) * len
    const y2 = y + Math.sin(ang) * len
    twigs.push(`<path d="M ${x.toFixed(1)} ${y.toFixed(1)} Q ${((x + x2) / 2 + (r() - 0.5) * 10).toFixed(1)} ${((y + y2) / 2 + (r() - 0.5) * 10).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${color}" stroke-width="${w.toFixed(1)}" fill="none" stroke-linecap="round"/>`)
    if (depth > 0) {
      branch(x2, y2, ang - 0.42 - r() * 0.2, len * 0.72, w * 0.66, depth - 1, color)
      branch(x2, y2, ang + 0.38 + r() * 0.2, len * 0.7, w * 0.66, depth - 1, color)
    }
  }
  // arteries (blue) fan up and out from the upper hilum; veins (red) gather to the lower hilum
  const out = mirror < 0 ? Math.PI : 0
  for (const [ang, len] of [[-1.15, 44], [-0.55, 50], [0.05, 46]]) branch(art[0], art[1], out + mirror * ang, len, 6, 3, BLUE)
  for (const [ang, len] of [[-0.95, 46], [-0.35, 50], [0.2, 40]]) branch(vein[0], vein[1], out + mirror * ang, len, 5, 3, RED)
  return twigs.join('\n')
}

function bodyBed() {
  // the organs' capillary bed: tissue cells, arterioles from the aorta (right), venules to the vena cava (left)
  let a = 7
  const r = () => {
    a = (a * 9301 + 49297) % 233280
    return a / 233280
  }
  const cells = []
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      const x = 398 + col * 42 + (row % 2) * 21 + (r() - 0.5) * 8
      const y = 816 + row * 36 + (r() - 0.5) * 6
      if (x > 822) continue
      cells.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(15 + r() * 4).toFixed(1)}" ry="${(12 + r() * 3).toFixed(1)}" fill="#f3d9bf" stroke="#e2bd98" stroke-width="1.6"/>`)
    }
  }
  const channels = []
  const rows = [826, 852, 878, 904, 930]
  rows.forEach((y, i) => {
    const amp = 7 + (i % 2) * 4
    let d = `M 846 ${880 + (y - 880) * 0.35}`
    d += ` C 800 ${y - amp}, 760 ${y + amp}, 712 ${y}`
    d += ` S 620 ${y - amp}, 590 ${y}`
    d += ` S 500 ${y + amp}, 450 ${y}`
    d += ` S 380 ${880 + (y - 880) * 0.35}, 354 ${880 + (y - 880) * 0.35}`
    channels.push(`<path d="${d}" fill="none" stroke="url(#bed-grad)" stroke-width="${i === 2 ? 7 : 5}" stroke-linecap="round"/>`)
  })
  // cross links: the finest capillaries
  for (let k = 0; k < 22; k += 1) {
    const x = 400 + r() * 420
    const i = Math.floor(r() * (rows.length - 1))
    channels.push(`<path d="M ${x.toFixed(1)} ${rows[i]} q ${((r() - 0.5) * 16).toFixed(1)} 13 ${((r() - 0.5) * 10).toFixed(1)} 26" fill="none" stroke="url(#bed-grad)" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>`)
  }
  return `<g data-part="organs systemic">
    <rect x="354" y="796" width="492" height="160" rx="44" fill="url(#tissue)" stroke="#d9ae86" stroke-width="2.5"/>
    <g clip-path="url(#bed-clip)">${cells.join('')}${channels.join('')}</g>
  </g>`
}

function svgMarkup() {
  const L = lung(600 - 64, -1, { notch: false })
  const R = lung(600 + 64, 1, { notch: true })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="lung-grad" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#fbe1dc"/><stop offset="0.7" stop-color="#f3c3bb"/><stop offset="1" stop-color="#e7a59c"/></radialGradient>
    <radialGradient id="muscle" cx="0.42" cy="0.32" r="0.8"><stop offset="0" stop-color="#ee9f95"/><stop offset="0.6" stop-color="#d86f66"/><stop offset="1" stop-color="#b9504a"/></radialGradient>
    <radialGradient id="cav-blue" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#6f93e0"/><stop offset="1" stop-color="#2f58ad"/></radialGradient>
    <radialGradient id="cav-red" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="#ec6a72"/><stop offset="1" stop-color="#b42633"/></radialGradient>
    <linearGradient id="tissue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbeedf"/><stop offset="1" stop-color="#f4dfc7"/></linearGradient>
    <linearGradient id="bed-grad" gradientUnits="userSpaceOnUse" x1="846" y1="0" x2="354" y2="0"><stop offset="0" stop-color="${RED}"/><stop offset="0.5" stop-color="#8b4aa6"/><stop offset="1" stop-color="${BLUE}"/></linearGradient>
    <clipPath id="bed-clip"><rect x="356" y="798" width="488" height="156" rx="42"/></clipPath>
    <clipPath id="lungs-clip"><path d="${L.outline}"/><path d="${R.outline}"/></clipPath>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="3" dy="6" stdDeviation="7" flood-color="#5a2a24" flood-opacity="0.18"/></filter>
    <filter id="soft-sm" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#2a2430" flood-opacity="0.2"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="#fdfcf9"/>

  <!-- airway: trachea and bronchi (not part of the circulation, shown so the lungs read as lungs) -->
  <g data-part="lungs-airway" opacity="0.95">
    <path d="M 600 18 L 600 100 M 600 100 C 590 118, 566 132, 548 150 M 600 100 C 610 118, 634 132, 652 150" fill="none" stroke="#e8dccb" stroke-width="22" stroke-linecap="round"/>
    <path d="M 600 18 L 600 100 M 600 100 C 590 118, 566 132, 548 150 M 600 100 C 610 118, 634 132, 652 150" fill="none" stroke="#f7efe4" stroke-width="15" stroke-linecap="round"/>
    ${[30, 44, 58, 72, 86].map((y) => `<path d="M 592 ${y} L 608 ${y}" stroke="#ddcdb6" stroke-width="3" stroke-linecap="round"/>`).join('')}
  </g>

  <!-- lungs, each with its blue arteries, red veins and the capillaries between them -->
  <g data-part="lungs pulmonary" filter="url(#soft)">
    <path d="${L.outline}" fill="url(#lung-grad)" stroke="#d1877e" stroke-width="2.5"/>
    <path d="${R.outline}" fill="url(#lung-grad)" stroke="#d1877e" stroke-width="2.5"/>
  </g>
  <g data-part="lungs pulmonary">
    ${L.fissures}${R.fissures}
    <g opacity="0.9" clip-path="url(#lungs-clip)">${lungVessels([556, 205], [522, 254], -1, 11)}${lungVessels([644, 205], [680, 254], 1, 23)}</g>
  </g>

  <!-- the pulmonary vein from the left of the picture passes behind the trunk -->
  ${vessel('pvL', { part: 'pv pulmonary' })}
  ${vessel('pvR', { part: 'pv pulmonary' })}

  <!-- heart: muscle, then the four chambers -->
  <g filter="url(#soft)">
    <path data-part="heart-wall" d="M 470 404 C 452 372, 500 352, 548 366 C 572 372, 590 376, 602 380 C 616 370, 650 352, 696 360 C 752 370, 774 420, 768 480
      C 764 560, 742 640, 694 700 C 668 732, 640 752, 618 752 C 590 750, 560 724, 528 688 C 486 640, 452 584, 446 520 C 442 470, 452 432, 470 404 Z"
      fill="url(#muscle)" stroke="#9f3c37" stroke-width="3"/>
  </g>
  <path data-part="ra systemic" d="M 470 420 C 466 394, 500 384, 536 390 C 568 395, 584 414, 584 444 C 584 476, 566 492, 530 494 C 494 496, 470 478, 466 452 C 465 440, 466 430, 470 420 Z" fill="url(#cav-blue)" stroke="#1f3f84" stroke-width="2.5"/>
  <path data-part="la pulmonary" d="M 620 410 C 626 388, 656 380, 690 386 C 722 392, 742 412, 742 440 C 742 470, 720 488, 686 490 C 650 492, 622 474, 618 446 C 617 432, 617 420, 620 410 Z" fill="url(#cav-red)" stroke="#7d1722" stroke-width="2.5"/>
  <path data-part="rv pulmonary" d="M 480 524 C 500 512, 540 508, 566 512 C 578 506, 584 496, 596 496 C 606 498, 608 512, 604 530 C 596 560, 592 610, 584 650 C 580 668, 578 680, 576 690 C 562 680, 530 650, 506 612 C 488 584, 474 552, 480 524 Z" fill="url(#cav-blue)" stroke="#1f3f84" stroke-width="2.5"/>
  <path data-part="lv systemic" d="M 632 526 C 652 512, 690 512, 706 532 C 722 552, 718 600, 702 640 C 688 676, 662 706, 636 716 C 628 690, 624 650, 624 610 C 624 574, 622 544, 632 526 Z" fill="url(#cav-red)" stroke="#7d1722" stroke-width="2.5"/>
  <!-- the openings between atria and ventricles, with the tricuspid and mitral leaflets; semilunar valves at the outflows -->
  <path d="M 506 488 L 552 488 L 556 520 L 502 520 Z" fill="url(#cav-blue)"/>
  <path d="M 648 484 L 696 484 L 700 520 L 644 520 Z" fill="url(#cav-red)"/>
  <g fill="#ffffff" stroke="#c7ccd4" stroke-width="1.2" opacity="0.95">
    <path d="M 503 494 C 510 506, 518 514, 523 522 C 520 510, 516 500, 512 492 Z"/><path d="M 555 494 C 548 506, 540 514, 535 522 C 538 510, 542 500, 546 492 Z"/>
    <path d="M 645 490 C 652 502, 660 512, 665 520 C 662 508, 658 498, 654 488 Z"/><path d="M 699 490 C 692 502, 684 512, 679 520 C 682 508, 686 498, 690 488 Z"/>
  </g>
  <g fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    <path d="M 529 476 L 529 540 M 521 531 L 529 541 L 537 531"/>
    <path d="M 672 472 L 672 540 M 664 531 L 672 541 L 680 531"/>
  </g>
  <g fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" opacity="0.95">
    <path d="M 586 520 Q 592 512 598 520 Q 604 512 610 520"/>
    <path d="M 734 598 Q 742 604 734 610 Q 742 616 734 622"/>
  </g>

  ${vessel('ao', { part: 'ao systemic' })}
  ${vessel('vc', { part: 'vc systemic' })}
  <!-- the trunk is drawn last: in front of the atria and of the vein that passes behind it -->
  <g filter="url(#soft-sm)">${vessel('pa', { part: 'pa pulmonary' })}${vessel('paL', { part: 'pa pulmonary' })}${vessel('paR', { part: 'pa pulmonary' })}</g>

  ${bodyBed()}
  <g id="chevrons" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"></g>
  <g id="flow-arrows" fill="#ffffff" stroke="none" opacity="0.9"></g>
</svg>`
}

/** White chevrons along each vessel, pointing the way the blood flows. */
function addChevrons(svg) {
  const g = svg.querySelector('#chevrons')
  for (const holder of svg.querySelectorAll('[data-flow]')) {
    const path = holder.querySelector('path:nth-child(2)')
    const key = holder.dataset.flow
    const len = path.getTotalLength()
    const step = key.startsWith('pa') && key !== 'pa' ? 34 : 58
    const parts = holder.dataset.part
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.setAttribute('data-part', parts)
    group.setAttribute('class', 'chev')
    for (let t = step * 0.7; t < len - step * 0.4; t += step) {
      const p = path.getPointAtLength(t)
      const q = path.getPointAtLength(Math.min(len, t + 2))
      const ang = Math.atan2(q.y - p.y, q.x - p.x)
      const s = VESSELS[key].width * 0.26
      const pts = [
        [-s * 0.6, -s],
        [s * 0.6, 0],
        [-s * 0.6, s],
      ].map(([x, y]) => [p.x + x * Math.cos(ang) - y * Math.sin(ang), p.y + x * Math.sin(ang) + y * Math.cos(ang)])
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      c.setAttribute('d', `M ${pts.map((v) => v.map((n) => n.toFixed(1)).join(' ')).join(' L ')}`)
      group.append(c)
    }
    g.append(group)
  }
}

function rasterize(svgText, scale) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = W * scale
      canvas.height = H * scale
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText)
  })
}

/** One part alone: its elements white, everything else black (stroke and fill), no filters. */
function maskMarkup(svg, part) {
  const clone = svg.cloneNode(true)
  clone.querySelectorAll('[filter]').forEach((n) => n.removeAttribute('filter'))
  clone.querySelector('rect').setAttribute('fill', '#000')
  const mine = new Set()
  clone.querySelectorAll('[data-part]').forEach((n) => {
    if (n.dataset.part.split(' ').includes(part)) n.querySelectorAll('*').forEach((c) => mine.add(c)), mine.add(n)
  })
  clone.querySelectorAll('path, rect, ellipse, circle').forEach((n, i) => {
    if (i === 0 && n.tagName === 'rect') return
    const own = mine.has(n)
    if (n.getAttribute('fill') && n.getAttribute('fill') !== 'none') n.setAttribute('fill', own ? '#fff' : '#000')
    if (n.getAttribute('stroke')) n.setAttribute('stroke', own ? '#fff' : '#000')
    n.removeAttribute('opacity')
    if (!own && !n.getAttribute('fill') && !n.getAttribute('stroke')) n.setAttribute('fill', '#000')
  })
  clone.querySelectorAll('g').forEach((n) => {
    n.removeAttribute('opacity')
    const own = mine.has(n)
    if (n.getAttribute('fill') && n.getAttribute('fill') !== 'none') n.setAttribute('fill', own ? '#fff' : '#000')
    if (n.getAttribute('stroke')) n.setAttribute('stroke', own ? '#fff' : '#000')
  })
  return new XMLSerializer().serializeToString(clone)
}

job(async () => {
  document.body.innerHTML = svgMarkup()
  const svg = document.querySelector('svg')
  addChevrons(svg)
  return async ({ scale = 2 }) => {
    const markup = new XMLSerializer().serializeToString(svg)
    const image = await rasterize(markup, scale)
    const masks = {}
    for (const part of ['lungs', 'organs', 'ra', 'la', 'rv', 'lv', 'pa', 'pv', 'ao', 'vc', 'pulmonary', 'systemic']) {
      masks[part] = await rasterize(maskMarkup(svg, part), 1)
    }
    return { image, masks, method: 'SVG schematic; each part rendered alone (white on black) and traced; scripts/render/heart.js' }
  }
})
