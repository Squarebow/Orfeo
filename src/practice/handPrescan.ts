// ── Reading the library ahead, in the background ────────────────────────────
// The trained hand model is too slow to read a long song every time it opens,
// so Orfeo reads the whole library once, in the background, a few seconds
// after it starts: one song at a time on its own processor core
// (handPrescan.worker.ts), pausing while a song plays. What it reads is kept
// (handReadCache.ts) and saved with Orfeo's settings, so opening a song, its
// practice readiness and its lesson check use readings already made. A song
// is read again only when its file changes, the hand settings change, or a
// new model comes; a song opened before its turn is read on the spot, as
// before. Settings › Dev Tools › Hand reading shows how far it got.
import { create } from 'zustand'
import { useStore } from '../store'
import { addReadings, takeFreshReadings, forgetReadings, readingStats, type StoredReadings } from '../utils/handReadCache'
import { HAND_MODEL_NAME, handModelOn } from '../utils/handModelReader'
import type { PrescanJob, PrescanReply } from './handPrescan.worker'

interface PrescanState {
  running: boolean
  /** songs looked at this round, of `total` */
  done: number
  total: number
  /** songs the model read this round (the rest were read before) */
  read: number
  /** the song being read */
  current: string
  /** when this round finished (ms), or null */
  finished: number | null
  seconds: number
  /** songs found ready to practise so far (the queue's Scan adds them at once) */
  readyCount: number
}
export const useHandPrescan = create<PrescanState>(() => ({ running: false, done: 0, total: 0, read: 0, current: '', finished: null, seconds: 0, readyCount: 0 }))
// dev mode: live tests read the state the app itself uses (an import from
// outside gets its own copy of this module after a hot update)
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__handPrescan = { state: () => useHandPrescan.getState(), stats: () => readingStats() }

const START_AFTER = 6000      // ms after Orfeo opens: the window and the first song come first
const SAVE_EVERY = 10         // songs between saves to disk

let worker: Worker | null = null
// every song read: its key → ready to practise or not (kept on disk as "key|1" /
// "key|0"; a key from before readiness was kept has no answer and is read again)
let readDone = new Map<string, boolean>()
// this session: a Library song → ready or not, once its turn has come
const readyByPath = new Map<string, boolean>()
const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
/** Is the song at `path` ready to practise, as the background reading found? (undefined: not reached yet) */
export const prescanReady = (path: string): boolean | undefined => readyByPath.get(norm(path))
/** Every Library song found ready so far (lower case, forward slashes) */
export const prescanReadyPaths = (): string[] => [...readyByPath].filter(([, r]) => r).map(([p]) => p)
let loaded = false
let pending: { readings: StoredReadings; done: string[] } = { readings: [], done: [] }
let again = false

const api = () => (window as any).electronAPI

function fileKey(bytes: Uint8Array, options: { rhMaxFingers: number; lhMaxFingers: number }): string {
  let h = 0x811c9dc5, g = 0x9e3779b9
  for (let i = 0; i < bytes.length; i++) { h = Math.imul(h ^ bytes[i], 0x01000193); g = Math.imul(g ^ bytes[i], 0x5bd1e995); g ^= g >>> 15 }
  return `${HAND_MODEL_NAME}:${options.rhMaxFingers}/${options.lhMaxFingers}:${(h >>> 0).toString(36)}.${(g >>> 0).toString(36)}.${bytes.length}`
}

async function save(): Promise<void> {
  // readings made by opening songs here go to the disk as well
  const mine = takeFreshReadings()
  const out = { readings: [...pending.readings, ...mine], done: pending.done }
  pending = { readings: [], done: [] }
  if (out.readings.length || out.done.length) await api()?.handReadsAdd?.(out.readings, out.done)
}

async function load(): Promise<void> {
  if (loaded) return
  loaded = true
  const r = await api()?.handReadsLoad?.()
  if (r) {
    addReadings(r.readings ?? [])
    readDone = new Map()
    for (const d of (r.done ?? []) as string[]) { const m = /^(.*)\|([01])$/.exec(d); if (m) readDone.set(m[1], m[2] === '1') }
  }
}

function getWorker(): Promise<Worker> {
  if (worker) return Promise.resolve(worker)
  return import('./handPrescanWorkerCtor').then(m => (worker = new m.default()))
}

const playing = () => useStore.getState().playbackState === 'playing'
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

let jobId = 0
/** One song through the background reader (its readings are kept here as well) */
export async function workerJob(job: Omit<PrescanJob, 'id'>): Promise<PrescanReply> {
  const w = await getWorker()
  const id = ++jobId
  const out = await new Promise<PrescanReply>(res => {
    const on = (e: MessageEvent) => { if (e.data?.id === id) { w.removeEventListener('message', on); res(e.data) } }
    w.addEventListener('message', on)
    w.postMessage({ ...job, id }, [job.bytes])
  })
  addReadings(out.readings)
  pending.readings.push(...out.readings)
  return out
}

/** A Library file's bytes, or null */
export async function songBytes(path: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const r = await api().loadMidiFromPath(path)
  if (!r?.base64) return null
  const bin = atob(r.base64)
  const bytes = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k)
  return { bytes, fileName: r.fileName }
}

/** One round over the library: every song not read yet with this model and these settings */
export async function prescanLibrary(): Promise<void> {
  if (!handModelOn()) return
  if (useHandPrescan.getState().running) { again = true; return }
  await load()
  const files = useStore.getState().libraryFiles.filter(f => /\.(mid|midi|kar)$/i.test(f.path))
  // songs in the practice queue first: they are the ones about to be opened
  const queued = new Set(useStore.getState().queue.paths.map(p => p.toLowerCase()))
  files.sort((a, b) => Number(queued.has(b.path.toLowerCase())) - Number(queued.has(a.path.toLowerCase())))
  const t0 = performance.now()
  useHandPrescan.setState({ running: true, done: 0, total: files.length, read: 0, current: '', finished: null, seconds: 0 })
  let read = 0, sinceSave = 0
  for (let i = 0; i < files.length; i++) {
    if (!handModelOn()) break
    while (playing()) await sleep(1000)
    const f = files[i]
    try {
      const r = await songBytes(f.path)
      if (r) {
        const { bytes } = r
        const s = useStore.getState()
        const options = { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers }
        const key = fileKey(bytes, options)
        if (!readDone.has(key)) {
          useHandPrescan.setState({ current: f.name })
          const out = await workerJob({ bytes: bytes.buffer as ArrayBuffer, name: r.fileName, path: f.path, options })
          const ready = !!out.ready
          pending.done.push(`${key}|${ready ? 1 : 0}`); readDone.set(key, ready)
          read++
          if (++sinceSave >= SAVE_EVERY) { sinceSave = 0; await save() }
        }
        readyByPath.set(norm(f.path), readDone.get(key) ?? false)
        useHandPrescan.setState({ readyCount: [...readyByPath.values()].filter(Boolean).length })
      }
    } catch { /* a song Orfeo can't read: skipped, as when opening it */ }
    // no pause between songs: waiting for the file and for the reader already
    // gives the screen its turn, and a timer would stretch to a second while
    // Orfeo's window is hidden or minimised
    useHandPrescan.setState({ done: i + 1, read })
  }
  await save()
  useHandPrescan.setState({ running: false, current: '', finished: Date.now(), seconds: Math.round((performance.now() - t0) / 1000) })
  if (again) { again = false; void prescanLibrary() }
}

/** Forget every reading (here, in the main process and on disk) and read the library again */
export async function forgetAndRescan(): Promise<void> {
  forgetReadings()
  readDone = new Map()
  readyByPath.clear()
  pending = { readings: [], done: [] }
  await api()?.handReadsForget?.()
  void prescanLibrary()
}

let started = false
/** Called once at start-up, after the model is switched on */
export function startHandPrescan(): void {
  if (started || typeof window === 'undefined') return
  started = true
  void load()    // what was read before: at once, a song opened now uses it
  setTimeout(() => {
    void prescanLibrary()
    // a new library folder, or new songs in it: read what's new
    let last = useStore.getState().libraryFiles
    useStore.subscribe(s => { if (s.libraryFiles !== last) { last = s.libraryFiles; void prescanLibrary() } })
    // readings made by opening songs are saved now and then
    setInterval(() => { if (!useHandPrescan.getState().running) void save() }, 60000)
  }, START_AFTER)
}
