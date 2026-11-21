import type { TakeRecord } from './take'

// ── Practice history per song (practice stage 4) ────────────────────────────
// Every session's numbers, kept by the song's place in the Library (they
// follow renames and moves in Orfeo), in Orfeo's own data folder, never in
// the file. The notes you played are kept for the last few sessions only, for
// the review (stage 5); older sessions keep the numbers. Outside Electron
// (tests) it lives in memory.

export interface SessionRecord {
  id: number                 // when it started
  notes: number              // how many notes your part had then (to tell later if the song changed)
  takes: TakeRecord[]
}
export interface SongHistory { v: 1; sessions: SessionRecord[] }

/** How many recent sessions keep the notes you played (Q10, suggested 5) */
export const KEEP_PLAYED = 5

const empty = (): SongHistory => ({ v: 1, sessions: [] })

/** The history with `session` added or brought up to date; only the last
 *  KEEP_PLAYED sessions keep the notes you played */
export function withSession(h: SongHistory, session: SessionRecord, keepPlayed = KEEP_PLAYED): SongHistory {
  const sessions = h.sessions.filter(s => s.id !== session.id).concat(session).sort((a, b) => a.id - b.id)
  const cut = sessions.length - keepPlayed
  return {
    v: 1,
    sessions: sessions.map((s, i) => (i >= cut || !s.takes.some(k => k.played)
      ? s
      : { ...s, takes: s.takes.map(({ played: _p, ...k }) => k) })),
  }
}

export const allTakes = (h: SongHistory | null, except?: number): TakeRecord[] =>
  (h?.sessions ?? []).filter(s => s.id !== except).flatMap(s => s.takes)

// ── On disk, through the main process ───────────────────────────────────────
const api = () => (typeof window !== 'undefined' ? (window as any).electronAPI : undefined)
const memory = new Map<string, SongHistory>()
const key = (p: string) => p.replace(/\\/g, '/').toLowerCase()

export async function loadHistory(song: string): Promise<SongHistory> {
  const k = key(song)
  if (memory.has(k)) return memory.get(k)!
  let h: SongHistory = empty()
  try {
    const got = await api()?.practiceLoad?.(song)
    if (got && Array.isArray(got.sessions)) h = got as SongHistory
  } catch {}
  memory.set(k, h)
  return h
}

/** The history as last read or written (null until loaded) */
export const cachedHistory = (song: string): SongHistory | null => memory.get(key(song)) ?? null

let writing: Promise<unknown> = Promise.resolve()
export async function saveSession(song: string, session: SessionRecord): Promise<SongHistory> {
  const h = withSession(await loadHistory(song), session)
  memory.set(key(song), h)
  // one write at a time, in order
  writing = writing.then(() => api()?.practiceSave?.(song, h)).catch(() => {})
  await writing
  return h
}

export async function forgetHistory(song: string): Promise<void> {
  memory.set(key(song), empty())
  try { await api()?.practiceForget?.(song) } catch {}
}
