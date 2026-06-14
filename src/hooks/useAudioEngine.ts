import { useEffect, useRef } from 'react'
import { useStore } from '../store'

const isPianoProgram = (p: number) => p >= 0 && p <= 7

let _JZZ: any = null
let _port: any = null
let _ready = false
let _initP: Promise<void> | null = null

function initJZZ(): Promise<void> {
  if (_ready) return Promise.resolve()
  if (_initP) return _initP
  _initP = (async () => {
    const jzzMod = await import('jzz')
    _JZZ = jzzMod.default ?? jzzMod
    const smfMod = await import('jzz-midi-smf')
    const tinyMod = await import('jzz-synth-tiny')
    ;(smfMod.default ?? smfMod)(_JZZ)
    ;(tinyMod.default ?? tinyMod)(_JZZ)
    await new Promise<void>((resolve, reject) => {
      _JZZ.synth.Tiny().and(function(this: any) {
        _port = this; _ready = true
        console.log('[Orfeo] JZZ ready')
        resolve()
      }).or((e: any) => { _initP = null; reject(e) })
    })
  })()
  return _initP
}

export function useAudioEngine() {
  const playerRef = useRef<any>(null)
  const keyTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const prevStateRef = useRef('stopped')
  const prevTimeRef = useRef(0)  // track last known time to detect scrub
  const chProgsRef = useRef<Map<number, number>>(new Map())

  const clearKeys = () => {
    keyTimersRef.current.forEach(t => clearTimeout(t))
    keyTimersRef.current.clear()
    useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
  }

  const destroyPlayer = () => {
    try { playerRef.current?.stop() } catch {}
    playerRef.current = null
    ;(window as any).__orfeoPlayer = null
    clearKeys()
  }

  const buildPlayer = async (startSec: number) => {
    const raw = (useStore.getState().midi as any)?._raw
    if (!raw) return
    try {
      await initJZZ()
      destroyPlayer()
      chProgsRef.current.clear()

      const { tracks, bpm, originalBpm } = useStore.getState()
      const midiData = useStore.getState().midi as any
      const ratio = bpm / originalBpm
      const hasSolo = tracks.some((t: any) => t.solo)
      const mutedCh = new Set<number>()
      for (const tr of midiData.tracks) {
        const ts = tracks.find((t: any) => t.index === tr.index)
        if (!ts || ts.muted || !ts.visible) { mutedCh.add(tr.channel); continue }
        if (hasSolo && !ts.solo) mutedCh.add(tr.channel)
      }

      const smfFile = new _JZZ.MIDI.SMF(new Uint8Array(raw))
      const player = smfFile.player()
      player.connect(_port)

      const chProgs = chProgsRef.current
      player.filter(function(this: any, msg: any) {
        const status = msg[0] & 0xF0
        const ch = msg[0] & 0x0F
        if (status === 0xC0) chProgs.set(ch, msg[1])
        if (mutedCh.has(ch)) return
        this._receive(msg)
        if (status === 0x90 && msg[2] > 0) {
          const note = msg[1]
          if (isPianoProgram(chProgs.get(ch) ?? 0)) {
            const tr = midiData.tracks.find((t: any) => t.channel === ch)
            const ts = useStore.getState().tracks.find((t: any) => tr && t.index === tr.index)
            const color = ts?.color ?? '#e8a027'
            const prev = new Set(useStore.getState().activeKeys)
            prev.add(note)
            const cols = new Map(useStore.getState().activeKeyColors)
            cols.set(note, color)
            useStore.setState({ activeKeys: prev, activeKeyColors: cols })
            keyTimersRef.current.set(note, setTimeout(() => {
              const s = new Set(useStore.getState().activeKeys); s.delete(note)
              const c = new Map(useStore.getState().activeKeyColors); c.delete(note)
              useStore.setState({ activeKeys: s, activeKeyColors: c })
              keyTimersRef.current.delete(note)
            }, 2000))
          }
        }
        if (status === 0x80 || (status === 0x90 && msg[2] === 0)) {
          const note = msg[1]
          const t = keyTimersRef.current.get(note)
          if (t) { clearTimeout(t); keyTimersRef.current.delete(note) }
          const s = new Set(useStore.getState().activeKeys); s.delete(note)
          const c = new Map(useStore.getState().activeKeyColors); c.delete(note)
          useStore.setState({ activeKeys: s, activeKeyColors: c })
        }
      })

      player.onEnd = () => {
        useStore.setState({ playbackState: 'stopped', currentTime: 0 })
        ;(window as any).__orfeoPlayer = null
        clearKeys()
      }

      player.speed(ratio)
      player.play()

      // jumpMS AFTER play() — play() resets position to 0
      if (startSec > 0.1) {
        player.jumpMS(Math.floor(startSec * 1000))
      }

      playerRef.current = player
      prevTimeRef.current = startSec

      // Delay exposing player so rAF reads correct position
      setTimeout(() => {
        ;(window as any).__orfeoPlayer = player
      }, 50)

      console.log('[Orfeo] playing from', startSec.toFixed(2), 's')
    } catch (e) {
      console.error('[Orfeo] buildPlayer error:', e)
    }
  }

  const playNote = async (midi: number, vel = 90, durMs = 400) => {
    try {
      await initJZZ()
      _port.noteOn(0, midi, vel)
      setTimeout(() => _port.noteOff(0, midi, 0), durMs)
      const prev = new Set(useStore.getState().activeKeys)
      prev.add(midi)
      const cols = new Map(useStore.getState().activeKeyColors)
      cols.set(midi, '#e8a027')
      useStore.setState({ activeKeys: prev, activeKeyColors: cols })
      setTimeout(() => {
        const s = new Set(useStore.getState().activeKeys); s.delete(midi)
        const c = new Map(useStore.getState().activeKeyColors); c.delete(midi)
        useStore.setState({ activeKeys: s, activeKeyColors: c })
      }, durMs + 100)
    } catch (e) { console.error('[Orfeo] playNote error:', e) }
  }

  useEffect(() => {
    ;(window as any).__orfeoPlayNote = playNote
    initJZZ().catch(console.error)
    return () => { delete (window as any).__orfeoPlayNote; destroyPlayer() }
  }, [])

  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      const ps = state.playbackState
      const pp = prevStateRef.current
      prevStateRef.current = ps

      if (ps === 'playing' && pp !== 'playing') {
        const timeDiff = Math.abs(state.currentTime - prevTimeRef.current)
        const isScrub = timeDiff > 0.5  // user moved time significantly
        const isResumeFromPause = pp === 'paused' && !isScrub

        if (isResumeFromPause && playerRef.current) {
          // True resume — reuse existing player, don't rebuild
          try {
            playerRef.current.resume()
            ;(window as any).__orfeoPlayer = playerRef.current
          } catch { buildPlayer(state.currentTime) }
        } else {
          // New play or scrub — rebuild from new position
          buildPlayer(state.currentTime)
        }
        prevTimeRef.current = state.currentTime
      } else if (ps === 'paused' && pp === 'playing') {
        prevTimeRef.current = state.currentTime
        try { playerRef.current?.pause() } catch {}
        clearKeys()
      } else if (ps === 'stopped' && pp !== 'stopped') {
        prevTimeRef.current = 0
        destroyPlayer()
      } else if (ps === 'playing' && (state.bpm !== prev.bpm || state.tracks !== prev.tracks)) {
        buildPlayer(state.currentTime)
      }
    })
    return () => { unsub(); destroyPlayer() }
  }, [])
}