import { create } from 'zustand'
import { useStore } from '../store'
import { barOf } from '../utils/debugTimestamp'
import { usePractice, practisedHand, metronomeAllowed, speedPercent, setSpeedPercent } from './practiceMode'
import { onTake, freshTake, currentMatcher, useWaiting, heardSongTime } from './listen'
import { onPlayedKey } from '../hooks/useMidiInput'
import { useReview } from './reviewState'
import { waitingOn } from './waiting'
import { buildTake, worthKeeping, cleanTake, rampAfterRound, RAMP_START, type TakeRecord, type TakeEnd, type Hold, type PlayedLog } from './take'
import { howItWent, type HowItWent } from './words'
import { loadHistory, saveSession, cachedHistory, allTakes, type SessionRecord } from './history'

// ── A practice session (practice stage 4) ────────────────────────────────────
// From going into practice mode on a song until leaving it or opening another:
// every take's numbers kept for the song (practice/history.ts). When you stop,
// a few words on how it went (practice/words.ts), unless switched off in
// Settings › Practice mode. Speed up gradually raises the tempo after clean
// rounds of the loop.

export interface Card extends HowItWent { take: TakeRecord }
interface SessionUi {
  card: Card | null
  ramp: { streak: number } // clean rounds in a row at this speed (Speed up gradually)
}
export const useSession = create<SessionUi>(() => ({ card: null, ramp: { streak: 0 } }))

interface Open {
  from: number; maxTo: number
  activeMs: number; activeSince: number | null
  holds: Hold[]; holdStart: { perf: number; bar: number } | null
  played: PlayedLog
}

let song: string | null = null
let session: SessionRecord | null = null
let open: Open | null = null
let stretchFrom = 0            // the first take since Play
let stretchOpen = false
let rampedTo: number | null = null
let speedBeforeRamp: number | null = null   // the speed before Speed up gradually took over

const ratio = () => { const s = useStore.getState(); return s.originalBpm > 0 ? s.bpm / s.originalBpm : 1 }
const bar = (t: number) => barOf(t, useStore.getState().barStarts) ?? 1
const isActive = () => useStore.getState().playbackState === 'playing' || useWaiting.getState().holding
const r3 = (x: number) => Math.round(x * 1000) / 1000

function startSession() {
  const s = useStore.getState()
  song = ((s.midi as any)?._filePath as string | undefined) ?? null
  session = { id: Date.now(), notes: currentMatcher()?.expected.length ?? 0, takes: [] }
  stretchFrom = 0; stretchOpen = false; rampedTo = null
  useSession.setState({ card: null, ramp: { streak: 0 } })
  if (song) void loadHistory(song)
}

function openTake(at: number) {
  sounding.clear()
  open = { from: at, maxTo: at, activeMs: 0, activeSince: isActive() ? performance.now() : null, holds: [], holdStart: null, played: [] }
}

function closeTake(why: TakeEnd) {
  const o = open
  open = null
  const m = currentMatcher()
  if (!o || !m || !session) return
  const now = performance.now()
  if (o.activeSince !== null) o.activeMs += now - o.activeSince
  if (o.holdStart) o.holds.push({ bar: o.holdStart.bar, sec: (now - o.holdStart.perf) / 1000 })
  const s = useStore.getState()
  const p = usePractice.getState()
  const to = why === 'end' && s.midi ? s.midi.duration : o.maxTo
  const k = buildTake({
    summary: m.summary(), ratio: ratio(), from: o.from, to, barOf: bar, realSec: o.activeMs / 1000,
    holds: o.holds, played: o.played, end: why, at: Date.now(),
    meta: { way: p.way, hand: practisedHand(), level: p.level, wait: waitingOn(), ramp: p.way === 'practise' && p.ramp },
  })
  if (!worthKeeping(k)) return
  session.takes.push(k)
  if (song) void saveSession(song, { ...session, takes: [...session.takes] })
  // Speed up gradually: a round of the loop, or the song played to its end
  if (k.ramp && (why === 'loop' || why === 'end')) {
    const next = rampAfterRound({ speed: speedPercent(), streak: useSession.getState().ramp.streak }, cleanTake(k))
    useSession.setState({ ramp: { streak: next.streak } })
    if (next.raised) {
      rampedTo = next.speed
      // after this change of the store has gone round
      setTimeout(() => setSpeedPercent(next.speed), 0)
    }
  }
}

/** Stopped (not waiting for you): the takes since Play, in words */
function stretchEnded() {
  stretchOpen = false
  if (useReview.getState().open) return
  if (!session || !useStore.getState().practiceSummaryEnabled) return
  const takes = session.takes.slice(stretchFrom)
  const subject = [...takes].reverse().find(k => k.end === 'loop') ?? takes[takes.length - 1]
  if (!subject) return
  const earlier = [...allTakes(song ? cachedHistory(song) : null, session.id), ...session.takes.slice(0, stretchFrom)]
  const words = howItWent(subject, { earlier, session: session.takes.slice(stretchFrom), rampedTo, metronome: metronomeAllowed() })
  if (words.lines.length) useSession.setState({ card: { ...words, take: subject } })
}

// ── Wiring ───────────────────────────────────────────────────────────────────
onTake(e => {
  // the review plays passages over: none of that is practice
  if (useReview.getState().open) { open = null; return }
  if (e.type === 'start') { if (open) closeTake('jump'); openTake(e.at); return }
  if (e.type === 'end') { closeTake(e.why); return }
  if (!open) return
  const o = e.o
  if (o.kind === 'hit') open.played.push([r3(o.played.time), o.played.midi, o.played.vel ?? 0, 0, Math.round(o.offset / ratio() * 1000)])
  else if (o.kind === 'extra') open.played.push([r3(o.played.time), o.played.midi, o.played.vel ?? 0, 1, 0])
  else open.played.push([r3(o.exp.time), o.exp.midi, 0, 2, 0, r3(o.exp.dur ?? 0.25)])
  if (o.kind !== 'missed') sounding.set(o.played.midi, open.played.length - 1)
})
// how long each played note was held, for hearing it again in the review
const sounding = new Map<number, number>()   // key → its entry in open.played
onPlayedKey(k => {
  if (k.on || !open) return
  const i = sounding.get(k.note)
  if (i === undefined) return
  sounding.delete(k.note)
  const e = open.played[i]
  if (e) e[5] = r3(Math.max(0.05, heardSongTime(k.at) - e[0]))
})

let stopTimer: ReturnType<typeof setTimeout> | null = null
function activity() {
  if (open) {
    const now = performance.now()
    if (isActive() && open.activeSince === null) open.activeSince = now
    if (!isActive() && open.activeSince !== null) { open.activeMs += now - open.activeSince; open.activeSince = null }
  }
  if (!usePractice.getState().active || useReview.getState().open) return
  if (isActive()) {
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null }
    if (!stretchOpen) {
      stretchOpen = true
      rampedTo = null
      useSession.setState({ card: null })
      if (!open) freshTake()
      stretchFrom = session?.takes.length ?? 0
    }
    return
  }
  if (!stretchOpen || stopTimer) return
  // a moment's grace: the loop going round pauses for an instant
  stopTimer = setTimeout(() => {
    stopTimer = null
    if (isActive() || !usePractice.getState().active) return
    const s = useStore.getState()
    if (open) closeTake(s.playbackState === 'stopped' && !!s.midi && s.currentTime >= s.midi.duration - 0.01 ? 'end' : 'pause')
    stretchEnded()
  }, 150)
}

useStore.subscribe((s, prev) => {
  if (s.midi !== prev.midi && usePractice.getState().active && s.midi) startSession()
  if (open && s.currentTime !== prev.currentTime && s.playbackState === 'playing') open.maxTo = Math.max(open.maxTo, s.currentTime)
  if (s.playbackState !== prev.playbackState) activity()
})
useWaiting.subscribe((w, prev) => {
  if (w.holding === prev.holding) return
  if (open) {
    if (w.holding) open.holdStart = { perf: performance.now(), bar: bar(w.at ?? useStore.getState().currentTime) }
    else if (open.holdStart) { open.holds.push({ bar: open.holdStart.bar, sec: (performance.now() - open.holdStart.perf) / 1000 }); open.holdStart = null }
  }
  activity()
})
usePractice.subscribe((p, prev) => {
  if (p.active && !prev.active) startSession()
  if (!p.active && prev.active) { session = null; song = null; useSession.setState({ card: null }) }
  // Speed up gradually switched on: start at 60 % (or slower, if you already are);
  // switched off (or another way of playing): back to the speed you had before
  const rampOn = (q: typeof p) => q.active && q.ramp && q.way === 'practise'
  if (rampOn(p) && !rampOn(prev)) {
    useSession.setState({ ramp: { streak: 0 } })
    speedBeforeRamp = speedPercent()
    if (speedPercent() > RAMP_START) setSpeedPercent(RAMP_START)
  } else if (!rampOn(p) && rampOn(prev) && p.active) {
    useSession.setState({ ramp: { streak: 0 } })
    setSpeedPercent(speedBeforeRamp ?? 100)
    speedBeforeRamp = null
  }
  if (!p.active) speedBeforeRamp = null
})

/** Practise the bars worth another go: loop them in Practise */
export function practiseBars(from: number, to: number): number | null {
  const s = useStore.getState()
  if (!s.midi || !s.barStarts.length) return null
  const start = s.barStarts[Math.max(0, from - 1)]
  const end = to < s.barStarts.length ? s.barStarts[to] : s.midi.duration
  if (!s.loopRegionEnabled) s.setLoopRegionEnabled(true)
  s.setLoopRegion(start, end)
  s.setLoopRegionActive(true)
  const p = usePractice.getState()
  if (p.way !== 'practise') usePractice.setState({ way: 'practise', hand: 'B', waitOn: p.way === 'wait' })
  useSession.setState({ card: null })
  return start
}

/** Dev Tools: the session so far, and the song it's for */
export const currentSession = () => ({ song, session })
/** Dev Tools: show the words for a made-up take */
export function showCardFor(take: TakeRecord, opts: Parameters<typeof howItWent>[1] = {}) {
  useSession.setState({ card: { ...howItWent(take, opts), take } })
}
