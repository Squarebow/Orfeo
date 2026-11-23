// ── The background reader, on its own processor core ───────────────────────
// Reads one song at a time the way Orfeo reads a song it opens (the hands,
// the practice readiness, the lesson check), with the trained model switched
// on, and sends back every model reading it made (handReadCache.ts). The song
// itself is thrown away: only the readings matter. handPrescan.ts drives it.
// A 'share' job also sends back the song's hands as anonymous numbers
// (handShareRecord.ts, Share my hands for research: shareHands.ts).
import { installHandModel } from '../utils/handModelReader'
import { takeFreshReadings } from '../utils/handReadCache'
import { parseMidiBuffer } from '../utils/midiParser'
import { songPracticeState } from '../utils/practiceReadiness'
import { songCheckOf } from './songCheckOf'
import { sharedSong, type SharedSong } from './handShareRecord'

installHandModel(true)

export interface PrescanJob { id: number; bytes: ArrayBuffer; name: string; path: string; options: { rhMaxFingers: number; lhMaxFingers: number }; share?: boolean }
export interface PrescanReply { id: number; ok: boolean; readings: [string, string][]; shared?: SharedSong | null }

self.onmessage = (e: MessageEvent<PrescanJob>) => {
  const { id, bytes, name, path, options, share } = e.data
  let ok = true
  let shared: SharedSong | null = null
  try {
    const m: any = parseMidiBuffer(bytes, name, path, options)
    const pairs: [number, number][] = m._stavePairs ?? []
    if (share) shared = sharedSong(m, options)
    else {
      songPracticeState(m.tracks, { stavePairs: pairs, options })
      songCheckOf(m.tracks.map((t: any) => ({ index: t.index, name: t.name ?? '', group: t.group ?? '', isDrum: !!t.isDrum, notes: t.notes })), pairs, options)
    }
  } catch { ok = false }
  const reply: PrescanReply = { id, ok, readings: takeFreshReadings(), ...(share ? { shared } : {}) }
  self.postMessage(reply)
}
