import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { Plot } from './Plot.jsx'

const series = [{ id: 'T', label: 'Chu kỳ', points: Array.from({ length: 21 }, (_, i) => [i / 10, 2 * Math.PI * Math.sqrt(i / 10 / 9.81)]) }]

function draw(props = {}, data = series) {
  const { container } = render(<I18nProvider><Plot series={data} xLabel="L" xUnit="m" yLabel="T" yUnit="s" height={300} {...props} /></I18nProvider>)
  const axis = container.querySelector('.frame-line')
  const xFigures = [...container.querySelectorAll('text.tick[text-anchor="middle"]')]
  const yFigures = [...container.querySelectorAll('text.tick[text-anchor="end"]')]
  return {
    container,
    left: Number(axis.getAttribute('x1')),
    baseline: Number(axis.getAttribute('y1')),
    xFigureY: Number(xFigures[0].getAttribute('y')),
    xCount: xFigures.length,
    yCount: yFigures.length,
  }
}

beforeEach(() => { window.localStorage.setItem('cl.lang', 'en') })
afterEach(() => { cleanup(); window.localStorage.clear() })

describe('axis figures sized to their type', () => {
  it('keeps the 12px layout by default', () => {
    const plot = draw()
    // 12px figures hang 18px under the axis, the axis sits 26px above the foot
    expect(plot.xFigureY - plot.baseline).toBe(18)
    expect(300 - plot.baseline).toBe(26)
    expect(plot.container.querySelector('.cl-plot').getAttribute('style')).toBeNull()
    expect(plot.container.querySelector('.cl-plot-em')).not.toBeNull()
  })

  it('moves the figures and widens the margins for larger figures', () => {
    const base = draw()
    cleanup()
    const large = draw({ tickSize: 18 })
    expect(large.container.querySelector('.cl-plot').style.getPropertyValue('--cl-plot-tick')).toBe('18px')
    // one figure height plus the 4px marks and a gap: no collision with the lowest y figure
    expect(large.xFigureY - large.baseline).toBe(24)
    expect(300 - large.baseline).toBe(32)
    // the y figures keep their room: thousands need a wider margin at the larger size
    const thousands = [{ id: 'A', points: [[0, 0], [10, 1000]] }]
    cleanup()
    const wideBase = draw({}, thousands)
    cleanup()
    const wideLarge = draw({ tickSize: 18 }, thousands)
    expect(wideLarge.left).toBeGreaterThan(wideBase.left)
    // fewer, roomier ticks rather than crowded larger ones
    expect(large.xCount).toBeLessThanOrEqual(base.xCount)
    expect(large.yCount).toBeLessThanOrEqual(base.yCount)
  })

  it('keeps the 12px tick density and margins for smaller figures', () => {
    const base = draw()
    cleanup()
    const small = draw({ tickSize: 10 })
    expect(small.xFigureY - small.baseline).toBe(16)
    expect(small.left).toBe(base.left)
    expect(small.xCount).toBe(base.xCount)
    expect(small.yCount).toBe(base.yCount)
  })
})
