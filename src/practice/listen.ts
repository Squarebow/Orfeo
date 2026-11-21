import { create } from 'zustand'
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import { onPlayedKey, rangeOf } from '../hooks/useMidiInput'
import { outputLatencySec } from '../audio/engine'
import { barOf } from '../utils/debugTimestamp'
import { usePractice, practisedHand } from './practiceMode'
import { Matcher, type Expected, type Outcome, type Summary } from './matcher'
import type { TakeEnd } from './take'
import { reviewing } from './reviewState'
import { useScoreUi } from '../notation/scoreMode'
import { melodyOf } from '../notation/score'

// ── Orfeo listens (practice stage 2) ─────────────────────────────────────────
// While practice mode plays, every key you press is placed in the song (where
// the music you were hearing had got to) and paired with your part by the
// Matcher: right, missed or extra, per hand and per bar. Nothing of it shows
// to the player yet: the Dev Tools' listening panel reads it, and the waiting
// (stage 3) and the review (stage 5) are built on it.

// How far from its place a note may be played and still count as that note,
// in real time (the song's seconds stretch with the tempo you practise at)
export const MATCH_WINDOW_SEC = 0.25

// ── The song's clock, between the screen's updates ───────────────────────────
let anchorTime = 0, anchorPerf = 0, lastTime = 0
const ratio = () => { const s = useStore.getState(); return s.originalBpm > 0 ? s.bpm / s.originalBpm : 1 }

/** The place in the song you were hearing at `perf` (performance.now()):
 *  the clock, less the time the sound takes to reach you */
export function heardSongTime(perf: number = performance.now()): number {
  const s = useStore.getState()
  const r = ratio()
  const clock = s.playbackState === 'playing' ? anchorTime + Math.max(0, perf - anchorPerf) / 1000 * r : s.currentTime
  return clock - outputLatencySec() * r
}

// ── What you're meant to play right now: your hand(s) of the piano ───────────
// The score as melody and chords (a lead sheet): only the melody is asked
// for; the chords are the player's own, so keys below the tune don't count
export const leadSheetOn = () => usePractice.getState().view === 'score' && useScoreUi.getState().mode === 'lead'
let leadFloor = -1   // keys below this are the player's own chords (lead sheet only)

export function expectedNotes(): Expected[] {
  const s = useStore.getState()
  if (!s.midi) return []
  if (leadSheetOn()) {
    const shift = s.detectedKey?.transpose ?? 0
    const all = s.tracks.filter(ts => ts.practicePart && ts.practiceHand).flatMap(ts =>
      (s.midi!.tracks.find(t => t.index === ts.index)?.notes ?? []).map(n => ({ midi: n.midi + shift, time: n.time, dur: n.duration, hand: ts.practiceHand! })))
    return melodyOf(all).map(n => ({ midi: n.midi, time: n.time, hand: 'R' as const, bar: barOf(n.time, s.barStarts) ?? 1, dur: n.dur }))
  }
  const hand = practisedHand()
  const shift = s.detectedKey?.transpose ?? 0
  const out: Expected[] = []
  for (const ts of s.tracks) {
    if (!ts.practicePart || !ts.practiceHand) continue
    if (hand !== 'B' && ts.practiceHand !== hand) continue
    const tr = s.midi.tracks.find(t => t.index === ts.index)
    for (const n of tr?.notes ?? []) out.push({ midi: n.midi + shift, time: n.time, hand: ts.practiceHand, bar: barOf(n.time, s.barStarts) ?? 1, dur: n.duration })
  }
  return out
}

// ── What the Dev Tools' panel reads ──────────────────────────────────────────
interface ListenState {
  listening: boolean
  summary: Summary | null
  recent: Outcome[]          // newest first
}
export const useListen = create<ListenState>(() => ({ listening: false, summary: null, recent: [] }))

// The song waiting for your notes (practice/waiting.ts): stopped, but still
// "playing" as far as you're concerned, so keys still count
export const useWaiting = create<{ holding: boolean; at: number | null }>(() => ({ holding: false, at: null }))
const takingKeys = () => !reviewing() && (useStore.getState().playbackState === 'playing' || useWaiting.getState().holding)

let matcher: Matcher | null = null

// Someone else following the song (the virtual pianist) hears of every jump
// and fresh start here
const _jumpListeners = new Set<(t: number) => void>()
export function onSongJump(fn: (t: number) => void): () => void { _jumpListeners.add(fn); return () => { _jumpListeners.delete(fn) } }
const jumpTo = (t: number) => { for (const fn of _jumpListeners) fn(t) }
const RECENT = 14

// ── Takes (practice stage 4): each fresh start begins one, each jump, the loop
// going round, the song's end or leaving ends it; practice/session.ts keeps them ──
export type TakeEvent = { type: 'start'; at: number } | { type: 'outcome'; o: Outcome } | { type: 'end'; why: TakeEnd }
const _takeListeners = new Set<(e: TakeEvent) => void>()
export function onTake(fn: (e: TakeEvent) => void): () => void { _takeListeners.add(fn); return () => { _takeListeners.delete(fn) } }
const emit = (e: TakeEvent) => { for (const fn of _takeListeners) fn(e) }
let win = MATCH_WINDOW_SEC

function publish(outs: Outcome[]) {
  if (!matcher) return
  for (const o of outs) emit({ type: 'outcome', o })
  const recent = outs.length ? [...outs.reverse(), ...useListen.getState().recent].slice(0, RECENT) : useListen.getState().recent
  useListen.setState({ summary: matcher.summary(), recent })
}

/** A fresh start on your part: what lies before the playhead isn't counted */
export function rebuildListening(): void {
  const s = useStore.getState()
  if (matcher) emit({ type: 'end', why: usePractice.getState().active ? 'change' : 'leave' })
  if (!usePractice.getState().active || !s.midi) { matcher = null; useListen.setState({ listening: false, summary: null, recent: [] }); return }
  win = MATCH_WINDOW_SEC * ratio()
  const exp = expectedNotes()
  leadFloor = leadSheetOn() && exp.length ? Math.min(...exp.map(e => e.midi)) - 2 : -1
  matcher = new Matcher(exp, win, t => barOf(t, useStore.getState().barStarts) ?? 1)
  const now = s.currentTime
  matcher.skip(e => e.time < now - 1e-6)
  const range = rangeOf(useMidiSettings.getState().activeDevice)
  if (range) matcher.skip(e => e.midi < range.low || e.midi > range.high, true)
  anchorTime = lastTime = now; anchorPerf = performance.now()
  useListen.setState({ listening: true, recent: [], summary: matcher.summary() })
  jumpTo(now)
  emit({ type: 'start', at: now })
}

/** Play after a pause: a fresh take from where the song is */
export function freshTake(): void {
  if (!matcher) return
  const t = useStore.getState().currentTime
  matcher.restartAt(t)
  useListen.setState({ summary: matcher.summary(), recent: [] })
  emit({ type: 'start', at: t })
}

// ── Wiring ───────────────────────────────────────────────────────────────────
onPlayedKey(k => {
  if (!k.on || !matcher || !takingKeys()) return
  if (k.note < leadFloor) return   // a lead sheet: the chords under the tune are yours
  publish([matcher.play({ midi: k.note, time: heardSongTime(k.at), vel: k.vel })])
})

useStore.subscribe((s, prev) => {
  if (s.currentTime !== prev.currentTime || s.playbackState !== prev.playbackState) {
    const t = s.currentTime
    const expectedNow = lastTime + (performance.now() - anchorPerf) / 1000 * ratio()
    // a jump: a seek, or the loop going round
    const jumped = s.playbackState === 'playing' && prev.playbackState === 'playing'
      ? t < lastTime - 0.05 || t > expectedNow + 0.5
      : t !== lastTime   // paused or stopped: any move is a seek
    const before = lastTime
    anchorTime = lastTime = t; anchorPerf = performance.now()
    if (jumped) jumpTo(t)
    if (matcher && jumped) {
      // why the take ends: the song's end, the loop going round, or a jump
      const loopAt = s.loopRegionActive ? (s.loopStart ?? 0) : null
      const why: TakeEnd = s.playbackState === 'stopped' && !!s.midi && t >= s.midi.duration - 0.01 ? 'end'
        : loopAt !== null && Math.abs(t - loopAt) < 0.05 && before > t ? 'loop' : 'jump'
      // played to the end (of the song or the loop): what's behind it is missed
      if (why !== 'jump') { const missed = matcher.advance(why === 'end' ? t + win : before + win); if (missed.length) publish(missed) }
      emit({ type: 'end', why })
      matcher.restartAt(t); useListen.setState({ summary: matcher.summary(), recent: [] })
      emit({ type: 'start', at: t })
    }
    if (matcher && s.playbackState === 'playing') { const missed = matcher.advance(heardSongTime()); if (missed.length) publish(missed) }
  }
  // another tempo (you, or Speed up gradually): the same take goes on, with the
  // window stretched to the new tempo
  if (s.bpm !== prev.bpm && matcher) { win = MATCH_WINDOW_SEC * ratio(); matcher.setWindow(win) }
  if (s.midi !== prev.midi || s.barStarts !== prev.barStarts
    || (s.detectedKey?.transpose ?? 0) !== (prev.detectedKey?.transpose ?? 0)
    || s.tracks.some((t, i) => t.practiceHand !== prev.tracks[i]?.practiceHand)) {
    if (usePractice.getState().active) rebuildListening()
  }
})

usePractice.subscribe((p, prev) => {
  if (p.active !== prev.active || p.way !== prev.way || p.hand !== prev.hand || p.onlyHand !== prev.onlyHand || p.view !== prev.view) rebuildListening()
})
useScoreUi.subscribe((m, prev) => { if ((m.mode === 'lead') !== (prev.mode === 'lead') && usePractice.getState().active) rebuildListening() })

/** For tests and the Dev Tools: the matcher in use */
export const currentMatcher = () => matcher
