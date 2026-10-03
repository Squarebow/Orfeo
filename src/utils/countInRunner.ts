import { useStore } from '../store'
import { countInPlan } from './countIn'
import { isTapCapturing } from './tapTempoSession'

// ── Count-in runner — schedules the count-in clicks on the metronome's audio
// clock, shows the count, then starts playback so the first note is HEARD
// exactly one beat after the last click: the engine is started early by its
// own output delay (minus the click's). Only user-started plays come here
// (usePlayback.play) — never the internal pause→play blips of scrubbing or
// loop wraps. Audio/timer access is injected (useCountIn wires the real
// ones) so the timing logic is testable headlessly. ──────────────────────

export interface CountInDeps {
  now: () => number                  // metronome AudioContext time (s)
  perfNow: () => number              // performance.now() (ms)
  ctxLatency: () => number           // click output delay (s)
  engineLatency: () => number        // active sound engine's output delay (s)
  click: (when: number, accent: boolean) => { stop: () => void }
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (t: unknown) => void
  anchor: (audioTime: number, songTime: number, clickedSongTime?: number | null) => void
  engine: () => string               // 'gm' | 'samples'
  engineStartedAt: () => number | null  // performance.now() when the engine really started playing
  prepare: () => void                 // get the engine ready to start instantly (during the clicks)
}

const LEAD = 0.1   // s between pressing Play and the first click (scheduling headroom)

let deps: CountInDeps | null = null

// How long each engine takes from "play" to really sounding (GM builds the
// whole song for playback first, ~¼ s). Learned from every count-in, so
// the engine is started that much early and the first note lands on the
// beat after the count-in. Starting guesses, replaced by the first real
// measurement, then smoothed.
const startLag: Record<string, number> = { gm: 0.05, samples: 0.03 }
const measured: Record<string, boolean> = {}
let lastFlip: { perf: number; engine: string } | null = null
const MAX_LEARN_LAG = 0.6

export function learnEngineStart() {
  if (!deps || !lastFlip) return
  const started = deps.engineStartedAt()
  const flip = lastFlip
  lastFlip = null
  if (started === null || started < flip.perf - 1) return
  const lag = (started - flip.perf) / 1000
  // a one-off slow start (the engine warming up on first use) is not the
  // engine's normal start time — never learn from it
  if (lag > MAX_LEARN_LAG) return
  startLag[flip.engine] = measured[flip.engine] ? 0.7 * (startLag[flip.engine] ?? lag) + 0.3 * lag : lag
  measured[flip.engine] = true
}
export function setCountInDeps(d: CountInDeps | null) { deps = d }

let active: { clicks: { stop: () => void }[]; timer: unknown; prevTime: number; key: string | null } | null = null

export function isCountingIn(): boolean { return active !== null }

function firstNoteTime(): number {
  const tracks = useStore.getState().midi?.tracks ?? []
  let first = Infinity
  for (const t of tracks) for (const n of t.notes) if (n.time < first) first = n.time
  return Number.isFinite(first) ? first : 0
}

export function startCountIn(): boolean {
  const s = useStore.getState()
  if (!deps || !s.countInEnabled || !s.midi || active || isTapCapturing()) return false
  const m = s.midi as any
  const ratio = s.originalBpm > 0 ? s.bpm / s.originalBpm : 1
  const plan = countInPlan({
    beats: m._beatTimes ?? [], bars: m._barTimes ?? [],
    firstNote: firstNoteTime(), playhead: s.currentTime, nBars: s.countInBars, ratio,
  })
  if (!plan || plan.clicks.length === 0) return false

  const d = deps
  const t0 = d.now() + LEAD
  const musicAt = t0 + plan.total
  const clicks = plan.clicks.map(c => d.click(t0 + c.rel, c.accent))
  d.prepare()
  // Metronome on: click the song's first beat here too, on the same clock as
  // the count-in, so it can't be late or dropped by the playback start
  let clickedSongTime: number | null = null
  if (s.metronomeEnabled) {
    const beats: number[] = m._beatTimes ?? [], bars: number[] = m._barTimes ?? []
    const first = beats.find(b => b >= plan.startAt - 1e-6)
    if (first !== undefined) {
      clicks.push(d.click(musicAt + (first - plan.startAt) / ratio, bars.some(b => Math.abs(b - first) < 1e-6)))
      clickedSongTime = first
    }
  }
  const prevTime = s.currentTime
  const key = s.songKey
  useStore.setState({ currentTime: plan.startAt })
  s.setCountIn({ startPerf: d.perfNow() + LEAD * 1000, clicks: plan.clicks.map(c => ({ rel: c.rel, n: c.n })), total: plan.total })

  const engine = d.engine()
  // the click and the engine reach the speakers with different delays; an
  // engine that hasn't measured its own yet (reports 0) goes through the same
  // audio output as the clicks, so no correction then
  const engLat = d.engineLatency()
  const outputSkew = engLat > 0 ? d.ctxLatency() - engLat : 0
  const delay = Math.max(0, (musicAt - d.now()) + outputSkew - (startLag[engine] ?? 0))
  const timer = d.setTimer(() => {
    const st = useStore.getState()
    const ok = active !== null && st.songKey === key && st.countIn !== null
    active = null
    st.setCountIn(null)
    if (!ok) return
    d.anchor(musicAt, plan.startAt, clickedSongTime)
    lastFlip = { perf: d.perfNow(), engine }
    useStore.setState({ playbackState: 'playing' })
    d.setTimer(learnEngineStart, 1500)
  }, delay * 1000)
  active = { clicks, timer, prevTime, key }
  return true
}

export function cancelCountIn() {
  if (!active || !deps) return
  for (const c of active.clicks) { try { c.stop() } catch { /* already played */ } }
  deps.clearTimer(active.timer)
  const prevTime = active.prevTime
  active = null
  useStore.getState().setCountIn(null)
  useStore.setState({ currentTime: prevTime })
}
