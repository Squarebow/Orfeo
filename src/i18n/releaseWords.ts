// Release step (npm run i18n:ready, scripts/i18n-ready.mjs): bring the bundled words and the
// bundled record (src/i18n/translations.json) up to the same moment on Weblate, so the age the
// record gives each language's words is the age of the words that ship.
//
// The record starts from the daily one on the stats branch; when that can't be read (before the
// Stats workflow has run from main), from Weblate's own list, with the same rule as
// tools/stats/translations.py merge(). A language whose file can't be read, checked or written
// keeps its old file and its old record entry.
import { validateCatalog } from './validateCatalog'
import { COUNT_MACHINE_DRAFTS, isCheckedReady, type Snapshot, type SnapshotEntry } from './readiness'

export interface WeblateRow { total: number; translated: number; fuzzy: number; lastChange: string | null }

export interface ReleaseWordsDeps {
  get: (url: string) => Promise<unknown>   // throws when the answer isn't a 200
  listUrl: string
  recordUrl: string
  fileUrl: (code: string) => string
  english: Record<string, string>
  previous: Snapshot                        // the bundled record as it is now
  today: string                             // Ljubljana date, YYYY-MM-DD
  isCode: (code: string) => boolean
  write: (code: string, catalog: Record<string, string>) => void   // throws on failure
}

export interface ReleaseWordsResult { snapshot: Snapshot | null; written: string[]; notes: string[] }

// Same as merge() in tools/stats/translations.py: drafts count in the percentage, readySince
// only for checked texts, never cleared; a language missing from the list keeps its entry.
export function mergeRecord(previous: Snapshot, stats: Record<string, WeblateRow>, today: string): Snapshot {
  const out: Snapshot = {}
  for (const [code, e] of Object.entries(previous)) out[code] = { ...e }
  for (const [code, s] of Object.entries(stats)) {
    const counted = s.translated + (COUNT_MACHINE_DRAFTS ? s.fuzzy : 0)
    const old = previous[code]?.readySince ?? null
    out[code] = {
      percent: s.total > 0 ? Math.floor((counted * 100) / s.total) : 0,
      total: s.total,
      translated: s.translated,
      fuzzy: s.fuzzy,
      readySince: old ?? (isCheckedReady(s) ? today : null),
      lastChange: s.lastChange,
    }
  }
  return Object.fromEntries(Object.keys(out).sort().map(c => [c, out[c]]))
}

// Weblate's list of languages, every page, English left out. No languages = a failed read.
async function readList(deps: ReleaseWordsDeps): Promise<Record<string, WeblateRow>> {
  const out: Record<string, WeblateRow> = {}
  let url: string | null = deps.listUrl
  for (let page = 0; url && page < 20; page++) {
    const body = await deps.get(url) as { next?: string | null; results?: Record<string, unknown>[] }
    for (const r of body?.results ?? []) {
      const code = String(r.language_code)
      if (code === 'en' || !deps.isCode(code)) continue
      out[code] = {
        total: Number(r.total) || 0, translated: Number(r.translated) || 0, fuzzy: Number(r.fuzzy) || 0,
        lastChange: typeof r.last_change === 'string' ? r.last_change : null,
      }
    }
    url = body?.next ?? null
  }
  if (!Object.keys(out).length) throw new Error('no languages')
  return out
}

// The stats branch record, or null when it isn't one
function asRecord(raw: unknown): Snapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  for (const v of Object.values(raw as Record<string, unknown>)) {
    const e = v as Partial<SnapshotEntry> | null
    if (!e || typeof e.total !== 'number' || typeof e.translated !== 'number') return null
  }
  return raw as Snapshot
}

export async function releaseWords(deps: ReleaseWordsDeps): Promise<ReleaseWordsResult> {
  const notes: string[] = []
  let live: Record<string, WeblateRow> | null = null
  try { live = await readList(deps) } catch (e) { notes.push(`Weblate list not read (${(e as Error).message})`) }
  let record: Snapshot | null = null
  try {
    record = asRecord(await deps.get(deps.recordUrl))
    if (!record) notes.push('stats branch record is not a record')
  } catch (e) { notes.push(`stats branch record not read (${(e as Error).message})`) }
  if (!live && !record) return { snapshot: null, written: [], notes }

  const { previous } = deps
  const fresh = live ? mergeRecord(record ?? previous, live, deps.today) : { ...record! }
  const keep = (code: string): SnapshotEntry => {
    const old = previous[code]
    if (!old) return { ...fresh[code], lastChange: null }   // no old entry: the age of the bundled words is unknown
    return { ...old, readySince: old.readySince ?? fresh[code].readySince ?? null }   // once ready, always ready
  }

  const written: string[] = []
  const snapshot: Snapshot = {}
  for (const code of Object.keys(fresh).sort()) {
    if (code === 'en' || !deps.isCode(code)) continue
    let ok = false
    if (live?.[code]) {
      try {
        const v = validateCatalog(await deps.get(deps.fileUrl(code)), deps.english)
        if (v) { deps.write(code, v.catalog); ok = true; written.push(code) }
        else notes.push(`${code}: file refused by the check, old file kept`)
      } catch (e) { notes.push(`${code}: ${(e as Error).message}, old file kept`) }
    }
    snapshot[code] = ok
      ? { ...fresh[code], readySince: fresh[code].readySince ?? previous[code]?.readySince ?? null }
      : keep(code)
  }
  return { snapshot, written, notes }
}
