import { useStore } from '../store'
import { outputLatencySec } from '../audio/engine'
import { CHORD_GRACE_SEC } from '../utils/midiParser'
import { usePractice } from './practiceMode'
import { currentMatcher, onSongJump, useListen, useWaiting } from './listen'
import { StepWaiter, type Matcher } from './matcher'

// ── The waiting (practice stage 3) ───────────────────────────────────────────
// Wait for me, or Practise with Wait on: the song plays on, band and all, up
// to your next notes, and waits there until you've played them (StepWaiter in
// matcher.ts). Then it carries on from that very place. Wrong notes sound and
// don't move it on; there's no hurry and nothing counts against you.

export function waitingOn(): boolean {
  const p = usePractice.getState()
  return p.active && (p.way === 'wait' || (p.way === 'practise' && p.waitOn))
}

// The song may run this far past a step (real seconds): the time the sound
// takes to reach you, plus a moment, so a player right on the beat never
// feels it stop and start
const GRACE_SEC = 0.06
const ratio = () => { const s = useStore.getState(); return s.originalBpm > 0 ? s.bpm / s.originalBpm : 1 }

let waiter: StepWaiter | null = null
let forMatcher: Matcher | null = null
function current(): StepWaiter | null {
  const m = currentMatcher()
  if (!m) { waiter = forMatcher = null; return null }
  if (m !== forMatcher) {
    forMatcher = m
    waiter = new StepWaiter(m, (outputLatencySec() + GRACE_SEC) * ratio(), CHORD_GRACE_SEC)
    waiter.reset(useStore.getState().currentTime)
  }
  return waiter
}

function hold(at: number) {
  useWaiting.setState({ holding: true, at })
  useStore.setState({ playbackState: 'paused' })
}
/** Stop waiting: Play goes on, Pause stays paused */
export function endHold(playOn: boolean) {
  if (!useWaiting.getState().holding) return
  useWaiting.setState({ holding: false, at: null })
  if (playOn) useStore.setState({ playbackState: 'playing' })
}

useStore.subscribe((s, prev) => {
  if (s.currentTime === prev.currentTime && s.playbackState === prev.playbackState) return
  if (s.playbackState !== 'playing' || !waitingOn()) return
  const w = current()
  const step = w?.check(s.currentTime)
  if (step) hold(step.time)
})

// each key you press: is the step you're waited for complete?
useListen.subscribe(() => {
  if (!useWaiting.getState().holding) return
  const w = current()
  if (!w || !w.check(useStore.getState().currentTime)) endHold(true)
})

onSongJump(t => { useWaiting.setState({ holding: false, at: null }); current()?.reset(t) })
usePractice.subscribe((p, prev) => {
  if (p.way !== prev.way || p.waitOn !== prev.waitOn || p.active !== prev.active) {
    if (!waitingOn()) endHold(false)
    forMatcher = null   // fresh steps
  }
})
