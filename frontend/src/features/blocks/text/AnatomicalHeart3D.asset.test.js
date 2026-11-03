import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

it('bundles the attributed and checksum-verified BodyParts3D heart model', () => {
  const model = readFileSync(resolve(process.cwd(), 'public/models/bodyparts3d/heart.glb'))
  expect(model.readUInt32LE(0)).toBe(0x46546c67) // GLB magic
  expect(model.byteLength).toBe(2524400)
  expect(createHash('sha256').update(model).digest('hex')).toBe('b80a727d022a4ab07ccfcf15caccc228eaccb6d69ec0e72923324946ac35a946')
  const jsonLength = model.readUInt32LE(12)
  const gltf = JSON.parse(model.subarray(20, 20 + jsonLength).toString('utf8'))
  expect(gltf.asset.copyright).toContain('BodyParts3D')
  expect(gltf.nodes.map((node) => node.name)).toContain('right-ventricle')
  expect(gltf.nodes.map((node) => node.name)).toContain('ascending-aorta')
})
