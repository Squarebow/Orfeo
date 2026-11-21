import { create } from 'zustand'
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import { onPlayedKey, rangeOf } from '../hooks/useMidiInput'
import { outputLatencySec } from '../audio/engine'
import { barOf } from '../utils/debugTimestamp'
import { usePractice, practisedHand } from './practiceMode'
import { Matcher, type Expected, type Outcome, type Summary } from './matcher'

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
export function expectedNotes(): Expected[] {
  const s = useStore.getState()
  if (!s.midi) return []
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

let matcher: Matcher | null = null

// Someone else following the song (the virtual pianist) hears of every jump
// and fresh start here
const _jumpListeners = new Set<(t: number) => void>()
export function onSongJump(fn: (t: number) => void): () => void { _jumpListeners.add(fn); return () => { _jumpListeners.delete(fn) } }
const jumpTo = (t: number) => { for (const fn of _jumpListeners) fn(t) }
const RECENT = 14

function publish(outs: Outcome[]) {
  if (!matcher) return
  const recent = outs.length ? [...outs.reverse(), ...useListen.getState().recent].slice(0, RECENT) : useListen.getState().recent
  useListen.setState({ summary: matcher.summary(), recent })
}

/** A fresh start on your part: what lies before the playhead isn't counted */
export function rebuildListening(): void {
  const s = useStore.getState()
  if (!usePractice.getState().active || !s.midi) { matcher = null; useListen.setState({ listening: false, summary: null, recent: [] }); return }
  const win = MATCH_WINDOW_SEC * ratio()
  matcher = new Matcher(expectedNotes(), win, t => barOf(t, useStore.getState().barStarts) ?? 1)
  const now = s.currentTime
  matcher.skip(e => e.time < now - 1e-6)
  const range = rangeOf(useMidiSettings.getState().activeDevice)
  if (range) matcher.skip(e => e.midi < range.low || e.midi > range.high, true)
  anchorTime = lastTime = now; anchorPerf = performance.now()
  useListen.setState({ listening: true, recent: [], summary: matcher.summary() })
  jumpTo(now)
}

// ── Wiring ───────────────────────────────────────────────────────────────────
onPlayedKey(k => {
  if (!k.on || !matcher || useStore.getState().playbackState !== 'playing') return
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
    anchorTime = lastTime = t; anchorPerf = performance.now()
    if (jumped) jumpTo(t)
    if (matcher && jumped) { matcher.restartAt(t); useListen.setState({ summary: matcher.summary(), recent: [] }) }
    if (matcher && s.playbackState === 'playing') { const missed = matcher.advance(heardSongTime()); if (missed.length) publish(missed) }
  }
  if (s.midi !== prev.midi || s.barStarts !== prev.barStarts || s.bpm !== prev.bpm
    || (s.detectedKey?.transpose ?? 0) !== (prev.detectedKey?.transpose ?? 0)
    || s.tracks.some((t, i) => t.practiceHand !== prev.tracks[i]?.practiceHand)) {
    if (usePractice.getState().active) rebuildListening()
  }
})

usePractice.subscribe((p, prev) => {
  if (p.active !== prev.active || p.way !== prev.way || p.hand !== prev.hand || p.onlyHand !== prev.onlyHand) rebuildListening()
})

/** For tests and the Dev Tools: the matcher in use */
export const currentMatcher = () => matcher
