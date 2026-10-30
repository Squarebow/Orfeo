// ── Native audio engine (beta) — the renderer side of song playback ──────────
// Self-gates on audioEngine === 'native'. Starts the engine (audio process)
// when chosen, sends it the song as one flat event list, and turns the store's
// transport / mixer / key changes into engine commands. The engine plays the
// song itself, sample-accurately; this hook only schedules what the screen
// shows (key lights, hit effects), delayed by the engine's real output delay.

import { useEffect } from 'react'
import { useStore } from '../store'
import { useMidiSettings, latencyOffsetSec } from '../store/midiSettings'
import { NES } from '../utils/noteEditorState'
import { pushHitEffect, amberHex } from '../utils/hitEffectQueue'
import { isHomogeneousHandTrack, resolveHandAwareColor } from '../utils/handColors'
import { startNative, stopNative, nativeCall, isNativeRunning, useNativeAudio, onNativeRestart } from './nativeClient'
import { programTimeline } from './programTimeline'
import { volumeRatio } from './songVolume'
import type { ControlEvent, ParsedTrack } from '../types'
import { isShown } from '../utils/trackShown'

// Brings Native to the Samples engine's loudness at the same master volume.
// Measured from the speakers at a low master volume, where neither engine's
// limiter acts (compressor off): matched there, both reach their limiters at
// the same point, so loud passages keep the same punch. (Matching loudness at
// a high volume instead hides a hotter engine behind its own limiter.)
export const NATIVE_BOOST = 1.37

type Tracks = ReturnType<typeof useStore.getState>['tracks']
const activeMidiData = (): any => (NES.dirty && NES.editMidi) ? NES.editMidi : useStore.getState().midi

// ── Mixer mirror: per MIDI channel, so a master knob can override every
// channel's send without losing what the channel strip set ──────────────
interface Ch { volume: number; pan: number; reverb: number; chorus: number }
const _ch: Ch[] = Array.from({ length: 16 }, () => ({ volume: 1, pan: 0, reverb: 0, chorus: 0 }))
let _masterReverb: number | null = null
let _masterChorus: number | null = null
// Per channel, the track whose volume moves the song plays there: the engine
// multiplies them by the fader ÷ the song's first volume (songVolume.ts)
const _volumeTrack: (ParsedTrack | undefined)[] = Array(16).fill(undefined)
function pushChannel(c: number) {
  const s = _ch[c]
  const t = _volumeTrack[c]
  const volume = t ? volumeRatio(t, s.volume) : s.volume
  nativeCall('setChannel', c, volume, s.pan, _masterReverb ?? s.reverb, _masterChorus ?? s.chorus)
}
export const nativeSetChannelVolume = (c: number, v: number) => { _ch[c].volume = v; pushChannel(c) }
export const nativeSetChannelPan = (c: number, v: number) => { _ch[c].pan = v; pushChannel(c) }
export const nativeSetChannelReverb = (c: number, v: number) => { _ch[c].reverb = v; pushChannel(c) }
export const nativeSetChannelChorus = (c: number, v: number) => { _ch[c].chorus = v; pushChannel(c) }
export const nativeSetMasterReverb = (v: number) => { _masterReverb = v; for (let c = 0; c < 16; c++) pushChannel(c) }
export const nativeSetMasterChorus = (v: number) => { _masterChorus = v; for (let c = 0; c < 16; c++) pushChannel(c) }
export const nativeSetMasterTone = (v: number) => nativeCall('setToneDb', v * 12)
export const nativeSetMasterCompressor = (enabled: boolean, preset: number) => nativeCall('setCompressor', enabled, preset)
export const nativeSetMasterPan = (_v: number) => { /* master pan: not in the native mixer yet */ }

// ── Low latency follows the keyboards: off (sharing the sound card, so a
// browser or video call keeps playing) unless a MIDI keyboard is connected.
// A keyboard connecting (or found at startup) turns it on, the last one
// unplugged turns it off; switching it by hand holds until the next of
// those. Never saved, so every start begins from that rule. The rule itself
// can be switched off (MIDI Keyboard › Sound & Latency: autoLowLatency). ──
let _keyboards = new Set<string>()
useMidiSettings.subscribe((m) => {
  const now = new Set(m.devices.filter(d => d.connected).map(d => d.key))
  const fresh = [...now].some(k => !_keyboards.has(k))
  const allGone = _keyboards.size > 0 && now.size === 0
  _keyboards = now
  if (!m.autoLowLatency) return
  if (fresh) setLowLatency(true)
  else if (allGone) setLowLatency(false)
})
export function setLowLatency(on: boolean) {
  if (useMidiSettings.getState().nativeExclusive !== on) useMidiSettings.setState({ nativeExclusive: on })
  nativeCall('setExclusive', on)
}

/** Real delay from "told to play" to "heard" + the user's offset (seconds) */
export function nativeOutputLatencySec(): number {
  return Math.max(0, nativeMeasuredLatencySec() + latencyOffsetSec())
}
export function nativeMeasuredLatencySec(): number {
  const s = useNativeAudio.getState().status
  if (!s || !s.rate) return 0
  // exclusive: the device reports its buffer; shared: it reports 0, so count our buffer
  return Math.max(s.reportedLatencyMs, s.bufferFrames * 1000 / s.rate) / 1000
}

// ── Live keys and previews (the Explorers, Lock-a-Chord, clicked keys) play
// piano on channel 16 — but a song with its own track there (an alto sax, say)
// gives that channel its instrument, and the synth keeps it after the song,
// even once another song is loaded. Put piano back before they play, as the
// Samples engine does (ensureHwChannel / ensureLiveChannel). ───────────────
const LIVE_CH = 15
let _liveChDirty = false
let _songUsesLiveCh = false
export function nativeLivePiano() {
  if (!_liveChDirty) return
  nativeCall('midi', 0xc0 | LIVE_CH, 0, 0)
  // the current song can set it again when it plays or jumps
  _liveChDirty = _songUsesLiveCh
}

// ── Song → one flat, time-sorted event list for the engine ──────────────────
function sendSong() {
  const midi = activeMidiData()
  const { tracks } = useStore.getState()
  if (!midi) { nativeCall('loadSong', new Float64Array(0), new Uint16Array(0), new Uint8Array(0), 0, 0); return }
  type E = [time: number, order: number, track: number, s: number, d1: number, d2: number]
  const ev: E[] = []
  let trackCount = 0
  for (const t of midi.tracks) {
    const ch = t.channel & 0x0f
    trackCount = Math.max(trackCount, t.index + 1)
    for (const n of t.notes) {
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)))
      ev.push([n.time, 2, t.index, 0x90 | ch, n.midi, vel])
      ev.push([n.time + Math.max(n.duration, 0.04), 0, t.index, 0x80 | ch, n.midi, 0])
    }
    for (const p of t.sustainEvents ?? []) ev.push([p.time, 1, t.index, 0xb0 | ch, 64, p.down ? 127 : 0])
    // the song's own volume and expression moves (the first one holds from the start, as in songVolume.ts)
    ;(t.volumeEvents ?? []).forEach((e: ControlEvent, i: number) => ev.push([i ? e.time : 0, 1, t.index, 0xb0 | ch, 7, Math.round(e.value * 127)]))
    ;(t.expressionEvents ?? []).forEach((e: ControlEvent, i: number) => ev.push([i ? e.time : 0, 1, t.index, 0xb0 | ch, 11, Math.round(e.value * 127)]))
  }
  _volumeTrack.fill(undefined)
  for (const t of midi.tracks) {
    const ch = t.channel & 0x0f
    if (t.volumeEvents?.length && !_volumeTrack[ch]) _volumeTrack[ch] = t
  }
  // Each channel's instrument, switching where one of its tracks takes over
  // (a file track that changes instrument is split into one track per instrument)
  _songUsesLiveCh = false
  for (const [ch, switches] of programTimeline(midi, tracks)) {
    for (const sw of switches) ev.push([sw.time, 1, sw.track, 0xc0 | ch, sw.program, 0])
    if (ch === LIVE_CH) _songUsesLiveCh = _liveChDirty = true
  }
  // note-offs before pedal and instrument changes before note-ons at the same instant
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const times = new Float64Array(ev.length), trk = new Uint16Array(ev.length), bytes = new Uint8Array(ev.length * 3)
  ev.forEach((e, i) => { times[i] = e[0]; trk[i] = e[2]; bytes[3 * i] = e[3]; bytes[3 * i + 1] = e[4]; bytes[3 * i + 2] = e[5] })
  nativeCall('loadSong', times, trk, bytes, trackCount, midi.duration ?? 0)
  // the instruments are in the song itself now: no channel keeps a fixed one
  for (let ch = 0; ch < 16; ch++) nativeCall('setChannelProgram', ch, -1)
  sendTrackState(tracks)
}

// A changed instrument on a channel shared by several tracks: the song's
// instrument switches change, so the song goes again, from where it is
function resendSongKeepingPlace() {
  const s = useStore.getState()
  sendSong(); sendSongClicks()
  nativeCall('seek', s.currentTime)
  if (s.playbackState === 'playing') nativeCall('play')
}

function sendTrackState(tracks: Tracks) {
  const hasSolo = tracks.some(t => t.solo)
  const n = Math.max(0, ...tracks.map(t => t.index + 1))
  const audible = Array.from({ length: n }, (_, i) => {
    const t = tracks.find(x => x.index === i)
    return !t || (!t.muted && (!hasSolo || t.solo))
  })
  nativeCall('setAudibleTracks', audible)
  const midi = activeMidiData()
  for (const t of tracks) {
    const ch = midi?.tracks?.find((x: any) => x.index === t.index)?.channel
    if (ch === undefined) continue
    _ch[ch] = { volume: t.volume, pan: t.pan ?? 0, reverb: t.reverb ?? 0, chorus: t.chorus ?? 0 }
    pushChannel(ch)
  }
}

// Metronome: every beat of the song's grid (Tap Tempo corrections included),
// accented on bar starts — the engine clicks them itself, sample-exact
function sendSongClicks() {
  const m = activeMidiData() as any
  const beats: number[] = m?._beatTimes ?? []
  const bars = new Set<number>(m?._barTimes ?? [])
  nativeCall('setSongClicks', new Float64Array(beats), Uint8Array.from(beats, b => (bars.has(b) ? 1 : 0)))
}
function sendMetronome() {
  const s = useStore.getState()
  nativeCall('setMetronome', s.metronomeEnabled, s.metronomeVolume)
}

// ── Count-in: the clicks and the song start are both on the engine's clock.
// The runner arms the start here; when the UI then flips to 'playing' the
// engine is already playing — it must not be re-seeked. ─────────────────
let _armed: { songTime: number; until: number } | null = null
export function nativeArmStart(songTime: number, delaySec: number) {
  nativeCall('seek', songTime)
  nativeCall('playAfter', Math.max(0, delaySec))
  _armed = { songTime, until: performance.now() + delaySec * 1000 + 1000 }
}
export function nativeCancelArmedStart() { _armed = null; nativeCall('cancelPendingClicks') }

function sendTransportSettings() {
  const s = useStore.getState()
  nativeCall('setTempoRatio', s.bpm / s.originalBpm || 1)
  nativeCall('setTranspose', s.detectedKey?.transpose ?? 0)
  nativeCall('setMasterGain', s.masterVolume * NATIVE_BOOST)
  nativeCall('setCompressor', s.masterCompEnabled, s.masterCompPreset)
}

// ── Screen: key lights + hit effects, rolling 1.5 s ahead ───────────────────
const LOOKAHEAD_SEC = 1.5
const REFILL_MS = 400
const _timers: ReturnType<typeof setTimeout>[] = []
const _keyTimers = new Map<number, ReturnType<typeof setTimeout>>()
let _refill: ReturnType<typeof setInterval> | null = null
let _vis: { startPerf: number; startSec: number; ratio: number; transpose: number; cursors: Map<number, number>; tracks: Tracks; midi: any; hasSolo: boolean; scope: string; showHands: boolean; performance: boolean; homog: Map<number, boolean> } | null = null

export function nativeLightKey(midiNum: number, color: string, durMs: number) {
  const prev = _keyTimers.get(midiNum)
  if (prev) clearTimeout(prev)
  const { activeKeys, activeKeyColors } = useStore.getState()
  const nk = new Set(activeKeys); nk.add(midiNum)
  const nc = new Map(activeKeyColors); nc.set(midiNum, color)
  useStore.setState({ activeKeys: nk, activeKeyColors: nc })
  pushHitEffect(midiNum, color)
  _keyTimers.set(midiNum, setTimeout(() => {
    _keyTimers.delete(midiNum)
    const { activeKeys: k, activeKeyColors: c } = useStore.getState()
    const a = new Set(k); a.delete(midiNum)
    const b = new Map(c); b.delete(midiNum)
    useStore.setState({ activeKeys: a, activeKeyColors: b })
  }, Math.max(50, durMs)))
}

function clearVisuals() {
  _timers.forEach(clearTimeout); _timers.length = 0
  if (_refill) { clearInterval(_refill); _refill = null }
  _keyTimers.forEach(clearTimeout); _keyTimers.clear()
  _vis = null
  useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
}

function startVisuals(startSec: number) {
  clearVisuals()
  const s = useStore.getState()
  const midi = activeMidiData()
  if (!midi) return
  _vis = {
    startPerf: performance.now(), startSec, ratio: s.bpm / s.originalBpm || 1, transpose: s.detectedKey?.transpose ?? 0,
    cursors: new Map(), tracks: s.tracks, midi, hasSolo: s.tracks.some(t => t.solo), scope: s.hitEffectScope,
    showHands: s.showHandLabels || (s.noteEditorActive && NES.reassignHandsMode), performance: s.handLabelMode === 'performance', homog: new Map(),
  }
  for (const t of midi.tracks) {
    let i = t.notes.findIndex((n: any) => n.time >= startSec)
    _vis.cursors.set(t.index, i === -1 ? t.notes.length : i)
    _vis.homog.set(t.index, isHomogeneousHandTrack(t.notes))
  }
  refillVisuals()
  _refill = setInterval(refillVisuals, REFILL_MS)
}

function refillVisuals() {
  const v = _vis
  if (!v) return
  const now = () => v.startSec + (performance.now() - v.startPerf) / 1000 * v.ratio
  const target = now() + LOOKAHEAD_SEC * v.ratio
  const latencyMs = nativeOutputLatencySec() * 1000
  for (const t of v.midi.tracks) {
    const ts = v.tracks.find(x => x.index === t.index)
    if (!ts || !isShown(ts, v.hasSolo)) { v.cursors.set(t.index, t.notes.length); continue }   // lights follow what the roll shows (trackShown.ts)
    const base = ts.color ?? amberHex()
    let c = v.cursors.get(t.index) ?? t.notes.length
    while (c < t.notes.length && t.notes[c].time < target) {
      const n = t.notes[c++]
      const delay = Math.max(0, (n.time - now()) / v.ratio * 1000) + latencyMs
      const dur = Math.max(n.duration / v.ratio * 1000, 40)
      const key = n.midi + v.transpose
      const color = resolveHandAwareColor(n, base, { homogeneousTrack: v.homog.get(t.index) ?? false, showHandLabels: v.showHands, performanceMode: v.performance })
      _timers.push(setTimeout(() => {
        if (ts.showOnKeyboard) nativeLightKey(key, color, Math.min(dur + 30, 2500))
        else if (v.scope === 'all') pushHitEffect(key, color)
      }, delay))
    }
    v.cursors.set(t.index, c)
  }
}

// ── Engine lifetime ─────────────────────────────────────────────────────────
async function startEngine() {
  const paths = await window.electronAPI.nativeSoundfontPaths(useStore.getState().selectedSoundfont)
  const ok = await startNative({ soundfonts: paths, exclusive: useMidiSettings.getState().nativeExclusive })
  if (!ok) {
    console.error('[Orfeo Native] could not start — falling back to the Samples engine:', useNativeAudio.getState().error)
    if (useStore.getState().audioEngine === 'native') useStore.getState().setAudioEngine('samples')
    return
  }
  sendTransportSettings()
  sendSong()
  sendSongClicks()
  sendMetronome()
  const s = useStore.getState()
  if (s.playbackState === 'playing') { nativeCall('seek', s.currentTime); nativeCall('play'); startVisuals(s.currentTime) }
}

export function useNativeEngine() {
  useEffect(() => {
    let prev = useStore.getState()
    let prevSig = trackSig(prev.tracks)
    if (prev.audioEngine === 'native') void startEngine()

    const unsub = useStore.subscribe((s) => {
      const p = prev
      prev = s
      const sig = trackSig(s.tracks)
      const tracksChanged = sig !== prevSig
      prevSig = sig

      if (s.audioEngine !== p.audioEngine) {
        if (s.audioEngine === 'native') { void startEngine(); return }
        if (p.audioEngine === 'native') { clearVisuals(); void stopNative(); return }
      }
      if (s.audioEngine !== 'native' || !isNativeRunning()) return

      if (s.midi !== p.midi) { sendSong(); sendSongClicks(); if (s.playbackState !== 'playing') nativeCall('seek', s.currentTime) }
      if (s.metronomeEnabled !== p.metronomeEnabled || s.metronomeVolume !== p.metronomeVolume) sendMetronome()
      if (s.selectedSoundfont !== p.selectedSoundfont) { void startEngine(); return }
      if (s.masterVolume !== p.masterVolume) nativeCall('setMasterGain', s.masterVolume * NATIVE_BOOST)
      if (s.masterCompEnabled !== p.masterCompEnabled || s.masterCompPreset !== p.masterCompPreset) nativeCall('setCompressor', s.masterCompEnabled, s.masterCompPreset)
      if (tracksChanged) sendTrackState(s.tracks)
      // instruments chosen in the track panel
      if (s.tracks !== p.tracks) {
        const midi = activeMidiData()
        let resend = false
        for (const t of s.tracks) {
          const o = p.tracks.find(x => x.index === t.index)
          if (o && o.program !== t.program) {
            const ch = midi?.tracks?.find((x: any) => x.index === t.index)?.channel
            if (ch === undefined || ch === 9) continue
            const shared = (midi?.tracks ?? []).filter((x: any) => x.channel === ch && x.notes?.length).length > 1
            if (shared) resend = true
            else nativeCall('setChannelProgram', ch, t.program) // its only track: change it on the spot
          }
        }
        if (resend) resendSongKeepingPlace()
      }

      const bpmChanged = s.bpm !== p.bpm || s.originalBpm !== p.originalBpm
      const transposeChanged = (s.detectedKey?.transpose ?? 0) !== (p.detectedKey?.transpose ?? 0)
      if (bpmChanged) nativeCall('setTempoRatio', s.bpm / s.originalBpm || 1)
      if (transposeChanged) nativeCall('setTranspose', s.detectedKey?.transpose ?? 0)

      const ps = s.playbackState, pp = p.playbackState
      if (ps === 'playing' && pp !== 'playing') {
        const armed = _armed && performance.now() < _armed.until
        _armed = null
        // after a count-in the engine started itself, on the beat — leave it be
        if (!armed) { nativeCall('seek', s.currentTime); nativeCall('play') }
        startVisuals(s.currentTime)
      } else if (ps === 'paused' && pp === 'playing') {
        nativeCall('pause'); clearVisuals()
      } else if (ps === 'stopped' && pp !== 'stopped') {
        nativeCall('pause'); nativeCall('seek', 0); clearVisuals()
      } else if (ps === 'playing' && (bpmChanged || transposeChanged || tracksChanged)) {
        // keep the engine on the UI clock's position and redraw what's lit
        nativeCall('seek', s.currentTime); startVisuals(s.currentTime)
      } else if (ps !== 'playing' && s.currentTime !== p.currentTime) {
        nativeCall('seek', s.currentTime)
      }
    })
    const offRestart = onNativeRestart(() => {
      sendTransportSettings(); sendSong(); sendSongClicks(); sendMetronome()
      const s = useStore.getState()
      if (s.playbackState === 'playing') { nativeCall('seek', s.currentTime); nativeCall('play'); startVisuals(s.currentTime) }
    })
    return () => { unsub(); offRestart(); clearVisuals() }
  }, [])
}

// Changes that alter WHICH notes play / light: mute, solo, keyboard, visibility, volume/pan/sends
function trackSig(ts: Tracks) {
  return ts.map(t => `${t.muted ? 'm' : t.solo ? 's' : '.'}${t.showOnKeyboard ? 'k' : '.'}${t.visible ? 'v' : '.'}`).join('')
}
