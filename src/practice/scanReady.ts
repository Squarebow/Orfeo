import { create } from 'zustand'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { songPracticeState } from '../utils/practiceReadiness'

// ── Scan for practice-ready songs ────────────────────────────────────────────
// From the practice queue's drop-down (the top bar, in playback and in
// practice mode): read every song in the Library the way Orfeo reads a song
// it opens, and add the ones ready to practise to the end of the queue: a
// piano as two tracks that play like a left and a right hand (practiceReadiness.ts).
// One song at a time with a pause between, so Orfeo stays responsive; Stop
// keeps what was found so far.

interface ScanState {
  running: boolean
  done: number
  total: number
  added: number | null      // after a scan: how many songs went into the queue
}
export const useReadyScan = create<ScanState>(() => ({ running: false, done: 0, total: 0, added: null }))

let stopRequested = false
export function stopReadyScan(): void { stopRequested = true }

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()

/** Is the song at `bytes` ready to practise? (exported for the tests) */
export function isPracticeReady(bytes: ArrayBuffer, name: string, path: string): boolean {
  const m: any = parseMidiBuffer(bytes, name, path)
  const s = useStore.getState()
  const st = songPracticeState(m.tracks, { stavePairs: m._stavePairs ?? [], options: { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers } })
  return st.state === 'ready' || st.state === 'one-hand'
}

export async function scanForPracticeReady(): Promise<void> {
  if (useReadyScan.getState().running) return
  stopRequested = false
  const queued = new Set(useStore.getState().queue.paths.map(norm))
  const files = useStore.getState().libraryFiles
    .filter(f => /\.(mid|midi|kar)$/i.test(f.path) && !queued.has(norm(f.path)))
  useReadyScan.setState({ running: true, done: 0, total: files.length, added: null })
  const found: string[] = []
  for (let i = 0; i < files.length && !stopRequested; i++) {
    const f = files[i]
    try {
      const r = await window.electronAPI.loadMidiFromPath(f.path)
      if (r?.base64) {
        const bin = atob(r.base64)
        const buf = new Uint8Array(bin.length)
        for (let k = 0; k < bin.length; k++) buf[k] = bin.charCodeAt(k)
        if (isPracticeReady(buf.buffer, r.fileName, f.path)) found.push(f.path)
      }
    } catch { /* not a song Orfeo can read: skipped */ }
    useReadyScan.setState({ done: i + 1 })
    await new Promise(res => setTimeout(res, 0))
  }
  if (found.length) useStore.getState().queueAdd(found)
  useReadyScan.setState({ running: false, added: found.length })
}
