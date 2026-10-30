// ── Skip empty bars at the start (Settings › Playback) ───────────────────────
// Every song handed to the store passes through here once. With the switch
// on, the silent bars before the music (leadCut.ts) are cut from the song's
// bytes (smfLead.ts) and the song is read again from them, so the piano roll,
// bars, all three engines and exports see one shortened song. The file's own
// bytes stay on the song as _origRaw (song identity, reloading when the switch
// changes, the Note Editor's save keeping the lead-in); _leadTick/_leadSec say
// where it was cut. The file on disk is never touched.
import { Midi } from '@tonejs/midi'
import type { ParsedMidi } from '../types'
import { parseMidiBuffer } from './midiParser'
import { findLeadCut, EARLY } from './leadCut'
import { trimSmfLead } from './smfLead'
import { applyTempoCorrection, type SongTempoCorrection } from './tempoCorrection'

export function prepareSong(parsed: ParsedMidi, o: { skip: boolean; keepCountIn: boolean; correction: SongTempoCorrection | null }): ParsedMidi {
  if (parsed._origRaw) return parsed               // prepared already
  const raw = parsed._raw
  parsed._origRaw = raw
  parsed._leadTick = 0
  parsed._leadSec = 0
  if (!o.skip || !raw) return parsed
  // bars as the user hears them: the Tap Tempo grid when there is one
  const grid = o.correction ? applyTempoCorrection(parsed, o.correction) : parsed
  const cut = findLeadCut(grid, o.keepCountIn)
  if (!cut) return parsed
  const file = new Midi(raw)
  const header = file.header
  const bars = grid._barTimes ?? []
  const barAt = (sec: number) => { let b = 0; while (b + 1 < bars.length && bars[b + 1] <= sec + EARLY) b++; return b }
  let bar = cut.bar, tick = 0
  for (let pass = 0; pass < 8; pass++) {
    tick = Math.round(header.secondsToTicks(bars[bar]))
    // a note played a hair early for the music's first beat belongs to it:
    // the cut moves back to it (by at most EARLY), so it isn't lost
    const early = Math.floor(header.secondsToTicks(Math.max(0, bars[bar] - EARLY)))
    for (const t of file.tracks) for (const n of t.notes) if (n.ticks >= early && n.ticks < tick) tick = n.ticks
    // a track that plays only before the cut (a separate click track) would
    // be left empty, and every later track would shift by one: keep its last bar
    const lastOf = file.tracks.filter(t => t.notes.length && t.notes.every(n => n.ticks < tick))
      .map(t => barAt(header.ticksToSeconds(Math.max(...t.notes.map(n => n.ticks)))))
    if (!lastOf.length) break
    bar = Math.min(...lastOf)
    if (bar < 1) return parsed
  }
  const bytes = trimSmfLead(raw, tick)
  if (bytes === raw) return parsed                  // SMPTE timing: no bars to cut on
  const short = parseMidiBuffer(bytes, parsed.fileName, (parsed as any)._filePath ?? '')
  short._origRaw = raw
  short._leadTick = tick
  short._leadSec = header.ticksToSeconds(tick)
  return short
}
