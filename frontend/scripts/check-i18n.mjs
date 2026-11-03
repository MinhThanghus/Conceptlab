// Verifies that every translation key exists in both Vietnamese and English and that
// every t('ns.key') literal used in src/ exists. Run: npm run check:i18n
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vi = (await import(pathToFileURL(join(root, 'src/i18n/locales/vi/index.js')).href)).default
const en = (await import(pathToFileURL(join(root, 'src/i18n/locales/en/index.js')).href)).default

function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') flatten(value, path, out)
    else out.set(path, value)
  }
  return out
}

const fv = flatten(vi)
const fe = flatten(en)
const problems = []
for (const key of fv.keys()) if (!fe.has(key)) problems.push(`missing in en: ${key}`)
for (const key of fe.keys()) if (!fv.has(key)) problems.push(`missing in vi: ${key}`)
for (const [key, value] of fv) if (typeof value === 'string' && !value.trim()) problems.push(`empty vi: ${key}`)
for (const [key, value] of fe) if (typeof value === 'string' && !value.trim()) problems.push(`empty en: ${key}`)

// static usage scan: t('a.b.c') / t("a.b.c") with literal keys
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(jsx?|mjs)$/.test(name) && !full.includes(`${join('i18n', 'locales')}`)) files.push(full)
  }
  return files
}
const keyRe = /\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g
const pluralForms = (key) => [key, `${key}_one`, `${key}_other`]
for (const file of walk(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(keyRe)) {
    const key = match[1]
    if (!pluralForms(key).some((k) => fv.has(k))) problems.push(`unknown key ${key} in ${file.replace(root, '')}`)
  }
}

if (problems.length) {
  console.error(`i18n check failed (${problems.length}):\n` + problems.map((p) => `  - ${p}`).join('\n'))
  process.exit(1)
}
console.log(`i18n OK: ${fv.size} keys in vi and en`)
