import { canRender3D } from '../../lib/three/capability.js'

let cached = null

/**
 * canRender3D(), asked once per page load: the check opens a WebGL context, so screens that
 * mount several labs (or re-mount one) reuse the first answer instead of opening more.
 */
export function can3D() {
  if (cached === null) cached = canRender3D()
  return cached
}
