// ── Renderer side of the native audio engine ─────────────────────────────────
// One MessagePort to Orfeo's audio process (electron/audioHost.ts): commands
// go out as { t: 'call', m, a }, the engine's status comes back ~30×/s into a
// small zustand store. If the audio process ever exits, it is restarted and
// the engine started again with the same options; the caller re-sends the
// song through `onRestart`.

import { create } from 'zustand'
import { PendingRenders } from './pendingRenders'

export interface NativeStatus {
  position: number
  playing: boolean
  mode: 'exclusive' | 'shared' | 'none'
  rate: number
  periodFrames: number
  bufferFrames: number
  reportedLatencyMs: number
  lateWakeups: number
  reopens: number
  periodStep: number
  worstRenderMs: number
  deviceName: string
  fallbackReason?: string | null
  error?: string | null
  channelPeaks: number[]
  masterPeak: number
  compReductionDb: number
  windowsGain?: number | null  // Windows volume the engine applies itself (Low latency without hardware volume)
  measuredRate?: number | null // how fast the card really plays in Low latency (Hz), once measured
  format?: string              // e.g. "48000 Hz · 32-bit float"
  liveNotes: number
  liveWaitAvgMs: number
  liveWaitMaxMs: number
  liveQueuedAvgMs: number
}

type Phase = 'off' | 'connecting' | 'starting' | 'running' | 'failed'

export const useNativeAudio = create<{ phase: Phase; status: NativeStatus | null; error: string | null }>(() => ({
  phase: 'off', status: null, error: null,
}))

let port: MessagePort | null = null
let portWaiter: ((p: MessagePort) => void) | null = null
let startOpts: { soundfonts: string[]; exclusive: boolean } | null = null
let startedWaiters: Array<(ok: boolean) => void> = []
let stoppedWaiters: Array<() => void> = []
const restartListeners = new Set<() => void>()

window.addEventListener('message', (e) => {
  if (e.data !== 'orfeo-audio-port' || !e.ports[0]) return
  port = e.ports[0]
  port.onmessage = onHostMessage
  portWaiter?.(port)
  portWaiter = null
})

function onHostMessage(e: MessageEvent) {
  const m = e.data
  if (m.t === 'status') { if (useNativeAudio.getState().phase === 'running') useNativeAudio.setState({ status: m.status }) }
  else if (m.t === 'render-progress') _renderProgress.get(m.id)?.(m.p)
  else if (m.t === 'render-done') _renders.done(m.id, m.cancelled ? null : [m.l, m.r])
  else if (m.t === 'render-error') _renders.fail(m.id, m.message)
  else if (m.t === 'stopped') { stoppedWaiters.forEach(w => w()); stoppedWaiters = [] }
  else if (m.t === 'started') {
    useNativeAudio.setState({ phase: 'running', status: m.status, error: null })
    startedWaiters.forEach(w => w(true)); startedWaiters = []
  } else if (m.t === 'error') {
    console.error('[Orfeo Native]', m.during, m.message)
    if (m.during === 'start') {
      useNativeAudio.setState({ phase: 'failed', error: m.message })
      startedWaiters.forEach(w => w(false)); startedWaiters = []
    } else useNativeAudio.setState({ error: m.message })
  }
}

async function connect(): Promise<boolean> {
  const got = new Promise<MessagePort>(res => { portWaiter = res })
  const r = await window.electronAPI.connectNativeAudio()
  if (!r.ok) { useNativeAudio.setState({ phase: 'failed', error: r.reason ?? 'unavailable' }); portWaiter = null; return false }
  await got
  return true
}

/** Starts (or restarts) the engine. Resolves false if it couldn't start. */
export async function startNative(opts: { soundfonts: string[]; exclusive: boolean }): Promise<boolean> {
  startOpts = opts
  useNativeAudio.setState({ phase: 'connecting', error: null })
  if (!port && !(await connect())) return false
  useNativeAudio.setState({ phase: 'starting' })
  const started = new Promise<boolean>(res => startedWaiters.push(res))
  port!.postMessage({ t: 'start', ...opts })
  return started
}

/** Stops the engine; resolves once the sound card is released (in exclusive
 *  mode nothing else can play until then — the Web Audio engines included) */
export function stopNative(): Promise<void> {
  const wasOn = useNativeAudio.getState().phase !== 'off'
  useNativeAudio.setState({ phase: 'off', status: null })
  if (!port || !wasOn) return Promise.resolve()
  const done = new Promise<void>(res => {
    stoppedWaiters.push(res)
    setTimeout(res, 1500) // never hang on a stuck audio process
  })
  port.postMessage({ t: 'stop' })
  return done
}

// ── Export to audio: an offline render in the audio process (exportNative.ts).
// Works whether or not the live engine runs; null = cancelled.
// Every export settles: by its result, its error, the audio process going away
// (onNativeAudioHostExit below) or, once cancelled, after 2 s with no answer.
let _renderId = 0
const _renders = new PendingRenders()
const _renderProgress = new Map<number, (p: number) => void>()

export async function nativeRenderOffline(
  packed: { job: unknown; times: Float64Array; tracks: Uint16Array; bytes: Uint8Array; trackCount: number; duration: number },
  onProgress?: (p: number) => void, isCancelled?: () => boolean,
): Promise<Float32Array[] | null> {
  if (!port && !(await connect())) throw new Error(useNativeAudio.getState().error ?? 'Native sound is unavailable')
  const id = ++_renderId
  const cancelWatch = setInterval(() => { if (isCancelled?.()) port?.postMessage({ t: 'render-cancel', id }) }, 100)
  if (onProgress) _renderProgress.set(id, onProgress)
  try {
    const result = _renders.wait(id, { isCancelled })
    port!.postMessage({ t: 'render', id, ...packed })
    return await result
  } finally {
    clearInterval(cancelWatch)
    _renderProgress.delete(id)
  }
}

/** One engine call; silently dropped while the engine isn't running */
export function nativeCall(method: string, ...args: unknown[]) {
  if (useNativeAudio.getState().phase !== 'running') return
  port?.postMessage({ t: 'call', m: method, a: args })
}

export const isNativeRunning = () => useNativeAudio.getState().phase === 'running'

/** Called after the audio process had to be restarted — re-send the song etc. */
export function onNativeRestart(fn: () => void) { restartListeners.add(fn); return () => restartListeners.delete(fn) }

window.electronAPI?.onNativeAudioHostExit?.(async (code) => {
  console.warn('[Orfeo Native] audio process exited', code)
  port = null
  _renders.failAll('the audio process stopped')
  if (!startOpts || useNativeAudio.getState().phase === 'off') return
  if (await startNative(startOpts)) restartListeners.forEach(fn => fn())
})
