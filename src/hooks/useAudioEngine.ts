import { useEffect, useRef } from 'react'
import * as Tone from 'tone'
import { useStore } from '../store'

const MAX_VOICES = 6

let masterLimiter: Tone.Limiter | null = null
const getDestination = () => {
  if (!masterLimiter) masterLimiter = new Tone.Limiter(-6).toDestination()
  return masterLimiter
}

function makeSynth(program: number): Tone.PolySynth {
  const p = { maxPolyphony: MAX_VOICES }
  const dest = getDestination()
  if (program <= 7)  return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.2 }, volume: -10 }).connect(dest)
  if (program <= 15) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.5 }, volume: -10 }).connect(dest)
  if (program <= 23) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.01, sustain: 0.9, release: 0.05 }, volume: -16 }).connect(dest)
  if (program <= 31) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.3 }, volume: -12 }).connect(dest)
  if (program <= 39) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'triangle' }, envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.3 }, volume: -8 }).connect(dest)
  if (program <= 47) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1, decay: 0.2, sustain: 0.8, release: 0.5 }, volume: -14 }).connect(dest)
  if (program <= 55) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sine' }, envelope: { attack: 0.15, decay: 0.1, sustain: 0.9, release: 0.8 }, volume: -14 }).connect(dest)
  if (program <= 63) return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.2 }, volume: -12 }).connect(dest)
  return new Tone.PolySynth(Tone.Synth, { ...p, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.03, decay: 0.05, sustain: 0.8, release: 0.3 }, volume: -14 }).connect(dest)
}

const isPianoProgram = (program: number) => program <= 7

export function useAudioEngine() {
  const synthsRef = useRef<Map<number, Tone.PolySynth>>(new Map())
  const partsRef = useRef<Tone.Part[]>([])
  const prevStateRef = useRef<string>('stopped')

  const disposeSynths = () => {
    synthsRef.current.forEach(s => { try { s.releaseAll(); s.dispose() } catch {} })
    synthsRef.current.clear()
  }

  const clearParts = () => {
    partsRef.current.forEach(p => { try { p.stop(0); p.dispose() } catch {} })
    partsRef.current = []
  }

  const allNotesOff = () => {
    synthsRef.current.forEach(s => { try { s.releaseAll() } catch {} })
    useStore.setState({ activeKeys: new Set(), activeKeyColors: new Map() })
  }

  const getSynth = (program: number) => {
    if (!synthsRef.current.has(program)) synthsRef.current.set(program, makeSynth(program))
    return synthsRef.current.get(program)!
  }

  const startAudio = async (startMidiTime: number) => {
    const { midi, tracks, bpm, originalBpm } = useStore.getState()
    if (!midi) return

    await Tone.start()

    const transport = Tone.getTransport()
    transport.stop()
    transport.cancel()
    clearParts()
    disposeSynths()
    allNotesOff()

    const tempoRatio = bpm / originalBpm

    for (let ti = 0; ti < midi.tracks.length; ti++) {
      const track = midi.tracks[ti]
      const ts = tracks.find(t => t.index === track.index)
      if (!ts || !ts.visible) continue
      if (track.channel === 9) continue

      const program: number = (track as any).instrument?.number ?? 0
      const synth = getSynth(program)
      const trackIndex = track.index
      const shouldLightKeys = isPianoProgram(program)

      const events: [number, any][] = track.notes
        .filter(n => n.time >= startMidiTime - 0.05)
        .map(n => [
          Math.max(0, (n.time - startMidiTime) / tempoRatio),
          {
            m: n.midi,
            d: Math.max(0.05, n.duration / tempoRatio),
            v: n.velocity,
            ti: trackIndex,
            light: shouldLightKeys,
          }
        ])

      if (events.length === 0) continue

      const part = new Tone.Part((time, ev) => {
        // Check mute/solo in real time — no rebuild needed
        const { playbackState, tracks: currentTracks } = useStore.getState()
        if (playbackState !== 'playing') return

        const currentTs = currentTracks.find(t => t.index === ev.ti)
        if (!currentTs || currentTs.muted || !currentTs.visible) return

        const hasSolo = currentTracks.some(t => t.solo)
        if (hasSolo && !currentTs.solo) return

        try {
          synth.triggerAttackRelease(
            Tone.Frequency(ev.m, 'midi').toFrequency(),
            ev.d, time, ev.v
          )
        } catch {}

        if (!ev.light) return

        Tone.getDraw().schedule(() => {
          const { playbackState: ps, tracks: ts2 } = useStore.getState()
          if (ps !== 'playing') return
          const ts3 = ts2.find(t => t.index === ev.ti)
          if (!ts3 || ts3.muted || !ts3.visible) return
          const hasSolo2 = ts2.some(t => t.solo)
          if (hasSolo2 && !ts3.solo) return

          const prev = new Set(useStore.getState().activeKeys)
          prev.add(ev.m)
          const colors = new Map(useStore.getState().activeKeyColors)
          colors.set(ev.m, ts3.color)
          useStore.setState({ activeKeys: prev, activeKeyColors: colors })

          setTimeout(() => {
            const curr = new Set(useStore.getState().activeKeys)
            curr.delete(ev.m)
            const cm = new Map(useStore.getState().activeKeyColors)
            cm.delete(ev.m)
            useStore.setState({ activeKeys: curr, activeKeyColors: cm })
          }, ev.d * 1000)
        }, time)
      }, events)

      part.start(0)
      partsRef.current.push(part)
    }

    transport.start()
  }

  const stopAudio = () => {
    Tone.getTransport().stop()
    Tone.getTransport().cancel()
    clearParts()
    allNotesOff()
  }

  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, prev) => {
      const { playbackState, currentTime, bpm } = state
      const prevState = prevStateRef.current
      prevStateRef.current = playbackState

      // Only rebuild on play/pause/stop transitions and BPM changes
      // Mute/solo are handled in real time inside Part callbacks — no rebuild needed
      if (playbackState === 'playing' && prevState !== 'playing') {
        startAudio(currentTime)
        return
      }
      if (playbackState === 'paused' && prevState === 'playing') {
        stopAudio()
        return
      }
      if (playbackState === 'stopped' && prevState !== 'stopped') {
        stopAudio()
        disposeSynths()
        return
      }
      if (playbackState === 'playing' && bpm !== prev.bpm) {
        startAudio(currentTime)
      }
    })

    return () => {
      unsubscribe()
      stopAudio()
      disposeSynths()
    }
  }, [])
}