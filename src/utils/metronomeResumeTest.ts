import { resumeIndexAfterGridSwap, firstClickTime } from './metronomeResume'

export function runMetronomeResumeTest(): number {
  console.group('[metronomeResume] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Old grid 190 bpm, last click at 60.0 s; new grid ~94 bpm -> resume right after 60 s, not 60 s later
  const slow = Array.from({ length: 400 }, (_, i) => i * 0.638)
  const j = resumeIndexAfterGridSwap(slow, 60.0)
  check(slow[j] <= 60.1 && slow[j + 1] > 60.0, `resume just after last click, got idx ${j} t=${slow[j]}`)
  // A new-grid beat within 0.1 s after the last click counts as already clicked (no double click)
  const g = [59.5, 60.05, 60.7]
  check(resumeIndexAfterGridSwap(g, 60.0) === 1, 'beat 50 ms after last click is skipped')
  // Nothing scheduled yet
  check(resumeIndexAfterGridSwap(g, -Infinity) === -1, 'no prior click -> -1')
  // Faster new grid (Cancel back from a corrected groove): never jumps ahead
  const fast = Array.from({ length: 400 }, (_, i) => i * 0.25)
  const k = resumeIndexAfterGridSwap(fast, 30.0)
  check(fast[k + 1] > 30.0 && fast[k + 1] < 30.4, `next click right after 30 s, got ${fast[k + 1]}`)

  // starting playback exactly on a beat: that beat is already a few ms in the
  // past when the scheduler first runs — click it (a hair late), don't drop it
  check(firstClickTime(10.0, 10.02, true) === 10.025, 'first beat of a run, just passed -> clicked now')
  check(firstClickTime(10.0, 10.2, true) === null, 'long gone -> skipped')
  check(firstClickTime(10.0, 10.02, false) === null, 'mid-run past beat -> skipped (no double clicks)')
  check(firstClickTime(10.5, 10.0, true) === 10.5, 'future beat -> on time')

  console.log(`metronomeResume: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
