import { useBlockEnv } from '../BlockEnv.jsx'
import { knownSize, mediaUrl } from '../steps/lessonKit.js'

/** Resolve a diagram ImageRef { source_id, page, asset_id } to { src, size, source, asset }. */
export function usePicture(image) {
  const env = useBlockEnv()
  const asset = image?.asset_id ? env.assetById(image.asset_id) : null
  const source = !asset && image?.source_id ? env.sourceById(image.source_id) : null
  const src = mediaUrl({ source, asset, page: image?.page })
  return { src, size: knownSize({ source, asset }), source, asset }
}

/** Display name of a hotspot ("Part 3" when it has no label). */
export function partName(h, index, t) {
  return h?.label?.trim() || t('diagram.view.partN', { n: index + 1 })
}
