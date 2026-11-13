// Main-process side of Settings > Translations: Weblate's public numbers, the shared
// "ever ready" record, language files saved in the user data folder, and the
// synchronous start-up snapshot the page reads before it draws.
//
// Checked by hand 2026-11-13 (zh_Hans): Weblate's /file/ download includes the machine
// ("needs editing") wordings. The API said translated 51 + fuzzy 1367 = 1418; the file
// held 1436 keys, 1429 with a non-empty value. So the plain file is enough.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import english from '../src/i18n/locales/en.json'
import { validateCatalog } from '../src/i18n/validateCatalog'
import { isNewer, type LangStats, type Snapshot } from '../src/i18n/readiness'

export const WEBLATE_LIST = 'https://hosted.weblate.org/api/components/orfeo/app/translations/'
export const weblateFile = (code: string) => `https://hosted.weblate.org/api/translations/orfeo/app/${code}/file/`
export const EVER_READY_URL = 'https://raw.githubusercontent.com/Squarebow/Orfeo/stats/translations.json'
export const MIN_REFRESH_MS = 3_600_000

export interface TranslationsDeps { fetch: typeof fetch; dir: string; now: () => number }
export interface BootState {
  seenReady: string[]
  downloaded: Record<string, { catalog: Record<string, string>; lastChange: string | null }>
  stats: LangStats[] | null
  fetchedAt: number | null
  remote: Snapshot | null
}

const ENGLISH = english as Record<string, string>
const HEADERS = { 'User-Agent': 'Orfeo' }

function readJson<T>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T } catch { return null }
}

// Temp name first, then rename, so a crash never leaves half a file behind.
function writeJson(dir: string, name: string, data: unknown): void {
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `${name}.tmp`)
  writeFileSync(tmp, JSON.stringify(data))
  renameSync(tmp, join(dir, name))
}

const readStats = (dir: string) => {
  const c = readJson<{ fetchedAt: number; stats: LangStats[] }>(join(dir, 'stats.json'))
  return c && Array.isArray(c.stats) && typeof c.fetchedAt === 'number' ? c : null
}
const readRemote = (dir: string): Snapshot | null => {
  const r = readJson<Snapshot>(join(dir, 'remote.json'))
  return r && typeof r === 'object' && !Array.isArray(r) ? r : null
}
const readDownloaded = (dir: string): Record<string, string | null> => {
  const d = readJson<Record<string, string | null>>(join(dir, 'downloaded.json'))
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {}
}

export function bootState(deps: TranslationsDeps, bundled: Snapshot): BootState {
  const { dir } = deps
  const seen = readJson<string[]>(join(dir, 'seen-ready.json'))
  const stats = readStats(dir)
  const record = readDownloaded(dir)
  const downloaded: BootState['downloaded'] = {}
  let changed = false
  for (const [code, lastChange] of Object.entries(record)) {
    // an Orfeo update that brought newer words makes the download obsolete
    const b = bundled[code]
    if (b && !isNewer(lastChange, b.lastChange)) {
      try { rmSync(join(dir, `${code}.json`), { force: true }) } catch { /* ignore */ }
      delete record[code]; changed = true
      continue
    }
    const v = validateCatalog(readJson<unknown>(join(dir, `${code}.json`)), ENGLISH)
    if (v) downloaded[code] = { catalog: v.catalog, lastChange }
  }
  if (changed) { try { writeJson(dir, 'downloaded.json', record) } catch { /* ignore */ } }
  return {
    seenReady: Array.isArray(seen) ? seen.filter(c => typeof c === 'string') : [],
    downloaded,
    stats: stats?.stats ?? null,
    fetchedAt: stats?.fetchedAt ?? null,
    remote: readRemote(dir),
  }
}

async function getJson(deps: TranslationsDeps, url: string): Promise<unknown> {
  const res = await deps.fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function fetchStats(deps: TranslationsDeps): Promise<LangStats[]> {
  const out: LangStats[] = []
  let url: string | null = WEBLATE_LIST
  for (let page = 0; url && page < 20; page++) {
    const body = await getJson(deps, url) as { next?: string | null; results?: Record<string, unknown>[] }
    for (const r of body.results ?? []) {
      const code = String(r.language_code)
      if (code === 'en') continue
      out.push({
        code, total: Number(r.total) || 0, translated: Number(r.translated) || 0, fuzzy: Number(r.fuzzy) || 0,
        lastChange: typeof r.last_change === 'string' ? r.last_change : null,
      })
    }
    url = body.next ?? null
  }
  return out
}

export async function refresh(deps: TranslationsDeps, force = false):
  Promise<{ stats: LangStats[] | null; remote: Snapshot | null; fetchedAt: number | null; offline: boolean }> {
  const { dir } = deps
  const cached = readStats(dir)
  const cachedRemote = readRemote(dir)
  if (!force && cached && deps.now() - cached.fetchedAt < MIN_REFRESH_MS) {
    return { stats: cached.stats, remote: cachedRemote, fetchedAt: cached.fetchedAt, offline: false }
  }
  const [s, r] = await Promise.allSettled([fetchStats(deps), getJson(deps, EVER_READY_URL)])
  let remote = cachedRemote
  if (r.status === 'fulfilled' && r.value && typeof r.value === 'object' && !Array.isArray(r.value)) {
    remote = r.value as Snapshot
    try { writeJson(dir, 'remote.json', remote) } catch { /* keep going */ }
  }
  // never an empty list on failure: the page would show no languages
  if (s.status === 'rejected') {
    return { stats: cached?.stats ?? null, remote, fetchedAt: cached?.fetchedAt ?? null, offline: true }
  }
  const fetchedAt = deps.now()
  try { writeJson(dir, 'stats.json', { fetchedAt, stats: s.value }) } catch { /* keep going */ }
  return { stats: s.value, remote, fetchedAt, offline: false }
}

export async function download(deps: TranslationsDeps, code: string): Promise<'saved' | 'invalid' | 'failed'> {
  let raw: unknown
  try { raw = await getJson(deps, weblateFile(code)) } catch { return 'failed' }
  if (!validateCatalog(raw, ENGLISH)) return 'invalid'
  const lastChange = readStats(deps.dir)?.stats.find(s => s.code === code)?.lastChange ?? null
  try {
    writeJson(deps.dir, `${code}.json`, raw)
    writeJson(deps.dir, 'downloaded.json', { ...readDownloaded(deps.dir), [code]: lastChange })
  } catch { return 'failed' }
  return 'saved'
}

export function rememberReady(deps: TranslationsDeps, codes: string[]): void {
  const have = readJson<string[]>(join(deps.dir, 'seen-ready.json'))
  const set = new Set(Array.isArray(have) ? have : [])
  const before = set.size
  for (const c of codes) set.add(c)
  if (set.size === before && existsSync(join(deps.dir, 'seen-ready.json'))) return
  try { writeJson(deps.dir, 'seen-ready.json', [...set]) } catch { /* ignore */ }
}
