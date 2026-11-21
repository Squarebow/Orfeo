import { create } from 'zustand'
import { useStore } from '../store'
import { usePractice, practisedHand } from './practiceMode'
import { useWaiting } from './listen'
import { FINGER_VERSION } from '../utils/fingering'

// ── Fingering on the virtual keyboard (practice stage 10) ────────────────────
// In practice mode all eyes are on the keyboard, so that's where the fingering
// shows: the finger number on each key your hand(s) play right now (while
// the song waits, on the keys it waits for). Worked out here so the keyboard only
// redraws when the numbers actually change, not on every frame.

export const useKeyFingers = create<{ fingers: Map<number, number> }>(() => ({ fingers: new Map() }))   // key (as shown, after a key change) → finger

interface Fingered { midi: number; time: number; end: number; finger: number; hand: 'L' | 'R' }
let cache: { midi: unknown; tracks: unknown; version: number; notes: Fingered[]; longest: number } | null = null
let lastKey = ''

function song() {
  const s = useStore.getState()
  if (cache && cache.midi === s.midi && cache.tracks === s.tracks && cache.version === FINGER_VERSION.n) return cache
  const notes: Fingered[] = []
  for (const ts of s.tracks) {
    if (!ts.practicePart || !ts.practiceHand) continue
    for (const n of s.midi?.tracks.find(t => t.index === ts.index)?.notes ?? []) {
      if (n.finger) notes.push({ midi: n.midi, time: n.time, end: n.time + n.duration, finger: n.finger, hand: ts.practiceHand })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  cache = { midi: s.midi, tracks: s.tracks, version: FINGER_VERSION.n, notes, longest: notes.reduce((m, n) => Math.max(m, n.end - n.time), 0) }
  return cache
}

function update() {
  const s = useStore.getState(), p = usePractice.getState(), w = useWaiting.getState()
  const fingers = new Map<number, number>()
  if (p.active && s.practiceFingering && s.midi) {
    const c = song()
    const shift = s.detectedKey?.transpose ?? 0
    const holding = w.holding && w.at !== null
    const t = holding ? w.at! : s.currentTime
    const hand = practisedHand()   // practising one hand: only its fingers (the other plays along)
    // from the first note that could still be sounding
    let lo = 0, hi = c.notes.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (c.notes[m].time < t - c.longest - 0.05) lo = m + 1; else hi = m }
    for (let i = lo; i < c.notes.length && c.notes[i].time <= t + 0.03; i++) {
      const n = c.notes[i]
      if (hand !== 'B' && n.hand !== hand) continue
      if (holding ? Math.abs(n.time - t) < 0.03 : n.end > t + 0.001) fingers.set(n.midi + shift, n.finger)
    }
  }
  const key = [...fingers].join()
  if (key === lastKey) return
  lastKey = key
  useKeyFingers.setState({ fingers })
}

useStore.subscribe((s, prev) => {
  if (s.currentTime !== prev.currentTime || s.midi !== prev.midi || s.tracks !== prev.tracks || s.detectedKey !== prev.detectedKey
    || s.practiceFingering !== prev.practiceFingering) update()
})
usePractice.subscribe((p, prev) => { if (p.active !== prev.active || p.hand !== prev.hand || p.way !== prev.way) update() })
useWaiting.subscribe(update)
