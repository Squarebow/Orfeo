// ── Simulated MIDI keyboards — development builds only ───────────────────────
// Lets the app be seen and tested exactly as a player with a USB keyboard sees
// it, without one: plugging/unplugging fires the same connection events, and
// played notes arrive as real MIDI messages through the same handler, sound
// and lights as a physical key. Wraps navigator.requestMIDIAccess so every
// caller (keyboard input AND the General MIDI output list) sees real devices
// plus the simulated ones. Driven from Settings → MIDI Keyboard → Keyboards
// (dev only) or the console: window.__orfeoSimMidi.

export interface SimModel { key: string; ports: string[]; outPorts: string[]; manufacturer: string }

// Port names as Windows reports them for these real keyboards — including the
// second "MIDIIN2 (…)" port some have, to exercise the name cleaning
export const SIM_MODELS: SimModel[] = [
  { key: 's88', ports: ['KOMPLETE KONTROL S88 MK3 MIDI'], outPorts: ['KOMPLETE KONTROL S88 MK3 MIDI'], manufacturer: 'Native Instruments' },
  { key: 'mpk', ports: ['MPK mini Plus'], outPorts: ['MPK mini Plus'], manufacturer: 'Microsoft' },
  { key: 'launchkey', ports: ['Launchkey MK4 37 MIDI', 'MIDIIN2 (Launchkey MK4 37)'], outPorts: ['Launchkey MK4 37 MIDI'], manufacturer: 'Focusrite A.E. Ltd' },
]

type PortState = 'connected' | 'disconnected'

class SimPort extends EventTarget {
  state: PortState = 'disconnected'
  connection: 'open' | 'closed' | 'pending' = 'closed'
  onmidimessage: ((e: Event) => void) | null = null
  onstatechange: ((e: Event) => void) | null = null
  version = '1.0'
  sent: number[][] = []
  constructor(public id: string, public name: string, public manufacturer: string, public type: 'input' | 'output') { super() }
  open() { this.connection = 'open'; return Promise.resolve(this) }
  close() { this.connection = 'closed'; return Promise.resolve(this) }
  send(data: number[] | Uint8Array) { this.sent.push(Array.from(data)) }
  clear() {}
  deliver(bytes: number[]) {
    if (this.state !== 'connected') return
    const e = new MIDIMessageEvent('midimessage', { data: new Uint8Array(bytes) })
    this.dispatchEvent(e)
    this.onmidimessage?.(e)
  }
}

const _inputs = new Map<string, SimPort>()
const _outputs = new Map<string, SimPort>()
const _accesses = new Set<SimAccess>()

class SimAccess extends EventTarget {
  onstatechange: ((e: Event) => void) | null = null
  sysexEnabled = true
  constructor(private real: MIDIAccess | null) {
    super()
    if (real) real.onstatechange = (e) => this.fire(e)
  }
  get inputs() {
    const m = new Map<string, any>()
    this.real?.inputs.forEach((v, k) => m.set(k, v))
    // Once plugged, a port stays listed (as disconnected after unplugging) — as Chromium does
    for (const [k, v] of _inputs) m.set(k, v)
    return m
  }
  get outputs() {
    const m = new Map<string, any>()
    this.real?.outputs.forEach((v, k) => m.set(k, v))
    for (const [k, v] of _outputs) m.set(k, v)
    return m
  }
  fire(e: Event) { this.dispatchEvent(new Event('statechange')); this.onstatechange?.(e) }
}

function notify(port: SimPort) {
  const e = Object.assign(new Event('statechange'), { port })
  port.onstatechange?.(e)
  for (const a of _accesses) a.fire(e)
}

function model(key: string) {
  const m = SIM_MODELS.find(x => x.key === key)
  if (!m) throw new Error(`unknown simulated keyboard: ${key} (${SIM_MODELS.map(x => x.key).join(', ')})`)
  return m
}
const firstInput = (key: string) => _inputs.get(`sim-${key}-in-0`)

export const sim = {
  models: SIM_MODELS,
  isPlugged: (key: string) => firstInput(key)?.state === 'connected',
  plug(key: string) {
    const m = model(key)
    m.ports.forEach((name, i) => {
      const id = `sim-${key}-in-${i}`
      const p = _inputs.get(id) ?? new SimPort(id, name, m.manufacturer, 'input')
      _inputs.set(id, p); p.state = 'connected'; notify(p)
    })
    m.outPorts.forEach((name, i) => {
      const id = `sim-${key}-out-${i}`
      const p = _outputs.get(id) ?? new SimPort(id, name, m.manufacturer, 'output')
      _outputs.set(id, p); p.state = 'connected'; notify(p)
    })
  },
  unplug(key: string) {
    for (const [id, p] of [..._inputs, ..._outputs]) if (id.startsWith(`sim-${key}-`)) { p.state = 'disconnected'; notify(p) }
  },
  send(key: string, bytes: number[], port = 0) { _inputs.get(`sim-${key}-in-${port}`)?.deliver(bytes) },
  noteOn(key: string, note: number, vel = 90) { sim.send(key, [0x90, note, vel]) },
  noteOff(key: string, note: number) { sim.send(key, [0x80, note, 0]) },
  // Notes held for `ms`, all struck together
  chord(key: string, notes: number[], vel = 90, ms = 900) {
    notes.forEach(n => sim.noteOn(key, n, vel))
    setTimeout(() => notes.forEach(n => sim.noteOff(key, n)), ms)
  },
  // A quick run up and down — touch varies so the light/loudness changes show
  run(key: string, from = 60, steps = 8, gapMs = 110) {
    const scale = [0, 2, 4, 5, 7, 9, 11, 12]
    const seq = [...scale.slice(0, steps), ...scale.slice(0, steps - 1).reverse()].map(s => from + s)
    seq.forEach((n, i) => setTimeout(() => { sim.noteOn(key, n, 50 + ((i * 23) % 70)); setTimeout(() => sim.noteOff(key, n), gapMs * 0.9) }, i * gapMs))
  },
  pedal(key: string, down: boolean) { sim.send(key, [0xB0, 64, down ? 127 : 0]) },
  bend(key: string, value14: number) { sim.send(key, [0xE0, value14 & 0x7F, (value14 >> 7) & 0x7F]) },
  // Pitch-bend wiggle, then back to centre
  wiggle(key: string) {
    const pts = [8192, 10500, 12800, 10500, 8192, 5900, 3600, 5900, 8192]
    pts.forEach((v, i) => setTimeout(() => sim.bend(key, v), i * 60))
  },
  modWheel(key: string, value: number) { sim.send(key, [0xB0, 1, value]) },
  aftertouch(key: string, value: number) { sim.send(key, [0xD0, value]) },
  // One key sent twice within a few ms — what the double-note filter catches
  doubleTrigger(key: string, note = 64) {
    sim.noteOn(key, note, 80)
    setTimeout(() => sim.noteOn(key, note, 78), 6)
    setTimeout(() => { sim.noteOff(key, note); sim.noteOff(key, note) }, 400)
  },
  // Key down, then the keyboard is unplugged before the key is released
  stuckNote(key: string, note = 67) {
    sim.noteOn(key, note, 90)
    setTimeout(() => sim.unplug(key), 300)
  },
  sentTo(key: string) { return _outputs.get(`sim-${key}-out-0`)?.sent ?? [] },
}

// Dev runs and test portables (npm run dist:portable builds in 'test-build'
// mode); in a release only after the hidden switch below
const DEV_TOOLS_KEY = 'orfeo-dev-tools'
let _unlocked = false
try { _unlocked = localStorage.getItem(DEV_TOOLS_KEY) === '1' } catch {}
export const simAvailable = import.meta.env.DEV || import.meta.env.MODE === 'test-build' || _unlocked

// Hidden switch, any build: Ctrl+Alt+Shift+D turns the dev tools on or off
// and reloads the window (deliberately undocumented: for the developer only)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey && e.shiftKey && e.code === 'KeyD') || e.repeat) return
    // AltGr is Ctrl+Alt to Windows: never fire while typing text
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return
    try { localStorage.setItem(DEV_TOOLS_KEY, _unlocked ? '0' : '1') } catch { return }
    location.reload()
  })
}

if (simAvailable && typeof navigator !== 'undefined' && navigator.requestMIDIAccess && !(window as any).__orfeoSimMidi) {
  const realRequest = navigator.requestMIDIAccess.bind(navigator)
  ;(navigator as any).requestMIDIAccess = async (opts?: MIDIOptions) => {
    let real: MIDIAccess | null = null
    try { real = await realRequest(opts) } catch {}
    const a = new SimAccess(real)
    _accesses.add(a)
    return a as unknown as MIDIAccess
  }
  ;(window as any).__orfeoSimMidi = sim
}
