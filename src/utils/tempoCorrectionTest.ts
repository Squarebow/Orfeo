import type { ParsedMidi } from '../types'
import { applyTempoCorrection, buildSegment, upsertSegment, shiftDownbeat, scaleCorrection, sanitizeCorrections, carryCorrection, nudgeSegment, removeSegmentAt, describeCorrection } from './tempoCorrection'

// Synthetic file: 60 bpm 4/4, 40 s long, beats every 1 s, bars every 4 s.
function file60(): ParsedMidi {
  const beats = Array.from({ length: 45 }, (_, i) => i)
  return {
    fileName: 't.mid', duration: 40, bpm: 60, timeSignatureNumerator: 4, timeSignatureDenominator: 4,
    tracks: [], noteCount: 0,
    _beatTimes: beats, _barTimes: beats.filter(b => b % 4 === 0),
    _tempoMap: [{ bpm: 60, time: 0 }],
    ...({ _barStarts: beats.filter(b => b % 4 === 0), _timeSigMap: [{ num: 4, den: 4, time: 0 }] } as any),
  } as ParsedMidi
}

export function runTempoCorrectionTest(): number {
  console.group('[tempoCorrection] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol
  const g = (m: ParsedMidi) => m as any

  // 1. no correction -> file grid, original object untouched
  const m0 = file60()
  const r0 = g(applyTempoCorrection(m0, null))
  check(r0._beatTimes.length === 45 && r0._barTimes[1] === 4, 'null correction = file grid')
  check(r0.bpm === 60 && r0.timeSignatureNumerator === 4, 'bpm/time-sig fields untouched')

  // 2. free segment from 0 (92.3 bpm), first tap at 1.3 is beat 1
  const s1 = buildSegment(m0, 0, { period: 0.65, anchor: 1.3 })
  check(!s1.snap && s1.beatsPerBar === 4 && s1.den === 4, `free segment, got ${JSON.stringify(s1)}`)
  const r1 = g(applyTempoCorrection(m0, { segments: [s1] }))
  check(near(r1._beatTimes[0], 0), `extends back to start, got ${r1._beatTimes[0]}`)
  check(near(r1._barTimes[0], 1.3), `first bar at first tap, got ${r1._barTimes[0]}`)
  check(near(r1._barTimes[1], 1.3 + 4 * 0.65), 'second bar four beats later')
  const beatSet = new Set<number>(r1._beatTimes)
  check(r1._barTimes.every((b: number) => beatSet.has(b)), 'every bar is an exact member of beats')
  check(r1._beatTimes[r1._beatTimes.length - 1] >= 40, 'grid runs past song end')
  check(near(r1._tempoMap[0].bpm, 60 / 0.65, 1e-6) && r1._tempoMap.length === 1, 'tempo map replaced')
  check(r1._barStarts === r1._barTimes, '_barStarts mirrors _barTimes')

  // 3. mid-song segment at 10 s: file grid kept before, no near-duplicate at seam
  const s2 = buildSegment(m0, 10, { period: 0.65, anchor: 12.0 })
  const r2 = g(applyTempoCorrection(m0, { segments: [s2] }))
  check(r2._beatTimes.includes(9) && !r2._beatTimes.includes(10), 'file beat 10 dropped at seam')
  check(r2._beatTimes.some((b: number) => near(b, 12 - 3 * 0.65)), 'first corrected beat 10.05 present')
  check(r2._tempoMap.length === 2 && r2._tempoMap[0].bpm === 60 && near(r2._tempoMap[1].time, 10.05), 'tempo map: file then corrected')
  check(r2._timeSigMap.length === 2 && near(r2._timeSigMap[1].time, 10.05), 'time-sig map gets a seam entry')
  const sorted = r2._beatTimes.every((b: number, i: number, a: number[]) => i === 0 || b > a[i - 1])
  check(sorted, 'beats strictly ascending')

  // 4. two segments; upsert inside the second replaces only from its start
  const s3 = buildSegment(m0, 25, { period: 0.5, anchor: 25 })
  const c23 = upsertSegment(upsertSegment(null, s2), s3)
  check(c23.segments.length === 2, 'two segments')
  const r3 = g(applyTempoCorrection(m0, c23))
  check(r3._beatTimes.some((b: number) => near(b, 25)) && r3._tempoMap.length === 3, 'third tempo region')
  const s4 = buildSegment(m0, 20, { period: 0.55, anchor: 20 })
  const c4 = upsertSegment(c23, s4)
  check(c4.segments.length === 2 && c4.segments[1].start === 20, 'upsert at 20 drops the 25 segment, keeps 10')

  // 5. downbeat shift moves bars by one beat, beats unchanged
  const r5 = g(applyTempoCorrection(m0, { segments: [shiftDownbeat(s1, 1)] }))
  check(near(r5._barTimes[0], 1.95), `shift +1, got ${r5._barTimes[0]}`)
  check(r5._beatTimes.length === r1._beatTimes.length && r5._beatTimes.every((b: number, i: number) => near(b, r1._beatTimes[i], 1e-9)), 'beats identical after shift')

  // 6. idempotent: correcting an already-corrected object uses the file grid
  const r6 = g(applyTempoCorrection(r2 as ParsedMidi, { segments: [s1] }))
  check(JSON.stringify(r6._beatTimes) === JSON.stringify(r1._beatTimes), 'no stacking of corrections')
  check(g(applyTempoCorrection(r2 as ParsedMidi, null))._beatTimes.length === 45, 'reset from corrected object')

  // 7. scaleCorrection
  const sc = scaleCorrection({ segments: [s2] }, 0.5)
  check(near(sc.segments[0].start, 5) && near(sc.segments[0].period, 0.325) && near(sc.segments[0].anchor, 6), 'scaled')

  // 8. segment past song end is ignored
  const r8 = g(applyTempoCorrection(m0, { segments: [{ ...s1, start: 99 }] }))
  check(r8._beatTimes.length === 45, 'out-of-range segment skipped')

  // 9. sanitize
  const clean = sanitizeCorrections({
    good: { segments: [s1] },
    nan: { segments: [{ ...s1, period: NaN }] },
    neg: { segments: [{ ...s1, period: -1 }] },
    junk: 'x', missing: { segments: [{ start: 0 }] },
  })
  check(Object.keys(clean).join() === 'good', `sanitize keeps only valid, got ${Object.keys(clean)}`)
  check(Object.keys(sanitizeCorrections(null)).length === 0, 'sanitize(null) = {}')

  // 10. carry-over on save: baked 2x speed halves all times
  const all = { A: { segments: [s2] } }
  const moved = carryCorrection(all, 'A', 'B', 0.5)
  check(!!moved && !!moved.A && near(moved.B.segments[0].start, 5), 'carried + scaled, original kept')
  check(carryCorrection(all, 'Z', 'B', 1) === null && carryCorrection(all, null, 'B', 1) === null, 'nothing to carry')
  check(carryCorrection(all, 'A', 'A', 1) === null, 'same key -> no-op')

  // 11. sanitize rejects tempos outside 20–400 bpm (hand-edited prefs)
  const tiny = sanitizeCorrections({ a: { segments: [{ ...s1, period: 1e-6 }] }, b: { segments: [{ ...s1, period: 6 }] }, c: { segments: [s1] } })
  check(Object.keys(tiny).join() === 'c', `bpm bounds enforced, got ${Object.keys(tiny)}`)

  // 12. nudge / list / remove (for the pad's menu)
  check(near(nudgeSegment(s1, -0.01).anchor, 1.29), 'nudge moves anchor')
  const list = describeCorrection({ segments: [s2, s3] })
  check(list.length === 2 && list[0].start === 10 && near(list[0].bpm, 60 / 0.65) && near(list[1].bpm, 120), `describe, got ${JSON.stringify(list)}`)
  const rm = removeSegmentAt({ segments: [s2, s3] }, 0)
  check(rm.segments.length === 1 && rm.segments[0].start === 25, 'remove one segment')

  // 13. "file's own bar lines" segment: bars/beats/time signatures pass
  // through untouched, only the tempo number is rescaled (double-time files)
  const gbBeats: number[] = [], gbBars: number[] = [], gbSigs: any[] = []
  { let i = 0, bar = 0
    while (i < 160) { const len = bar % 4 === 3 ? 4 : 3
      gbBars.push(i * 0.316); if (bar % 4 === 0 || bar % 4 === 3) gbSigs.push({ num: len, den: 4, time: i * 0.316 })
      for (let k = 0; k < len; k++) gbBeats.push((i + k) * 0.316)
      i += len; bar++ } }
  const gb = { ...file60(), duration: 50, _beatTimes: gbBeats, _barTimes: gbBars, _barStarts: gbBars,
    _tempoMap: [{ bpm: 60 / 0.316, time: 0 }], _timeSigMap: gbSigs } as any as ParsedMidi
  const fileSeg = { start: 0, anchor: 0, period: 0.632, beatsPerBar: 3, den: 4, snap: { ratio: 2, barShift: 0 } }
  const rg = g(applyTempoCorrection(gb, { segments: [fileSeg] }))
  check(JSON.stringify(rg._beatTimes) === JSON.stringify(gbBeats.filter(b => b < 50 + 8 * 0.632)), 'file beats kept')
  check(JSON.stringify(rg._barTimes) === JSON.stringify(gbBars.filter(b => b < 50 + 8 * 0.632)), 'file bar lines kept (3/4 and 4/4)')
  check(near(rg._tempoMap[0].bpm, 60 / 0.632, 1e-6), `tempo number halved, got ${rg._tempoMap[0].bpm}`)
  check(rg._timeSigMap.length === gbSigs.length && rg._timeSigMap[1].num === 4, 'time signature changes kept')

  console.log(`tempoCorrection: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
