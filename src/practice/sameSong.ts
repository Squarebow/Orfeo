// ── Is it the same song? ────────────────────────────────────────────────────
// A Library often holds a song several times: copies ("(2)"), Orfeo's own
// versions (_ORFEO_v2), the same file under another name, other arrangements
// ("… (Piano Solo)", "01-elton_john-rocket_man-[k]"). The practice queue takes
// one of them (practice/scanReady.ts). Two songs are the same when their piano
// parts are note for note the same, or when the words of one title are all in
// the other (the noise words of file names left out). Pure.

const NOISE = new Set([
  'the', 'a', 'an', 'and', 'of', 'by', 'for', 'with', 'feat', 'ft',
  'mid', 'midi', 'kar', 'k', 'karaoke', 'version', 'ver', 'edit', 'edited', 'remix', 'mix',
  'piano', 'solo', 'easy', 'original', 'cover', 'instrumental', 'live', 'remaster', 'remastered',
  'orfeo', 'imported', 'split', 'top', 'test', 'arr', 'arrangement', 'accompaniment',
  'vocal', 'voice', 'guitar', 'pvg', 'sheet', 'lead', 'words', 'lyrics', 'demo', 'gm', 'xg', 'gs',
  'www', 'com', 'net', 'org', 'midisfree', 'midifind', 'freemidi', 'musescore',
])

/** The words of a song's file name that say which song it is */
export function titleWords(path: string): string[] {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  const words = name
    .replace(/\.(midi?|kar)$/i, '')
    .replace(/_ORFEO_(v\d+|IMPORTED|SPLIT)\b/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')          // [k], [MIDIfind.com]
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents
    // catalogue numbers say which piece: "No. 1", "Op 23", "BWV 565" stay as one word
    .replace(/(?<![a-z])(no|nr|nro|op|bwv|kv|k|hob|d|s)[\s._-]*(\d+)/g, ' $1$2 ')
    .split(/[^a-z0-9]+/)
    .filter(w => w && !NOISE.has(w) && !/^\d+$/.test(w))   // track numbers, years, (2)
  return [...new Set(words)]
}

/** A song's notes as a fingerprint: the practice piano's keys and starts (to
 *  a hundredth of a second); two files with the same piano part share it */
export function pianoFingerprint(tracks: { group?: string; isDrum?: boolean; program?: number; notes: { midi: number; time: number }[] }[]): string {
  const notes = tracks
    .filter(t => t.group === 'piano' && !t.isDrum && t.program !== 6 && t.program !== 7)
    .flatMap(t => t.notes.map(n => [Math.round(n.time * 100), n.midi] as const))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (notes.length < 20) return ''
  let h = 0x811c9dc5, g = 0x9e3779b9
  for (const [t, m] of notes) for (const v of [t, m]) { h = Math.imul(h ^ v, 0x01000193); g = Math.imul(g ^ v, 0x5bd1e995); g ^= g >>> 15 }
  return `${(h >>> 0).toString(36)}.${(g >>> 0).toString(36)}.${notes.length}`
}

export interface SongId { path: string; words?: string[]; fp?: string }

const wordsOf = (s: SongId) => s.words ?? titleWords(s.path)

/** Are these two the same song? Same piano part note for note, or every word of
 *  the shorter title in the longer one (at least two words, or one long word) */
export function sameSong(a: SongId, b: SongId): boolean {
  if (a.fp && b.fp && a.fp === b.fp) return true
  const wa = wordsOf(a), wb = wordsOf(b)
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa]
  if (!short.length || !short.some(w => w.length >= 4)) return false
  if (short.length === 1 && short[0].length < 6) return false
  const set = new Set(long)
  return short.every(w => set.has(w))
}

/** Of several versions of one song, the one to keep: a version prepared in
 *  Orfeo first (the newest), then the plainest file name */
export function preferOrder(a: string, b: string): number {
  const v = (p: string) => { const m = /_ORFEO_v(\d+)/i.exec(p); return m ? +m[1] : /[\\/]orfeo[\\/]/i.test(p) ? 0.5 : 0 }
  return v(b) - v(a) || a.length - b.length || a.localeCompare(b)
}
