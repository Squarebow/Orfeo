import { create } from 'zustand'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { songPracticeState } from '../utils/practiceReadiness'
import { prescanReady, prescanFingerprint, prescanReadyPaths } from './handPrescan'
import { sameSong, titleWords, pianoFingerprint, preferOrder, type SongId } from './sameSong'

// ── Scan for practice-ready songs ────────────────────────────────────────────
// From the practice queue's drop-down (the top bar, in playback and in
// practice mode): read every song in the Library the way Orfeo reads a song
// it opens, and add the ones ready to practise to the end of the queue: a
// piano as two tracks that play like a left and a right hand (practiceReadiness.ts).
// One song at a time with a pause between, so Orfeo stays responsive; Stop
// keeps what was found so far. A song the background reading has already
// reached (handPrescan.ts) isn't read again: its answer is used at once, so
// after that reading the scan takes a moment.

interface ScanState {
  running: boolean
  done: number
  total: number
  added: number | null      // after a scan: how many songs went into the queue
  versions: number          // ... and how many other versions of those songs were left out
}
export const useReadyScan = create<ScanState>(() => ({ running: false, done: 0, total: 0, added: null, versions: 0 }))

let stopRequested = false
export function stopReadyScan(): void { stopRequested = true }

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()

/** Is the song at `bytes` ready to practise? (exported for the tests) */
export function isPracticeReady(bytes: ArrayBuffer, name: string, path: string): boolean {
  return readyAndFingerprint(bytes, name, path).ready
}
function readyAndFingerprint(bytes: ArrayBuffer, name: string, path: string): { ready: boolean; fp: string } {
  const m: any = parseMidiBuffer(bytes, name, path)
  const s = useStore.getState()
  const st = songPracticeState(m.tracks, { stavePairs: m._stavePairs ?? [], options: { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers } })
  return { ready: st.state === 'ready' || st.state === 'one-hand', fp: pianoFingerprint(m.tracks) }
}

/** One version of each song (24. 11., the user: three Rocket Mans in the queue):
 *  of the found songs, in order of preference (a version prepared in Orfeo
 *  first), only those that are no other version of a song already in the queue
 *  or already taken. Returns the songs to add and how many were left out. */
export function oneOfEachSong(found: SongId[], queue: SongId[]): { add: string[]; versions: number } {
  const taken: SongId[] = [...queue]
  const add: string[] = []
  let versions = 0
  for (const s of [...found].sort((a, b) => preferOrder(a.path, b.path))) {
    if (taken.some(q => sameSong(q, s))) { versions++; continue }
    taken.push(s); add.push(s.path)
  }
  return { add, versions }
}
const idOf = (path: string, fp?: string): SongId => ({ path, words: titleWords(path), fp: fp ?? prescanFingerprint(path) })

/** What *Add practice-ready songs* would add now, from the background reading alone */
export function readyToAdd(queuePaths: string[]): { add: string[]; versions: number } {
  const inQueue = new Set(queuePaths.map(norm))
  const lib = new Map(useStore.getState().libraryFiles.map(f => [norm(f.path), f.path]))
  const found = prescanReadyPaths().filter(p => !inQueue.has(p)).map(p => idOf(lib.get(p) ?? p))
  return oneOfEachSong(found, queuePaths.map(p => idOf(p)))
}

export async function scanForPracticeReady(): Promise<void> {
  if (useReadyScan.getState().running) return
  stopRequested = false
  const queued = new Set(useStore.getState().queue.paths.map(norm))
  const files = useStore.getState().libraryFiles
    .filter(f => /\.(mid|midi|kar)$/i.test(f.path) && !queued.has(norm(f.path)))
  useReadyScan.setState({ running: true, done: 0, total: files.length, added: null, versions: 0 })
  const found: SongId[] = []
  for (let i = 0; i < files.length && !stopRequested; i++) {
    const f = files[i]
    const known = prescanReady(f.path)
    if (known !== undefined) {
      if (known) found.push(idOf(f.path))
      if (i % 50 === 49) useReadyScan.setState({ done: i + 1 })
      continue
    }
    try {
      const r = await window.electronAPI.loadMidiFromPath(f.path)
      if (r?.base64) {
        const bin = atob(r.base64)
        const buf = new Uint8Array(bin.length)
        for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k)
        const a = readyAndFingerprint(buf.buffer, r.fileName, f.path)
        if (a.ready) found.push(idOf(f.path, a.fp))
      }
    } catch { /* not a song Orfeo can read: skipped */ }
    useReadyScan.setState({ done: i + 1 })
    await new Promise(res => setTimeout(res, 0))
  }
  const { add, versions } = oneOfEachSong(found, useStore.getState().queue.paths.map(p => idOf(p)))
  if (add.length) useStore.getState().queueAdd(add)
  useReadyScan.setState({ running: false, added: add.length, versions })
}
