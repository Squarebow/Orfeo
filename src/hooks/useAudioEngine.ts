import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// ---------------------------------------------------------------------------
// JZZ audio engine — plays raw MIDI through jzz-synth-tiny (GM sounds)
// Init ONLY when user first presses play (prevents startup freeze on Windows)
// ---------------------------------------------------------------------------

let _jzzReady = false
let _jzzInitP: Promise<void> | null = null
let _JZZ: any = null
let _port: any = null
let _player: any = null
let _notePortReady = false  // tracks whether we've sent program change for click playback

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
        engine.and(function(this: any) {
          const info = this.info()
          console.log('[Orfeo] JZZ engine info:', JSON.stringify(info))
          console.log('[Orfeo] MIDI outputs:', info.outputs?.map((o: any) => o.name))
          resolve()
        }).or(() => resolve())
      })

      // Try system MIDI out first, fall back to tiny synth
      await new Promise<void>((resolve) => {
        _JZZ().openMidiOut().and(function(this: any) {
          _port = this
          _jzzReady = true
          _notePortReady = false  // need to init program
          console.log('[Orfeo] Using system MIDI out:', this.name())
          resolve()
        }).or(() => {
          console.log('[Orfeo] No system MIDI out, trying jzz-synth-tiny...')
          _JZZ.synth.Tiny().and(function(this: any) {
            _port = this
            _jzzReady = true
            _notePortReady = false
            console.log('[Orfeo] Using jzz-synth-tiny')
            resolve()
          }).or((e: any) => {
            console.error('[Orfeo] Both MIDI outputs failed:', e)
            _jzzReady = true
            resolve()
          })
        })
      })
    } catch (e) {
      _jzzInitP = null
      console.error('[Orfeo] JZZ init error:', e)
      throw e
    }
  })()
  return _jzzInitP
}

// Send Grand Piano program change on ch 9 (0-indexed) — dedicated click channel
// Note: ch 9 (0-indexed) is normally drums in GM but we use it here for clicks
// since jzz-synth-tiny doesn't enforce the ch10=drums rule strictly.
// Actually safest: use ch 14 (0-indexed) = ch 15 in 1-indexed, avoids GM drum channel 9
function ensureClickChannel() {
  if (_notePortReady || !_port) return
  try {
    // Ch 14 (0-indexed), program 0 = Acoustic Grand Piano
    _port.send([0xCE, 0])   // Program Change ch 14, prog 0
    _notePortReady = true
    console.log('[Orfeo] Click channel initialized (ch 14, Grand Piano)')
  } catch (e) {
    console.warn('[Orfeo] ensureClickChannel error:', e)
  }
}

// ---------------------------------------------------------------------------
// Key lighting
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
function destroyPlayer() {
  try { _player?.stop() } catch {}
  _player = null
  ;(window as any).__orfeoPlayer = null
}

function buildPlayer(startSec: number) {
  if (!_jzzReady) { console.warn('[Orfeo] buildPlayer: JZZ not ready'); return }
  if (!_port) { console.warn('[Orfeo] buildPlayer: no MIDI port'); return }

  const raw = (useStore.getState().midi as any)?._raw
  if (!raw) { console.warn('[Orfeo] buildPlayer: no raw MIDI data'); return }

  try {
    destroyPlayer()
    clearAllKeys()
    clearLightSchedule()

    const { tracks, bpm, originalBpm, detectedKey } = useStore.getState()
    const transpose = detectedKey?.transpose ?? 0
    const ratio = bpm / originalBpm
    const midiData = useStore.getState().midi as any
    const hasSolo = tracks.some((t: any) => t.solo)

    const mutedCh = new Set<number>()
    for (const tr of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === tr.index)
      if (!ts || ts.muted || !ts.visible) { mutedCh.add(tr.channel); continue }
      if (hasSolo && !ts.solo) mutedCh.add(tr.channel)
    }

    // Schedule key lighting from note data (only for tracks with showOnKeyboard)
    for (const track of midiData.tracks) {
      const ts = tracks.find((t: any) => t.index === track.index)
      if (!ts || ts.muted || !ts.visible) continue
      if (hasSolo && !ts.solo) continue
      if (!ts.showOnKeyboard) continue  // only keyboard-type tracks light keys
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

    console.log('[Orfeo] Building SMF player, raw bytes:', raw.byteLength)
    const smfFile = new _JZZ.MIDI.SMF(new Uint8Array(raw))
    console.log('[Orfeo] SMF parsed, tracks:', smfFile.length)
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
      console.log('[Orfeo] Playback ended')
      useStore.setState({ playbackState: 'stopped', currentTime: 0 })
      ;(window as any).__orfeoPlayer = null
      clearAllKeys()
      // reset click channel ready flag so it re-inits after file playback
      _notePortReady = false
    }

    player.speed(ratio)
    player.play()
    if (startSec > 0.1) player.jumpMS(Math.floor(startSec * 1000))

    _player = player
    setTimeout(() => { ;(window as any).__orfeoPlayer = player }, 50)
    console.log('[Orfeo] Player started from', startSec.toFixed(2), 's')
  } catch (e) {
    console.error('[Orfeo] buildPlayer error:', e)
  }
}

function stopAudio() {
  destroyPlayer()
  clearLightSchedule()
  clearAllKeys()
  if (_port) {
    try {
      for (let ch = 0; ch < 16; ch++) _port.send([0xB0 | ch, 123, 0])
    } catch {}
  }
  _notePortReady = false
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAudioEngine() {
  const prevStateRef = useRef('stopped')
  const prevBpmRef = useRef(120)
  const prevTransposeRef = useRef(0)
  const prevTracksRef = useRef<any>(null)
  const schedulingRef = useRef(false)

  useEffect(() => {
    const playNote = async (midiNum: number, vel = 90, durMs = 500) => {
      try {
        await initJZZ()
        if (!_port) { console.warn('[Orfeo] playNote: no port'); return }
        // Ensure Grand Piano is set on our dedicated click channel (ch 15)
        ensureClickChannel()
        // Use ch 14 (0x9E = note on ch 14) — dedicated click channel with Grand Piano
        _port.send([0x9E, midiNum, Math.round(vel * 127)])
        setTimeout(() => {
          try { _port.send([0x8E, midiNum, 0]) } catch {}
        }, durMs)
        lightKey(midiNum, '#e8a027', durMs + 100)
      } catch (e) { console.error('[Orfeo] playNote error:', e) }
    }
    ;(window as any).__orfeoPlayNote = playNote

    return () => { delete (window as any).__orfeoPlayNote; stopAudio() }
  }, [])

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
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
        clearLightSchedule()
        clearAllKeys()

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
