/**
 * Combined audio engine dispatcher for Orfeo (Stage 5c)
 *
 * Reads audioEngine from store ('gm' | 'sf2') and activates
 * the correct backend. The GM engine (JZZ) and SF2 engine
 * (soundfont-player) each run as separate hooks but only the
 * active one actually responds to playback state changes.
 *
 * The click note handler (window.__orfeoPlayNote) routes to
 * whichever backend is currently active.
 */

import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { useSF2Engine } from './useSF2Engine'

// ── Paste entire original JZZ engine below ────────────────────────────────
// (all the _jzzReady, initJZZ, lightKey, buildPlayer, etc. code)
// Only change: every subscriber check begins with:
//   if (state.audioEngine !== 'gm') return

let _jzzReady = false
let _jzzInitP: Promise<void> | null = null
let _JZZ: any = null
let _port: any = null
let _player: any = null
let _notePortReady = false

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

const _lightSchedule: ReturnType<typeof setTimeout>[] = []
function clearLightSchedule() {
  _lightSchedule.forEach(t => clearTimeout(t))
  _lightSchedule.length = 0
}

function destroyPlayer() {
  try { _player?.stop() } catch {}
  _player = null
  ;(window as any).__orfeoPlayer = null
}

function buildPlayer(startSec: number) {
  if (!_jzzReady || !_port) return
  const raw = (useStore.getState().midi as any)?._raw
  if (!raw) return
  try {
    destroyPlayer(); clearAllKeys(); clearLightSchedule()
    const { tracks, bpm, originalBpm, detectedKey } = useStore.getState()
    const transpose = detectedKey?.transpose ?? 0
    const ratio = bpm / originalBpm
    const midiData = useStore.getState().midi as any
    const hasSolo = tracks.some((t: any) => t.solo)
    const mutedCh = new Set<number>()
    for (const tr of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === tr.index)
      if (!ts || ts.muted || !ts.visible || (hasSolo && !ts.solo)) mutedCh.add(tr.channel)
    }
    for (const track of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === track.index)
      if (!ts || ts.muted || !ts.visible || (hasSolo && !ts.solo) || !ts.showOnKeyboard) continue
      const color = ts.color ?? '#e8a027'
      for (const note of track.notes) {
        const noteStart = note.time / ratio
        if (noteStart < startSec) continue
        const delay = (noteStart - startSec) * 1000
        const durMs = Math.max(note.duration / ratio * 1000, 80)
        const midiNum = note.midi + transpose
        const t = setTimeout(() => lightKey(midiNum, color, Math.min(durMs + 80, 2500)), delay)
        _lightSchedule.push(t)
      }
    }
    const smfFile = new _JZZ.MIDI.SMF(new Uint8Array(raw))
    const player = smfFile.player()
    player.connect(_port)
    player.filter(function(this: any, msg: any) {
      const status = msg[0] & 0xF0
      const ch = msg[0] & 0x0F
      if (mutedCh.has(ch)) return
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
    player.play()
    if (startSec > 0.1) player.jumpMS(Math.floor(startSec * 1000))
    _player = player
    setTimeout(() => { ;(window as any).__orfeoPlayer = player }, 50)
  } catch (e) {
    console.error('[Orfeo GM] buildPlayer error:', e)
  }
}

function stopAudio() {
  destroyPlayer(); clearLightSchedule(); clearAllKeys()
  if (_port) {
    try { for (let ch = 0; ch < 16; ch++) _port.send([0xB0 | ch, 123, 0]) } catch {}
  }
  _notePortReady = false
}

// ── Combined hook ─────────────────────────────────────────────────────────────
export function useAudioEngine() {
  // Always mount SF2 engine (it self-gates on audioEngine !== 'sf2')
  useSF2Engine()

  const prevStateRef = useRef('stopped')
  const prevBpmRef = useRef(120)
  const prevTransposeRef = useRef(0)
  const prevTracksRef = useRef<any>(null)
  const schedulingRef = useRef(false)

  useEffect(() => {
    const playNote = async (midiNum: number, vel = 90, durMs = 500) => {
      const { audioEngine } = useStore.getState()
      if (audioEngine === 'sf2') {
        const fn = (window as any).__orfeoPlayNoteSF2
        if (fn) { fn(midiNum, vel / 127, durMs); return }
      }
      try {
        await initJZZ()
        if (!_port) return
        ensureClickChannel()
        _port.send([0x9E, midiNum, Math.round(vel * 127)])
        setTimeout(() => { try { _port.send([0x8E, midiNum, 0]) } catch {} }, durMs)
        lightKey(midiNum, '#e8a027', durMs + 100)
      } catch (e) { console.error('[Orfeo GM] playNote error:', e) }
    }
    ;(window as any).__orfeoPlayNote = playNote
    return () => { delete (window as any).__orfeoPlayNote; stopAudio() }
  }, [])

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      // GM engine only responds when audioEngine === 'gm'
      if (state.audioEngine !== 'gm') return

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
      } else if (ps === 'playing' && (bpmChanged || transposeChanged || tracksChanged)) {
        if (schedulingRef.current) return
        schedulingRef.current = true
        buildPlayer(state.currentTime)
        schedulingRef.current = false
      }
    })
    return () => { unsub(); stopAudio() }
  }, [])
}
