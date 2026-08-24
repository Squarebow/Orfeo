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
// the felt character between "gentle glue" and "hard limiter".
//
// makeupDb — a compressor only ever pulls loud peaks DOWN toward its
// threshold; a DynamicsCompressorNode has no built-in makeup-gain stage, so
// on its own it does nothing for a passage that's just genuinely played
// quiet (real case: a file whose note velocities dip hard for a passage —
// no amount of ratio/threshold tweaking brings that back up, since there's
// nothing above the threshold there to compress). A gain boost, scaled to
// roughly how hard each preset squashes the loud parts, is what actually
// closes that gap — quiet passages end up louder in absolute terms even
// though the compressor itself never touched them. Values kept modest
// (halved from the first pass) and — critically — applied BEFORE _compNode,
// not after: see the chain-wiring comment below for why the original
// after-compressor placement caused audible clipping/distortion on any
// transient the compressor's attack hadn't fully caught yet (e.g. a fast
// glissando run into a loud downbeat), and why fixing the order is what
// actually caps that, not just lowering these numbers. ─────────────────────
interface CompPreset { threshold: number; ratio: number; attack: number; knee: number; makeupDb: number; label: string }
export const COMPRESSOR_PRESETS: CompPreset[] = [
  { label: 'Safety',  threshold: -1,  ratio: 2,  attack: 0.010, knee: 10, makeupDb: 0.5 },
  { label: 'Gentle',  threshold: -6,  ratio: 4,  attack: 0.008, knee: 8,  makeupDb: 1.5 },
  { label: 'Medium',  threshold: -12, ratio: 8,  attack: 0.005, knee: 6,  makeupDb: 3 },
  { label: 'Firm',    threshold: -18, ratio: 14, attack: 0.003, knee: 3,  makeupDb: 4.5 },
  { label: 'Limiter', threshold: -24, ratio: 20, attack: 0.003, knee: 0,  makeupDb: 6 },
]
const COMPRESSOR_RELEASE = 0.25
const dbToGain = (db: number) => Math.pow(10, db / 20)

// ── Auto-Level (AGC) — static makeup gain (above) only ever applies a flat
// offset; it can't close a genuinely wide gap between a loud passage and a
// quiet one (real case this was built for: a file whose note velocities
// crash for a whole passage — a plain downward compressor never crosses
// threshold there at all, so neither compression nor a fixed makeup-gain
// value can lift it, only shift everything by the same fixed amount). This
// is a real closed-loop auto-gain instead: an AnalyserNode continuously
// measures RMS loudness of the (already-gain-adjusted) signal, compared
// against a target, and the error smoothly drives a GainNode via a slow time
// constant.
//
// Scoped to whole-SONG loudness drift, not individual notes/runs — this is
// the point of the slow time constants below, not an incidental detail.
// The first pass used a 0.6s attack and a 26dB max boost, which is fast and
// big enough to chase a single quiet passage of well under a second (a fast
// ornamental run like a glissando, or a bar of sparse notes before a
// downbeat) most of the way to full boost — so a loud hit landing right
// after one got amplified on top of whatever the compressor could catch,
// producing audible clipping/distortion. Multi-second time constants mean
// a poll 100ms into a quiet run moves the gain only a few percent of the
// way there — real per-tick correction targets still get computed off a
// single ~46ms analyser window (fftSize below), but the GAIN itself can't
// physically get anywhere close to a large correction within one bar, only
// across a genuinely sustained passage. That's what makes this "song-level"
// rather than "note-level" — not a maximum-boost cap alone. ─────────────────
let _agcGainNode: GainNode | null = null
let _analyserNode: AnalyserNode | null = null
let _agcTimer: ReturnType<typeof setInterval> | null = null
const AGC_TARGET_DB = -18
const AGC_NOISE_FLOOR_DB = -50   // below this, treat as silence/rest — hold gain, don't chase noise
const AGC_MAX_BOOST_DB = 9
const AGC_MAX_CUT_DB = 4
// Asymmetric, like a real leveler: catch up to a quiet passage faster than
// easing back down out of a loud one — but both now measured in several
// seconds, not fractions of one, so a single fast passage can't swing this.
const AGC_TIME_CONSTANT_UP = 3.0    // boosting (quiet passage) — seconds
const AGC_TIME_CONSTANT_DOWN = 5.0  // cutting (loud passage) — seconds
const AGC_POLL_MS = 100

// ── Module-level singletons ───────────────────────────────────────────────────
let _ctx: AudioContext | null = null
let _gainNode: GainNode | null = null
// High-shelf BiquadFilter for master tone control (Samples engine only)
let _filterNode: BiquadFilterNode | null = null
// User-facing compressor — presets/on-off from MasterStrip. NOT the last
// thing in the chain (see _safetyLimiterNode below) — this is tone-shaping
// the user opts into, not the thing that keeps output out of digital
// clipping. Confirmed by direct measurement: a dense 10-track arrangement
// (real case — "Abba - Dancing Queen") clips (peaks well past ±1.0) even
// with this compressor fully OFF (ratio 1:1/threshold 0dB, a mathematical
// no-op) — the raw synth+SAMPLES_BOOST signal is hot enough on its own to
// overload on a loud passage, regardless of anything this node does.
let _compNode: DynamicsCompressorNode | null = null
// Makeup gain — sits right before _compNode (see COMPRESSOR_PRESETS.makeupDb).
let _compMakeupNode: GainNode | null = null
// ── Safety limiter — the ACTUAL last stage before destination, always on
// regardless of masterCompEnabled/preset. A brick-wall limiter (near-20:1
// ratio, near-0 attack, threshold just under 0dBFS) that exists purely to
// stop digital clipping, not to shape tone — the user's own _compNode
// above is a completely separate, optional, musical decision (glue/
// character) that this doesn't replace or depend on. Needed because
// nothing upstream — not _gainNode's SAMPLES_BOOST, not the user
// compressor even at its most aggressive preset, not the AGC/makeup gain —
// actually guarantees output stays under 0dBFS on its own; only a real
// limiter as the final node can. ────────────────────────────────────────
let _safetyLimiterNode: DynamicsCompressorNode | null = null
// type-only — runtime reference populated after dynamic import
let _synth: WorkletSynthesizer | null = null
let _synthInitP: Promise<void> | null = null
let _synthReady = false
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

// ── Hardware-input/preview channel setup — program 0, full volume on ch 15 ──
// Re-asserted on every call, not just once: channel 15 isn't actually
// reserved at the MIDI-spec level, so a loaded file with a real track on
// channel 15 (e.g. a 7th+ melodic instrument, common once a file needs
// more non-drum channels than 0-8/10-15 comfortably give it) reprograms it
// during normal playback — a real MIDI file (Bruce Hornsby - The Way It
// Is, alto sax on channel 15) hit exactly this, permanently leaving the
// Lock-a-Chord/Explorer preview channel playing sax instead of piano for
// the rest of the session. A ProgramChange is cheap enough to just always
// send. ─────────────────────────────────────────────────────────────────
function ensureHwChannel() {
  if (!_synth) return
  try {
    _synth.programChange(15, 0)
    ;(_synth as any).controllerChange(15, 7, 127)
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
      // ── Force reverb/chorus sends to 0 on every channel at init — MasterStrip's
      // Chorus/Reverb knobs default their React state to 0, but nothing was ever
      // pushing that to the synth itself, so channels sat at whatever send level
      // GeneralUser-GS/SpessaSynth defaults to (typically a non-zero GM default
      // reverb send) until the user touched a knob. That meant reverb/chorus DSP
      // ran continuously from the very first note despite the UI showing "off" —
      // real, silent CPU cost with no matching user-visible control. ────────────
      setMasterReverb(0)
      setMasterChorus(0)

      // Wire gain node — apply SAMPLES_BOOST so perceived level matches GM Synth
      _gainNode = _ctx.createGain()
      _gainNode.gain.value = useStore.getState().masterVolume * SAMPLES_BOOST

      // High-shelf tone control — inserted between gain and destination
      _filterNode = _ctx.createBiquadFilter()
      _filterNode.type = 'highshelf'
      _filterNode.frequency.value = 3000
      _filterNode.gain.value = 0  // flat at center position

      // Auto-Level (AGC) — see the block comment above where these are
      // declared. Sits between tone control and the peak compressor so the
      // compressor still catches whatever transients AGC's slow response
      // doesn't. AnalyserNode passes audio through unchanged — it's a real
      // link in the chain, not just a tap.
      _agcGainNode = _ctx.createGain()
      _agcGainNode.gain.value = 1
      _analyserNode = _ctx.createAnalyser()
      _analyserNode.fftSize = 2048
      _analyserNode.smoothingTimeConstant = 0

      // Master compressor/limiter — last stage before destination, no
      // exceptions. Always created and wired in; "off" is a real transparent
      // state (ratio 1:1, threshold 0dB — mathematically a no-op, never
      // reduces gain) rather than disconnecting/reconnecting the graph on
      // every toggle. Makeup gain sits BEFORE it (off = 0dB/gain 1 the same
      // way), not after: makeup gain first shipped applied AFTER _compNode
      // with nothing downstream to catch its output, so any transient the
      // compressor's attack hadn't fully clamped yet got amplified straight
      // through with zero further limiting — audible as clipping/distortion
      // on fast attacks (a glissando run into a loud downbeat was the
      // reported case). Putting it before the compressor instead doesn't
      // weaken the quiet-passage boost it exists for — content that's still
      // below threshold after the makeup boost passes through the
      // compressor untouched either way — but now anything the boost pushes
      // OVER threshold gets caught and controlled by the one dynamics node
      // in this chain, instead of bypassing it entirely.
      _compNode = _ctx.createDynamicsCompressor()
      _compNode.release.value = COMPRESSOR_RELEASE
      _compMakeupNode = _ctx.createGain()
      {
        const { masterCompEnabled, masterCompPreset } = useStore.getState()
        setMasterCompressor(masterCompEnabled, masterCompPreset)
      }

      // Safety limiter — see the declaration comment above. Fixed settings,
      // not user-configurable, always engaged.
      _safetyLimiterNode = _ctx.createDynamicsCompressor()
      _safetyLimiterNode.threshold.value = -1
      _safetyLimiterNode.ratio.value = 20
      _safetyLimiterNode.knee.value = 0
      _safetyLimiterNode.attack.value = 0.001
      _safetyLimiterNode.release.value = 0.05

      _synth.connect(_gainNode)
      _gainNode.connect(_filterNode)
      _filterNode.connect(_agcGainNode)
      _agcGainNode.connect(_analyserNode)
      _analyserNode.connect(_compMakeupNode)
      _compMakeupNode.connect(_compNode)
      _compNode.connect(_safetyLimiterNode)
      _safetyLimiterNode.connect(_ctx.destination)

      startAgcLoop()

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
          // "all tracks" scope still requires the track to be visible on the
          // piano roll — a track hidden from both the roll and the keyboard
          // should show nothing, see useAudioEngine.ts's identical fix.
          else if (hitEffectScope === 'all' && ts.visible) pushHitEffect(midiNum, color)
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
  _compMakeupNode?.gain.setTargetAtTime(dbToGain(p ? p.makeupDb : 0), now, 0.01)
}

// ── getMasterCompReduction — live gain reduction in dB (0 = none, negative =
// reducing), for the master-knob/track-fader visual-dip gimmick. Real-time,
// unsmoothed — callers should lerp toward this each frame, not use it raw. ──
export function getMasterCompReduction(): number {
  return _compNode?.reduction ?? 0
}

// ── startAgcLoop — the closed-loop auto-gain poll (see the AGC block
// comment near the module-level declarations for why this exists). Started
// once at init and left running for the app's lifetime, same as every other
// node here — when the compressor's off it just eases _agcGainNode back to
// unity every tick rather than stopping, so there's no separate start/stop
// wiring to keep in sync with setMasterCompressor. ──────────────────────────
function startAgcLoop(): void {
  if (_agcTimer || !_analyserNode || !_agcGainNode) return
  const buf = new Float32Array(_analyserNode.fftSize)
  _agcTimer = setInterval(() => {
    const analyser = _analyserNode, agc = _agcGainNode, ctx = _ctx
    if (!analyser || !agc || !ctx) return
    const now = ctx.currentTime
    // Direction is current gain vs. where we're headed, not the sign of the
    // correction alone — e.g. easing off an existing boost is still a "down"
    // move even though the passage is still quieter than target.
    const moveTo = (targetGain: number) => {
      const tc = targetGain > agc.gain.value ? AGC_TIME_CONSTANT_UP : AGC_TIME_CONSTANT_DOWN
      agc.gain.setTargetAtTime(targetGain, now, tc)
    }
    if (!useStore.getState().masterCompEnabled) {
      moveTo(1)
      return
    }
    analyser.getFloatTimeDomainData(buf)
    let sumSquares = 0
    for (let i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i]
    const rms = Math.sqrt(sumSquares / buf.length)
    if (rms <= 0) return // true digital silence — hold current gain
    const rmsDb = 20 * Math.log10(rms)
    if (rmsDb < AGC_NOISE_FLOOR_DB) return // rest/near-silence — don't chase noise floor
    const correctionDb = Math.max(-AGC_MAX_CUT_DB, Math.min(AGC_MAX_BOOST_DB, AGC_TARGET_DB - rmsDb))
    moveTo(dbToGain(correctionDb))
  }, AGC_POLL_MS)
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
    // ── Schedule-affecting signature — mute/solo/showOnKeyboard/visible are the
    // only per-track fields that change WHICH notes get scheduled or whether
    // they light the keyboard/spawn hit effects (see buildSamplesPlayer's
    // hasSolo/muted/solo gate and its showOnKeyboard/visible branch below).
    // Missing showOnKeyboard or visible here meant toggling either mid-playback
    // never rebuilt the schedule — already-scheduled notes kept firing
    // lightKey/pushHitEffect from their original closures (with the stale
    // values baked in) until some other change forced a rebuild, so hit
    // effects kept appearing for a track the user had just hidden. Volume/
    // pan/chorus/reverb are still deliberately excluded — they're pushed
    // straight to the synth via setChannelVolume/Pan/Chorus/Reverb at the
    // same call site that patches the store, so reacting to every `tracks`
    // reference change here (as a raw `!==` would) rebuilds the whole scheduled
    // player on every fader mousemove — dozens of times a second — which is
    // what was stuttering/pausing playback while dragging a Console fader. ───
    const scheduleSignature = (ts: ReturnType<typeof useStore.getState>['tracks']) =>
      ts.map(t => (t.muted ? 'm' : t.solo ? 's' : '.') + (t.showOnKeyboard ? 'k' : '.') + (t.visible ? 'v' : '.')).join('')
    let prevSignature = scheduleSignature(useStore.getState().tracks)

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
      const signature = scheduleSignature(state.tracks)
      const tracksChanged = signature !== prevSignature

      prevBpm = state.bpm
      prevTranspose = state.detectedKey?.transpose ?? 0
      prevSignature = signature

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
