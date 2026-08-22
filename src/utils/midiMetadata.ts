// ── Lightweight MIDI file metadata — for the File info popup (SettingsPanel).
// Deliberately separate from midiParser.ts: that one does full note-level
// parsing + hand assignment (fine for actually opening a file, wasteful for
// a quick right-click info read on a file that may not even be loaded).
import { Midi } from '@tonejs/midi'
import { parseMidi } from 'midi-file'
import { stripOrfeoSuffix } from './orfeoVersioning'
import { parseKeySignature, formatKey, detectKeyFromTracks, SEMITONE_TO_KEY_NAME, type DetectedKey } from './keyDetection'
import type { NoteNaming, Accidentals } from '../types'

export interface MidiFileMetadata {
  artist: string | null
  song: string | null
  key: DetectedKey | null
  bpm: number
  timeSignature: string
  trackCount: number
  copyright: string | null
}

// ── Artist/Song — parsed from the "Artist - Song.mid" filename convention,
// the only place this info exists (not a real MIDI field). No metadata for
// either half if the filename doesn't have the " - " separator. ────────────
function parseArtistSong(fileName: string): { artist: string | null; song: string | null } {
  const base = stripOrfeoSuffix(fileName.replace(/\.(mid|midi)$/i, ''))
  const sepIdx = base.indexOf(' - ')
  if (sepIdx === -1) return { artist: null, song: base.trim() || null }
  return { artist: base.slice(0, sepIdx).trim() || null, song: base.slice(sepIdx + 3).trim() || null }
}

// ── Rebuild a filename from edited Artist/Song values, preserving everything
// else (Orfeo version suffix, extension). Used by both the File info popup's
// Save button (inline-edited fields) and its swap icon (swap the two current
// field values, then rebuild). Returns null when there's no song to anchor
// the filename on — Orfeo's convention has no slot for an artist-only name. ─
export function buildRenamedFileName(fileName: string, artist: string, song: string): string | null {
  const extMatch = fileName.match(/\.(mid|midi)$/i)
  const ext = extMatch ? extMatch[0] : ''
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  const suffixMatch = stem.match(/(_ORFEO(?:_MERGED|_SPLIT|_IMPORTED|_V\d+|_v\d+)?)$/i)
  const suffix = suffixMatch ? suffixMatch[0] : ''
  const a = artist.trim(), s = song.trim()
  if (!s) return null
  const base = a ? `${a} - ${s}` : s
  return `${base}${suffix}${ext}`
}

// ── copyright (MIDI meta type 0x02) — @tonejs/midi's Header never captures
// this event type into `header.meta` (only text/cuePoint/marker/lyrics do),
// so it's read directly via the lower-level midi-file parser instead. ──────
function extractCopyright(buffer: ArrayBuffer): string | null {
  try {
    const raw = parseMidi(new Uint8Array(buffer))
    for (const track of raw.tracks) {
      const ev = track.find((e: any) => e.type === 'copyrightNotice') as any
      if (ev && typeof ev.text === 'string' && ev.text.trim()) return ev.text.trim()
    }
  } catch { /* malformed file — no copyright, not a hard error */ }
  return null
}

export function parseMidiMetadata(buffer: ArrayBuffer, fileName: string): MidiFileMetadata {
  const midi = new Midi(buffer)
  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120
  const timeSig = midi.header.timeSignatures.length > 0 ? midi.header.timeSignatures[0].timeSignature : [4, 4]
  const trackCount = midi.tracks.filter(t => t.notes.length > 0).length

  // ── Key — same 3-tier priority as everywhere else the app shows a key
  // (midiParser.ts, tempoKeySave.ts, etc): ORFEO_KEY custom meta (Orfeo's
  // own tempo/key saves strip the native key-signature event, see
  // midiParser.ts) > native key-signature meta event > pitch-based
  // detection when the file has no explicit key at all (e.g. most files
  // that weren't authored with a DAW that writes one). Without the last
  // tier this matched the loaded-file display for files with an explicit
  // key but showed "—" for the common case of no key-signature event. ──────
  let key: DetectedKey | null = null
  try {
    for (const meta of (midi.header as any).meta ?? []) {
      if (typeof meta.text !== 'string' || !meta.text.startsWith('ORFEO_KEY:')) continue
      const rest = meta.text.slice('ORFEO_KEY:'.length)
      const [semitoneStr, scale] = rest.split(':')
      const semitone = parseInt(semitoneStr, 10)
      if (!isNaN(semitone) && SEMITONE_TO_KEY_NAME[semitone]) {
        key = parseKeySignature(SEMITONE_TO_KEY_NAME[semitone], scale === 'minor' ? 'minor' : 'major')
      }
      break
    }
  } catch { /* malformed meta — fall through to other sources */ }
  if (!key) {
    const ks = (midi.header as any).keySignatures
    if (ks && ks.length > 0) key = parseKeySignature(ks[0].key, ks[0].scale)
  }
  if (!key) key = detectKeyFromTracks(midi.tracks.map(t => ({ isDrum: t.channel === 9, notes: t.notes })))

  const { artist, song } = parseArtistSong(fileName)

  return {
    artist, song, key, bpm,
    timeSignature: `${timeSig[0]}/${timeSig[1]}`,
    trackCount,
    copyright: extractCopyright(buffer),
  }
}

export function formatKeyOrDash(key: DetectedKey | null, naming: NoteNaming, accidentals: Accidentals): string {
  return key ? formatKey(key, naming, accidentals) : '—'
}
