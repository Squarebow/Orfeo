import { countInPlan } from './countIn'

// grid helper: beats every `b` s from `from`, bars every `bpb` beats
function grid(b: number, bpb: number, from: number, to: number) {
  const beats: number[] = [], bars: number[] = []
  for (let k = 0, t = from; t <= to; k++, t = from + k * b) { beats.push(+t.toFixed(6)); if (k % bpb === 0) bars.push(+t.toFixed(6)) }
  return { beats, bars }
}

export function runCountInTest(): number {
  console.group('[countIn] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol

  // 1. first note right on bar 1 at 0 s, 120 bpm 4/4, 1 bar
  const g = grid(0.5, 4, 0, 60)
  const p1 = countInPlan({ ...g, firstNote: 0, playhead: 0, nBars: 1, ratio: 1 })!
  check(!!p1 && p1.startAt === 0 && p1.clicks.length === 4 && near(p1.total, 2), `1 bar = 4 clicks over 2 s, got ${JSON.stringify(p1)}`)
  check(p1.clicks.map(c => c.n).join() === '1,2,3,4' && p1.clicks[0].accent && !p1.clicks[1].accent, 'counts 1-2-3-4, accent on 1')
  check(near(p1.clicks[3].rel, 1.5) && near(p1.total - p1.clicks[3].rel, 0.5), 'music one beat after the last click')

  // 2. two empty bars before the first note (at 4 s) -> lead-in skipped
  const p2 = countInPlan({ ...g, firstNote: 4, playhead: 0, nBars: 2, ratio: 1 })!
  check(p2.startAt === 4 && p2.clicks.length === 8 && near(p2.total, 4), `skips the empty bars, got start ${p2.startAt}`)

  // 3. pickup: first note on beat 4 of the bar before bar 2 (bar 2 at 2.0 s)
  const p3 = countInPlan({ ...g, firstNote: 1.5, playhead: 0, nBars: 1, ratio: 1 })!
  check(p3.startAt === 1.5, `music starts on the pickup, got ${p3.startAt}`)
  check(p3.clicks.map(c => c.n).join() === '1,2,3', `clicks stop before the pickup, got ${p3.clicks.map(c => c.n)}`)
  check(near(p3.total - p3.clicks[p3.clicks.length - 1].rel, 0.5), 'pickup one beat after the last click')

  // 4. 3/4 -> 3 clicks per bar
  const g3 = grid(0.6, 3, 0, 60)
  const p4 = countInPlan({ ...g3, firstNote: 0, playhead: 0, nBars: 2, ratio: 1 })!
  check(p4.bpb === 3 && p4.clicks.map(c => c.n).join() === '1,2,3,1,2,3', `3/4 count, got ${p4.clicks.map(c => c.n)}`)

  // 5. mid-song: playhead inside bar starting at 10 s -> starts at 10
  const p5 = countInPlan({ ...g, firstNote: 0, playhead: 10.7, nBars: 1, ratio: 1 })!
  check(p5.startAt === 10 && p5.clicks.length === 4, `mid-song counts into the bar, got ${p5.startAt}`)

  // 6. speed 50% -> everything twice as long; 150% -> shorter
  const p6 = countInPlan({ ...g, firstNote: 0, playhead: 0, nBars: 1, ratio: 0.5 })!
  check(near(p6.total, 4) && near(p6.clicks[1].rel, 1), `50% speed doubles the count-in, got ${p6.total}`)
  const p7 = countInPlan({ ...g, firstNote: 0, playhead: 0, nBars: 1, ratio: 1.5 })!
  check(near(p7.total, 2 / 1.5), '150% speed shortens it')

  // 7. no usable grid -> null
  check(countInPlan({ beats: [], bars: [], firstNote: 0, playhead: 0, nBars: 1, ratio: 1 }) === null, 'no grid -> null')

  // 8. playhead exactly on a bar line mid-song stays on it
  check(countInPlan({ ...g, firstNote: 0, playhead: 12, nBars: 1, ratio: 1 })!.startAt === 12, 'on a bar line stays there')

  // 9. first note a hair after the bar line (humanised) still gets a full bar
  const p9 = countInPlan({ ...g, firstNote: 0.012, playhead: 0, nBars: 1, ratio: 1 })!
  check(p9.clicks.length === 4 && p9.startAt === 0.012, `slightly late first note -> full bar, got ${p9.clicks.length}`)

  console.log(`countIn: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
