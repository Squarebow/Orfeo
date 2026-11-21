import { useStore } from '../store'
import { playBackNote } from '../hooks/useMidiInput'
import { usePractice, applySound } from './practiceMode'
import { useWaiting } from './listen'
import { endHold } from './waiting'
import { currentSession, useSession } from './session'
import { cachedHistory, allTakes } from './history'
import { useReview, type ReviewUnit, type ReviewHear } from './reviewState'
import type { TakeRecord } from './take'

// ── The practice review (practice stage 5) ───────────────────────────────────
// After playing, the song stays stopped and the piano roll shows how it went,
// note by note: fine, a little early, a little late, missed, extra. You move
// through it a bar or a screenful at a time; the passage you're on can go
// round and round, with your own notes played back as you played them, the
// part as written, or both. Nothing here is practice: no takes are kept and
// the song doesn't wait while the review is open.

export type MarkKind = 'fine' | 'early' | 'late' | 'missed' | 'extra'
export interface Mark {
  kind: MarkKind
  midi: number
  t: number        // where it shows: when you pressed it (the note's own place for a missed note)
  exp: number      // the note's own place (= t for an extra key)
  dur: number      // how long it sounded, song seconds
  vel: number
}

/** The marks' colours (a shape each too, so colour is never the only sign):
 *  clear of the hand colours and the amber of the controls */
export const REVIEW_COLORS: Record<MarkKind, string> = { fine: '#3ecf8e', early: '#f5d76e', late: '#f5d76e', missed: '#e6e8eb', extra: '#c77dff' }

/** Within this, early or late is "fine" (real milliseconds) */
export const FINE_MS = 50

export function marksFor(take: TakeRecord): Mark[] {
  const r = take.speed / 100
  return (take.played ?? []).map(([t, midi, vel, kind, off, dur]) => {
    if (kind === 2) return { kind: 'missed' as const, midi, t, exp: t, dur: dur ?? 0.25, vel }
    if (kind === 1) return { kind: 'extra' as const, midi, t, exp: t, dur: dur ?? 0.25, vel }
    const exp = t - off / 1000 * r
    return { kind: Math.abs(off) <= FINE_MS ? 'fine' as const : off < 0 ? 'early' as const : 'late' as const, midi, t, exp, dur: dur ?? 0.25, vel }
  })
}

export function countMarks(marks: Mark[], from: number, to: number): Record<MarkKind, number> {
  const c: Record<MarkKind, number> = { fine: 0, early: 0, late: 0, missed: 0, extra: 0 }
  for (const m of marks) if (m.exp >= from - 1e-6 && m.exp < to - 1e-6) c[m.kind]++
  return c
}

// ── Passages: one bar, or as many whole bars as fit on the screen ────────────
export interface Bars { starts: number[]; duration: number }
const barStart = (b: Bars, n: number) => b.starts[Math.max(0, n - 1)] ?? 0
const barEnd = (b: Bars, n: number) => (n < b.starts.length ? b.starts[n] : b.duration)

/** The passage starting at bar `from`, kept within bars lo..hi; `span` is how
 *  many seconds of the song fit on the screen */
export function passageFrom(unit: ReviewUnit, from: number, bars: Bars, span: number, lo: number, hi: number): { from: number; to: number } {
  const f = Math.max(lo, Math.min(hi, from))
  if (unit === 'bar') return { from: f, to: f }
  let to = f
  while (to < hi && barEnd(bars, to + 1) - barStart(bars, f) <= span) to++
  return { from: f, to }
}
/** The passage just before bar `from` (ending at from − 1) */
export function passageBefore(unit: ReviewUnit, from: number, bars: Bars, span: number, lo: number, hi: number): { from: number; to: number } {
  const to = Math.max(lo, Math.min(hi, from - 1))
  if (unit === 'bar') return { from: to, to }
  let f = to
  while (f > lo && barEnd(bars, to) - barStart(bars, f - 1) <= span) f--
  return { from: f, to }
}

// ── Running it ───────────────────────────────────────────────────────────────
const VISIBLE_SECONDS = 6, PLAYHEAD_RATIO = 0.8   // as the piano roll draws (PianoRoll.tsx)
const screenSpan = () => (VISIBLE_SECONDS / (useStore.getState().zoomLevel || 1)) * PLAYHEAD_RATIO * 0.95
const songBars = (): Bars => { const s = useStore.getState(); return { starts: s.barStarts, duration: s.midi?.duration ?? 0 } }
const take = () => { const r = useReview.getState(); return r.takes[r.idx] ?? null }

let saved: { loopEnabled: boolean; loopActive: boolean; loopStart: number | null; loopEnd: number | null; bpm: number; time: number } | null = null
let marks: Mark[] = []
export const reviewMarks = () => marks

/** The takes that kept your notes, for the song in practice, oldest first */
export function reviewableTakes(): TakeRecord[] {
  const { song, session } = currentSession()
  const all = song ? allTakes(cachedHistory(song)) : session?.takes ?? []
  return all.filter(k => k.played?.length).sort((a, b) => a.at - b.at)
}

export function openReview(prefer?: TakeRecord | null, startBar?: number): boolean {
  const takes = reviewableTakes()
  if (!takes.length || !usePractice.getState().active) return false
  const s = useStore.getState()
  if (useWaiting.getState().holding) endHold(false)
  if (s.playbackState === 'playing') useStore.setState({ playbackState: 'paused' })
  if (!saved) saved = { loopEnabled: s.loopRegionEnabled, loopActive: s.loopRegionActive, loopStart: s.loopStart, loopEnd: s.loopEnd, bpm: s.bpm, time: s.currentTime }
  let idx = takes.length - 1
  if (prefer) { const i = takes.findIndex(k => k.at === prefer.at); if (i >= 0) idx = i }
  useSession.setState({ card: null })
  useReview.setState({ open: true, takes, idx, playing: false })
  showTake(idx, startBar)
  return true
}

export function closeReview(): void {
  const r = useReview.getState()
  if (!r.open) return
  stopPassage()
  useReview.setState({ open: false, playing: false })
  marks = []
  const b = saved
  saved = null
  if (b) {
    const s = useStore.getState()
    useStore.setState({ loopRegionEnabled: b.loopEnabled, loopRegionActive: b.loopActive, loopStart: b.loopStart, loopEnd: b.loopEnd, currentTime: b.time })
    if (s.bpm !== b.bpm) s.setBpm(b.bpm)
  }
  applySound()
}

/** Show take `i`: its notes, its tempo, from its first bar (or `startBar`) */
export function showTake(i: number, startBar?: number): void {
  const r = useReview.getState()
  const k = r.takes[i]
  if (!k) return
  if (r.playing) stopPassage()
  marks = marksFor(k)
  useReview.setState({ idx: i })
  const s = useStore.getState()
  if (s.originalBpm > 0) s.setBpm(s.originalBpm * k.speed / 100)
  hearAs(r.hear)
  goTo(passageFrom(r.unit, startBar ?? k.fromBar, songBars(), screenSpan(), k.fromBar, k.toBar))
}

function goTo(p: { from: number; to: number }) {
  useReview.setState({ from: p.from, to: p.to })
  const bars = songBars()
  const start = barStart(bars, p.from)
  if (useReview.getState().playing) {
    useStore.setState({ loopStart: start, loopEnd: barEnd(bars, p.to), loopRegionActive: true, loopRegionEnabled: true, currentTime: start, playbackState: 'paused' })
    Promise.resolve().then(() => useStore.setState({ playbackState: 'playing' }))
  } else useStore.setState({ currentTime: start })
  fired.clear()
}

/** The next or the previous passage */
export function stepPassage(dir: -1 | 1): void {
  const r = useReview.getState(), k = take()
  if (!k) return
  const bars = songBars(), span = screenSpan()
  goTo(dir > 0
    ? passageFrom(r.unit, Math.min(k.toBar, r.to + 1), bars, span, k.fromBar, k.toBar)
    : passageBefore(r.unit, Math.max(k.fromBar + 1, r.from), bars, span, k.fromBar, k.toBar))
}

export function setUnit(unit: ReviewUnit): void {
  const r = useReview.getState(), k = take()
  useReview.setState({ unit })
  if (k) goTo(passageFrom(unit, r.from, songBars(), screenSpan(), k.fromBar, k.toBar))
}

/** What you hear: your own notes (the part silent, as when you played), the
 *  part as written, or both */
export function hearAs(hear: ReviewHear): void {
  useReview.setState({ hear })
  const k = take()
  if (!k) return
  useStore.getState().setPracticeSound(k.hand, hear !== 'mine')
}

export function playPassage(): void {
  const r = useReview.getState()
  if (!r.open || r.playing) return
  useReview.setState({ playing: true })
  goTo({ from: r.from, to: r.to })
}
export function stopPassage(): void {
  if (!useReview.getState().playing) return
  useReview.setState({ playing: false })
  useStore.setState({ playbackState: 'paused', loopRegionActive: false })
  for (const t of timers) clearTimeout(t)
  timers.clear()
  const bars = songBars()
  useStore.setState({ currentTime: barStart(bars, useReview.getState().from) })
}
export const togglePassage = () => (useReview.getState().playing ? stopPassage() : playPassage())

// ── Your notes, played back as you played them ───────────────────────────────
const fired = new Set<number>()
const timers = new Set<ReturnType<typeof setTimeout>>()
let lastT = 0
useStore.subscribe((s, prev) => {
  const r = useReview.getState()
  if (!r.open || !r.playing || s.currentTime === prev.currentTime) return
  if (s.currentTime < lastT - 0.05) fired.clear()   // round again
  lastT = s.currentTime
  if (r.hear === 'written' || s.playbackState !== 'playing') return
  const ratio = s.originalBpm > 0 ? s.bpm / s.originalBpm : 1
  const ahead = s.currentTime + 0.12 * ratio
  marks.forEach((m, i) => {
    if (m.kind === 'missed' || fired.has(i) || m.t < s.currentTime - 0.02 || m.t > ahead) return
    if (s.loopEnd !== null && m.t >= s.loopEnd) return
    fired.add(i)
    const id = setTimeout(() => { timers.delete(id); playBackNote(m.midi, m.vel || 80, m.dur / ratio * 1000) }, Math.max(0, (m.t - s.currentTime) / ratio * 1000))
    timers.add(id)
  })
})

// leaving practice mode or opening another song closes the review
usePractice.subscribe((p, prev) => { if (!p.active && prev.active) closeReview() })
useStore.subscribe((s, prev) => { if (s.midi !== prev.midi && useReview.getState().open) { saved = null; closeReview() } })
