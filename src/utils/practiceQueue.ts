// ── Practice queue — a planned list of songs to work through, kept between starts.
// Songs are stored by their place in the Library, like favourites and tags, and
// follow renames and moves inside Orfeo. `index` is where you are: the queued song
// that's open, or the last one played (-1 before the first). Next / previous never
// wrap round. The queue is also the future karaoke singing list. ─────────────────

export interface QueueState { paths: string[]; index: number }
export type QueueEndAction = 'ask' | 'next' | 'repeat' | 'stop'
export const QUEUE_END_ACTIONS: QueueEndAction[] = ['ask', 'next', 'repeat', 'stop']
export const EMPTY_QUEUE: QueueState = { paths: [], index: -1 }

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
const find = (paths: string[], path: string) => paths.findIndex(p => norm(p) === norm(path))

/** Adds songs at the end; a song already queued isn't added twice. */
export function addToQueue(q: QueueState, paths: string[]): QueueState {
  const next = [...q.paths]
  for (const p of paths) if (find(next, p) === -1) next.push(p)
  return { paths: next, index: q.index }
}

/** Takes a song out; the position stays on the same song where it can. */
export function removeFromQueue(q: QueueState, path: string): QueueState {
  const i = find(q.paths, path)
  if (i === -1) return q
  const paths = q.paths.filter((_, k) => k !== i)
  // removing the current song leaves the position just before the one that follows it
  const index = i < q.index ? q.index - 1 : i === q.index ? i - 1 : q.index
  return { paths, index: Math.min(index, paths.length - 1) }
}

/** Drags a song from one place to another; the position follows the song that was current. */
export function moveInQueue(q: QueueState, from: number, to: number): QueueState {
  if (from === to || from < 0 || from >= q.paths.length) return q
  const paths = [...q.paths]
  const [song] = paths.splice(from, 1)
  const at = Math.max(0, Math.min(to, paths.length))
  paths.splice(at, 0, song)
  const current = q.index >= 0 ? q.paths[q.index] : null
  return { paths, index: current === null ? -1 : find(paths, current) }
}

/** The place of the next (+1) or previous (-1) song, or null at either end. */
export function neighbour(q: QueueState, dir: 1 | -1): number | null {
  if (q.paths.length === 0) return null
  const i = q.index + dir
  if (dir === -1 && q.index <= 0) return null
  return i >= 0 && i < q.paths.length ? i : null
}

/** Opening a queued song from anywhere moves the position to it; other songs leave it alone. */
export function followOpenSong(q: QueueState, openPath: string | null | undefined): QueueState {
  if (!openPath) return q
  const i = find(q.paths, openPath)
  return i === -1 || i === q.index ? q : { paths: q.paths, index: i }
}

/** Songs keep their place in the queue when renamed or moved inside Orfeo. */
export function remapQueue(q: QueueState, pairs: { oldPath: string; newPath: string }[]): QueueState {
  if (!pairs.length) return q
  const map = new Map(pairs.map(p => [norm(p.oldPath), p.newPath]))
  return { paths: q.paths.map(p => map.get(norm(p)) ?? p), index: q.index }
}

/** Songs no longer in the Library leave the queue. */
export function pruneQueue(q: QueueState, inLibrary: (path: string) => boolean): QueueState {
  let next = q
  for (const p of q.paths) if (!inLibrary(p)) next = removeFromQueue(next, p)
  return next
}

/** Saved queue, checked. */
export function restoreQueue(saved: { queuePaths?: unknown; queueIndex?: unknown }): QueueState {
  const paths = Array.isArray(saved.queuePaths) ? saved.queuePaths.filter((p): p is string => typeof p === 'string' && !!p) : []
  const unique = paths.filter((p, i) => find(paths, p) === i)
  const index = typeof saved.queueIndex === 'number' && Number.isInteger(saved.queueIndex) ? saved.queueIndex : -1
  return { paths: unique, index: Math.max(-1, Math.min(index, unique.length - 1)) }
}
