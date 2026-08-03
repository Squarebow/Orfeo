// ── Combined audio engine dispatcher ─────────────────────────────────────────
// Routes to the active backend (gm | samples). Each backend self-gates on its
// own audioEngine value. The click handler (window.__orfeoPlayNote) forwards to
// whichever backend is currently selected.

import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useSamplesEngine } from './useSamplesEngine'
import { pushHitEffect, amberHex } from '../utils/hitEffectQueue'

let _jzzReady = false
let _jzzInitP: Promise<void> | null = null
let _JZZ: any = null
let _port: any = null
let _player: any = null
let _notePortReady = false
// ch 15 = collision risk if a loaded MIDI file uses channel 16; accepted tradeoff
let _hwChannelReady = false
// ── Module-level muted channel set — updated in-place so the live filter reads it ──
let _mutedCh = new Set<number>()
// ── Promise for the channel-warmup operation triggered on edit-mode enter ────
// Null = warmup not yet started; resolved promise = warmup done.
// Cleared in destroyPlayer so the next edit-mode entry after a file reload
// or playback-stop re-warms correctly.
let _warmupPromise: Promise<void> | null = null

function initJZZ(): Promise<void> {
  if (_jzzReady) return Promise.resolve()
  if (_jzzInitP) return _jzzInitP
  _jzzInitP = (async () => {
    try {
      const jzzMod = await import('jzz')
      _JZZ = jzzMod.default ?? jzzMod
      const smfMod = await import('jzz-midi-smf')
      ;(smfMod.default ?? smfMod)(_JZZ)
      const tinyMod = await import('jzz-synth-tiny')
      ;(tinyMod.default ?? tinyMod)(_JZZ)
      const engine = _JZZ()
      await new Promise<void>((resolve) => {
        engine.and(function(this: any) { resolve() }).or(() => resolve())
      })
      await new Promise<void>((resolve) => {
        _JZZ().openMidiOut().and(function(this: any) {
          _port = this; _jzzReady = true; _notePortReady = false
          console.log('[Orfeo GM] System MIDI out:', this.name())
          resolve()
        }).or(() => {
          _JZZ.synth.Tiny().and(function(this: any) {
            _port = this; _jzzReady = true; _notePortReady = false
            console.log('[Orfeo GM] jzz-synth-tiny active')
            resolve()
          }).or((e: any) => {
            console.error('[Orfeo GM] Both MIDI outputs failed:', e)
            _jzzReady = true; resolve()
          })
        })
      })
    } catch (e) {
      _jzzInitP = null
      console.error('[Orfeo GM] JZZ init error:', e)
      throw e
    }
  })()
  return _jzzInitP
}

function ensureClickChannel() {
  if (_notePortReady || !_port) return
  try {
    _port.send([0xCE, 0])
    _notePortReady = true
  } catch (e) {
    console.warn('[Orfeo GM] ensureClickChannel error:', e)
  }
}

// ── One-time hardware-input channel setup — program 0 on ch 15 ───────────────
function ensureHardwareChannel() {
  if (_hwChannelReady || !_port) return
  try {
    _port.send([0xCF, 0])
    _hwChannelReady = true
  } catch (e) {
    console.warn('[Orfeo GM] ensureHardwareChannel error:', e)
  }
}

const _keyTimers = new Map<number, ReturnType<typeof setTimeout>>()

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

function clearAllKeys() {
  _keyTimers.forEach(t => clearTimeout(t))
  _keyTimers.clear()
  useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
}

const _lightSchedule: ReturnType<typeof setTimeout>[] = []
function clearLightSchedule() {
  _lightSchedule.forEach(t => clearTimeout(t))
  _lightSchedule.length = 0
}

function destroyPlayer() {
  try { _player?.stop() } catch {}
  _player = null
  ;(window as any).__orfeoPlayer = null
  _warmupPromise = null   // allow re-warm on next edit-mode entry
}

// ── updateMutedChannels — live mute/solo update without rebuilding the player ──
// Repopulates _mutedCh and rebuilds the key-lighting schedule from currentTime.
// Called on track-state changes during playback so the filter takes effect instantly.
function updateMutedChannels() {
  const { midi, tracks, bpm, originalBpm, detectedKey, currentTime, hitEffectScope } = useStore.getState()
  const midiData = midi as any
  if (!midiData || !_player) return
  const hasSolo = tracks.some((t: any) => t.solo)
  const transpose = detectedKey?.transpose ?? 0
  const ratio = bpm / originalBpm
  _mutedCh.clear()
  for (const tr of midiData.tracks) {
    const ts = tracks.find((t: any) => t.index === tr.index)
    if (!ts || ts.muted || (hasSolo && !ts.solo)) _mutedCh.add(tr.channel)
  }
  clearLightSchedule(); clearAllKeys()
  for (const track of midiData.tracks) {
    const ts = tracks.find((t: any) => t.index === track.index)
    if (!ts || ts.muted || (hasSolo && !ts.solo)) continue
    // hitEffectScope === 'all' lets non-keyboard tracks still spawn hit effects
    // (purely visual, at the note's key position) without lighting the key itself.
    if (!ts.showOnKeyboard && hitEffectScope !== 'all') continue
    const color = ts.color ?? amberHex()
    for (const note of track.notes) {
      const noteStart = note.time / ratio
      if (noteStart < currentTime) continue
      const delay = (noteStart - currentTime) * 1000
      const durMs = Math.max(note.duration / ratio * 1000, 40)
      const midiNum = note.midi + transpose
      const t = setTimeout(() => {
        if (ts.showOnKeyboard) lightKey(midiNum, color, Math.min(durMs + 30, 2500))
        else pushHitEffect(midiNum, color)
      }, delay)
      _lightSchedule.push(t)
    }
  }
}

function buildPlayer(startSec: number) {
  if (!_jzzReady || !_port) return
  const raw = (useStore.getState().midi as any)?._raw
  if (!raw) return
  try {
    destroyPlayer(); clearAllKeys(); clearLightSchedule()
    const { tracks, bpm, originalBpm, detectedKey, hitEffectScope } = useStore.getState()
    const transpose = detectedKey?.transpose ?? 0
    const ratio = bpm / originalBpm
    const midiData = useStore.getState().midi as any
    const hasSolo = tracks.some((t: any) => t.solo)
    _mutedCh = new Set<number>()
    for (const tr of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === tr.index)
      if (!ts || ts.muted || (hasSolo && !ts.solo)) _mutedCh.add(tr.channel)
    }
    // ── Start the real audio clock BEFORE scheduling any light timers ─────────
    // JZZ's player anchors its internal tick clock (_t0) the instant play()/
    // jumpMS() run. Building the SMF (parses the whole file, builds its tempo
    // table) and player.play() must happen first — previously the light
    // setTimeouts were all registered *before* this, computed relative to an
    // earlier "now" than the audio clock's actual anchor, coupling visual
    // sync to however long SMF construction + the note loop took. Doing audio
    // setup first minimizes that gap instead of leaving it to chance.
    const smfFile = new _JZZ.MIDI.SMF(new Uint8Array(raw))
    const player = smfFile.player()
    player.connect(_port)
    player.filter(function(this: any, msg: any) {
      const status = msg[0] & 0xF0
      const ch = msg[0] & 0x0F
      if (_mutedCh.has(ch)) return
      if (transpose !== 0 && (status === 0x90 || status === 0x80)) {
        const newNote = Math.max(0, Math.min(127, msg[1] + transpose))
        this._receive(_JZZ.MIDI(msg[0], newNote, msg[2]))
        return
      }
      this._receive(msg)
    })
    player.onEnd = () => {
      useStore.setState({ playbackState: 'stopped', currentTime: 0 })
      ;(window as any).__orfeoPlayer = null
      clearAllKeys()
      _notePortReady = false
    }
    player.speed(ratio)
    applyMasterVolume(useStore.getState().masterVolume)
    player.play()
    if (startSec > 0.1) player.jumpMS(Math.floor(startSec * 1000))
    _player = player
    setTimeout(() => { ;(window as any).__orfeoPlayer = player }, 50)

    for (const track of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === track.index)
      if (!ts || ts.muted || (hasSolo && !ts.solo)) continue
      if (!ts.showOnKeyboard && hitEffectScope !== 'all') continue
      const color = ts.color ?? amberHex()
      for (const note of track.notes) {
        const noteStart = note.time / ratio
        if (noteStart < startSec) continue
        const delay = (noteStart - startSec) * 1000
        const durMs = Math.max(note.duration / ratio * 1000, 40)
        const midiNum = note.midi + transpose
        const t = setTimeout(() => {
          if (ts.showOnKeyboard) lightKey(midiNum, color, Math.min(durMs + 30, 2500))
          else pushHitEffect(midiNum, color)
        }, delay)
        _lightSchedule.push(t)
      }
    }
  } catch (e) {
    console.error('[Orfeo GM] buildPlayer error:', e)
  }
}

// ── MIDI CC 7 (Main Volume) on all 16 channels ───────────────────────────────
function applyMasterVolume(v: number) {
  if (!_port) return
  const val = Math.round(Math.max(0, Math.min(1, v)) * 127)
  try { for (let ch = 0; ch < 16; ch++) _port.send([0xB0 | ch, 7, val]) } catch {}
}

function stopAudio() {
  destroyPlayer(); clearLightSchedule(); clearAllKeys()
  if (_port) {
    try { for (let ch = 0; ch < 16; ch++) _port.send([0xB0 | ch, 123, 0]) } catch {}
  }
  _notePortReady = false
}

// ── warmupEditChannels — prime GM channel programs before first note-editor click ──
// Sends program changes through a real JZZ SMF player (the same path buildPlayer
// uses) so jzz-synth-tiny's internal pipeline is correctly activated.  A filter
// blocks all note events so no sound is emitted.  The promise is stored in
// _warmupPromise so playNote can await it if the user clicks before the 150 ms
// settling window has elapsed.
async function warmupEditChannels() {
  // Skip if a player is active — its SMF events have already set programs.
  // Skip if warmup already in flight / done for this file session.
  if (_player || _warmupPromise) return
  _warmupPromise = (async () => {
    try {
      await initJZZ()
      if (!_port || !_JZZ) return
      const raw = (useStore.getState().midi as any)?._raw as ArrayBuffer | undefined
      if (!raw) return
      const smfFile = new _JZZ.MIDI.SMF(new Uint8Array(raw))
      const wPlayer = smfFile.player()
      wPlayer.connect(_port)
      // Only let program changes and bank-select CCs through — no notes emitted
      wPlayer.filter(function(this: any, msg: any) {
        const status = msg[0] & 0xF0
        if (status === 0xC0) { this._receive(msg); return }
        if (status === 0xB0 && (msg[1] === 0 || msg[1] === 32)) { this._receive(msg) }
      })
      wPlayer.play()
      // Program changes live at tick 0 and are dispatched immediately after play();
      // 150 ms is ample time for all of them to reach the synthesizer.
      await new Promise<void>(r => setTimeout(r, 150))
      try { wPlayer.stop() } catch {}
    } catch (e) { console.warn('[Orfeo GM] warmupEditChannels error:', e) }
  })()
  return _warmupPromise
}

// ── Combined hook ─────────────────────────────────────────────────────────────
export function useAudioEngine() {
  // Always mount Samples engine (it self-gates on audioEngine !== 'samples')
  useSamplesEngine()

  const prevStateRef = useRef('stopped')
  const prevBpmRef = useRef(120)
  const prevTransposeRef = useRef(0)
  const prevTracksRef = useRef<any>(null)
  const prevVolumeRef = useRef<number>(useStore.getState().masterVolume)
  const schedulingRef = useRef(false)
  // ── Track audioEngine so we can react to engine switches ────────────────
  const prevAudioEngineRef = useRef<string>(useStore.getState().audioEngine)

  useEffect(() => {
    // ── Timed click-to-play (shared by both engines) ─────────────────────────
    // channel: MIDI channel 0-based. Undefined = preview channel (14 GM / 15 samples).
    const playNote = async (midiNum: number, vel = 90, durMs = 500, channel?: number) => {
      const { audioEngine } = useStore.getState()
      if (audioEngine === 'samples') {
        const fn = (window as any).__orfeoPlayNoteSamples
        if (fn) { fn(midiNum, vel, durMs, channel); return }
      }
      // GM: ch 14 is the dedicated preview channel (piano). Track channels have
      // correct programs after __orfeoWarmupEditChannels runs on edit-mode enter.
      const ch = channel ?? 14
      try {
        // If a channel warmup is in flight, wait for it before sending note-on
        // so the program change arrives before the note on the first click.
        if (channel !== undefined && _warmupPromise) await _warmupPromise
        await initJZZ()
        if (!_port) return
        if (ch === 14) ensureClickChannel()
        _port.send([0x90 | ch, midiNum, Math.round(vel * 127)])
        setTimeout(() => { try { _port.send([0x80 | ch, midiNum, 0]) } catch {} }, durMs)
        lightKey(midiNum, amberHex(), durMs + 100)
      } catch (e) { console.error('[Orfeo GM] playNote error:', e) }
    }
    ;(window as any).__orfeoPlayNote = playNote

    // ── Sustained note-on for hardware MIDI input (GM path) ──────────────────
    ;(window as any).__orfeoNoteOn = async (midiNum: number, vel: number) => {
      try {
        await initJZZ()
        if (!_port) return
        ensureHardwareChannel()
        _port.send([0x9F, midiNum, Math.round(vel * 127)])
      } catch (e) { console.error('[Orfeo GM] noteOn error:', e) }
    }
    // ── Immediate note-off for hardware MIDI input (GM path) ─────────────────
    ;(window as any).__orfeoNoteOff = (midiNum: number) => {
      try { _port?.send([0x8F, midiNum, 0]) } catch (e) { console.error('[Orfeo GM] noteOff error:', e) }
    }

    // ── Warm up GM channels via a temporary silent SMF player ────────────────
    ;(window as any).__orfeoWarmupEditChannels = () => {
      if (useStore.getState().audioEngine === 'gm') warmupEditChannels()
    }

    return () => {
      delete (window as any).__orfeoPlayNote
      delete (window as any).__orfeoWarmupEditChannels
      delete (window as any).__orfeoNoteOn
      delete (window as any).__orfeoNoteOff
      stopAudio()
    }
  }, [])

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const engineChanged = state.audioEngine !== prevAudioEngineRef.current
      const prevEngine = prevAudioEngineRef.current
      prevAudioEngineRef.current = state.audioEngine

      if (state.audioEngine !== 'gm') {
        // Engine leaving 'gm' — stop JZZ immediately so it doesn't keep playing
        if (prevEngine === 'gm') {
          stopAudio()
        }
        return
      }

      // audioEngine === 'gm' from here
      const ps = state.playbackState
      const pp = prevStateRef.current
      const bpmChanged = state.bpm !== prevBpmRef.current
      const transposeChanged = (state.detectedKey?.transpose ?? 0) !== prevTransposeRef.current
      const tracksChanged = state.tracks !== prevTracksRef.current

      prevStateRef.current = ps
      prevBpmRef.current = state.bpm
      prevTransposeRef.current = state.detectedKey?.transpose ?? 0
      prevTracksRef.current = state.tracks

      if (engineChanged && ps === 'playing') {
        // Engine just switched TO gm while playback is active — rebuild player
        if (schedulingRef.current) return
        schedulingRef.current = true
        initJZZ()
          .then(() => buildPlayer(state.currentTime))
          .catch(console.error)
          .finally(() => { schedulingRef.current = false })
      } else if (ps === 'playing' && pp !== 'playing') {
        if (schedulingRef.current) return
        schedulingRef.current = true
        initJZZ()
          .then(() => buildPlayer(state.currentTime))
          .catch(console.error)
          .finally(() => { schedulingRef.current = false })
      } else if (ps === 'paused' && pp === 'playing') {
        try { _player?.pause() } catch {}
        clearLightSchedule(); clearAllKeys()
      } else if (ps === 'stopped' && pp !== 'stopped') {
        stopAudio()
      } else if (ps === 'playing' && (bpmChanged || transposeChanged)) {
        // BPM/transpose change requires a full rebuild (tempo/pitch affects note timing)
        if (schedulingRef.current) return
        schedulingRef.current = true
        buildPlayer(state.currentTime)
        schedulingRef.current = false
      } else if (ps === 'playing' && tracksChanged) {
        // Mute/solo/visible changed — update live filter + lighting without rebuilding player
        updateMutedChannels()
      }
    })
    return () => { unsub(); stopAudio() }
  }, [])

  // ── Live volume changes — send CC 7 immediately while port is open ──────────
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (state.audioEngine !== 'gm') return
      if (state.masterVolume === prevVolumeRef.current) return
      prevVolumeRef.current = state.masterVolume
      applyMasterVolume(state.masterVolume)
    })
    return () => unsub()
  }, [])
}
