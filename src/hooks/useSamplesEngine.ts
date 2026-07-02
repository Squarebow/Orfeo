// ── Samples audio engine — spessasynth_lib + GeneralUser GS SF2 ──────────────
// Self-gates on audioEngine !== 'samples'. Loads the soundfont once via fetch
// and caches the synth for the lifetime of the app.
//
// WorkletSynthesizer is imported DYNAMICALLY inside initSamplesEngine so that
// spessasynth_lib is never bundled at app startup (prevents Vite dep-
// optimisation reload when spessasynth_core is encountered for the first time).

import { useEffect } from 'react'
import type { WorkletSynthesizer } from 'spessasynth_lib'
import { useStore } from '../store'

// ── GeneralUser GS outputs at a lower reference level than jzz-synth-tiny.
// This constant normalises perceived loudness at equal masterVolume settings.
const SAMPLES_BOOST = 3.0

// ── Module-level singletons ───────────────────────────────────────────────────
let _ctx: AudioContext | null = null
let _gainNode: GainNode | null = null
// type-only — runtime reference populated after dynamic import
let _synth: WorkletSynthesizer | null = null
let _synthInitP: Promise<void> | null = null
let _synthReady = false

// ── Per-note key-light timers ─────────────────────────────────────────────────
const _keyTimers = new Map<number, ReturnType<typeof setTimeout>>()

// ── setTimeout handles for the note schedule ──────────────────────────────────
const _schedule: ReturnType<typeof setTimeout>[] = []

// ── Light a single piano key for durMs then extinguish ───────────────────────
function lightKey(midiNum: number, color: string, durMs: number) {
  const existing = _keyTimers.get(midiNum)
  if (existing) clearTimeout(existing)
  const { activeKeys, activeKeyColors } = useStore.getState()
  const nk = new Set(activeKeys); nk.add(midiNum)
  const nc = new Map(activeKeyColors); nc.set(midiNum, color)
  useStore.setState({ activeKeys: nk, activeKeyColors: nc })
  const timer = setTimeout(() => {
    _keyTimers.delete(midiNum)
    const { activeKeys: k, activeKeyColors: c } = useStore.getState()
    const nk2 = new Set(k); nk2.delete(midiNum)
    const nc2 = new Map(c); nc2.delete(midiNum)
    useStore.setState({ activeKeys: nk2, activeKeyColors: nc2 })
  }, Math.max(50, durMs))
  _keyTimers.set(midiNum, timer)
}

// ── Clear all active key lights ───────────────────────────────────────────────
function clearAllKeys() {
  _keyTimers.forEach(t => clearTimeout(t))
  _keyTimers.clear()
  useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
}

// ── Cancel all pending note timeouts and silence the synth ───────────────────
function clearSchedule() {
  _schedule.forEach(t => clearTimeout(t))
  _schedule.length = 0
  try { _synth?.stopAll(true) } catch {}
}

// ── Send CC7=127 (max volume) to every MIDI channel ──────────────────────────
// The gain node controls master level; CC7 controls the synth's internal level.
function applyChannelVolumes() {
  if (!_synth) return
  for (let ch = 0; ch < 16; ch++) {
    try { ;(_synth as any).controllerChange(ch, 7, 127) } catch {}
  }
}

// ── Initialise AudioContext + worklet + synth + soundfont ─────────────────────
// onProgress receives 0..1 as the SF2 fetch progresses.
// WorkletSynthesizer is imported dynamically here to prevent Vite from bundling
// spessasynth_lib at startup, which triggered a dep-optimisation page reload.
export async function initSamplesEngine(onProgress: (p: number) => void): Promise<void> {
  if (_synthReady) return
  if (_synthInitP) return _synthInitP

  _synthInitP = (async () => {
    try {
      _ctx = new AudioContext()

      // ── Worklet: use ./ relative path so it resolves correctly in both dev
      // (http://localhost:5173/spessasynth_processor.min.js) and packaged
      // (file:///…/app.asar/out/renderer/spessasynth_processor.min.js).
      // Leading / resolves to filesystem root in file:// and breaks in packaged.
      // The file must also be in asarUnpack — AudioWorklet.addModule() bypasses
      // Electron's asar protocol handler and needs the real filesystem path.
      const workletUrl = new URL('./spessasynth_processor.min.js', location.href).href
      console.log('[Orfeo Samples] loading worklet from:', workletUrl)
      await _ctx.audioWorklet.addModule(workletUrl)

      // Dynamic import keeps spessasynth_lib out of the initial bundle
      const { WorkletSynthesizer } = await import('spessasynth_lib')
      _synth = new WorkletSynthesizer(_ctx)
      await _synth.isReady

      // ── SF2: same relative-path fix; fetch() goes through Electron's file://
      // protocol handler which supports asar, so no asarUnpack needed here.
      const sf2Url = new URL('./GeneralUser-GS.sf2', location.href).href
      console.log('[Orfeo Samples] fetching SF2 from:', sf2Url)
      const response = await fetch(sf2Url)
      if (!response.ok) throw new Error(`SF2 fetch failed: ${response.status} (url: ${sf2Url})`)
      const total = Number(response.headers.get('content-length') ?? 0)
      const reader = response.body!.getReader()
      const chunks: Uint8Array[] = []
      let loaded = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) { chunks.push(value); loaded += value.byteLength }
        if (total > 0) onProgress(loaded / total)
      }
      const buffer = new Uint8Array(loaded)
      let offset = 0
      for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength }

      await _synth.soundBankManager.addSoundBank(buffer.buffer, 'GeneralUser-GS')

      // Set all channels to max internal volume; gain node handles master level
      applyChannelVolumes()

      // Wire gain node — apply SAMPLES_BOOST so perceived level matches GM Synth
      _gainNode = _ctx.createGain()
      _gainNode.gain.value = useStore.getState().masterVolume * SAMPLES_BOOST
      _synth.connect(_gainNode)
      _gainNode.connect(_ctx.destination)

      _synthReady = true
      onProgress(1)
      console.log('[Orfeo Samples] spessasynth ready')
    } catch (e: any) {
      _synthInitP = null
      console.error('[Orfeo Samples] init error:', e?.message ?? e)
      throw e
    }
  })()
  return _synthInitP
}

// ── Schedule all MIDI notes from store for playback starting at startSec ──────
// usePlayback.ts handles currentTime tracking and end-of-song detection —
// this function only handles note-on/off scheduling and key lighting.
function buildSamplesPlayer(startSec: number) {
  if (!_synthReady || !_synth) return
  clearSchedule(); clearAllKeys()
  applyChannelVolumes()

  const { midi, tracks, bpm, originalBpm, detectedKey } = useStore.getState()
  const midiData = midi as any
  if (!midiData) return

  const transpose = detectedKey?.transpose ?? 0
  const ratio = bpm / originalBpm
  const hasSolo = tracks.some(t => t.solo)

  // Send programChange for each active track
  for (const track of midiData.tracks) {
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || ts.muted || !ts.visible || (hasSolo && !ts.solo)) continue
    if (!track.isDrum) {
      try { _synth.programChange(track.channel, ts.program) } catch {}
    }
  }

  // Schedule noteOn / noteOff / key lights via setTimeout
  for (const track of midiData.tracks) {
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || ts.muted || !ts.visible || (hasSolo && !ts.solo)) continue
    const color = ts.color ?? '#e8a027'
    const ch = track.channel

    for (const note of track.notes) {
      const noteStart = note.time / ratio
      if (noteStart < startSec) continue
      const delay = (noteStart - startSec) * 1000
      const durMs = Math.max(note.duration / ratio * 1000, 50)
      const midiNum = note.midi + transpose

      const t = setTimeout(() => {
        if (!_synth) return
        try {
          _synth.noteOn(ch, midiNum, Math.round(note.velocity * 127))
          const offT = setTimeout(() => { try { _synth?.noteOff(ch, midiNum) } catch {} }, durMs)
          _schedule.push(offT)
          if (ts.showOnKeyboard) lightKey(midiNum, color, Math.min(durMs + 80, 2500))
        } catch (e) {
          console.error('[Orfeo Samples] noteOn error:', e)
        }
      }, delay)
      _schedule.push(t)
    }
  }
}

// ── Hook: self-gates on audioEngine !== 'samples' ────────────────────────────
export function useSamplesEngine() {
  // ── Register global click-to-play handler ────────────────────────────────
  useEffect(() => {
    ;(window as any).__orfeoPlayNoteSamples = (midiNum: number, vel: number, durMs: number) => {
      if (!_synth || !_synthReady) return
      _synth.programChange(15, 0)
      ;(_synth as any).controllerChange(15, 7, 127)
      _synth.noteOn(15, midiNum, Math.round(vel * 127))
      setTimeout(() => _synth?.noteOff(15, midiNum), durMs)
      lightKey(midiNum, '#e8a027', durMs + 100)
    }
    return () => { delete (window as any).__orfeoPlayNoteSamples }
  }, [])

  // ── Subscribe to playback state and engine changes ───────────────────────
  useEffect(() => {
    let prevState = useStore.getState().playbackState as string
    let prevAudioEngine = useStore.getState().audioEngine
    let prevBpm = useStore.getState().bpm
    let prevTranspose = useStore.getState().detectedKey?.transpose ?? 0
    let prevTracks = useStore.getState().tracks

    const unsub = useStore.subscribe((state) => {
      const engineChanged = state.audioEngine !== prevAudioEngine
      const prevEngine = prevAudioEngine

      // CRITICAL: update ALL prev values BEFORE any calls that may trigger
      // useStore.setState so that recursive subscriber re-entries see the
      // updated values and skip spurious actions (infinite recursion guard).
      const pp = prevState
      prevState = state.playbackState
      prevAudioEngine = state.audioEngine

      if (state.audioEngine !== 'samples') {
        // Engine leaving 'samples' — stop all scheduled notes immediately
        if (prevEngine === 'samples') {
          clearSchedule(); clearAllKeys()
        }
        return
      }

      const ps = state.playbackState
      const bpmChanged = state.bpm !== prevBpm
      const transposeChanged = (state.detectedKey?.transpose ?? 0) !== prevTranspose
      const tracksChanged = state.tracks !== prevTracks

      prevBpm = state.bpm
      prevTranspose = state.detectedKey?.transpose ?? 0
      prevTracks = state.tracks

      if (engineChanged && ps === 'playing') {
        // Engine just switched TO samples while playback is active
        buildSamplesPlayer(state.currentTime)
      } else if (ps === 'playing' && pp !== 'playing') {
        buildSamplesPlayer(state.currentTime)
      } else if (ps === 'paused' && pp === 'playing') {
        clearSchedule(); clearAllKeys()
      } else if (ps === 'stopped' && pp !== 'stopped') {
        clearSchedule(); clearAllKeys()
      } else if (ps === 'playing' && (bpmChanged || transposeChanged || tracksChanged)) {
        buildSamplesPlayer(state.currentTime)
      }
    })
    return () => { unsub(); clearSchedule(); clearAllKeys() }
  }, [])

  // ── Live master volume changes via GainNode ───────────────────────────────
  useEffect(() => {
    let prevVol = useStore.getState().masterVolume
    const unsub = useStore.subscribe((state) => {
      if (state.audioEngine !== 'samples') return
      if (state.masterVolume === prevVol) return
      prevVol = state.masterVolume
      if (_gainNode) _gainNode.gain.value = state.masterVolume * SAMPLES_BOOST
    })
    return () => unsub()
  }, [])
}
