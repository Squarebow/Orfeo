// Release step: copy the daily "ever ready" record from the stats branch into the app
// (src/i18n/translations.json). On any failure the old file stays and the exit code is 0.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const URL_ = 'https://raw.githubusercontent.com/Squarebow/Orfeo/stats/translations.json' // keep equal to EVER_READY_URL in electron/translations.ts
const OUT = fileURLToPath(new URL('../src/i18n/translations.json', import.meta.url))

try {
  const res = await fetch(URL_, { headers: { 'User-Agent': 'Orfeo' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a JSON object')
  for (const [code, v] of Object.entries(data)) {
    if (!v || typeof v.total !== 'number' || typeof v.translated !== 'number') throw new Error(`bad entry for ${code}`)
  }
  writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n')
  console.log(`i18n:ready - ${Object.keys(data).length} languages written to src/i18n/translations.json`)
} catch (e) {
  console.log(`i18n:ready - kept the old src/i18n/translations.json (${e.message})`)
}
