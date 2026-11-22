import { create } from 'zustand'
import { useStore } from '../store'
import { CHORD_GRACE_SEC } from '../utils/midiParser'
import { HAND_LH_CSS, HAND_RH_CSS } from '../utils/handColors'
import { setLightSource } from '../hooks/keyLightsOutput'
import { usePractice } from './practiceMode'
import { currentMatcher, useListen, useWaiting } from './listen'
import { useReview, reviewing } from './reviewState'
import type { Expected } from './matcher'
import { useFingerHints } from './fingerHints'

// ── Lighted keyboards in practice mode (practice stage 7) ────────────────────
// Outside practice mode a lighted keyboard shows the song's notes as they
// sound (hooks/keyLightsOutput.ts). In practice mode it shows only what you
// play, and a moment before you play it:
//   - as the song plays, each of your notes lights a moment early and goes
//     dark when it ends (a key played again goes dark briefly first, so you
//     see it's struck again);
//   - while the song waits for you, the keys it waits for stay lit until
//     you've played them, each going dark as you press it;
//   - stopped or paused, the first notes you'll play light, so your hands
//     find their place before you start.
// The band and the hand Orfeo plays for you never light. Same path to every
// keyboard as outside practice mode, so the Settings choices all apply.

/** How early a note lights, in real seconds (the same at any speed) */
export const LIGHT_AHEAD_SEC = 0.25
/** A key played again goes dark this long before it lights again */
export const LIGHT_GAP_SEC = 0.08

export interface LitKey { hand: 'L' | 'R'; finger?: number }

interface Prepared { exp: readonly Expected[]; nextSame: number[]; longest: number }

/** For one set of notes: where each key comes next, and the longest note */
export function prepareLights(exp: readonly Expected[]): Prepared {
  const nextSame = exp.map(() => Infinity)
  const lastAt = new Map<number, number>()
  for (let i = exp.length - 1; i >= 0; i--) {
    const j = lastAt.get(exp[i].midi)
    if (j !== undefined) nextSame[i] = exp[j].time
    lastAt.set(exp[i].midi, i)
  }
  return { exp, nextSame, longest: exp.reduce((m, e) => Math.max(m, e.dur ?? 0), 0) }
}

/** Pure: the keys to light at song time `t`. `ahead` and `gap` in song seconds;
 *  `done(i)`: note i is played, or not asked for (out of reach, before the take) */
export function practiceLights(p: Prepared, t: number, o: {
  playing: boolean; holdAt: number | null; ahead: number; gap: number; done: (i: number) => boolean
}): Map<number, LitKey> {
  const out = new Map<number, LitKey>()
  const { exp } = p
  const put = (e: Expected) => out.set(e.midi, e.finger ? { hand: e.hand, finger: e.finger } : { hand: e.hand })
  const firstFrom = (time: number) => {
    let lo = 0, hi = exp.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (exp[m].time < time) lo = m + 1; else hi = m }
    return lo
  }
  // a step: the notes starting together from `i`, the ones still to play
  const step = (i: number) => {
    const at = exp[i].time
    for (let j = i; j < exp.length && exp[j].time <= at + CHORD_GRACE_SEC + 1e-9; j++) if (!o.done(j)) put(exp[j])
  }

  if (o.holdAt !== null) {
    const i = firstFrom(o.holdAt - 1e-6)
    if (i < exp.length) step(i)
    return out
  }
  if (!o.playing) {
    let i = firstFrom(t - 1e-6)
    while (i < exp.length && o.done(i)) i++
    if (i < exp.length) step(i)
    return out
  }
  for (let i = firstFrom(t - p.longest - o.ahead - 0.05); i < exp.length; i++) {
    const e = exp[i]
    const on = e.time - o.ahead
    if (on > t) break
    const end = Math.max(Math.min(e.time + Math.max(e.dur ?? 0, 0.05), p.nextSame[i] - o.ahead - o.gap), on + 0.04)
    if (t < end) put(e)
  }
  return out
}

/** Pure: the notes of your part to play at song time `t`, for naming the chord
 *  (the footer's TO PLAY): the moment of the next notes to strike (a moment
 *  early, as the keys light; while the song waits, the waited-for step), and
 *  every note of yours sounding then, held ones included, so a melody over a
 *  held chord still names the chord */
export function chordToPlay(p: Prepared, t: number, o: { playing: boolean; holdAt: number | null; ahead: number }): number[] {
  const { exp } = p
  if (!exp.length) return []
  const firstFrom = (time: number) => {
    let lo = 0, hi = exp.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (exp[m].time < time) lo = m + 1; else hi = m }
    return lo
  }
  let at: number
  if (o.holdAt !== null) at = o.holdAt
  else if (!o.playing) { const i = firstFrom(t - 1e-6); if (i >= exp.length) return []; at = exp[i].time }
  else {
    // the latest step started by now (counting the lead), else the next one
    const i = firstFrom(t + o.ahead + 1e-6) - 1
    if (i < 0) at = exp[0].time
    else at = exp[i].time
  }
  const notes = new Set<number>()
  for (let i = firstFrom(at - p.longest - 0.05); i < exp.length && exp[i].time <= at + CHORD_GRACE_SEC + 1e-9; i++) {
    const e = exp[i]
    if (e.time >= at - 1e-9 || e.time + Math.max(e.dur ?? 0, 0.05) > at + 0.02) notes.add(e.midi)
  }
  return [...notes].sort((a, b) => a - b)
}

// ── The chord to play next, for the footer ──────────────────────────────────
// `notes`: your part's notes at that moment; `chord`: the song's chord there, as
// the chord display reads it (steady through fast runs: what TO PLAY shows by default)
export const useToPlay = create<{ notes: number[]; chord: string | null }>(() => ({ notes: [], chord: null }))
let toPlayKey = ''
function setToPlay(notes: number[], chord: string | null = null) {
  const k = notes.join() + '|' + (chord ?? '')
  if (k === toPlayKey) return
  toPlayKey = k
  useToPlay.setState({ notes, chord })
}
/** The song's chord at song time `t` (the last chord change at or before it) */
function songChordAt(t: number): string | null {
  const seq = useStore.getState().chordSequence
  let lo = 0, hi = seq.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (seq[m].time <= t + 1e-6) lo = m + 1; else hi = m }
  return lo > 0 ? seq[lo - 1].name || null : null
}

// ── The keys the song waits for, pulsing on the on-screen keyboard ──────────
// While the song waits, the notes it waits for (a chord together) pulse slowly
// on the on-screen keyboard until you play them; each stops as you play it.
export const useWaitPulse = create<{ keys: Map<number, 'L' | 'R'> }>(() => ({ keys: new Map() }))
let pulseKey = ''
function setPulse(keys: Map<number, 'L' | 'R'>) {
  const k = [...keys].join()
  if (k === pulseKey) return
  pulseKey = k
  useWaitPulse.setState({ keys })
}

// ── Wiring: what the keyboards light while practice mode is on ──────────────
let prepared: Prepared | null = null
let lit: Map<number, LitKey> | null = null
let lastKey = 'none'

const ratio = () => { const s = useStore.getState(); return s.originalBpm > 0 ? s.bpm / s.originalBpm : 1 }

function update() {
  const s = useStore.getState(), p = usePractice.getState(), w = useWaiting.getState()
  const m = currentMatcher()
  let next: Map<number, LitKey> | null = null
  if (p.active && m && !reviewing()) {
    if (!prepared || prepared.exp !== m.expected) prepared = prepareLights(m.expected)
    next = practiceLights(prepared, s.currentTime, {
      playing: s.playbackState === 'playing',
      holdAt: w.holding ? w.at : null,
      ahead: LIGHT_AHEAD_SEC * ratio(), gap: LIGHT_GAP_SEC * ratio(),
      done: i => m.isDone(i),
    })
    if (!s.practiceFingering) for (const v of next.values()) delete v.finger
    const playingNow = s.playbackState === 'playing', holdAt = w.holding ? w.at : null
    const notes = chordToPlay(prepared, s.currentTime, { playing: playingNow, holdAt, ahead: LIGHT_AHEAD_SEC * ratio() })
    setToPlay(notes, songChordAt(holdAt ?? (playingNow ? s.currentTime + LIGHT_AHEAD_SEC * ratio() : s.currentTime)))
  } else setToPlay([])
  setPulse(next && w.holding ? new Map([...next].map(([k, v]) => [k, v.hand])) : new Map())
  const key = next ? [...next].map(([k, v]) => `${k}${v.hand}${v.finger ?? ''}`).join() : 'none'
  if (key === lastKey) return
  lastKey = key
  lit = next
  setLightSource(source)
}

function source() {
  if (!lit) return null
  const colours = new Map<number, string>(), fingers = new Map<number, number>()
  for (const [k, v] of lit) {
    colours.set(k, v.hand === 'L' ? HAND_LH_CSS : HAND_RH_CSS)
    if (v.finger) fingers.set(k, v.finger)
  }
  return { colours, fingers }
}

const unsubs = [
  useStore.subscribe((s, prev) => {
    if (s.currentTime !== prev.currentTime || s.playbackState !== prev.playbackState || s.bpm !== prev.bpm
      || s.practiceFingering !== prev.practiceFingering || s.chordSequence !== prev.chordSequence) update()
  }),
  useWaiting.subscribe(update),
  useListen.subscribe(update),      // a key you played (a waited-for key goes dark), a fresh take
  usePractice.subscribe(update),
  useReview.subscribe(update),
  useFingerHints.subscribe(update), // suggested fingers changed: a keyboard lighting per finger follows
]
setLightSource(source)

if (import.meta.hot) import.meta.hot.dispose(() => { for (const u of unsubs) u(); setLightSource(null) })
