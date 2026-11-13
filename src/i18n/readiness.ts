// When a translation counts as ready, what status each language shows, and which to download.
// Pure rules, no UI text: the Settings page turns the statuses into words.

export const READY_SHARE = 0.8
// 1.8: machine drafts ("needs editing" on Weblate) count towards readiness and the
// percentages shown. Set to false to count only texts a person has checked.
export const COUNT_MACHINE_DRAFTS = true

export interface LangStats { code: string; total: number; translated: number; fuzzy: number; lastChange: string | null } // ISO time
export interface SnapshotEntry { percent: number; total: number; translated: number; fuzzy?: number; readySince: string | null; lastChange: string | null }
export type Snapshot = Record<string, SnapshotEntry>
export interface ReadySources { live: LangStats[] | null; bundled: Snapshot; remote: Snapshot | null; seenReady: string[] }

type Counts = { total: number; translated: number; fuzzy?: number }
const drafts = (s: Counts): number => (COUNT_MACHINE_DRAFTS ? s.fuzzy ?? 0 : 0)

export function percentOf(s: Counts): number {
  return s.total > 0 ? Math.floor(((s.translated + drafts(s)) / s.total) * 100) : 0
}

export function isReadyNow(s: Counts): boolean {
  return s.total > 0 && (s.translated + drafts(s)) / s.total >= READY_SHARE
}

// Checked texts only, never drafts: this is what the lasting "was ready" record uses.
export function isCheckedReady(s: { total: number; translated: number }): boolean {
  return s.total > 0 && s.translated / s.total >= READY_SHARE
}

interface Chosen { total: number; translated: number; fuzzy?: number; lastChange: string | null }

// Live numbers win, then the remote snapshot, then the bundled one.
function chosen(code: string, src: ReadySources): Chosen | null {
  const l = src.live?.find(x => x.code === code)
  if (l) return l
  return src.remote?.[code] ?? src.bundled[code] ?? null
}

export function isReady(code: string, src: ReadySources): boolean {
  const c = chosen(code, src)
  if (c && isReadyNow(c)) return true
  if (src.bundled[code]?.readySince || src.remote?.[code]?.readySince) return true
  return src.seenReady.includes(code)
}

export function isNewer(a: string | null, b: string | null): boolean {
  if (a === null) return false
  if (b === null) return true
  return Date.parse(a) > Date.parse(b)
}

export type LangStatus =
  | { kind: 'upToDate' } | { kind: 'newTranslations' }
  | { kind: 'newWords'; count: number } | { kind: 'needs'; percent: number }
  | { kind: 'arriving'; when: 'nextStart' | 'nextVersion' }
export interface LangRow { code: string; percent: number; ready: boolean; tickable: boolean; status: LangStatus }

function codesOf(src: ReadySources): string[] {
  const keys = src.live ? src.live.map(l => l.code) : Object.keys(src.remote ?? src.bundled)
  return [...new Set(keys)].filter(c => c !== 'en')
}

export function buildRows(src: ReadySources, have: Record<string, string | null>, updates: 'download' | 'wait'): LangRow[] {
  const rows = codesOf(src).map((code): LangRow => {
    const c = chosen(code, src) ?? { total: 0, translated: 0, lastChange: null }
    const percent = percentOf(c)
    const ready = isReady(code, src)
    const has = code in have
    const tickable = ready && has
    let status: LangStatus
    if (!ready) status = { kind: 'needs', percent: Math.round(READY_SHARE * 100) - percent }
    else if (!has) status = { kind: 'arriving', when: updates === 'download' ? 'nextStart' : 'nextVersion' }
    else if (!isReadyNow(c)) status = { kind: 'newWords', count: c.total - c.translated - drafts(c) }
    else status = isNewer(c.lastChange, have[code]) ? { kind: 'newTranslations' } : { kind: 'upToDate' }
    return { code, percent, ready, tickable, status }
  })
  return rows.sort((a, b) => b.percent - a.percent || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

export function languagesToDownload(src: ReadySources, have: Record<string, string | null>, wanted: string[]): string[] {
  return codesOf(src).filter(code => {
    if (!isReady(code, src)) return false
    if (!(code in have)) return true
    return wanted.includes(code) && isNewer(chosen(code, src)?.lastChange ?? null, have[code])
  })
}
