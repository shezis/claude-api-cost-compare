// Writes prices.json from the built-in table in hooks/prices.ts.
//   node scripts/build-prices.mjs          write it
//   node scripts/build-prices.mjs --check  exit 1 when it is out of date (CI)
// Needs Node 22.18+ (runs the .ts file with type stripping).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { BUILTIN, parseTable } from '../hooks/prices.ts'

const out = fileURLToPath(new URL('../prices.json', import.meta.url))
const text = `${JSON.stringify(BUILTIN, null, 2)}\n`

if (!parseTable(text)) {
  console.error('hooks/prices.ts does not produce a valid price table')
  process.exit(1)
}

if (process.argv.includes('--check')) {
  let current = ''
  try {
    current = readFileSync(out, 'utf8')
  } catch {}
  if (current !== text) {
    console.error('prices.json is out of date: run `node scripts/build-prices.mjs` and commit it')
    process.exit(1)
  }
  console.log('prices.json is up to date')
} else {
  writeFileSync(out, text)
  console.log(`wrote prices.json (${BUILTIN.providers.length} providers, as of ${BUILTIN.asOf})`)
}
