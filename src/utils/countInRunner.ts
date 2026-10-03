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
  anchor: (audioTime: number, songTime: number) => void
}

const LEAD = 0.1   // s between pressing Play and the first click (scheduling headroom)

let deps: CountInDeps | null = null
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
  const prevTime = s.currentTime
  const key = s.songKey
  useStore.setState({ currentTime: plan.startAt })
  s.setCountIn({ startPerf: d.perfNow() + LEAD * 1000, clicks: plan.clicks.map(c => ({ rel: c.rel, n: c.n })), total: plan.total })

  const delay = Math.max(0, (musicAt - d.now()) + d.ctxLatency() - d.engineLatency())
  const timer = d.setTimer(() => {
    const st = useStore.getState()
    const ok = active !== null && st.songKey === key && st.countIn !== null
    active = null
    st.setCountIn(null)
    if (!ok) return
    d.anchor(musicAt, plan.startAt)
    useStore.setState({ playbackState: 'playing' })
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
