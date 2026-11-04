// ── How the Library shows a file: "Artist - Song", or "Song — Artist" ────────
// Display and sort order only: files on disk are never renamed. Artist and song
// come from the "Artist - Song" file name convention, the same split as File
// info. Unlike that split this one keeps Orfeo's version suffix on screen, or
// two saved versions of a song would look identical, and keeps the extension of
// imported formats, as the Library always has (only .mid/.midi are hidden).
import { stripOrfeoSuffix } from './orfeoVersioning'

interface Parts { artist: string | null; song: string; tail: string }

function parts(fileName: string): Parts {
  const ext = /\.[a-z0-9]{1,8}$/i.exec(fileName)?.[0] ?? ''
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  const base = stripOrfeoSuffix(stem)
  const tail = stem.slice(base.length) + (/^\.(mid|midi)$/i.test(ext) ? '' : ext)
  const sep = base.indexOf(' - ')
  const artist = sep === -1 ? '' : base.slice(0, sep).trim()
  const song = sep === -1 ? '' : base.slice(sep + 3).trim()
  // one half missing: there is nothing to swap, the name stands as it is
  return artist && song ? { artist, song, tail } : { artist: null, song: base.trim(), tail }
}

/** The name a Library row shows */
export function libraryDisplayName(fileName: string, songFirst: boolean): string {
  if (!songFirst) return fileName.replace(/\.(mid|midi)$/i, '')
  const { artist, song, tail } = parts(fileName)
  return artist ? `${song} — ${artist}${tail}` : `${song}${tail}`
}

/** A copy sorted by song, then artist: a song's versions stay side by side */
export function sortBySong<T extends { name: string }>(files: T[]): T[] {
  const opts = { sensitivity: 'base', numeric: true } as const
  return files
    .map(f => ({ f, p: parts(f.name) }))
    .sort((a, b) => a.p.song.localeCompare(b.p.song, undefined, opts)
      || (a.p.artist ?? '').localeCompare(b.p.artist ?? '', undefined, opts)
      || a.p.tail.localeCompare(b.p.tail, undefined, opts))
    .map(x => x.f)
}
