// ── Lyrics check — does a MIDI file carry singable lyrics? ──────────────────
// For the Library's lyrics mark (Settings › Show files with lyrics) and, later,
// karaoke mode. Walks every track event by event (a plain byte search would find
// false matches inside note data) and counts two kinds of words:
//   - lyric events (meta type 5): the standard place for sung syllables;
//   - text events (meta type 1): where .kar files keep theirs, with "@" header
//     lines (@KMIDI KARAOKE FILE, @T title…) and "/" or "\" at the start of a
//     syllable for a new line or a new verse.
// Plenty of plain MIDI files carry a few text events too (copyright, "Piano",
// an arranger's note), so a handful of words is not enough: see hasLyrics().

export interface LyricsStats {
  lyricEvents: number     // meta 5 with any text
  textEvents: number      // meta 1 with any text, "@" header lines excluded
  karaokeHeader: boolean  // an "@K…" text line, the .kar file mark
  lineMarks: number       // text or lyric syllables starting with "/" or "\"
}

const EMPTY: LyricsStats = { lyricEvents: 0, textEvents: 0, karaokeHeader: false, lineMarks: 0 }

// The standard MIDI file inside: plain, or wrapped in a RIFF "RMID" file
function smfStart(b: Uint8Array): number {
  const isMThd = (i: number) => b[i] === 0x4d && b[i + 1] === 0x54 && b[i + 2] === 0x68 && b[i + 3] === 0x64
  if (isMThd(0)) return 0
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    for (let i = 12; i + 4 <= Math.min(b.length, 4096); i++) if (isMThd(i)) return i
  }
  return -1
}

export function lyricsStats(raw: ArrayBuffer | Uint8Array): LyricsStats {
  const b = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  const start = smfStart(b)
  if (start < 0) return { ...EMPTY }
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  const stats: LyricsStats = { ...EMPTY }
  let pos = start + 8 + u32(start + 4)  // past the header chunk
  while (pos + 8 <= b.length) {
    const isTrack = b[pos] === 0x4d && b[pos + 1] === 0x54 && b[pos + 2] === 0x72 && b[pos + 3] === 0x6b
    const len = u32(pos + 4)
    const end = Math.min(b.length, pos + 8 + len)
    if (isTrack) readTrack(b, pos + 8, end, stats)
    pos = pos + 8 + len
  }
  return stats
}

function readTrack(b: Uint8Array, from: number, end: number, s: LyricsStats) {
  let i = from
  let running = 0
  const vlq = (): number => {
    let v = 0
    for (let n = 0; n < 4 && i < end; n++) { const c = b[i++]; v = (v << 7) | (c & 0x7f); if (!(c & 0x80)) return v }
    return v
  }
  while (i < end) {
    vlq() // delta time
    if (i >= end) return
    let status = b[i]
    if (status < 0x80) { if (!running) return; status = running } else i++
    if (status === 0xff) {
      const type = b[i++]
      const len = vlq()
      if (i + len > end) return
      if (type === 0x01 || type === 0x05) count(b, i, len, type, s)
      i += len
    } else if (status === 0xf0 || status === 0xf7) {
      const len = vlq(); i += len
    } else if (status >= 0x80 && status < 0xf0) {
      running = status
      i += (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2
    } else {
      return // a status this reader doesn't know: stop this track rather than guess
    }
  }
}

function count(b: Uint8Array, at: number, len: number, type: number, s: LyricsStats) {
  if (len === 0) return
  let text = ''
  for (let k = 0; k < len && k < 64; k++) text += String.fromCharCode(b[at + k])
  if (!text.trim()) return
  // Orfeo's own notes in saved versions (track names, colours, history) are not words
  if (text.startsWith('ORFEO_')) return
  const first = text.charCodeAt(0)
  if (type === 0x01 && first === 0x40 /* @ */) { if (text[1] === 'K' || text[1] === 'k') s.karaokeHeader = true; return }
  // A line mark starts a short sung syllable ("/Hel"). Player-piano roll files use the
  // same "/" for labels like "/title: The Entertainer", which have a colon and run longer.
  if ((first === 0x2f /* / */ || first === 0x5c /* \ */) && !text.includes(':') && len <= 32) s.lineMarks++
  if (type === 0x05) s.lyricEvents++
  else s.textEvents++
}

// Bump when the rule below changes: remembered results from an older rule get checked again
export const LYRICS_VERSION = 1

// Enough words to sing along to. Checked against a real Library of 443 songs:
// track labels, arranger's notes, copyright lines and player-piano roll labels
// stay well under these; the karaoke files there start at well over 100 syllables.
export const MIN_LYRIC_EVENTS = 8
export const MIN_KARAOKE_TEXTS = 50
export const MIN_LINE_MARKS = 5

export function hasLyrics(s: LyricsStats): boolean {
  if (s.lyricEvents >= MIN_LYRIC_EVENTS) return true
  // .kar style: syllables as text events, with the karaoke mark or line marks
  return s.textEvents >= MIN_KARAOKE_TEXTS && (s.karaokeHeader || s.lineMarks >= MIN_LINE_MARKS)
}

export function fileHasLyrics(raw: ArrayBuffer | Uint8Array): boolean {
  return hasLyrics(lyricsStats(raw))
}
