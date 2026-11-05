import { stepDisplayedBpm, typedBpm } from './bpmStep'

export function runBpmStepTest(): number {
  console.group('[bpmStep] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  // single-tempo uncorrected file: exactly ±1 as before
  check(stepDisplayedBpm(120, 120, 120, 1) === 121, 'plain +1')
  // corrected file: file 60, displayed tempo 92 -> one click moves the readout by 1
  const b = stepDisplayedBpm(60, 60, 92, 1)
  check(Math.abs(92 * (b / 60) - 93) < 1e-9, `readout +1, got ${92 * b / 60}`)
  // up then down returns EXACTLY to the original (no phantom "tempo changed" state)
  let bad = 0
  for (let ob = 40; ob < 240; ob += 0.73) for (const fb of [40.37, 63, 92.4, 191.7]) {
    const up = stepDisplayedBpm(ob, ob, fb, 1)
    if (stepDisplayedBpm(up, ob, fb, -1) !== ob) bad++
  }
  check(bad === 0, `round-trip lands exactly on original, ${bad} misses`)
  // clamps
  check(stepDisplayedBpm(300, 120, 120, 1) === 300 && stepDisplayedBpm(20, 120, 120, -1) === 20, 'clamped 20..300')
  // typing: the readout shows what was typed, on plain and corrected files
  check(typedBpm('90', 120, 120) === 90, 'typed 90 on a plain file')
  const typed = typedBpm('100', 60, 92)!
  check(Math.abs(92 * (typed / 60) - 100) < 1e-9, `corrected file reads 100, got ${92 * typed / 60}`)
  check(typedBpm(' 92,5 ', 120, 120) === 92.5 && typedBpm('92.5', 120, 120) === 92.5, 'comma or point, spaces ignored')
  // the song's own tempo restores it exactly, decimals in the file or not
  check(typedBpm('120', 120.4, 120.4) === 120.4, 'own tempo snaps to the original')
  // not a tempo: nothing changes
  for (const bad of ['', '   ', 'abc', '0', '-5', '1e', '12x']) check(typedBpm(bad, 120, 120) === null, `"${bad}" refused`)
  // same limits as the arrows
  check(typedBpm('5', 120, 120) === 20 && typedBpm('999', 120, 120) === 300, 'clamped 20..300')
  console.log(`bpmStep: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
