import { lyricsStats, hasLyrics, fileHasLyrics } from './lyricsCheck'

// ── Tiny MIDI file builder: one header, tracks of [delta, ...event bytes] ──
const vlq = (n: number): number[] => {
  const out = [n & 0x7f]
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80)
  return out
}
const meta = (type: number, text: string): number[] => {
  const bytes = [...text].map(c => c.charCodeAt(0) & 0xff)
  return [0x00, 0xff, type, ...vlq(bytes.length), ...bytes]
}
const note = (pitch: number): number[] => [0x00, 0x90, pitch, 100, 0x60, 0x80, pitch, 0]
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const track = (events: number[]): number[] => {
  const body = [...events, 0x00, 0xff, 0x2f, 0x00]
  return [0x4d, 0x54, 0x72, 0x6b, ...u32(body.length), ...body]
}
const smf = (...tracks: number[][]): Uint8Array =>
  new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0x01, 0xe0, ...tracks.flatMap(track)])
const times = (n: number, f: (i: number) => number[]) => Array.from({ length: n }, (_, i) => f(i)).flat()

export function runLyricsCheckTest(): number {
  console.group('[lyricsCheck] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Sung syllables as lyric events, between notes
  const sung = smf(times(12, i => [...note(60 + i), ...meta(5, ['Some', 'where ', 'o', 'ver '][i % 4])]))
  check(lyricsStats(sung).lyricEvents === 12, 'counts lyric events')
  check(fileHasLyrics(sung), 'a song with sung syllables has lyrics')

  // A .kar file: @ header lines, then syllables as text events with line marks
  const kar = smf(
    [...meta(1, '@KMIDI KARAOKE FILE'), ...meta(1, '@TSong title')],
    times(60, i => [...note(64), ...meta(1, i % 8 === 0 ? '/Hel' : 'lo ')]),
  )
  const ks = lyricsStats(kar)
  check(ks.karaokeHeader && ks.textEvents === 60, 'the @K mark is found and @ lines are not counted as words')
  check(ks.lineMarks === 8, 'line marks are counted')
  check(hasLyrics(ks), 'a .kar file with syllables has lyrics')

  // Not lyrics: a few labels, a copyright line, Orfeo's own notes, player-piano roll labels
  check(!fileHasLyrics(smf([...meta(1, 'Lead Vox'), ...meta(1, 'Drums'), ...meta(1, 'Piano'), ...note(60)])), 'track labels are not lyrics')
  check(!fileHasLyrics(smf([...meta(5, 'DO NOT DUPLICATE.'), ...meta(5, 'Not for rental.'), ...note(60)])), 'two lines of lyric-type small print are not lyrics')
  check(!fileHasLyrics(smf(times(80, i => meta(1, `ORFEO_TRACK_NAME:${i}:Piano`)))), "Orfeo's own notes in a saved version are not lyrics")
  const roll = smf(times(60, i => meta(1, i % 2 ? `/title: Rag ${i}` : `/composer: Someone ${i}`)))
  check(lyricsStats(roll).lineMarks === 0, 'roll labels with a colon are not line marks')
  check(!fileHasLyrics(roll), 'a player-piano roll file is not a karaoke file')
  check(!fileHasLyrics(smf(times(60, () => meta(1, 'chorus here'))), ), 'lots of text without the karaoke mark or line marks is not enough')

  // Running status: notes without repeated status bytes must not throw the reader off
  const running = smf([0x00, 0x90, 60, 100, 0x10, 62, 100, 0x10, 64, 100, ...times(10, () => meta(5, 'la '))])
  check(lyricsStats(running).lyricEvents === 10, 'running status is followed')

  // Wrapped in RIFF (RMID), cut short, or not MIDI at all
  const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x52, 0x4d, 0x49, 0x44, 0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0, ...sung])
  check(fileHasLyrics(riff), 'an RMID file is read through its wrapper')
  check(!fileHasLyrics(sung.slice(0, 40)), 'a cut-off file reads without throwing')
  check(!fileHasLyrics(new Uint8Array([1, 2, 3, 4, 5])), 'not a MIDI file: no lyrics, no error')

  console.log(`lyricsCheck: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
