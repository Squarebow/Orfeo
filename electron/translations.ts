// Main-process side of Settings > Translations: Weblate's public numbers, the shared
// "ever ready" record, language files saved in the user data folder, and the
// synchronous start-up snapshot the page reads before it draws.
//
// Checked by hand 2026-11-13 (zh_Hans): Weblate's /file/ download includes the machine
// ("needs editing") wordings. The API said translated 51 + fuzzy 1367 = 1418; the file
// held 1436 keys, 1429 with a non-empty value. So the plain file is enough.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import english from '../src/i18n/locales/en.json'
import { validateCatalog } from '../src/i18n/validateCatalog'
import { isNewer, type LangStats, type Snapshot } from '../src/i18n/readiness'

export const WEBLATE_LIST = 'https://hosted.weblate.org/api/components/orfeo/app/translations/'
export const weblateFile = (code: string) => `https://hosted.weblate.org/api/translations/orfeo/app/${code}/file/`
export const EVER_READY_URL = 'https://raw.githubusercontent.com/Squarebow/Orfeo/stats/translations.json'
export const MIN_REFRESH_MS = 3_600_000
// A request that hangs gives up after this long, so the page never waits forever
export const REQUEST_TIMEOUT_MS = 15_000

export interface TranslationsDeps { fetch: typeof fetch; dir: string; now: () => number }
// Dev Tools > Translations: session-only pretend numbers, kept in the main process's memory
export interface DevOverrides { percents?: Record<string, number>; offline?: boolean; newer?: boolean; tempDir?: boolean }
export const hasDevOverrides = (o: DevOverrides | null | undefined): o is DevOverrides =>
  !!o && (!!o.offline || !!o.newer || !!o.tempDir || Object.keys(o.percents ?? {}).length > 0)

// The numbers with the pretend ones on top: a chosen percentage (nothing machine-drafted) and/or "changed just now"
export function applyDevOverrides(stats: LangStats[], o: DevOverrides | null | undefined, now: number): LangStats[] {
  if (!hasDevOverrides(o)) return stats
  const when = new Date(now).toISOString()
  return stats.map(s => {
    const p = o.percents?.[s.code]
    const next = { ...s }
    if (typeof p === 'number' && Number.isFinite(p)) {
      next.translated = Math.round(s.total * Math.min(100, Math.max(0, p)) / 100)
      next.fuzzy = 0
    }
    if (o.newer) next.lastChange = when
    return next
  })
}

// True while the numbers last handed out were pretend ones: they must never reach seen-ready.json,
// even if the pretend settings were cleared while that check was still on its way back
let lastRefreshPretend = false
export const mayRemember = (o: DevOverrides | null | undefined, lastPretend: boolean = lastRefreshPretend): boolean => !hasDevOverrides(o) && !lastPretend

// While any pretend setting is on, downloads never touch the real folder
export const devDownloadDeps = (deps: TranslationsDeps, o: DevOverrides | null | undefined): TranslationsDeps =>
  hasDevOverrides(o) ? { ...deps, dir: join(tmpdir(), 'orfeo-i18n-test') } : deps

export interface BootState {
  seenReady: string[]
  downloaded: Record<string, { catalog: Record<string, string>; lastChange: string | null }>
  stats: LangStats[] | null
  fetchedAt: number | null
  remote: Snapshot | null
}

// Language codes end up in a URL and a file name: only plain ones pass.
export const isLanguageCode = (code: string): boolean => typeof code === 'string' && /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{2,8})*$/.test(code)

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
    if (!isLanguageCode(code)) { delete record[code]; changed = true; continue }
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
  const res = await deps.fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
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
      if (code === 'en' || !isLanguageCode(code)) continue
      out.push({
        code, total: Number(r.total) || 0, translated: Number(r.translated) || 0, fuzzy: Number(r.fuzzy) || 0,
        lastChange: typeof r.last_change === 'string' ? r.last_change : null,
      })
    }
    url = body.next ?? null
  }
  // an answer with no languages is a failed read: the page would show none
  if (!out.length) throw new Error('no languages')
  return out
}

export async function refresh(deps: TranslationsDeps, force = false, dev?: DevOverrides | null):
  Promise<{ stats: LangStats[] | null; remote: Snapshot | null; fetchedAt: number | null; offline: boolean }> {
  lastRefreshPretend = hasDevOverrides(dev)
  if (hasDevOverrides(dev)) return refreshPretending(deps, dev)
  const { dir } = deps
  const cached = readStats(dir)
  const cachedRemote = readRemote(dir)
  if (!force && cached && deps.now() - cached.fetchedAt >= 0 && deps.now() - cached.fetchedAt < MIN_REFRESH_MS) {
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

// With Dev Tools overrides on: always ask (no hour limit), write no cache, then lay the pretend numbers on top
async function refreshPretending(deps: TranslationsDeps, dev: DevOverrides) {
  const cached = readStats(deps.dir)
  const cachedRemote = readRemote(deps.dir)
  const tweak = (l: LangStats[] | null) => (l ? applyDevOverrides(l, dev, deps.now()) : null)
  if (dev.offline) return { stats: tweak(cached?.stats ?? null), remote: cachedRemote, fetchedAt: cached?.fetchedAt ?? null, offline: true }
  const [s, r] = await Promise.allSettled([fetchStats(deps), getJson(deps, EVER_READY_URL)])
  const remote = r.status === 'fulfilled' && r.value && typeof r.value === 'object' && !Array.isArray(r.value) ? r.value as Snapshot : cachedRemote
  if (s.status === 'rejected') return { stats: tweak(cached?.stats ?? null), remote, fetchedAt: cached?.fetchedAt ?? null, offline: true }
  return { stats: tweak(s.value), remote, fetchedAt: deps.now(), offline: false }
}

export async function download(deps: TranslationsDeps, code: string): Promise<'saved' | 'invalid' | 'failed'> {
  if (!isLanguageCode(code)) return 'failed'
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
  for (const c of codes) if (isLanguageCode(c)) set.add(c)
  if (set.size === before && existsSync(join(deps.dir, 'seen-ready.json'))) return
  try { writeJson(deps.dir, 'seen-ready.json', [...set]) } catch { /* ignore */ }
}
