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
import { findLeadCut } from './leadCut'
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
  const cut = findLeadCut(o.correction ? applyTempoCorrection(parsed, o.correction) : parsed, o.keepCountIn)
  if (!cut) return parsed
  const header = new Midi(raw).header
  const tick = Math.round(header.secondsToTicks(cut.sec))
  const bytes = trimSmfLead(raw, tick)
  if (bytes === raw) return parsed                  // SMPTE timing: no bars to cut on
  const short = parseMidiBuffer(bytes, parsed.fileName, (parsed as any)._filePath ?? '')
  short._origRaw = raw
  short._leadTick = tick
  short._leadSec = header.ticksToSeconds(tick)
  return short
}
