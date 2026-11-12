// ── Key lights: the song's notes on the player's own keyboard ──────────────
// What lights: the song notes the on-screen keyboard is showing right now
// (shown, unmuted tracks, in their track or hand colour). Never the player's
// own key presses, which a lighted keyboard shows by itself. Each keyboard is
// driven its own way (Settings › MIDI Keyboard › Key lights, utils/keyLights.ts);
// only the changes are sent. Practice mode will later light the notes to play
// next through the same path.
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import {
  defaultSetup, noteLightMessages, parseRgb, partyKeysAllOff, partyKeysColours, partyKeysEnter, partyKeysExit,
  colourChanges, fingerLightMessages, fingersEnter, oneSmartEnter, oneSmartMessages, vangoaMessages,
  type KeyLightSetup, type LightHand, type Rgb,
} from '../utils/keyLights'
import { HAND_LH_CSS } from '../utils/handColors'
import { noteLightSent } from '../utils/keyLightEcho'
import { outputFor, deviceOf, isSimDevice, rangeOf } from './useMidiInput'

const HARDWARE_COLOR = 'var(--text-amber)'  // the player's own keys (useMidiInput)
const FALLBACK: Rgb = [232, 163, 61]         // amber, when a colour can't be read

export function lightSetupFor(key: string): KeyLightSetup {
  const m = useMidiSettings.getState()
  const d = deviceOf(key)
  const saved = d && isSimDevice(d) ? m.simKeyLights[key] : m.keyLights[key]
  return saved ?? defaultSetup(key)
}

export function setLightSetup(key: string, setup: KeyLightSetup): void {
  const m = useMidiSettings.getState()
  const d = deviceOf(key)
  if (d && isSimDevice(d)) useMidiSettings.setState({ simKeyLights: { ...m.simKeyLights, [key]: setup } })
  else useMidiSettings.setState({ keyLights: { ...m.keyLights, [key]: setup } })
}

// ── Colours: CSS colours (hex, or a theme variable) to RGB, cached ──────────
const _rgb = new Map<string, Rgb>()
function toRgb(css: string): Rgb {
  const hit = _rgb.get(css)
  if (hit) return hit
  let c = parseRgb(css)
  if (!c && typeof document !== 'undefined') {
    const el = document.createElement('span')
    el.style.color = css
    el.style.display = 'none'
    document.body.appendChild(el)
    c = parseRgb(getComputedStyle(el).color)
    el.remove()
  }
  const out = c ?? FALLBACK
  _rgb.set(css, out)
  return out
}

// ── What should be lit now ───────────────────────────────────────────────────
// A test run (Settings' Try it, Dev Tools) takes the place of the song briefly
let _test: Map<number, string> | null = null

function songLit(): Map<number, string> {
  if (_test) return _test
  const { activeKeys, activeKeyColors } = useStore.getState()
  const out = new Map<number, string>()
  for (const n of activeKeys) {
    const c = activeKeyColors.get(n)
    if (c && c !== HARDWARE_COLOR) out.set(n, c)
  }
  return out
}

// ── Per keyboard: what it's showing, and how ────────────────────────────────
interface Lit { setup: KeyLightSetup; port: MIDIOutput; notes: Map<number, Rgb>; hands: Map<number, LightHand>; entered: boolean }
const _lit = new Map<string, Lit>()

function send(key: string, port: MIDIOutput, bytes: number[]) {
  try { port.send(bytes) } catch (e) { console.warn('[Orfeo lights] send failed', key, e) }
}

// Everything dark on one keyboard, and PartyKeys gets its own lights back
function darken(key: string, l: Lit) {
  if (l.setup.mode === 'notes') {
    const msgs = noteLightMessages(l.notes.keys(), [], l.setup.channel)
    for (const m of msgs) send(key, l.port, m)
  } else if (l.setup.mode === 'partykeys' && l.entered) {
    send(key, l.port, partyKeysAllOff())
    send(key, l.port, partyKeysExit())
  } else if (l.setup.mode === 'fingers') {
    for (const m of fingerLightMessages(l.hands, new Map())) send(key, l.port, m)
  } else if (l.setup.mode === 'onesmart') {
    for (const m of oneSmartMessages(l.notes.keys(), [])) send(key, l.port, m)
  } else if (l.setup.mode === 'vangoa') {
    for (const m of vangoaMessages(l.notes.keys(), [])) send(key, l.port, m)
  }
  l.notes.clear()
  l.hands.clear()
  l.entered = false
}

function flush() {
  _scheduled = false
  const want = songLit()
  const devices = useMidiSettings.getState().devices
  const live = new Set<string>()
  for (const d of devices) {
    if (!d.connected) continue
    const setup = lightSetupFor(d.key)
    const prev = _lit.get(d.key)
    if (setup.mode === 'off') { if (prev) { darken(d.key, prev); _lit.delete(d.key) } continue }
    const port = outputFor(d.key)
    if (!port) continue
    live.add(d.key)
    let l = prev
    // A new keyboard, port or way of lighting: start from dark
    if (l && (l.port !== port || l.setup.mode !== setup.mode || l.setup.channel !== setup.channel)) { darken(d.key, l); l = undefined }
    if (!l) { l = { setup, port, notes: new Map(), hands: new Map(), entered: false }; _lit.set(d.key, l) }

    // Only the keys this keyboard has, when Orfeo knows them
    const r = rangeOf(d.key)
    const next = new Map<number, Rgb>()
    const hands = new Map<number, LightHand>()  // left only when the key shows the left-hand colour
    for (const [n, c] of want) if (!r || (n >= r.low && n <= r.high)) { next.set(n, toRgb(c)); hands.set(n, c === HAND_LH_CSS ? 'L' : 'R') }

    if (setup.mode === 'notes') {
      const msgs = noteLightMessages(l.notes.keys(), next.keys(), setup.channel)
      if (msgs.length) { noteLightSent(d.key, msgs); for (const m of msgs) send(d.key, port, m) }
    } else if (setup.mode === 'partykeys') {
      if (!l.entered) { send(d.key, port, partyKeysEnter()); send(d.key, port, partyKeysAllOff()); l.entered = true }
      const bytes = partyKeysColours(colourChanges(l.notes, next))
      if (bytes) send(d.key, port, bytes)
    } else if (setup.mode === 'fingers') {
      if (!l.entered) { send(d.key, port, fingersEnter()); l.entered = true }
      const msgs = fingerLightMessages(l.hands, hands)
      if (msgs.length) { noteLightSent(d.key, msgs); for (const m of msgs) send(d.key, port, m) }
    } else if (setup.mode === 'onesmart') {
      if (!l.entered) { for (const m of oneSmartEnter()) send(d.key, port, m); l.entered = true }
      for (const m of oneSmartMessages(l.notes.keys(), next.keys())) send(d.key, port, m)
    } else if (setup.mode === 'vangoa') {
      for (const m of vangoaMessages(l.notes.keys(), next.keys())) send(d.key, port, m)
    }
    l.notes = next
    l.hands = hands
  }
  // Unplugged or gone: forget it (nothing to send to)
  for (const k of [..._lit.keys()]) if (!live.has(k)) _lit.delete(k)
}

let _scheduled = false
function schedule() {
  if (_scheduled) return
  _scheduled = true
  // one update for every note that changes at the same moment; not tied to
  // screen redraws, which stop while Orfeo's window is in the background
  queueMicrotask(flush)
}

// ── Try it: a C major scale up the keyboard's middle, then dark ─────────────
export function tryKeyLights(): void {
  const notes = [60, 62, 64, 65, 67, 69, 71, 72]
  notes.forEach((n, i) => setTimeout(() => { _test = new Map([[n, '#e8a33d']]); schedule() }, i * 220))
  setTimeout(() => { _test = new Map(notes.map(n => [n, '#e8a33d'])); schedule() }, notes.length * 220)
  setTimeout(() => { _test = null; schedule() }, notes.length * 220 + 900)
}
// Dev Tools: a chord held for a moment
export function lightChordForTest(notes: number[], ms = 1500): void {
  _test = new Map(notes.map(n => [n, '#5b9bd5']))
  schedule()
  setTimeout(() => { _test = null; schedule() }, ms)
}

// ── Wiring ───────────────────────────────────────────────────────────────────
const _unsubSong = useStore.subscribe((s, p) => { if (s.activeKeys !== p.activeKeys || s.activeKeyColors !== p.activeKeyColors) schedule() })
const _unsubMidi = useMidiSettings.subscribe((s, p) => {
  if (s.devices !== p.devices || s.keyLights !== p.keyLights || s.simKeyLights !== p.simKeyLights || s.keyRanges !== p.keyRanges) schedule()
})
// Closing Orfeo leaves every keyboard dark
const onUnload = () => { for (const [k, l] of _lit) darken(k, l); _lit.clear() }
if (typeof window !== 'undefined') window.addEventListener('beforeunload', onUnload)

if (import.meta.hot) import.meta.hot.dispose(() => {
  _unsubSong(); _unsubMidi()
  if (typeof window !== 'undefined') window.removeEventListener('beforeunload', onUnload)
  onUnload()
})
