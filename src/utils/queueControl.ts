import { useStore } from '../store'
import { neighbour } from './practiceQueue'

// ── Moving through the practice queue — one way in for the ↓ / ↑ keys, the
// queue's header buttons and the end-of-song card. App registers how a song is
// opened (its usual path, so the unsaved changes warning still comes first) and
// how playback starts; nothing here touches the audio itself. ───────────────
type Opener = (path: string, autoplay: boolean) => Promise<void>
let opener: Opener | null = null
export function registerQueueOpener(fn: Opener | null) { opener = fn }

export async function openQueueAt(index: number, autoplay: boolean): Promise<void> {
  const path = useStore.getState().queue.paths[index]
  if (!path || !opener) return
  // the position moves at once, so pressing ↓ twice quickly goes two songs on
  useStore.setState(s => ({ queue: { paths: s.queue.paths, index } }))
  await opener(path, autoplay)
}

/** Next (+1) or previous (-1) song in the queue; false when there is none that way. */
export function queueStep(dir: 1 | -1, autoplay = useStore.getState().playbackState === 'playing'): boolean {
  const s = useStore.getState()
  if (!s.queueEnabled) return false
  const i = neighbour(s.queue, dir)
  if (i === null) return false
  void openQueueAt(i, autoplay)
  return true
}

/** The song after the current one, for the end-of-song card. */
export function nextQueueSong(): { index: number; path: string } | null {
  const q = useStore.getState().queue
  const i = neighbour(q, 1)
  return i === null ? null : { index: i, path: q.paths[i] }
}

/** Is the open song the queue's current one? Only then does the end of a song move the queue on. */
export function openSongIsQueued(): boolean {
  const s = useStore.getState()
  const open = (s.midi as any)?._filePath as string | undefined
  const current = s.queue.paths[s.queue.index]
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  return !!open && !!current && norm(open) === norm(current)
}
