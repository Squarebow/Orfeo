/**
 * SF2 sample-based audio engine for Orfeo (Stage 5c)
 *
 * Uses WebAudioFont (pre-encoded JS soundfonts) — no large SF2 file needed.
 * Each GM instrument is a small JS file with base64-encoded samples.
 * Loads on demand, cached after first use.
 *
 * Bundled: GeneralUser GS via @danigb/soundfont-player
 * Falls back to GM synth if SF2 not available.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// ─── Audio context singleton ─────────────────────────────────────────────────
let _ctx: AudioContext | null = null
function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new AudioContext()
  }
  if (_ctx.state === 'suspended') _ctx.resume()
  return _ctx
}

// ─── Buffer cache: program → AudioBuffer[] (one per note, sparse) ───────────
const _bufferCache = new Map<string, Map<number, AudioBuffer>>()
// Active source nodes (for stopping)
const _activeSources = new Map<number, AudioBufferSourceNode>()

// ─── Soundfont player (soundfont-player npm) ─────────────────────────────────
let _soundfontPlayer: any = null
let _soundfontInstruments = new Map<number, any>()

async function ensureSoundfontPlayer() {
  if (_soundfontPlayer) return _soundfontPlayer
  try {
    // Dynamic import of soundfont-player
    const mod = await import('soundfont-player' as any)
    _soundfontPlayer = mod.default ?? mod
    return _soundfontPlayer
  } catch (e) {
    console.warn('[Orfeo SF2] soundfont-player not available:', e)
    return null
  }
}

// Map GM program numbers to soundfont-player instrument names
const GM_PROGRAM_TO_SOUNDFONT: Record<number, string> = {
  // Piano
  0: 'acoustic_grand_piano', 1: 'bright_acoustic_piano', 2: 'electric_grand_piano',
  3: 'honkytonk_piano', 4: 'electric_piano_1', 5: 'electric_piano_2',
  6: 'harpsichord', 7: 'clavinet',
  // Chromatic Perc
  8: 'celesta', 9: 'glockenspiel', 10: 'music_box', 11: 'vibraphone',
  12: 'marimba', 13: 'xylophone', 14: 'tubular_bells', 15: 'dulcimer',
  // Organ
  16: 'drawbar_organ', 17: 'percussive_organ', 18: 'rock_organ',
  19: 'church_organ', 20: 'reed_organ', 21: 'accordion', 22: 'harmonica',
  23: 'tango_accordion',
  // Guitar
  24: 'acoustic_guitar_nylon', 25: 'acoustic_guitar_steel',
  26: 'electric_guitar_jazz', 27: 'electric_guitar_clean',
  // Bass
  32: 'acoustic_bass', 33: 'electric_bass_finger', 34: 'electric_bass_pick',
  // Strings
  40: 'violin', 41: 'viola', 42: 'cello', 43: 'contrabass',
  44: 'tremolo_strings', 45: 'pizzicato_strings', 46: 'orchestral_harp',
  47: 'timpani',
  // Ensemble
  48: 'string_ensemble_1', 49: 'string_ensemble_2',
  // Brass
  56: 'trumpet', 57: 'trombone', 58: 'tuba', 60: 'french_horn',
  // Reed
  64: 'soprano_sax', 65: 'alto_sax', 66: 'tenor_sax', 67: 'baritone_sax',
  68: 'oboe', 69: 'english_horn', 70: 'bassoon', 71: 'clarinet',
  // Pipe
  72: 'piccolo', 73: 'flute', 74: 'recorder', 75: 'pan_flute',
}

function programToInstrumentName(program: number): string {
  return GM_PROGRAM_TO_SOUNDFONT[program] ?? 'acoustic_grand_piano'
}

async function getInstrument(program: number): Promise<any | null> {
  const Soundfont = await ensureSoundfontPlayer()
  if (!Soundfont) return null
  if (_soundfontInstruments.has(program)) return _soundfontInstruments.get(program)
  try {
    const ctx = getCtx()
    const name = programToInstrumentName(program)
    console.log(`[Orfeo SF2] Loading instrument: ${name} (prog ${program})`)
    const instrument = await Soundfont.instrument(ctx, name, {
      soundfont: 'MusyngKite',
      format: 'mp3',
    })
    _soundfontInstruments.set(program, instrument)
    return instrument
  } catch (e) {
    console.warn(`[Orfeo SF2] Failed to load instrument prog ${program}:`, e)
    return null
  }
}

// ─── Key lighting (same helper as GM engine) ─────────────────────────────────
const _keyTimers = new Map<number, ReturnType<typeof setTimeout>>()

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

function clearAllKeys() {
  _keyTimers.forEach(t => clearTimeout(t))
  _keyTimers.clear()
  useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
}

// ─── Playback scheduler ───────────────────────────────────────────────────────
const _schedule: ReturnType<typeof setTimeout>[] = []
let _startWallClock = 0
let _startMidiTime = 0
let _playing = false
let _rafHandle = 0

function clearSchedule() {
  _schedule.forEach(t => clearTimeout(t))
  _schedule.length = 0
  _activeSources.forEach(s => { try { s.stop() } catch {} })
  _activeSources.clear()
  cancelAnimationFrame(_rafHandle)
  _playing = false
}

async function buildSF2Player(startSec: number) {
  clearSchedule()
  clearAllKeys()

  const { midi, tracks, bpm, originalBpm, detectedKey } = useStore.getState()
  if (!midi) return

  const ratio = bpm / originalBpm
  const transpose = detectedKey?.transpose ?? 0
  const hasSolo = tracks.some(t => t.solo)
  const now = performance.now()
  _startWallClock = now
  _startMidiTime = startSec
  _playing = true

  // Pre-load all needed instruments
  const programsNeeded = new Set<number>()
  for (const track of (midi as any).tracks) {
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || ts.muted || !ts.visible) continue
    if (hasSolo && !ts.solo) continue
    programsNeeded.add(ts.program >= 0 ? ts.program : 0)
  }

  // Load instruments in parallel
  await Promise.all(Array.from(programsNeeded).map(p => getInstrument(p)))

  if (!_playing) return // stopped during load

  // Schedule notes
  for (const track of (midi as any).tracks) {
    const ts = tracks.find((t: any) => t.index === track.index)
    if (!ts || ts.muted || !ts.visible) continue
    if (hasSolo && !ts.solo) continue

    const instrument = await getInstrument(ts.program >= 0 ? ts.program : 0)
    const color = ts.color ?? '#e8a027'
    const showOnKb = ts.showOnKeyboard

    for (const note of track.notes) {
      const noteStart = note.time / ratio
      if (noteStart < startSec) continue
      const delay = (noteStart - startSec) * 1000
      const durMs = Math.max(note.duration / ratio * 1000, 80)
      const midiNum = Math.max(0, Math.min(127, note.midi + transpose))
      const vel = Math.min(1, note.velocity * 1.2)

      const t = setTimeout(async () => {
        if (!_playing) return
        if (instrument) {
          try {
            instrument.play(midiNum.toString(), getCtx().currentTime, {
              gain: vel,
              duration: durMs / 1000,
            })
          } catch {}
        }
        if (showOnKb) lightKey(midiNum, color, Math.min(durMs + 80, 2500))
      }, delay)
      _schedule.push(t)
    }
  }

  // End of song detection via RAF
  const totalDuration = (midi.duration / ratio - startSec) * 1000
  const endTimer = setTimeout(() => {
    if (!_playing) return
    _playing = false
    clearAllKeys()
    useStore.setState({ playbackState: 'stopped', currentTime: 0 })
  }, totalDuration + 500)
  _schedule.push(endTimer)

  // Current time tracker
  function tick() {
    if (!_playing) return
    const elapsed = (performance.now() - _startWallClock) / 1000
    useStore.setState({ currentTime: _startMidiTime + elapsed * ratio })
    _rafHandle = requestAnimationFrame(tick)
  }
  _rafHandle = requestAnimationFrame(tick)
}

// ─── Exported hook ─────────────────────────────────────────────────────────────
export function useSF2Engine() {
  const prevStateRef = useRef('stopped')
  const prevBpmRef = useRef(120)
  const prevTransposeRef = useRef(0)
  const prevTracksRef = useRef<any>(null)

  useEffect(() => {
    // Click note player for SF2 mode
    const playNote = async (midiNum: number, vel = 0.7, durMs = 500) => {
      const instrument = await getInstrument(0) // Grand Piano for clicks
      if (!instrument) return
      try {
        const ctx = getCtx()
        instrument.play(midiNum.toString(), ctx.currentTime, { gain: vel, duration: durMs / 1000 })
        lightKey(midiNum, '#e8a027', durMs + 100)
      } catch (e) {
        console.error('[Orfeo SF2] playNote error:', e)
      }
    }
    ;(window as any).__orfeoPlayNoteSF2 = playNote

    return () => {
      delete (window as any).__orfeoPlayNoteSF2
      clearSchedule()
      clearAllKeys()
    }
  }, [])

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      // Only active when audioEngine === 'sf2'
      if (state.audioEngine !== 'sf2') return

      const ps = state.playbackState
      const pp = prevStateRef.current
      const bpmChanged = state.bpm !== prevBpmRef.current
      const transposeChanged = (state.detectedKey?.transpose ?? 0) !== prevTransposeRef.current
      const tracksChanged = state.tracks !== prevTracksRef.current

      prevStateRef.current = ps
      prevBpmRef.current = state.bpm
      prevTransposeRef.current = state.detectedKey?.transpose ?? 0
      prevTracksRef.current = state.tracks

      if (ps === 'playing' && pp !== 'playing') {
        buildSF2Player(state.currentTime).catch(console.error)
      } else if (ps === 'paused' && pp === 'playing') {
        clearSchedule()
        clearAllKeys()
      } else if (ps === 'stopped' && pp !== 'stopped') {
        clearSchedule()
        clearAllKeys()
      } else if (ps === 'playing' && (bpmChanged || transposeChanged || tracksChanged)) {
        buildSF2Player(state.currentTime).catch(console.error)
      }
    })
    return () => { unsub(); clearSchedule(); clearAllKeys() }
  }, [])
}
