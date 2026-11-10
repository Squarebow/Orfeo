// ── Library tags — the user's own labels for songs (style, difficulty, "hands
// separate"), kept by Orfeo and never written into the files. A song's tags are
// stored by its place in the Library, like favourites, and follow it through
// renames and moves inside Orfeo (remapSongTags). A tag's identity is its name,
// compared without regard to capitals, so "jazz" can't sit beside "Jazz". ──────

export interface TagState {
  tags: string[]                       // every tag, in the user's order
  songTags: Record<string, string[]>   // song path → its tags
  pinned: string[]                     // the tags chosen (with ▾) to show as filter pills in the tags row
}

export const DEFAULT_TAGS = ['Classical', 'Pop', 'Jazz', 'Practice']
// The ready-made tags sit in the tags row from the start (all switched off), so
// a new user sees what the row is for
export const STARTER_ROW = DEFAULT_TAGS.slice(0, 4)
export const MAX_TAG_LENGTH = 24

export const sameTag = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

export function cleanTagName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim()
}

const without = (list: string[], tag: string) => list.filter(t => !sameTag(t, tag))
const has = (list: readonly string[] | undefined, tag: string) => !!list?.some(t => sameTag(t, tag))

/** A new tag at the end of the list. It joins the tags row only when chosen there with ▾. Null when empty or taken. */
export function addTag(s: TagState, raw: string): TagState | null {
  const name = cleanTagName(raw)
  if (!name || has(s.tags, name)) return null
  return { ...s, tags: [...s.tags, name] }
}

/** Renames a tag everywhere it's used. Null when the new name is empty or belongs to another tag. */
export function renameTag(s: TagState, from: string, raw: string): TagState | null {
  const name = cleanTagName(raw)
  if (!name || !has(s.tags, from)) return null
  if (!sameTag(from, name) && has(s.tags, name)) return null
  const swap = (t: string) => (sameTag(t, from) ? name : t)
  const songTags: Record<string, string[]> = {}
  for (const [path, list] of Object.entries(s.songTags)) songTags[path] = list.map(swap)
  return { tags: s.tags.map(swap), songTags, pinned: s.pinned.map(swap) }
}

/** Deletes a tag and takes it off every song. */
export function deleteTag(s: TagState, tag: string): TagState {
  const songTags: Record<string, string[]> = {}
  for (const [path, list] of Object.entries(s.songTags)) {
    const next = without(list, tag)
    if (next.length) songTags[path] = next
  }
  return { tags: without(s.tags, tag), songTags, pinned: without(s.pinned, tag) }
}

/** Puts a tag on (or takes it off) every song in `paths`. */
export function setSongsTag(songTags: Record<string, string[]>, paths: string[], tag: string, on: boolean): Record<string, string[]> {
  const next = { ...songTags }
  for (const path of paths) {
    const list = next[path] ?? []
    if (on && !has(list, tag)) next[path] = [...list, tag]
    else if (!on && has(list, tag)) {
      const rest = without(list, tag)
      if (rest.length) next[path] = rest
      else delete next[path]
    }
  }
  return next
}

/** How many of `paths` carry the tag: none, some or all (for the tick in the picker). */
export function tagCoverage(songTags: Record<string, string[]>, paths: string[], tag: string): 'none' | 'some' | 'all' {
  const n = paths.filter(p => has(songTags[p], tag)).length
  return n === 0 ? 'none' : n === paths.length ? 'all' : 'some'
}

/** A song passes the tags filter when it has every active tag (each pill narrows the list). */
export function songHasAllTags(songTags: Record<string, string[]>, path: string, active: readonly string[]): boolean {
  return active.every(tag => has(songTags[path], tag))
}

/** Songs keep their tags when renamed or moved inside Orfeo. */
export function remapSongTags(songTags: Record<string, string[]>, pairs: { oldPath: string; newPath: string }[]): Record<string, string[]> {
  if (!pairs.length) return songTags
  const map = new Map(pairs.map(p => [p.oldPath, p.newPath]))
  const next: Record<string, string[]> = {}
  for (const [path, list] of Object.entries(songTags)) next[map.get(path) ?? path] = list
  return next
}

/** Saved tags, checked. The very first start gets the ready-made set, the first four in the tags row. */
export function restoreTagState(saved: { libraryTags?: unknown; songTags?: unknown; pinnedTags?: unknown }): TagState {
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!cleanTagName(x)).map(cleanTagName) : null)
  const tags = strings(saved.libraryTags) ?? [...DEFAULT_TAGS]
  const unique = tags.filter((t, i) => tags.findIndex(u => sameTag(u, t)) === i)
  const songTags: Record<string, string[]> = {}
  if (saved.songTags && typeof saved.songTags === 'object') {
    for (const [path, list] of Object.entries(saved.songTags as Record<string, unknown>)) {
      const known = (strings(list) ?? []).filter(t => has(unique, t))
      if (known.length) songTags[path] = known
    }
  }
  const firstStart = saved.libraryTags === undefined && saved.pinnedTags === undefined
  const pinned = (strings(saved.pinnedTags) ?? (firstStart ? STARTER_ROW : [])).filter(t => has(unique, t))
  return { tags: unique, songTags, pinned }
}
