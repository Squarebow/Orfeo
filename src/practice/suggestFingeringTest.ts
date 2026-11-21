import { suggestFingering, type FingerNote } from './suggestFingering'

// What method books teach, as the suggestion must give it
export function runSuggestFingeringTest(): number {
  console.group('[suggested fingering] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const seq = (midis: number[], step = 0.25): FingerNote[] => midis.map((m, i) => ({ midi: m, time: i * step, dur: step * 0.9 }))
  const chord = (midis: number[]): FingerNote[] => midis.map(m => ({ midi: m, time: 0, dur: 0.9 }))
  const f = (ns: FingerNote[], h: 'L' | 'R', size?: 'small' | 'medium' | 'large') => suggestFingering(ns, h, size).join(' ')
  const C = [60, 62, 64, 65, 67, 69, 71, 72]

  // scales: the thumb passes under after 3, ends on 5
  check(f(seq(C), 'R') === '1 2 3 1 2 3 4 5', `C major, right hand up: ${f(seq(C), 'R')}`)
  check(f(seq([...C, ...C.slice(0, -1).reverse()]), 'R') === '1 2 3 1 2 3 4 5 4 3 2 1 3 2 1', 'C major up and down: 3 crosses over the thumb coming back')
  check(f(seq(C.map(m => m - 12)), 'L') === '5 4 3 2 1 3 2 1', 'C major, left hand up')
  check(f(seq([67, 69, 71, 72, 74, 76, 78, 79]), 'R') === '1 2 3 1 2 3 4 5', 'G major')
  check(f(seq([62, 64, 66, 67, 69, 71, 73, 74]), 'R') === '1 2 3 1 2 3 4 5', 'D major: no thumb on F# or C#')
  check(f(seq([64, 66, 68, 69, 71, 73, 75, 76]), 'R') === '1 2 3 1 2 3 4 5', 'E major')
  // five-finger position: one finger a key, no moving
  check(f(seq([60, 62, 64, 65, 67, 65, 64, 62, 60]), 'R') === '1 2 3 4 5 4 3 2 1', 'five-finger position, right hand')
  check(f(seq([48, 50, 52, 53, 55]), 'L') === '5 4 3 2 1', 'five-finger position, left hand')
  // chords in their usual shapes
  check(f(chord([60, 64, 67]), 'R') === '1 3 5' && f(chord([48, 52, 55]), 'L') === '5 3 1', 'a triad: 1-3-5 right, 5-3-1 left')
  check(f(chord([60, 72]), 'R') === '1 5', 'an octave: 1 and 5')
  check(f(seq([60, 64, 67, 72, 76, 79, 84]), 'R') === '1 2 3 1 2 3 5', 'C arpeggio, right hand')
  check(f(seq([36, 40, 43, 48, 52, 55, 60]), 'L') === '5 3 2 1 3 2 1', 'C arpeggio, left hand')
  check(f(seq([48, 55, 52, 55, 48, 55, 52, 55], 0.15), 'L') === '5 1 3 1 5 1 3 1', 'Alberti bass: 5-1-3-1')
  // black keys: the thumb kept off them in a scale
  const black = new Set([1, 3, 6, 8, 10])
  for (const [name, scale] of [['F major', [65, 67, 69, 70, 72, 74, 76, 77]], ['B♭ major', [70, 72, 74, 75, 77, 79, 81, 82]]] as const) {
    const out = suggestFingering(seq([...scale]), 'R')
    check(scale.every((m, i) => !(out[i] === 1 && black.has(m % 12))), `${name}: no thumb on a black key (${out.join(' ')})`)
  }
  // your own numbers stay, the rest fits round them
  const fixed = seq([60, 62, 64, 65, 67]).map((n, i) => (i === 2 ? { ...n, finger: 1 } : n))
  const fx = suggestFingering(fixed, 'R')
  check(fx[2] === 1 && fx.every(x => x !== undefined), `a finger you set is kept (${fx.join(' ')})`)
  // never the thumb under the little finger, never the same finger on two keys in a row (legato)
  for (const [name, ns] of [['C major', seq(C)], ['melody', seq([60, 72, 71, 67, 69, 60])], ['A minor', seq([69, 71, 72, 74, 76, 74, 72, 71, 69])]] as const) {
    const out = suggestFingering(ns as FingerNote[], 'R')
    const bad = out.some((x, i) => i > 0 && x === out[i - 1] && (ns as FingerNote[])[i].midi !== (ns as FingerNote[])[i - 1].midi)
    check(!bad, `${name}: no finger twice on different keys in a row (${out.join(' ')})`)
  }
  // the scale books' fingering for other keys (two octaves)
  const up = (start: number, steps: number[]) => { const out = [start]; for (let o = 0; o < 2; o++) for (const st of steps) out.push(out[out.length - 1] + st); return out }
  const MAJ = [2, 2, 1, 2, 2, 2, 1], HMIN = [2, 1, 2, 2, 1, 3, 1]
  const k = (tonic: number, minor = false) => ({ tonic, minor })
  const fk = (ms: number[], h: 'L' | 'R', key: { tonic: number; minor: boolean }) => suggestFingering(seq(ms), h, 'medium', key).join(' ')
  check(fk(up(65, MAJ), 'R', k(5)) === '1 2 3 4 1 2 3 1 2 3 4 1 2 3 4', `F major, right hand: 4 on B♭ (${fk(up(65, MAJ), 'R', k(5))})`)
  check(fk(up(70, MAJ), 'R', k(10)) === '2 1 2 3 1 2 3 4 1 2 3 1 2 3 4', 'B♭ major, right hand')
  check(fk(up(68, MAJ), 'R', k(8)) === '3 4 1 2 3 1 2 3 4 1 2 3 1 2 3', 'A♭ major, right hand')
  check(fk(up(53, MAJ), 'L', k(5)) === '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1', 'F major, left hand')
  check(fk(up(47, MAJ), 'L', k(11)) === '4 3 2 1 4 3 2 1 3 2 1 4 3 2 1', 'B major, left hand: 4 3 2 1 4 3 2 1')
  check(fk(up(69, HMIN), 'R', k(9, true)) === '1 2 3 1 2 3 4 1 2 3 1 2 3 4 5', 'A harmonic minor, right hand (across the augmented 2nd)')
  check(fk(up(45, HMIN), 'L', k(9, true)) === '5 4 3 2 1 3 2 1 4 3 2 1 3 2 1', 'A harmonic minor, left hand')

  // a hand can't play six notes at once: no suggestion, nothing broken
  check(suggestFingering(chord([48, 52, 55, 60, 64, 67]), 'R').every(x => x === undefined), 'six notes at once: left without numbers')
  // a small hand doesn't stretch a 10th in one go
  const tenth = suggestFingering(chord([60, 76]), 'R', 'small')
  check(tenth.every(x => x === undefined), 'a 10th is too far for a small hand')
  check(suggestFingering(chord([60, 76]), 'R', 'large').join(' ') === '1 5', 'a large hand reaches a 10th with 1 and 5')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
