import { create } from 'zustand'
import type { KeyRange } from '../utils/keyboardRange'
import type { KeyLightSetup } from '../utils/keyLights'

// ── MIDI keyboard settings + live device state ────────────────────────────────
// Kept apart from the main store: everything here is about the player's own
// keyboard, and the live part (activity lights, detected pedals) changes on
// every key press — a separate store keeps those updates from waking every
// main-store subscriber. Settings persist under one `midiSettings` key in
// orfeo-prefs.json.

export type LiveResponse = 'low' | 'balanced' | 'stable'
export type VelocityCurve = 'soft' | 'normal' | 'hard' | 'fixed'
export type ControlKind =
  | 'sustain' | 'sostenuto' | 'soft' | 'pitchBend' | 'modWheel'
  | 'channelPressure' | 'polyPressure' | 'expression' | 'volume'

export const CONTROL_KINDS: ControlKind[] = [
  'sustain', 'sostenuto', 'soft', 'pitchBend', 'modWheel', 'channelPressure', 'polyPressure', 'expression', 'volume',
]

export interface MidiPrefs {
  listenMode: 'all' | 'selected'
  selectedDevices: string[]       // device keys (cleaned model names) to listen to in 'selected' mode
  autoReconnect: boolean          // a re-plugged keyboard is listened to again without a click
  autoLowLatency: boolean         // Native: a keyboard plugged in switches to Exclusive, the last one out back to Shared
  liveResponse: LiveResponse
  latencyOffsetMs: number         // manual alignment on top of the measured output delay
  velocityCurve: VelocityCurve
  fixedVelocity: number           // 1-127, used by the 'fixed' curve
  minVelocity: number             // notes played softer than this are ignored (1 = none ignored)
  maxVelocity: number             // cap on the resulting loudness
  duplicateFilterMs: number       // 0 = off; a repeat of the same key within this window is dropped
  controls: Record<ControlKind, boolean>
  gmOutput: string                // '' = Orfeo's built-in General MIDI synth, else a MIDI output port name
  seenDevices: string[]           // keyboards that already got their first-connection Settings pop-up
  lastDevice: string              // last keyboard actually played
  keyRanges: Record<string, KeyRange> // device key -> its lowest and highest key, as the player pressed them
  rangeAsked: string[]            // keyboards already asked for their range (measured or skipped)
  keyLights: Record<string, KeyLightSetup> // device key -> how its key lights are driven (missing = utils/keyLights defaultSetup)
}

export const MIDI_DEFAULTS: MidiPrefs = {
  listenMode: 'all',
  selectedDevices: [],
  autoReconnect: true,
  autoLowLatency: true,
  liveResponse: 'low',
  latencyOffsetMs: 0,
  velocityCurve: 'normal',
  fixedVelocity: 100,
  minVelocity: 1,
  maxVelocity: 127,
  duplicateFilterMs: 0,
  // Volume is off: many controllers send CC7 from a fader meant for a DAW,
  // which would silently turn Orfeo down
  controls: {
    sustain: true, sostenuto: true, soft: true, pitchBend: true, modWheel: true,
    channelPressure: true, polyPressure: true, expression: true, volume: false,
  },
  gmOutput: '',
  seenDevices: [],
  lastDevice: '',
  keyRanges: {},
  rangeAsked: [],
  keyLights: {},
}

// The keyboard-range pop-up: which keyboard it's asking about. `test` (Dev
// Tools) takes keys from anywhere and saves nothing; a simulated keyboard
// (`sim`) is remembered for this session only, never in the prefs.
export interface RangePrompt { key: string; name: string; test?: boolean; sim?: boolean }

export interface MidiDeviceInfo {
  key: string             // cleaned model name — one entry per physical keyboard
  name: string            // what the user sees (maker + model)
  connected: boolean
  portIds: string[]
  virtual?: boolean       // a software port between apps (loopMIDI…), not a keyboard: listed in dev mode only
}

export interface MidiOutputInfo { port: string; name: string }

interface MidiLive {
  prefsLoaded: boolean
  accessError: string | null
  devices: MidiDeviceInfo[]
  outputs: MidiOutputInfo[]
  activeDevice: string                          // key of the keyboard last played (falls back to lastDevice)
  activity: Record<string, number>              // device key -> performance.now() of its last message
  detected: Partial<Record<ControlKind, boolean>> // seen at least once this session
  sustainDown: boolean
  diagVersion: number                           // bumped (throttled) when new timing samples arrive
  // Native engine: exclusive (Low latency) vs shared with other apps. Not saved:
  // off by default, on while a keyboard is connected (useNativeEngine.ts)
  nativeExclusive: boolean
  rangePrompt: RangePrompt | null
  simRanges: Record<string, KeyRange>  // simulated keyboards: session only, never saved
  simRangeAsked: string[]
  simKeyLights: Record<string, KeyLightSetup>  // simulated keyboards: session only, never saved
}

type MidiState = MidiPrefs & MidiLive & {
  set: (p: Partial<MidiPrefs>) => void
  resetPrefs: () => void
}

export const useMidiSettings = create<MidiState>((set) => ({
  ...MIDI_DEFAULTS,
  prefsLoaded: false,
  accessError: null,
  devices: [],
  outputs: [],
  activeDevice: '',
  activity: {},
  detected: {},
  sustainDown: false,
  diagVersion: 0,
  nativeExclusive: false,
  rangePrompt: null,
  simRanges: {},
  simRangeAsked: [],
  simKeyLights: {},
  set: (p) => set(p),
  // Keeps which keyboards already had their first-connection pop-up, and the
  // ranges measured for them — those describe the keyboards, not a preference
  resetPrefs: () => set(s => ({ ...MIDI_DEFAULTS, seenDevices: s.seenDevices, lastDevice: s.lastDevice, keyRanges: s.keyRanges, rangeAsked: s.rangeAsked, keyLights: s.keyLights })),
}))

// Same rule as utils/keyboardRange isKeyRange, kept here so this store loads nothing else
const validRange = (r: any): r is KeyRange =>
  !!r && Number.isInteger(r.low) && Number.isInteger(r.high) && r.low >= 0 && r.high <= 127 && r.low < r.high

const validLights = (l: any): l is KeyLightSetup =>
  !!l && ['off', 'notes', 'partykeys', 'fingers', 'onesmart', 'vangoa'].includes(l.mode) && Number.isInteger(l.channel) && l.channel >= 1 && l.channel <= 16

const PREF_KEYS = Object.keys(MIDI_DEFAULTS) as (keyof MidiPrefs)[]
const pickPrefs = (s: MidiPrefs): MidiPrefs =>
  Object.fromEntries(PREF_KEYS.map(k => [k, s[k]])) as unknown as MidiPrefs

// ── Load once at startup; anything missing or malformed falls back to the default
export const midiPrefsReady: Promise<void> = (async () => {
  try {
    const prefs = await window.electronAPI?.getPrefs?.()
    const saved = prefs?.midiSettings
    if (saved && typeof saved === 'object') {
      const merged: Partial<MidiPrefs> = {}
      for (const k of PREF_KEYS) {
        const d = MIDI_DEFAULTS[k], v = saved[k]
        if (v === undefined || typeof v !== typeof d || Array.isArray(d) !== Array.isArray(v)) continue
        ;(merged as any)[k] = k === 'controls' ? { ...MIDI_DEFAULTS.controls, ...v }
          : k === 'keyRanges' ? Object.fromEntries(Object.entries(v).filter(([, r]) => validRange(r)))
          : k === 'keyLights' ? Object.fromEntries(Object.entries(v).filter(([, l]) => validLights(l)))
          : v
      }
      useMidiSettings.setState(merged)
    }
  } catch {}
  useMidiSettings.setState({ prefsLoaded: true })
})()

// ── Save on change — only the settings, never the live state ───────────────
let _lastSaved = ''
let _saveTimer: ReturnType<typeof setTimeout> | null = null
const _unsub = useMidiSettings.subscribe((s) => {
  if (!s.prefsLoaded) return
  const json = JSON.stringify(pickPrefs(s))
  if (json === _lastSaved) return
  if (!_lastSaved) { _lastSaved = json; return } // first pass after load: nothing changed yet
  _lastSaved = json
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => { window.electronAPI?.setPrefs?.({ midiSettings: JSON.parse(json) }).catch(() => {}) }, 300)
})

// ── Velocity: curve, then the ignore-below floor is checked by the caller on
// the RAW velocity (what the player actually played), then the cap. ────────
export function shapeVelocity(raw: number, s: Pick<MidiPrefs, 'velocityCurve' | 'fixedVelocity' | 'maxVelocity'>): number {
  let v: number
  if (s.velocityCurve === 'fixed') v = s.fixedVelocity
  else {
    const x = Math.max(1, Math.min(127, raw)) / 127
    const exp = s.velocityCurve === 'soft' ? 0.6 : s.velocityCurve === 'hard' ? 1.6 : 1
    v = Math.round(Math.pow(x, exp) * 127)
  }
  return Math.max(1, Math.min(s.maxVelocity, v))
}

// ── Manual alignment added to every measured output delay (visuals, count-in,
// tap tempo). Never below zero in total — that would mean "before the sound".
export function latencyOffsetSec(): number {
  return useMidiSettings.getState().latencyOffsetMs / 1000
}

if (import.meta.hot) import.meta.hot.dispose(() => { _unsub(); if (_saveTimer) clearTimeout(_saveTimer) })
