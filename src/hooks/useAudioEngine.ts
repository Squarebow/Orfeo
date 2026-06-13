import { useEffect, useRef } from 'react'
import Soundfont from 'soundfont-player'
import { useStore } from '../store'

export function useAudioEngine() {
  const instrumentRef = useRef<Soundfont.Player | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastTimeRef = useRef<number>(-1)
  const scheduledRef = useRef<Set<string>>(new Set())
  const activeKeyTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const loadingRef = useRef(false)

  const getOrCreateContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  const loadInstrument = async () => {
    if (loadingRef.current || instrumentRef.current) return
    loadingRef.current = true
    try {
      const ctx = getOrCreateContext()
      const instrument = await Soundfont.instrument(ctx, 'acoustic_grand_piano', {
        soundfont: 'MusyngKite',
        gain: 4,
      })
      instrumentRef.current = instrument
      console.log('Piano soundfont loaded')
    } catch (e) {
      console.warn('Soundfont load failed:', e)
      loadingRef.current = false
    }
  }

  // Start loading immediately
  useEffect(() => {
    loadInstrument()
    return () => {
      audioCtxRef.current?.close()
      audioCtxRef.current = null
      instrumentRef.current = null
      loadingRef.current = false
    }
  }, [])

  // Polling loop
  useEffect(() => {
    const LOOKAHEAD = 2.0

    const poll = () => {
      const { midi, playbackState, currentTime, tracks, bpm, originalBpm } = useStore.getState()

      if (playbackState !== 'playing') {
        if (lastTimeRef.current !== -1) {
          lastTimeRef.current = -1
          scheduledRef.current.clear()
          activeKeyTimersRef.current.forEach((t) => clearTimeout(t))
          activeKeyTimersRef.current.clear()
          useStore.setState({ activeKeys: new Set() })
        }
        return
      }

      if (!midi) return

      // Load instrument on first play if not loaded yet
      if (!instrumentRef.current) {
        loadInstrument()
        return
      }

      const ctx = getOrCreateContext()

      // Detect seek backward
      if (currentTime < lastTimeRef.current - 1.0) {
        scheduledRef.current.clear()
        activeKeyTimersRef.current.forEach((t) => clearTimeout(t))
        activeKeyTimersRef.current.clear()
        useStore.setState({ activeKeys: new Set() })
      }

      lastTimeRef.current = currentTime
      const tempoRatio = bpm / originalBpm
      const windowEnd = currentTime + LOOKAHEAD

      for (let ti = 0; ti < midi.tracks.length; ti++) {
        const track = midi.tracks[ti]
        const ts = tracks.find((t) => t.index === track.index)
        if (ts && (ts.muted || !ts.visible)) continue

        for (let ni = 0; ni < track.notes.length; ni++) {
          const note = track.notes[ni]
          const key = `${ti}-${ni}`

          if (note.time < currentTime - 0.05 || note.time > windowEnd) continue
          if (scheduledRef.current.has(key)) continue
          scheduledRef.current.add(key)

          const delayMs = Math.max(0, (note.time - currentTime) / tempoRatio) * 1000
          const durSec = note.duration / tempoRatio
          const midiNum = note.midi

          setTimeout(() => {
            if (useStore.getState().playbackState !== 'playing') return
            const currentCtx = audioCtxRef.current
            if (!currentCtx || currentCtx.state === 'closed') return

            instrumentRef.current?.play(midiNum.toString(), currentCtx.currentTime, {
              duration: durSec,
              gain: note.velocity * 6,
            })

            // Light up key
            const prev = new Set(useStore.getState().activeKeys)
            prev.add(midiNum)
            useStore.setState({ activeKeys: prev })

            const t = setTimeout(() => {
              const curr = new Set(useStore.getState().activeKeys)
              curr.delete(midiNum)
              useStore.setState({ activeKeys: curr })
              activeKeyTimersRef.current.delete(midiNum)
            }, durSec * 1000)
            activeKeyTimersRef.current.set(midiNum, t)
          }, delayMs)
        }
      }
    }

    const intervalId = setInterval(poll, 100)
    return () => clearInterval(intervalId)
  }, [])
}