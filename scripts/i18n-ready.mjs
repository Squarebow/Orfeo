// Release step: bring the bundled words (src/i18n/locales/<code>.json) and the bundled record
// (src/i18n/translations.json) up to the same moment on Weblate. The rules live in
// src/i18n/releaseWords.ts; this file reads the network and writes the files. English is never
// touched. On any failure the old files stay and the exit code is 0.
// Run with the TypeScript hooks: node --import ./scripts/ts-esbuild-hooks.mjs scripts/i18n-ready.mjs
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { releaseWords } from '../src/i18n/releaseWords.ts'
import { EVER_READY_URL, REQUEST_TIMEOUT_MS, WEBLATE_LIST, isLanguageCode, weblateFile } from '../electron/translations.ts'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const RECORD = here('../src/i18n/translations.json')
const LOCALES = here('../src/i18n/locales/')

const readJson = (path, fallback) => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return fallback } }
const keyCount = (path) => Object.keys(readJson(path, {}) ?? {}).length

// Same layout as the files already there: two-space indent, a newline at the end, and the
// file's own line endings (CRLF in a Windows checkout), so a diff shows only real changes
function writeLike(path, data) {
  const eol = existsSync(path) && readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n'
  const tmp = `${path}.tmp`
  writeFileSync(tmp, (JSON.stringify(data, null, 2) + '\n').replace(/\n/g, eol))
  renameSync(tmp, path)
}

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Orfeo' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

try {
  const previous = readJson(RECORD, {})
  const english = readJson(`${LOCALES}en.json`, null)
  if (!english) throw new Error('src/i18n/locales/en.json not readable')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Ljubljana', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const before = {}
  const { snapshot, written, notes } = await releaseWords({
    get, listUrl: WEBLATE_LIST, recordUrl: EVER_READY_URL, fileUrl: weblateFile, english, previous, today,
    isCode: (code) => code !== 'en' && isLanguageCode(code),
    write: (code, catalog) => {
      const path = `${LOCALES}${code}.json`
      before[code] = existsSync(path) ? keyCount(path) : null
      writeLike(path, catalog)
    },
  })
  for (const n of notes) console.log(`i18n:ready - ${n}`)
  if (!snapshot) {
    console.log('i18n:ready - kept the old src/i18n/translations.json and language files')
  } else {
    writeLike(RECORD, snapshot)
    for (const code of written) console.log(`i18n:ready - ${code}.json: ${before[code] ?? 'new'} -> ${keyCount(`${LOCALES}${code}.json`)} texts`)
    console.log(`i18n:ready - ${Object.keys(snapshot).length} languages in src/i18n/translations.json, ${written.length} language files refreshed`)
  }
} catch (e) {
  console.log(`i18n:ready - stopped, old files kept where not yet written (${e.message})`)
}
