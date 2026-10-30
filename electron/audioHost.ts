// ── Orfeo's audio process ────────────────────────────────────────────────────
// Runs as an Electron utilityProcess (see startAudioHost in main.ts) so the
// native engine lives outside the app: if it ever crashes, Orfeo restarts
// the sound instead of closing. Loads the add-on (native/orfeo-audio-node)
// and talks to the renderer directly over a MessagePort — commands in,
// status out ~30 times a second. The main process only introduces the two.

/* eslint-disable @typescript-eslint/no-explicit-any */

type HostInit = { t: 'init'; addon: string; fluidDir: string }

let addonPath = ''
let fluidDir = ''
let NativeEngine: any = null
let engine: any = null
let port: Electron.MessagePortMain | null = null
let statusTimer: ReturnType<typeof setInterval> | null = null

function post(msg: any) { try { port?.postMessage(msg) } catch {} }

function stopEngine() {
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null }
  // Release the sound card now, not whenever garbage collection gets to it
  try { engine?.shutdown() } catch {}
  engine = null
}

function startEngine(opts: { soundfonts: string[]; exclusive: boolean }) {
  stopEngine()
  if (!NativeEngine) NativeEngine = require(addonPath).NativeEngine
  engine = new NativeEngine({ fluidDir, soundfonts: opts.soundfonts, exclusive: opts.exclusive })
  post({ t: 'started', status: engine.status() })
  statusTimer = setInterval(() => { if (engine) post({ t: 'status', status: engine.status() }) }, 33)
}

// ── Export to audio: offline renders on their own threads (addon OfflineRender),
// polled here; the live engine and its status keep running meanwhile ───────
const renders = new Map<number, any>()
function startRender(m: any) {
  let r: any
  try {
    const { OfflineRender } = require(addonPath)
    r = new OfflineRender({ ...m.job, fluidDir }, m.times, m.tracks, m.bytes, m.trackCount, m.duration)
  } catch (err: any) { post({ t: 'render-error', id: m.id, message: String(err?.message ?? err) }); return }
  renders.set(m.id, r)
  const poll = setInterval(() => {
    try {
      const out = r.take()
      if (!out) { post({ t: 'render-progress', id: m.id, p: r.progress() }); return }
      clearInterval(poll); renders.delete(m.id)
      const [l, rr] = out as Float32Array[]
      // copied, not transferred: a main-process MessagePort only transfers ports
      post({ t: 'render-done', id: m.id, l, r: rr })
    } catch (err: any) {
      clearInterval(poll); renders.delete(m.id)
      const message = String(err?.message ?? err)
      post(message === 'cancelled' ? { t: 'render-done', id: m.id, cancelled: true } : { t: 'render-error', id: m.id, message })
    }
  }, 100)
}

function onMessage(e: Electron.MessageEvent) {
  const m = e.data
  try {
    if (m.t === 'render') return startRender(m)
    if (m.t === 'render-cancel') { renders.get(m.id)?.cancel(); return }
    if (m.t === 'start') return startEngine(m)
    if (m.t === 'stop') { stopEngine(); post({ t: 'stopped' }); return }
    if (m.t === 'call') {
      if (!engine) return
      const fn = engine[m.m]
      if (typeof fn !== 'function') throw new Error(`unknown engine call ${m.m}`)
      fn.apply(engine, m.a ?? [])
    }
  } catch (err: any) {
    post({ t: 'error', message: String(err?.message ?? err), during: m?.t === 'call' ? m.m : m?.t })
  }
}

process.parentPort.on('message', (e) => {
  const m = e.data as HostInit
  if (m?.t !== 'init') return
  addonPath = m.addon
  fluidDir = m.fluidDir
  // A new renderer connection replaces the old one (reload, new window):
  // its engine goes too, so the new page starts from a clean sound card
  stopEngine()
  try { port?.close() } catch {}
  port = e.ports[0]
  port.on('message', onMessage)
  port.on('close', () => { stopEngine(); port = null })
  port.start()
  post({ t: 'ready' })
})
