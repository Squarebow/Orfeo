// ── Share my hands for research ──────────────────────────────────────────────
// Goes through the Library on the background reader (handPrescan.worker.ts),
// takes every song whose piano comes as two hands, and saves them as one
// compressed file of anonymous numbers (handShareRecord.ts) for the player to
// attach to the GitHub issue. Songs are told apart only by a fingerprint of
// their notes; the file holds no names, paths, words or other instruments.
import { create } from 'zustand'
import { useStore } from '../store'
import { workerJob, songBytes } from './handPrescan'
import type { SharedSong } from './handShareRecord'

interface ShareState {
  running: boolean
  done: number
  total: number
  staves: number
  named: number
  orfeo: number
  /** where the last file went, or null (none yet / cancelled) */
  savedTo: string | null
  sizeKb: number
  cancelled: boolean
}
export const useShareHands = create<ShareState>(() => ({ running: false, done: 0, total: 0, staves: 0, named: 0, orfeo: 0, savedTo: null, sizeKb: 0, cancelled: false }))

let stop = false
export function stopSharing(): void { stop = true }

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function shareMyHands(): Promise<void> {
  if (useShareHands.getState().running) return
  stop = false
  const files = useStore.getState().libraryFiles.filter(f => /\.(mid|midi|kar)$/i.test(f.path))
  useShareHands.setState({ running: true, done: 0, total: files.length, staves: 0, named: 0, orfeo: 0, savedTo: null, sizeKb: 0, cancelled: false })
  const songs = new Map<string, SharedSong>()   // one copy of each song
  const count = { staves: 0, named: 0, orfeo: 0 }
  for (let i = 0; i < files.length && !stop; i++) {
    try {
      const r = await songBytes(files[i].path)
      if (r) {
        const s = useStore.getState()
        const out = await workerJob({ bytes: r.bytes.buffer as ArrayBuffer, name: r.fileName, path: files[i].path, options: { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers }, share: true })
        const song = out.shared
        // a song prepared in Orfeo wins over another copy of it
        if (song && (!songs.has(song.id) || song.kind === 'orfeo')) songs.set(song.id, song)
      }
    } catch { /* a song Orfeo can't read: left out */ }
    for (const k of ['staves', 'named', 'orfeo'] as const) count[k] = [...songs.values()].filter(x => x.kind === k).length
    useShareHands.setState({ done: i + 1, ...count })
  }
  if (stop || !songs.size) { useShareHands.setState({ running: false, cancelled: stop }); return }
  const file = {
    format: 'orfeo-hands', version: 1, app: __APP_VERSION__,
    made: new Date().toISOString().slice(0, 10),
    about: 'Piano notes as numbers (key: MIDI note, middle C = 60; on: ms after the previous note; len: ms) and the hand of each. No names, words or other instruments.',
    songs: [...songs.values()],
  }
  const bytes = await gzip(JSON.stringify(file))
  const savedTo: string | null = await (window as any).electronAPI.saveHandShare(`orfeo-hands-${file.made}.json.gz`, bytes)
  useShareHands.setState({ running: false, savedTo, sizeKb: Math.round(bytes.length / 1024), cancelled: !savedTo })
}
