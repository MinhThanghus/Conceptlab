/** Static force decomposition, not a flight dynamics model. */
export function thrustComponents(force, tiltDegrees) {
  const radians = Number(tiltDegrees) * Math.PI / 180
  return { vertical: Number(force) * Math.cos(radians), horizontal: Number(force) * Math.sin(radians) }
}
