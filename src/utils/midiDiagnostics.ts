// ── MIDI keyboard timing diagnostics + exportable performance log ────────────
// Per key press, two numbers measured on the real machine:
//  • input  — the system/Chromium received the key → Orfeo's handler started
//             (the MIDI event's own timestamp vs. performance.now(); this is
//             where a busy screen redraw would show up)
//  • handle — handler start → the note was handed to the synth
// The fixed parts (synth block, Orfeo's own chain, the output device) come
// from the engines. Nothing here is persisted; the log is for bug reports.

import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import {
  getMeasuredOutputLatencySec as samplesOut, getLiveChainDelaySec, getSynthBlockSec, getSamplesSampleRate,
} from '../hooks/useSamplesEngine'
import { getMeasuredOutputLatencySec as gmOut, getGmOutputName } from '../hooks/useAudioEngine'
import { useNativeAudio } from '../audio/nativeClient'
import { nativeMeasuredLatencySec } from '../audio/useNativeEngine'

interface NoteSample { at: number; inputMs: number | null; handleMs: number; note: number; vel: number; device: string }

const MAX = 500
// A key that really took a second to arrive couldn't be played at all, so a
// keyboard that sends such a stamp isn't stamping when its keys arrive, and
// none of its stamps count. Over Bluetooth MIDI on macOS every note carried
// the same stamp, so "input" just grew with the time played — under a
// second too, at first.
const MAX_PLAUSIBLE_INPUT_MS = 1000
const _samples: NoteSample[] = []
export const counters = { duplicatesDropped: 0, softIgnored: 0, stuckReleases: 0, disconnects: 0, messages: 0 }

let _bumpTimer: ReturnType<typeof setTimeout> | null = null
function bump() {
  if (_bumpTimer) return
  _bumpTimer = setTimeout(() => {
    _bumpTimer = null
    useMidiSettings.setState(s => ({ diagVersion: s.diagVersion + 1 }))
  }, 250)
}

export function recordNote(eventStamp: number, t0: number, t1: number, note: number, vel: number, device: string) {
  // A stamp of 0, or one "after" the handler started, means the browser gave
  // no usable receive time for this message — keep the handle part only
  const inputMs = eventStamp > 0 && eventStamp <= t0 ? t0 - eventStamp : null
  _samples.push({ at: t0, inputMs, handleMs: t1 - t0, note, vel, device })
  if (_samples.length > MAX) _samples.shift()
  bump()
}
export function countEvent(k: keyof typeof counters) { counters[k]++; if (k !== 'messages') bump() }

export function clearDiagnostics() {
  _samples.length = 0
  for (const k of Object.keys(counters) as (keyof typeof counters)[]) counters[k] = 0
  bump()
}

export interface TimingStats {
  notes: number
  implausibleInputs: number  // from keyboards with stamps too far back to be a delay (kept as-is in the log)
  lastInputMs: number | null; avgInputMs: number | null; worstInputMs: number | null
  avgHandleMs: number | null; worstHandleMs: number | null
}
export function getStats(): TimingStats {
  const stale = new Set(_samples.filter(s => s.inputMs !== null && s.inputMs > MAX_PLAUSIBLE_INPUT_MS).map(s => s.device))
  const stamped = _samples.filter(s => s.inputMs !== null)
  const inp = stamped.filter(s => !stale.has(s.device)).map(s => s.inputMs as number)
  const last = _samples.at(-1)
  const hnd = _samples.map(s => s.handleMs)
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
  const max = (a: number[]) => (a.length ? Math.max(...a) : null)
  return {
    notes: _samples.length,
    implausibleInputs: stamped.length - inp.length,
    lastInputMs: last && !stale.has(last.device) ? last.inputMs : null,
    avgInputMs: avg(inp), worstInputMs: max(inp), avgHandleMs: avg(hnd), worstHandleMs: max(hnd),
  }
}

// ── The fixed parts of key → ear for the current engine, in ms ──────────────
export interface DelayBreakdown {
  engine: 'gm' | 'samples' | 'native'
  synthBlockMs: number      // waiting for the synth's next 128-sample block (worst case)
  chainMs: number           // Orfeo's own processing (Samples: 0 on the live path, 12 through the compressors)
  outputMs: number | null   // the sound card / system output; null = can't be measured for this output
  externalOutput: string    // GM sent to a MIDI device instead of Orfeo's synth
}
export function getDelayBreakdown(): DelayBreakdown {
  const engine = useStore.getState().audioEngine
  if (engine === 'native') {
    // a key waits at most one engine period for its turn; nothing in Orfeo's chain delays it
    const s = useNativeAudio.getState().status
    const out = nativeMeasuredLatencySec()
    return { engine, synthBlockMs: s?.rate ? s.periodFrames * 1000 / s.rate : 0, chainMs: 0, outputMs: out > 0 ? out * 1000 : null, externalOutput: '' }
  }
  if (engine === 'samples') {
    const out = samplesOut()
    return { engine, synthBlockMs: getSynthBlockSec() * 1000, chainMs: getLiveChainDelaySec() * 1000, outputMs: out > 0 ? out * 1000 : null, externalOutput: '' }
  }
  const out = gmOut()
  const ext = getGmOutputName()
  return { engine, synthBlockMs: ext ? 0 : 128 / 48000 * 1000, chainMs: 0, outputMs: out > 0 && !ext ? out * 1000 : null, externalOutput: ext }
}

// ── Exportable performance log — JSON a player can attach to a bug report
export function buildPerformanceLog() {
  const m = useMidiSettings.getState()
  const prefs = Object.fromEntries(Object.entries(m).filter(([k, v]) => typeof v !== 'function' && !['activity', 'diagVersion', 'devices', 'outputs', 'detected'].includes(k)))
  return {
    kind: 'orfeo-midi-performance-log',
    version: 1,
    appVersion: __APP_VERSION__,
    createdAt: new Date().toISOString(),
    platform: navigator.userAgent,
    audioEngine: useStore.getState().audioEngine,
    sampleRate: getSamplesSampleRate() || null,
    nativeOutput: nativeOutputReport(),
    delay: getDelayBreakdown(),
    timing: getStats(),
    counters: { ...counters },
    devices: m.devices,
    outputs: m.outputs,
    detectedControls: m.detected,
    settings: prefs,
    notes: _samples.map(s => ({ ...s, at: Math.round(s.at), inputMs: s.inputMs === null ? null : +s.inputMs.toFixed(2), handleMs: +s.handleMs.toFixed(2) })),
  }
}

// The native engine's sound card connection: which card, mode, format, buffer,
// how fast the card really plays, and why it isn't in Low latency if it isn't
function nativeOutputReport() {
  const s = useNativeAudio.getState().status
  if (!s) return null
  const { channelPeaks: _p, masterPeak: _m, position: _pos, playing: _pl, ...rest } = s
  return { ...rest, lowLatencyOn: useMidiSettings.getState().nativeExclusive }
}

export function exportPerformanceLog() {
  const json = JSON.stringify(buildPerformanceLog(), null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  a.href = url
  a.download = `orfeo-midi-log-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
