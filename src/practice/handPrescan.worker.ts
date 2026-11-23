// ── The background reader, on its own processor core ───────────────────────
// Reads one song at a time the way Orfeo reads a song it opens (the hands,
// the practice readiness, the lesson check), with the trained model switched
// on, and sends back every model reading it made (handReadCache.ts). The song
// itself is thrown away: only the readings matter. handPrescan.ts drives it.
import { installHandModel } from '../utils/handModelReader'
import { takeFreshReadings } from '../utils/handReadCache'
import { parseMidiBuffer } from '../utils/midiParser'
import { songPracticeState } from '../utils/practiceReadiness'
import { songCheckOf } from './songCheckOf'

installHandModel(true)

export interface PrescanJob { id: number; bytes: ArrayBuffer; name: string; path: string; options: { rhMaxFingers: number; lhMaxFingers: number } }

self.onmessage = (e: MessageEvent<PrescanJob>) => {
  const { id, bytes, name, path, options } = e.data
  let ok = true
  try {
    const m: any = parseMidiBuffer(bytes, name, path, options)
    const pairs: [number, number][] = m._stavePairs ?? []
    songPracticeState(m.tracks, { stavePairs: pairs, options })
    songCheckOf(m.tracks.map((t: any) => ({ index: t.index, name: t.name ?? '', group: t.group ?? '', isDrum: !!t.isDrum, notes: t.notes })), pairs, options)
  } catch { ok = false }
  self.postMessage({ id, ok, readings: takeFreshReadings() })
}
