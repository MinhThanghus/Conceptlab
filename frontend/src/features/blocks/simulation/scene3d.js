/**
 * What the 3D scenes draw, as a pure function of the sim clock and the scenario results (the
 * same contract as the SVG scenes in scenes.jsx): stepping, scrubbing, comparing and reduced
 * motion work the same in 2D and 3D. No Three.js here; SimLab3D applies the state.
 */
import { flightProgress, niceCeil, projectileLayout } from '../../../lib/three/simMath.js'

/** Models with a 3D scene, and which one. Compound interest stays a 2D chart. */
export const STAGE_3D = { pendulum: 'pendulum', projectile: 'projectile', spring_mass: 'spring' }

const DEG = Math.PI / 180

/**
 * Height of the pendulum stand in metres: the longest string the lesson's slider allows (so
 * dragging the slider never rebuilds the stand), rounded up to a half metre, 1 to 5 m.
 */
export function pendulumStandLength(sliderMax, items = []) {
  const longest = Math.max(Number(sliderMax) || 0, ...items.map((it) => Number(it.L) || 0))
  return Math.min(5, Math.max(1, Math.ceil(longest * 2 - 1e-9) / 2))
}

/** The largest starting displacement the spring track must show (the slider's maximum). */
export function springMaxAmp(sliderMax, items = []) {
  const widest = Math.max(Math.abs(Number(sliderMax) || 0), ...items.map((it) => Math.abs(Number(it.result?.values?.x0) || 0)))
  return niceCeil(Math.max(0.01, widest))
}

/**
 * The 3D state at time `time` for scenario items [{ result, L, stateAt }] (A first, then B).
 * `num(value, digits)` formats numbers in the lesson's locale.
 */
export function scene3dState(model, items, time, { num = (v) => String(v) } = {}) {
  if (model === 'pendulum') {
    return {
      items: items.map((it) => {
        const s = it.stateAt(time)
        return { length: it.L, theta: s.theta, amplitude: Math.abs(it.result.values.theta0) * DEG }
      }),
    }
  }
  if (model === 'projectile') {
    const layout = projectileLayout(items.map((it) => ({ range: it.result.outputs.range, maxHeight: it.result.outputs.max_height, h0: it.result.values.h0 })))
    return {
      layout,
      lanes: items.map((it, i) => {
        const res = it.result
        const tt = Math.min(time, res.duration)
        const s = res.stateAt(tt)
        const vx = res.values.v0 * Math.cos(res.values.angle * DEG)
        const last = i === items.length - 1
        return {
          path: res.plot.points,
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          progress: flightProgress(time, res.duration),
          landed: time >= res.duration - 1e-9,
          range: res.outputs.range,
          maxHeight: res.outputs.max_height,
          apexX: vx * res.outputs.time_to_apex,
          h0: res.values.h0,
          angle: res.values.angle,
          rangeText: `${num(res.outputs.range, 1)} m`,
          heightText: last ? `H = ${num(res.outputs.max_height, 2)} m` : '',
        }
      }),
    }
  }
  if (model === 'spring_mass') {
    return {
      lanes: items.map((it) => ({ x: it.result.stateAt(time).x, massText: `${num(it.result.values.m, 2)} kg` })),
    }
  }
  return null
}
