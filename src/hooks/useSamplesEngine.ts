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
import { pushHitEffect, amberHex } from '../utils/hitEffectQueue'
import { isHomogeneousHandTrack, resolveHandAwareColor } from '../utils/handColors'
import { NES } from '../utils/noteEditorState'

// ── Live edit-buffer awareness — mirrors useAudioEngine.ts's activeMidiData().
// Gated on NES.dirty, not just NES.editMidi being non-null — the edit buffer
// exists the instant edit mode opens, before any real edit happens, and
// routing through it unconditionally broke audio the moment the toolbar
// opened (see useAudioEngine.ts for the full explanation). Only reroute once
// there's an actual edit worth protecting. ─────────────────────────────────
function activeMidiData(): any {
  return (NES.dirty && NES.editMidi) ? NES.editMidi : useStore.getState().midi
}

// ── GeneralUser GS outputs at a lower reference level than jzz-synth-tiny.
// This constant normalises perceived loudness at equal masterVolume settings.
const SAMPLES_BOOST = 3.0

// ── Master compressor/limiter presets — each position bundles threshold,
// ratio, attack, AND release together, not just a ratio sweep with threshold
// fixed. A fixed threshold with only ratio changing either barely engages at
// low ratio or over-triggers at high ratio, so the 5 positions wouldn't
// actually sound distinct from each other. Index matches masterCompPreset
// in the store. Release fixed at 250ms across all — attack is what changes
// the felt character between "gentle glue" and "hard limiter". ─────────────
interface CompPreset { threshold: number; ratio: number; attack: number; knee: number; label: string }
export const COMPRESSOR_PRESETS: CompPreset[] = [
  { label: 'Safety',  threshold: -1,  ratio: 2,  attack: 0.010, knee: 10 },
  { label: 'Gentle',  threshold: -6,  ratio: 4,  attack: 0.008, knee: 8 },
  { label: 'Medium',  threshold: -12, ratio: 8,  attack: 0.005, knee: 6 },
  { label: 'Firm',    threshold: -18, ratio: 14, attack: 0.003, knee: 3 },
  { label: 'Limiter', threshold: -24, ratio: 20, attack: 0.003, knee: 0 },
]
const COMPRESSOR_RELEASE = 0.25

// ── Module-level singletons ───────────────────────────────────────────────────
let _ctx: AudioContext | null = null
let _gainNode: GainNode | null = null
// High-shelf BiquadFilter for master tone control (Samples engine only)
let _filterNode: BiquadFilterNode | null = null
// Master compressor/limiter — inserted last in the chain, right before
// destination, so it catches whatever the gain/tone stages produce.
let _compNode: DynamicsCompressorNode | null = null
// type-only — runtime reference populated after dynamic import
let _synth: WorkletSynthesizer | null = null
let _synthInitP: Promise<void> | null = null
let _synthReady = false
// ch 15 = collision risk if a loaded MIDI file uses channel 16; accepted tradeoff
let _hwChannelReady = false
// ── Extra downloadable soundfont currently layered over GeneralUser-GS ──────
// null = only the bundled default is loaded. See loadSelectedSoundfont().
let _activeExtraBankId: string | null = null
// ── Tracks which channels have had programChange sent since last buildSamplesPlayer ──
// SpessaSynth defaults every channel to program 0 (piano). Before first playback,
// edit-mode clicks must send programChange themselves — this set prevents redundant calls.
const _samplesChanInit = new Set<number>()

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
  pushHitEffect(midiNum, color)
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

// ── One-time hardware-input channel setup — program 0, full volume on ch 15 ──
function ensureHwChannel() {
  if (_hwChannelReady || !_synth) return
  try {
    _synth.programChange(15, 0)
    ;(_synth as any).controllerChange(15, 7, 127)
    _hwChannelReady = true
  } catch {}
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

      // High-shelf tone control — inserted between gain and destination
      _filterNode = _ctx.createBiquadFilter()
      _filterNode.type = 'highshelf'
      _filterNode.frequency.value = 3000
      _filterNode.gain.value = 0  // flat at center position

      // Master compressor/limiter — last stage before destination. Always
      // created and wired in; "off" is a real transparent state (ratio 1:1,
      // threshold 0dB — mathematically a no-op, never reduces gain) rather
      // than disconnecting/reconnecting the graph on every toggle.
      _compNode = _ctx.createDynamicsCompressor()
      _compNode.release.value = COMPRESSOR_RELEASE
      {
        const { masterCompEnabled, masterCompPreset } = useStore.getState()
        setMasterCompressor(masterCompEnabled, masterCompPreset)
      }

      _synth.connect(_gainNode)
      _gainNode.connect(_filterNode)
      _filterNode.connect(_compNode)
      _compNode.connect(_ctx.destination)

      _synthReady = true
      onProgress(1)
      console.log('[Orfeo Samples] spessasynth ready')

      const wanted = useStore.getState().selectedSoundfont
      if (wanted !== 'generaluser-gs') loadSelectedSoundfont(wanted).catch(() => {})
    } catch (e: any) {
      _synthInitP = null
      console.error('[Orfeo Samples] init error:', e?.message ?? e)
      throw e
    }
  })()
  return _synthInitP
}

// ── Swap the active soundfont — 'generaluser-gs' is the bundled default and
// always stays loaded; the other IDs are downloaded extras read from userData
// via IPC and layered on top with higher priority. GeneralUser-GS remains as
// fallback for any preset the extra bank doesn't cover.
export async function loadSelectedSoundfont(id: string): Promise<void> {
  if (!_synth || !_synthReady) return
  if (id === _activeExtraBankId || (id === 'generaluser-gs' && !_activeExtraBankId)) return

  if (_activeExtraBankId) {
    try { await _synth.soundBankManager.deleteSoundBank(_activeExtraBankId) } catch {}
    _activeExtraBankId = null
  }
  if (id === 'generaluser-gs') return

  const raw = await window.electronAPI.readSoundfont(id as any)
  if (!raw) { console.warn('[Orfeo Samples] soundfont not downloaded:', id); return }
  const bytes = new Uint8Array(raw)
  await _synth.soundBankManager.addSoundBank(bytes.buffer, id)
  _synth.soundBankManager.priorityOrder = [id, 'GeneralUser-GS']
  _activeExtraBankId = id
}

// ── Schedule all MIDI notes from store for playback starting at startSec ──────
// usePlayback.ts handles currentTime tracking and end-of-song detection —
// this function only handles note-on/off scheduling and key lighting.
function buildSamplesPlayer(startSec: number) {
  if (!_synthReady || !_synth) return
  clearSchedule(); clearAllKeys()
  applyChannelVolumes()

  const { tracks, bpm, originalBpm, detectedKey, hitEffectScope, showHandLabels, handLabelMode, noteEditorActive } = useStore.getState()
  const midiData = activeMidiData()
  if (!midiData) return

  const transpose = detectedKey?.transpose ?? 0
  const ratio = bpm / originalBpm
  const hasSolo = tracks.some(t => t.solo)
  const performanceMode = handLabelMode === 'performance'
  // Note Editor's own Hand toggle governs key-light coloring while editing —
  // same split as the piano roll, see useAudioEngine.ts's identical fix.
  const effectiveShowHandLabels = showHandLabels || (noteEditorActive && NES.reassignHandsMode)

  // Send programChange for each active track — also marks channels as initialized
  // so edit-mode lazy init doesn't redundantly override them.
  _samplesChanInit.clear()
  for (const track of midiData.tracks) {
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || ts.muted || (hasSolo && !ts.solo)) continue
    if (!track.isDrum) {
      try { _synth.programChange(track.channel, ts.program) } catch {}
      _samplesChanInit.add(track.channel)
    }
  }

  // Schedule noteOn / noteOff / key lights via setTimeout
  for (const track of midiData.tracks) {
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || ts.muted || (hasSolo && !ts.solo)) continue
    const defaultColor = ts.color ?? amberHex()
    const homogeneousTrack = isHomogeneousHandTrack(track.notes)
    const ch = track.channel

    for (const note of track.notes) {
      const noteStart = note.time / ratio
      if (noteStart < startSec) continue
      const delay = (noteStart - startSec) * 1000
      const durMs = Math.max(note.duration / ratio * 1000, 40)
      const midiNum = note.midi + transpose
      const color = resolveHandAwareColor(note, defaultColor, { homogeneousTrack, showHandLabels: effectiveShowHandLabels, performanceMode })

      const t = setTimeout(() => {
        if (!_synth) return
        try {
          _synth.noteOn(ch, midiNum, Math.round(note.velocity * 127))
          const offT = setTimeout(() => { try { _synth?.noteOff(ch, midiNum) } catch {} }, durMs)
          _schedule.push(offT)
          if (ts.showOnKeyboard) lightKey(midiNum, color, Math.min(durMs + 30, 2500))
          else if (hitEffectScope === 'all') pushHitEffect(midiNum, color)
        } catch (e) {
          console.error('[Orfeo Samples] noteOn error:', e)
        }
      }, delay)
      _schedule.push(t)
    }
  }
}

// ── setMasterChorus — broadcast CC93 to all 16 channels (Samples engine only) ─
export function setMasterChorus(value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(Math.max(0, Math.min(1, value)) * 127)
  for (let ch = 0; ch < 16; ch++) {
    try { ;(_synth as any).controllerChange(ch, 93, val) } catch {}
  }
}

// ── setMasterReverb — broadcast CC91 to all 16 channels (Samples engine only) ─
export function setMasterReverb(value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(Math.max(0, Math.min(1, value)) * 127)
  for (let ch = 0; ch < 16; ch++) {
    try { ;(_synth as any).controllerChange(ch, 91, val) } catch {}
  }
}

// ── setMasterPan — broadcast CC10 to all 16 channels (Samples engine only) ────
// value: −1…+1 (bipolar knob); 0 = center; maps to CC10 0–127 (64 = center)
export function setMasterPan(value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(((value + 1) / 2) * 127)
  for (let ch = 0; ch < 16; ch++) {
    try { ;(_synth as any).controllerChange(ch, 10, val) } catch {}
  }
}

// ── setMasterTone — adjust high-shelf filter gain ±12 dB (Samples engine only) ─
// value: −1…+1 (bipolar knob); 0 = flat; +1 = +12 dB treble boost
export function setMasterTone(value: number): void {
  if (!_filterNode) return
  _filterNode.gain.value = value * 12
}

// ── setMasterCompressor — called on/off/preset change from MasterStrip, and
// once at init time with the store's starting values. "Off" sets ratio 1:1 /
// threshold 0dB, a real transparent no-op (never reduces gain) rather than a
// bypass-via-reconnect — avoids rewiring the graph on every toggle. ────────
export function setMasterCompressor(enabled: boolean, preset: number): void {
  if (!_compNode) return
  const p = enabled ? COMPRESSOR_PRESETS[preset] : null
  const now = _compNode.context.currentTime
  const threshold = p ? p.threshold : 0
  const ratio     = p ? p.ratio     : 1
  const attack    = p ? p.attack    : 0.003
  const knee      = p ? p.knee      : 0
  _compNode.threshold.setTargetAtTime(threshold, now, 0.01)
  _compNode.ratio.setTargetAtTime(ratio, now, 0.01)
  _compNode.attack.setTargetAtTime(attack, now, 0.01)
  _compNode.knee.setTargetAtTime(knee, now, 0.01)
}

// ── getMasterCompReduction — live gain reduction in dB (0 = none, negative =
// reducing), for the master-knob/track-fader visual-dip gimmick. Real-time,
// unsmoothed — callers should lerp toward this each frame, not use it raw. ──
export function getMasterCompReduction(): number {
  return _compNode?.reduction ?? 0
}

// ── setChannelChorus — CC93 on a single MIDI channel (Samples engine only) ────
// ch: track.channel from the parsed MIDI file (0-based, NOT trackIndex)
export function setChannelChorus(ch: number, value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(Math.max(0, Math.min(1, value)) * 127)
  try { ;(_synth as any).controllerChange(ch, 93, val) } catch {}
}

// ── setChannelReverb — CC91 on a single MIDI channel (Samples engine only) ────
export function setChannelReverb(ch: number, value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(Math.max(0, Math.min(1, value)) * 127)
  try { ;(_synth as any).controllerChange(ch, 91, val) } catch {}
}

// ── setChannelPan — CC10 on a single MIDI channel (Samples engine only) ───────
// value: −1…+1 (bipolar knob); 0 = center; maps to CC10 0–127 (64 = center)
export function setChannelPan(ch: number, value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(((value + 1) / 2) * 127)
  try { ;(_synth as any).controllerChange(ch, 10, val) } catch {}
}

// ── setChannelVolume — CC7 on a single MIDI channel (Samples engine only) ─────
// value: 0…1 (fader); maps to CC7 0–127
export function setChannelVolume(ch: number, value: number): void {
  if (!_synth || !_synthReady) return
  const val = Math.round(Math.max(0, Math.min(1, value)) * 127)
  try { ;(_synth as any).controllerChange(ch, 7, val) } catch {}
}

// ── Hook: self-gates on audioEngine !== 'samples' ────────────────────────────
export function useSamplesEngine() {
  // ── Register global click-to-play and hardware note-on/off handlers ─────────
  useEffect(() => {
    // channel: MIDI channel 0-based. Undefined = dedicated preview channel (15).
    // visual = false skips the timed key-light — glissando drives the keyboard
    // light itself (instant swap, no fade timer) instead of this note-duration ring.
    ;(window as any).__orfeoPlayNoteSamples = (midiNum: number, vel: number, durMs: number, channel?: number, visual = true, color?: string) => {
      if (!_synth || !_synthReady) return
      const ch = channel ?? 15
      if (ch === 15) {
        ensureHwChannel()
      } else if (!_samplesChanInit.has(ch)) {
        // SpessaSynth defaults all channels to program 0 (piano).
        // Send programChange now — buildSamplesPlayer hasn't run yet (pre-first-play).
        const midi = useStore.getState().midi as any
        const track = (midi?.tracks as any[] | undefined)?.find((t: any) => t.channel === ch && !t.isDrum)
        try { _synth.programChange(ch, track?.program ?? 0) } catch {}
        _samplesChanInit.add(ch)
      }
      _synth.noteOn(ch, midiNum, Math.round(vel * 127))
      setTimeout(() => _synth?.noteOff(ch, midiNum), durMs)
      if (visual) lightKey(midiNum, color ?? amberHex(), durMs + 100)
    }
    // ── Sustained note-on for hardware MIDI input ────────────────────────────
    ;(window as any).__orfeoNoteOnSamples = (midiNum: number, vel: number) => {
      if (!_synth || !_synthReady) return
      ensureHwChannel()
      _synth.noteOn(15, midiNum, Math.round(vel * 127))
    }
    // ── Immediate note-off for hardware MIDI input ───────────────────────────
    ;(window as any).__orfeoNoteOffSamples = (midiNum: number) => {
      if (!_synth || !_synthReady) return
      _synth.noteOff(15, midiNum)
    }
    return () => {
      delete (window as any).__orfeoPlayNoteSamples
      delete (window as any).__orfeoNoteOnSamples
      delete (window as any).__orfeoNoteOffSamples
    }
  }, [])

  // ── Subscribe to playback state and engine changes ───────────────────────
  useEffect(() => {
    let prevState = useStore.getState().playbackState as string
    let prevAudioEngine = useStore.getState().audioEngine
    let prevBpm = useStore.getState().bpm
    let prevTranspose = useStore.getState().detectedKey?.transpose ?? 0
    // ── Mute/solo signature — the only per-track fields that change WHICH
    // notes get scheduled (see buildSamplesPlayer's hasSolo/muted/solo gate
    // below). Volume/pan/chorus/reverb are pushed straight to the synth via
    // setChannelVolume/Pan/Chorus/Reverb at the same call site that patches
    // the store, so reacting to every `tracks` reference change here (as a
    // raw `!==` would) rebuilds the whole scheduled player on every fader
    // mousemove — dozens of times a second — which is what was stuttering/
    // pausing playback while dragging a Console fader. ─────────────────────
    const muteSoloSignature = (ts: ReturnType<typeof useStore.getState>['tracks']) =>
      ts.map(t => (t.muted ? 'm' : t.solo ? 's' : '.')).join('')
    let prevMuteSolo = muteSoloSignature(useStore.getState().tracks)

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
      const muteSolo = muteSoloSignature(state.tracks)
      const tracksChanged = muteSolo !== prevMuteSolo

      prevBpm = state.bpm
      prevTranspose = state.detectedKey?.transpose ?? 0
      prevMuteSolo = muteSolo

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

  // ── Live soundfont switching (Settings panel dropdown) ────────────────────
  useEffect(() => {
    let prevId = useStore.getState().selectedSoundfont
    const unsub = useStore.subscribe((state) => {
      if (state.selectedSoundfont === prevId) return
      prevId = state.selectedSoundfont
      if (_synthReady) loadSelectedSoundfont(prevId).catch(() => {})
    })
    return () => unsub()
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

  // ── Live master compressor on/off + preset changes ────────────────────────
  useEffect(() => {
    let prevEnabled = useStore.getState().masterCompEnabled
    let prevPreset  = useStore.getState().masterCompPreset
    const unsub = useStore.subscribe((state) => {
      if (state.audioEngine !== 'samples') return
      if (state.masterCompEnabled === prevEnabled && state.masterCompPreset === prevPreset) return
      prevEnabled = state.masterCompEnabled
      prevPreset  = state.masterCompPreset
      setMasterCompressor(prevEnabled, prevPreset)
    })
    return () => unsub()
  }, [])
}
