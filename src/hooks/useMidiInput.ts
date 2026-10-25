// ── Live input from the player's own MIDI keyboard(s) ─────────────────────────
// Uses the Web MIDI API (navigator.requestMIDIAccess), native in Electron's
// Chromium renderer. Each physical keyboard is one device (all its ports
// share a cleaned model name — see midiDeviceNames.ts). Which keyboards are
// listened to, touch response, pedals and filters come from Settings → MIDI
// Keyboard (store/midiSettings.ts).
//
// Order inside a note-on matters: the sound is triggered FIRST, straight from
// the MIDI handler, and only then the keyboard light / store update — a store
// update runs every subscriber synchronously, and none of that should sit
// between the key and the synth.

import { useEffect } from 'react'
import { useStore } from '../store'
import { isTapCapturing, registerTap } from '../utils/tapTempoSession'
import {
  useMidiSettings, midiPrefsReady, shapeVelocity, type ControlKind, type MidiDeviceInfo, type MidiOutputInfo,
} from '../store/midiSettings'
import { cleanPortName, displayName } from '../utils/midiDeviceNames'
import { recordNote, countEvent } from '../utils/midiDiagnostics'
import {
  liveNoteOn as samplesNoteOn, liveNoteOff as samplesNoteOff, liveControl as samplesControl,
  livePitchBend as samplesBend, liveChannelPressure as samplesChanPressure, livePolyPressure as samplesPolyPressure,
  liveReset as samplesReset,
} from './useSamplesEngine'
import { liveNoteOn as gmNoteOn, liveSend as gmSend, liveReset as gmReset } from './useAudioEngine'
import { nativeCall } from '../audio/nativeClient'
import { nativeLivePiano } from '../audio/useNativeEngine'

const HARDWARE_COLOR = 'var(--text-amber)'

// ── Module state — one MIDI connection for the app's lifetime ────────────────
let _access: MIDIAccess | null = null
let _accessP: Promise<void> | null = null
const _listeners = new Map<string, { port: MIDIInput; handler: (e: Event) => void }>()
const _portDevice = new Map<string, string>()          // input port id -> device key
const _known = new Map<string, MidiDeviceInfo>()        // every keyboard seen this session
const _held = new Map<string, Set<number>>()            // device key -> keys currently down
const _lastOn = new Map<string, number>()               // `${device}:${note}` -> time of last accepted note-on
const _swallow = new Map<string, number>()              // note-offs to ignore for dropped/ignored note-ons
// Keyboards that were unplugged while "Reconnect automatically" was off —
// not listened to again until Rescan
const _waitingForRescan = new Set<string>()

const isSamples = () => useStore.getState().audioEngine === 'samples'
const isNative = () => useStore.getState().audioEngine === 'native'
// Native engine: every live message goes to its live channel (16) as-is
const nativeLive = (status: number, d1: number, d2 = 0) => nativeCall('midi', (status & 0xF0) | 0x0F, d1, d2)

// Last value the keyboard sent per controller (cc number; -1 = pitch bend,
// -2 = keyboard aftertouch) — so an automatic reset only puts back what the
// keyboard actually moved, never a blanket "everything off" on a channel a
// song may also be playing on
const _ctrlNow = new Map<number, number>()
const NEUTRAL: Record<number, number> = { 64: 0, 66: 0, 67: 0, 1: 0, 11: 127, 7: 127, [-1]: 8192, [-2]: 0 }
function sendCtrl(cc: number, value: number) {
  if (cc === -1) { if (isNative()) nativeLive(0xE0, value & 0x7F, value >> 7); else if (isSamples()) samplesBend(value); else gmSend([0xEF, value & 0x7F, value >> 7]) }
  else if (cc === -2) { if (isNative()) nativeLive(0xD0, value); else if (isSamples()) samplesChanPressure(value); else gmSend([0xDF, value]) }
  else if (isNative()) nativeLive(0xB0, cc, value); else if (isSamples()) samplesControl(cc, value); else gmSend([0xBF, cc, value])
}
function settleControls() {
  for (const [cc, v] of _ctrlNow) if (NEUTRAL[cc] !== undefined && v !== NEUTRAL[cc]) sendCtrl(cc, NEUTRAL[cc])
  _ctrlNow.clear()
  if (useMidiSettings.getState().sustainDown) useMidiSettings.setState({ sustainDown: false })
}

function isListening(key: string): boolean {
  if (_waitingForRescan.has(key)) return false
  const s = useMidiSettings.getState()
  return s.listenMode === 'all' || s.selectedDevices.includes(key)
}

// ── Activity lights — at most one store update per 100 ms ────────────────────
const _pendingActivity = new Map<string, number>()
let _activityTimer: ReturnType<typeof setTimeout> | null = null
function markActivity(key: string, t: number) {
  _pendingActivity.set(key, t)
  if (_activityTimer) return
  _activityTimer = setTimeout(() => {
    _activityTimer = null
    const add = Object.fromEntries(_pendingActivity)
    _pendingActivity.clear()
    useMidiSettings.setState(s => ({ activity: { ...s.activity, ...add } }))
  }, 100)
}

// ── Sound + light for one key ─────────────────────────────────────────────────
function soundOn(note: number, vel: number) { if (isNative()) { nativeLivePiano(); nativeLive(0x90, note, vel) } else if (isSamples()) samplesNoteOn(note, vel); else gmNoteOn(note, vel) }
function soundOff(note: number) { if (isNative()) nativeLive(0x80, note); else if (isSamples()) samplesNoteOff(note); else gmSend([0x8F, note, 0]) }

function lightOn(note: number) {
  const { activeKeys, activeKeyColors, midiHeldKeys } = useStore.getState()
  const nk = new Set(activeKeys); nk.add(note)
  const nc = new Map(activeKeyColors); nc.set(note, HARDWARE_COLOR)
  const held = new Set(midiHeldKeys); held.add(note)
  useStore.setState({ activeKeys: nk, activeKeyColors: nc, midiHeldKeys: held })
}
function lightOff(notes: Iterable<number>) {
  const { activeKeys, activeKeyColors, midiHeldKeys } = useStore.getState()
  const nk = new Set(activeKeys), nc = new Map(activeKeyColors), held = new Set(midiHeldKeys)
  for (const n of notes) { nk.delete(n); nc.delete(n); held.delete(n) }
  useStore.setState({ activeKeys: nk, activeKeyColors: nc, midiHeldKeys: held })
}

function heldBy(key: string): Set<number> {
  let s = _held.get(key)
  if (!s) { s = new Set(); _held.set(key, s) }
  return s
}
const heldElsewhere = (key: string, note: number) => [..._held].some(([k, s]) => k !== key && s.has(note))

// ── Release everything one keyboard (or every keyboard) is holding ───────────
function releaseHeld(key?: string) {
  const keys = key ? [key] : [..._held.keys()]
  const released: number[] = []
  for (const k of keys) {
    const s = _held.get(k)
    if (!s) continue
    for (const n of s) if (!heldElsewhere(k, n)) { soundOff(n); released.push(n) }
    s.clear()
  }
  if (released.length) { lightOff(released); countEvent('stuckReleases') }
}

function setActive(key: string) {
  const s = useMidiSettings.getState()
  if (s.activeDevice === key && s.lastDevice === key) return
  useMidiSettings.setState({ activeDevice: key, lastDevice: key })
  publishTopBar()
}

// ── Note on / off ────────────────────────────────────────────────────────────
function noteOn(key: string, note: number, raw: number, stamp: number, t0: number) {
  // During a Tap Tempo session a key press is a tap, not a note
  if (isTapCapturing()) { registerTap(); return }
  const s = useMidiSettings.getState()
  const id = `${key}:${note}`
  if (raw < s.minVelocity) {
    _swallow.set(id, (_swallow.get(id) ?? 0) + 1); countEvent('softIgnored'); return
  }
  if (s.duplicateFilterMs > 0) {
    const last = _lastOn.get(id)
    if (last !== undefined && t0 - last < s.duplicateFilterMs) {
      _swallow.set(id, (_swallow.get(id) ?? 0) + 1); countEvent('duplicatesDropped'); return
    }
  }
  _lastOn.set(id, t0)
  const vel = shapeVelocity(raw, s)
  soundOn(note, vel)
  recordNote(stamp, t0, performance.now(), note, vel, key)
  heldBy(key).add(note)
  lightOn(note)
  setActive(key)
}

function noteOff(key: string, note: number) {
  const id = `${key}:${note}`
  const sw = _swallow.get(id)
  if (sw) { if (sw > 1) _swallow.set(id, sw - 1); else _swallow.delete(id); return }
  heldBy(key).delete(note)
  if (heldElsewhere(key, note)) return
  soundOff(note)
  lightOff([note])
}

// ── Pedals, wheels, pressure ─────────────────────────────────────────────────
const CC_KIND: Record<number, ControlKind> = { 64: 'sustain', 66: 'sostenuto', 67: 'soft', 1: 'modWheel', 11: 'expression', 7: 'volume' }

function detect(kind: ControlKind) {
  if (useMidiSettings.getState().detected[kind]) return
  useMidiSettings.setState(s => ({ detected: { ...s.detected, [kind]: true } }))
}

function control(cc: number, value: number) {
  const kind = CC_KIND[cc]
  if (!kind) return            // other knobs/pads are meant for DAWs — not forwarded
  detect(kind)
  if (kind === 'sustain') {
    const down = value >= 64
    if (useMidiSettings.getState().sustainDown !== down) useMidiSettings.setState({ sustainDown: down })
  }
  if (!useMidiSettings.getState().controls[kind]) return
  _ctrlNow.set(cc, value)
  sendCtrl(cc, value)
}

function pitchBend(lsb: number, msb: number) {
  detect('pitchBend')
  if (!useMidiSettings.getState().controls.pitchBend) return
  _ctrlNow.set(-1, lsb | (msb << 7))
  sendCtrl(-1, lsb | (msb << 7))
}

function channelPressure(value: number) {
  detect('channelPressure')
  if (!useMidiSettings.getState().controls.channelPressure) return
  _ctrlNow.set(-2, value)
  sendCtrl(-2, value)
}

function polyPressure(note: number, value: number) {
  detect('polyPressure')
  if (!useMidiSettings.getState().controls.polyPressure) return
  if (isNative()) nativeLive(0xA0, note, value); else if (isSamples()) samplesPolyPressure(note, value); else gmSend([0xAF, note, value])
}

// ── One incoming MIDI message ────────────────────────────────────────────────
function handleMessage(e: MIDIMessageEvent, portId: string) {
  const t0 = performance.now()
  const data = e.data
  if (!data || data.length < 1) return
  const status = data[0]
  if (status >= 0xF0) return  // clock / active sensing / sysex: not playing
  const key = _portDevice.get(portId)
  if (!key || !isListening(key)) return
  countEvent('messages')
  markActivity(key, t0)
  const type = status & 0xF0
  const d1 = data[1] ?? 0, d2 = data[2] ?? 0
  if (type === 0x90 && d2 > 0) noteOn(key, d1, d2, e.timeStamp, t0)
  else if (type === 0x80 || type === 0x90) noteOff(key, d1)
  else if (type === 0xB0) control(d1, d2)
  else if (type === 0xE0) pitchBend(d1, d2)
  else if (type === 0xD0) channelPressure(d1)
  else if (type === 0xA0) polyPressure(d1, d2)
}

// ── Devices ──────────────────────────────────────────────────────────────────
function attach(input: MIDIInput) {
  if (_listeners.has(input.id)) return
  const handler = (e: Event) => handleMessage(e as MIDIMessageEvent, input.id)
  input.addEventListener('midimessage', handler)
  _listeners.set(input.id, { port: input, handler })
}
function detachAll() {
  for (const { port, handler } of _listeners.values()) port.removeEventListener('midimessage', handler)
  _listeners.clear()
}

// What the top bar shows: the keyboard last played if it's still there,
// otherwise the first connected one that's listened to
function publishTopBar() {
  const m = useMidiSettings.getState()
  const connected = m.devices.filter(d => d.connected)
  const pick = connected.find(d => d.key === m.activeDevice)
    ?? connected.find(d => d.key === m.lastDevice)
    ?? connected.find(d => isListening(d.key))
    ?? connected[0]
  if (pick && m.activeDevice !== pick.key) useMidiSettings.setState({ activeDevice: pick.key })
  useStore.getState().setMidiDevice(!!pick, pick?.name ?? '')
}

function syncDevices() {
  const access = _access
  if (!access) return
  const present = new Map<string, MidiDeviceInfo>()
  access.inputs.forEach((input) => {
    const key = cleanPortName(input.name ?? '')
    _portDevice.set(input.id, key)
    const connected = input.state === 'connected'
    const d = present.get(key) ?? { key, name: displayName(key, input.manufacturer), connected: false, portIds: [] }
    d.connected ||= connected
    d.portIds.push(input.id)
    present.set(key, d)
    if (connected) { attach(input); if (input.connection !== 'open') input.open().catch(() => {}) }
  })

  const autoReconnect = useMidiSettings.getState().autoReconnect
  for (const [key, before] of _known) {
    const now = present.get(key)
    if (before.connected && !now?.connected) {
      // Unplugged: nothing it was holding may keep sounding, and a pedal it
      // left down comes up (unless another keyboard is still playing)
      releaseHeld(key)
      if (![...present.values()].some(d => d.connected && isListening(d.key))) settleControls()
      countEvent('disconnects')
      if (!autoReconnect) _waitingForRescan.add(key)
    }
  }
  for (const [key, d] of present) _known.set(key, d)
  for (const [key, d] of _known) if (!present.has(key)) _known.set(key, { ...d, connected: false })

  const outputs: MidiOutputInfo[] = []
  access.outputs.forEach((o) => {
    if (o.state !== 'connected' || !o.name) return
    outputs.push({ port: o.name, name: displayName(cleanPortName(o.name), o.manufacturer) })
  })

  useMidiSettings.setState({ devices: [..._known.values()], outputs })
  publishTopBar()
  firstConnectionPopup()
}

// ── First time a keyboard is ever connected: open Settings on its page, once
function firstConnectionPopup() {
  const m = useMidiSettings.getState()
  if (!m.prefsLoaded) return
  const fresh = m.devices.filter(d => d.connected && !m.seenDevices.includes(d.key))
  if (!fresh.length) return
  useMidiSettings.setState({ seenDevices: [...m.seenDevices, ...fresh.map(d => d.key)] })
  useStore.getState().openSettingsWindow('midi')
}

async function connect(): Promise<void> {
  if (!navigator.requestMIDIAccess) {
    useMidiSettings.setState({ accessError: 'MIDI is not available in this build.' })
    return
  }
  try {
    await midiPrefsReady
    const access = await navigator.requestMIDIAccess()
    if (_access) _access.onstatechange = null
    _access = access
    useMidiSettings.setState({ accessError: null })
    syncDevices()
    access.onstatechange = () => syncDevices()
  } catch (e) {
    console.warn('[Orfeo MIDI] Web MIDI access denied or unavailable:', e)
    useMidiSettings.setState({ accessError: String((e as any)?.message ?? e) })
  }
}

// ── Actions for Settings → MIDI Keyboard ─────────────────────────────────────

// Fresh device list from the system, and keyboards held back since their
// last unplug are listened to again
export async function rescanMidiDevices(): Promise<void> {
  _waitingForRescan.clear()
  detachAll()
  _portDevice.clear()
  await connect()
}

// Every key up, pedals up, wheels centred — on both engines (the button:
// a deliberate full reset of the live channel)
export function clearStuckNotes(): void {
  releaseHeld()
  _swallow.clear()
  _ctrlNow.clear()
  samplesReset(); gmReset()
  // Native: the live channel only — every key up, pedals up, wheels centred
  if (isNative()) { for (const [cc, v] of [[64, 0], [66, 0], [67, 0], [1, 0], [11, 127], [123, 0]]) nativeLive(0xB0, cc, v); nativeLive(0xE0, 0, 64) }
  const { activeKeyColors, midiHeldKeys } = useStore.getState()
  const hw = [...activeKeyColors].filter(([, c]) => c === HARDWARE_COLOR).map(([n]) => n)
  if (hw.length || midiHeldKeys.size) lightOff([...hw, ...midiHeldKeys])
  useMidiSettings.setState({ sustainDown: false })
}

// Clear stuck notes, forget what's been detected, reconnect from scratch
export async function resetMidiInput(): Promise<void> {
  clearStuckNotes()
  _lastOn.clear()
  _known.clear()
  useMidiSettings.setState({ detected: {}, activity: {}, devices: [] })
  await rescanMidiDevices()
}

// A keyboard no longer listened to must not leave its keys sounding
const _unsubListen = useMidiSettings.subscribe((s, prev) => {
  if (s.listenMode === prev.listenMode && s.selectedDevices === prev.selectedDevices) return
  for (const key of _held.keys()) if (!isListening(key)) releaseHeld(key)
  publishTopBar()
})

// ── Hook: connect once; release everything if the window is hidden ──────────
// (minimised mid-chord, a note-off can be missed; nothing should hang on return)
export function useMidiInput() {
  useEffect(() => {
    if (!_accessP) _accessP = connect()
    const onHide = () => { if (document.visibilityState === 'hidden') { releaseHeld(); settleControls() } }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])
}

if (import.meta.hot) import.meta.hot.dispose(() => { detachAll(); if (_access) _access.onstatechange = null; _unsubListen() })
