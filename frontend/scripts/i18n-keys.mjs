// List translation keys used in the code for given namespaces, with context, so dictionaries
// can be written quickly and completely.
//   node scripts/i18n-keys.mjs graph sim algorithm          → missing keys only (default)
//   node scripts/i18n-keys.mjs --all quiz                   → every key used
// Output per key: file:line, the code line, interpolation variables, plural use, and which
// languages already define it. Template-literal keys (t(`ns.${x}`)) are listed as DYNAMIC
// with their prefix — resolve them by reading the code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const all = args.includes('--all')
const namespaces = args.filter((a) => !a.startsWith('--'))
if (!namespaces.length) {
  console.error('usage: node scripts/i18n-keys.mjs [--all] <namespace> [...]')
  process.exit(2)
}

async function load(lang) {
  return (await import(pathToFileURL(join(root, `src/i18n/locales/${lang}/index.js`)).href + `?t=${Date.now()}`)).default
}
const dicts = { vi: await load('vi'), en: await load('en') }
const has = (lang, key) => {
  const v = key.split('.').reduce((n, p) => (n && typeof n === 'object' ? n[p] : undefined), dicts[lang])
  return typeof v === 'string'
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name !== 'locales') walk(full, files)
    } else if (/\.(jsx?|mjs)$/.test(name) && !name.endsWith('.test.js') && !name.endsWith('.test.jsx')) files.push(full)
  }
  return files
}

const literal = /\bt\(\s*(['"])([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)\1\s*(?:,\s*\{([^)]*)\})?/g
const dynamic = /\bt\(\s*`([a-zA-Z0-9_.]*)\$\{/g
const found = new Map()
const dyn = []
for (const file of walk(join(root, 'src'))) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const m of line.matchAll(literal)) {
      const key = m[2]
      if (!namespaces.includes(key.split('.')[0])) continue
      const vars = m[3] ? [...m[3].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::|,|$)/g)].map((v) => v[1]) : []
      const entry = found.get(key) || { key, uses: [], vars: new Set(), plural: false }
      vars.forEach((v) => entry.vars.add(v))
      if (vars.includes('count')) entry.plural = true
      entry.uses.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 160)}`)
      found.set(key, entry)
    }
    for (const m of line.matchAll(dynamic)) {
      if (namespaces.includes(m[1].split('.')[0])) dyn.push(`${relative(root, file)}:${i + 1}: ${line.trim().slice(0, 180)}`)
    }
  })
}

let missing = 0
for (const ns of namespaces) {
  const entries = [...found.values()].filter((e) => e.key.startsWith(`${ns}.`)).sort((a, b) => a.key.localeCompare(b.key))
  console.log(`\n### namespace ${ns}: ${entries.length} literal keys`)
  for (const e of entries) {
    const forms = e.plural ? [`${e.key}_one`, `${e.key}_other`] : [e.key]
    const vi = e.plural ? forms.some((k) => has('vi', k)) || has('vi', e.key) : has('vi', e.key)
    const en = e.plural ? forms.some((k) => has('en', k)) || has('en', e.key) : has('en', e.key)
    if (!all && vi && en) continue
    missing += 1
    const vars = [...e.vars].length ? ` vars={${[...e.vars].join(', ')}}` : ''
    console.log(`- ${e.key}${e.plural ? ' [plural: write _one/_other in en, _other in vi]' : ''}${vars}  vi:${vi ? 'ok' : 'MISSING'} en:${en ? 'ok' : 'MISSING'}`)
    e.uses.slice(0, 2).forEach((u) => console.log(`    ${u}`))
  }
}
const dynMine = dyn.filter(Boolean)
if (dynMine.length) {
  console.log(`\n### DYNAMIC keys (resolve by reading the code; write every possible value):`)
  dynMine.forEach((d) => console.log(`  ${d}`))
}
console.log(`\n${missing} key(s) listed`)
