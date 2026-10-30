// ── Export to audio: the Native sound ───────────────────────────────────────
// Sends an ExportSong to the native engine's offline renderer (a fresh
// FluidSynth on its own thread in the audio process — never the live engine)
// and gets the stereo result back. Events are packed exactly as sendSong()
// packs the live song; the master gain carries NATIVE_BOOST as live.
import type { ExportSong } from './exportSong'
import { EXPORT_RATE, TAIL_SEC, type Stereo } from './exportEncode'
import { nativeRenderOffline } from './nativeClient'
import { NATIVE_BOOST } from './useNativeEngine'

export interface NativeJob {
  job: {
    fluidDir: string; soundfonts: string[]; sampleRate: number; tailSec: number
    channels: ({ volume: number; pan: number; reverb: number; chorus: number } | null)[]
    masterGain: number; toneDb: number; compEnabled: boolean; compPreset: number
  }
  times: Float64Array; tracks: Uint16Array; bytes: Uint8Array; trackCount: number; duration: number
}

export function packNativeJob(song: ExportSong, o: { fluidDir: string; soundfonts: string[]; masterGain: number }): NativeJob {
  const n = song.events.length
  const times = new Float64Array(n), tracks = new Uint16Array(n), bytes = new Uint8Array(n * 3)
  song.events.forEach((e, i) => { times[i] = e.time; tracks[i] = e.track; bytes[3 * i] = e.status; bytes[3 * i + 1] = e.d1; bytes[3 * i + 2] = e.d2 })
  return {
    job: {
      fluidDir: o.fluidDir, soundfonts: o.soundfonts, sampleRate: EXPORT_RATE, tailSec: TAIL_SEC,
      channels: song.channels.map(c => c ? { ...c } : null),
      masterGain: o.masterGain, toneDb: song.master.toneDb, compEnabled: song.master.comp.enabled, compPreset: song.master.comp.preset,
    },
    times, tracks, bytes, trackCount: song.trackCount, duration: song.duration,
  }
}

/** The song through the Native engine, offline; empty when cancelled. The
 *  audio process fills in its own FluidSynth folder. */
export async function renderNative(song: ExportSong, soundfonts: string[], onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
  const packed = packNativeJob(song, { fluidDir: '', soundfonts, masterGain: song.master.gain * NATIVE_BOOST })
  const out = await nativeRenderOffline(packed, onProgress, isCancelled)
  return out ? { l: out[0], r: out[1], rate: EXPORT_RATE } : { l: new Float32Array(0), r: new Float32Array(0), rate: EXPORT_RATE }
}
