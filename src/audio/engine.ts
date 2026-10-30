// ── One switchboard for "the sound engine that's on" ─────────────────────────
// The rest of Orfeo asks here — not the engines directly — for the output
// delay, mixer changes and master settings, so adding an engine never leaves
// an "if Samples … else General MIDI" somewhere quietly treating it as GM.

import { useStore } from '../store'
import * as samples from '../hooks/useSamplesEngine'
import * as gm from '../hooks/useAudioEngine'
import * as native from './useNativeEngine'

const engine = () => useStore.getState().audioEngine

/** Delay from "told to play" to "heard", including the user's manual offset (s) */
export function outputLatencySec(): number {
  const e = engine()
  return e === 'native' ? native.nativeOutputLatencySec() : e === 'samples' ? samples.getOutputLatencySec() : gm.getOutputLatencySec()
}
/** The device's own figure, without the manual offset (Settings readouts) */
export function measuredOutputLatencySec(): number {
  const e = engine()
  return e === 'native' ? native.nativeMeasuredLatencySec() : e === 'samples' ? samples.getMeasuredOutputLatencySec() : gm.getMeasuredOutputLatencySec()
}

// ── Channel strips (Console mixer) — General MIDI has no per-channel effects ──
export function setChannelVolume(ch: number, v: number) { engine() === 'native' ? native.nativeSetChannelVolume(ch, v) : samples.setChannelVolume(ch, v) }
export function setChannelPan(ch: number, v: number) { engine() === 'native' ? native.nativeSetChannelPan(ch, v) : samples.setChannelPan(ch, v) }
export function setChannelReverb(ch: number, v: number) { engine() === 'native' ? native.nativeSetChannelReverb(ch, v) : samples.setChannelReverb(ch, v) }
export function setChannelChorus(ch: number, v: number) { engine() === 'native' ? native.nativeSetChannelChorus(ch, v) : samples.setChannelChorus(ch, v) }

// ── Master strip ─────────────────────────────────────────────────────────────
// The master knobs as last turned (the Mixer keeps them in its own state) —
// Export to audio's "As I hear it" reads them. reverb/chorus null = untouched:
// each track's own amount plays.
const _knobs: { reverb: number | null; chorus: number | null; tone: number } = { reverb: null, chorus: null, tone: 0 }
export const masterKnobs = () => ({ ..._knobs })
export function setMasterReverb(v: number) { _knobs.reverb = v; engine() === 'native' ? native.nativeSetMasterReverb(v) : samples.setMasterReverb(v) }
export function setMasterChorus(v: number) { _knobs.chorus = v; engine() === 'native' ? native.nativeSetMasterChorus(v) : samples.setMasterChorus(v) }
export function setMasterTone(v: number) { _knobs.tone = v; engine() === 'native' ? native.nativeSetMasterTone(v) : samples.setMasterTone(v) }
export function setMasterCompressor(enabled: boolean, preset: number) {
  // both keep their state: switching engines later starts from the same setting
  samples.setMasterCompressor(enabled, preset)
  native.nativeSetMasterCompressor(enabled, preset)
}
export const COMPRESSOR_PRESETS = samples.COMPRESSOR_PRESETS

/** Engines whose mixer has per-channel effects and a master section */
export function hasMixerEffects(): boolean { return engine() !== 'gm' }
