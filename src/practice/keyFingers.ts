import { create } from 'zustand'
import { useStore } from '../store'
import { usePractice, practisedHand } from './practiceMode'
import { useWaiting } from './listen'
import { FINGER_VERSION } from '../utils/fingering'
import { shownFinger, useFingerHints } from './fingerHints'

// ── Fingering on the virtual keyboard (practice stage 10) ────────────────────
// In practice mode all eyes are on the keyboard, so that's where the fingering
// shows: the finger number on each key your hand(s) play right now (while
// the song waits, on the keys it waits for). Worked out here so the keyboard only
// redraws when the numbers actually change, not on every frame.

// key (as shown, after a key change) → finger; `suggested`: the keys whose number is Orfeo's suggestion, not yours
export const useKeyFingers = create<{ fingers: Map<number, number>; suggested: Set<number> }>(() => ({ fingers: new Map(), suggested: new Set() }))

interface Fingered { midi: number; time: number; end: number; finger: number; hand: 'L' | 'R'; suggested: boolean }
let cache: { midi: unknown; tracks: unknown; version: number; hints: number; notes: Fingered[]; longest: number } | null = null
let lastKey = ''

function song() {
  const s = useStore.getState()
  const hints = useFingerHints.getState().v
  if (cache && cache.midi === s.midi && cache.tracks === s.tracks && cache.version === FINGER_VERSION.n && cache.hints === hints) return cache
  const notes: Fingered[] = []
  for (const ts of s.tracks) {
    if (!ts.practicePart || !ts.practiceHand) continue
    for (const n of s.midi?.tracks.find(t => t.index === ts.index)?.notes ?? []) {
      const f = shownFinger(n as { finger?: number; fingerHint?: number })
      if (f) notes.push({ midi: n.midi, time: n.time, end: n.time + n.duration, finger: f.finger, hand: ts.practiceHand, suggested: f.suggested })
    }
  }
  notes.sort((a, b) => a.time - b.time)
  cache = { midi: s.midi, tracks: s.tracks, version: FINGER_VERSION.n, hints, notes, longest: notes.reduce((m, n) => Math.max(m, n.end - n.time), 0) }
  return cache
}

function update() {
  const s = useStore.getState(), p = usePractice.getState(), w = useWaiting.getState()
  const fingers = new Map<number, number>()
  const suggested = new Set<number>()
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
      if (holding ? Math.abs(n.time - t) < 0.03 : n.end > t + 0.001) {
        fingers.set(n.midi + shift, n.finger)
        if (n.suggested) suggested.add(n.midi + shift); else suggested.delete(n.midi + shift)
      }
    }
  }
  const key = [...fingers].join() + '|' + [...suggested].join()
  if (key === lastKey) return
  lastKey = key
  useKeyFingers.setState({ fingers, suggested })
}

useStore.subscribe((s, prev) => {
  if (s.currentTime !== prev.currentTime || s.midi !== prev.midi || s.tracks !== prev.tracks || s.detectedKey !== prev.detectedKey
    || s.practiceFingering !== prev.practiceFingering) update()
})
usePractice.subscribe((p, prev) => { if (p.active !== prev.active || p.hand !== prev.hand || p.way !== prev.way) update() })
useWaiting.subscribe(update)
useFingerHints.subscribe(update)
