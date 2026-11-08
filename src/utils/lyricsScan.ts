import { LYRICS_VERSION } from './lyricsCheck'

// ── Library background check for the lyrics mark. A handful of songs at a time,
// never while a song is playing, skipping songs already checked by the current
// rule (same size and modified time). The reading itself happens in the main
// program (lyrics:check), so no file travels to the page. Dependencies are
// injected so the queue logic is testable without Electron. ────────────────
export interface LyricsEntry { size: number; mtime: number; lyrics: boolean; v: number }

export interface LyricsScanDeps {
  stat: (paths: string[]) => Promise<{ path: string; size: number; mtime: number }[]>
  check: (paths: string[]) => Promise<{ path: string; size: number; mtime: number; lyrics: boolean }[]>
  getIndex: () => Record<string, LyricsEntry>
  save: (entries: ({ path: string } & LyricsEntry)[]) => void
  isActive: () => boolean     // switch still on, a newer run hasn't replaced this one
  isBusy: () => boolean       // a song is playing: don't compete with the audio
  pause: (ms: number) => Promise<void>
}

export const LYRICS_BATCH = 20
const SLICE_MS = 40
const BUSY_WAIT_MS = 1000

export const isMidiFamily = (path: string) => /\.(mid|midi|kar)$/i.test(path)

export function needsLyricsCheck(entry: LyricsEntry | undefined, st: { size: number; mtime: number }): boolean {
  return !entry || entry.v !== LYRICS_VERSION || entry.size !== st.size || entry.mtime !== st.mtime
}

export async function runLyricsScan(paths: string[], d: LyricsScanDeps): Promise<void> {
  const songs = paths.filter(isMidiFamily)
  if (!d.isActive() || songs.length === 0) return
  const stats = await d.stat(songs)
  const index = d.getIndex()
  const todo = stats.filter(st => needsLyricsCheck(index[st.path], st)).map(st => st.path)
  for (let i = 0; i < todo.length; i += LYRICS_BATCH) {
    while (d.isBusy()) { await d.pause(BUSY_WAIT_MS); if (!d.isActive()) return }
    if (!d.isActive()) return
    const batch = todo.slice(i, i + LYRICS_BATCH)
    let results: Awaited<ReturnType<LyricsScanDeps['check']>> = []
    try { results = await d.check(batch) } catch { /* left for the next run */ }
    if (!d.isActive()) return
    d.save(results.map(r => ({ path: r.path, size: r.size, mtime: r.mtime, lyrics: r.lyrics, v: LYRICS_VERSION })))
    await d.pause(SLICE_MS)
  }
}
