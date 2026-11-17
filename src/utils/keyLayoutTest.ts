import { isBlackKey } from './midiParser'
import {
  PIANO_RANGES, buildKeyLayoutRatios, buildKeyLayoutView, viewOfRange, whitesBelow,
  rangeOf, octaveLimits, clampOctave, foldIntoRange, isPortableSize,
} from './keyLayout'
import { fitKeyboard } from './keyboardRange'
import { keyHeightFor, labelScaleFor } from './keyView'

// The layout before portable keyboards (flex row of whites + 0.70 offset black
// keys), kept here to prove the shared formula still draws 61/73/88 identically.
function oldLayout(min: number, max: number) {
  const whites: number[] = []
  for (let m = min; m <= max; m++) if (!isBlackKey(m)) whites.push(m)
  const n = whites.length
  const out: { x: number; width: number }[] = []
  let wi = 0
  for (let m = min; m <= max; m++) {
    if (!isBlackKey(m)) { out.push({ x: wi / n, width: 1 / n }); wi++ }
    else out.push({ x: (wi - 0.30) / n, width: 0.60 / n })
  }
  return out
}

export function runKeyLayoutTest(): number {
  console.group('[keyLayout] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

  // every size draws exactly as before
  for (const size of [25, 37, 49, 61, 73, 88]) {
    const { min, max } = PIANO_RANGES[size]
    const a = buildKeyLayoutRatios(min, max), b = oldLayout(min, max)
    check(a.length === b.length && a.every((k, i) => near(k.x, b[i].x) && near(k.width, b[i].width)), `${size} keys: same layout as before`)
  }

  // the sizes: C to C, the number of keys, nested inside each other
  for (const size of [25, 37, 49]) {
    const { min, max } = PIANO_RANGES[size]
    check(max - min + 1 === size && min % 12 === 0 && max % 12 === 0, `${size} keys run C to C`)
  }
  const nested = [25, 37, 49, 61, 73, 88].every((n, i, all) => i === 0 || (PIANO_RANGES[all[i - 1]].min >= PIANO_RANGES[n].min && PIANO_RANGES[all[i - 1]].max <= PIANO_RANGES[n].max))
  check(nested, 'each size sits inside the next')
  check(isPortableSize(25) && isPortableSize(49) && !isPortableSize(61), 'portable sizes are 25, 37, 49')

  // white keys counted from note 0
  check(whitesBelow(0) === 0 && whitesBelow(12) === 7 && whitesBelow(60) === 35 && whitesBelow(61) === 36 && whitesBelow(62) === 36, 'white keys below C0, C1, C4, C#4, D4')
  check(viewOfRange(21, 108).vw === 52 && viewOfRange(36, 96).vw === 36 && viewOfRange(48, 72).vw === 15, '88 = 52 white keys, 61 = 36, 25 = 15')

  // a view half-way between two sizes: keys keep their order and widths stay equal
  const mid = { v0: (whitesBelow(36) + whitesBelow(48)) / 2, vw: (36 + 15) / 2 }
  const lay = buildKeyLayoutView(mid, 36, 96)
  check(lay.every((k, i) => i === 0 || k.x > lay[i - 1].x), 'mid-glide: keys stay in order')
  check(near(lay[60 - 36].width, 1 / mid.vw), 'mid-glide: a white key is 1/vw wide')

  // octave buttons
  check(JSON.stringify(octaveLimits(25)) === '{"down":-2,"up":3}', `25 keys: 2 octaves down, 3 up (${JSON.stringify(octaveLimits(25))})`)
  check(JSON.stringify(octaveLimits(49)) === '{"down":-1,"up":2}', '49 keys: 1 down, 2 up')
  check(JSON.stringify(octaveLimits(61)) === '{"down":0,"up":0}', '61 keys: no octave buttons')
  check(clampOctave(25, 9) === 3 && clampOctave(25, -9) === -2, 'octave stays on the 88-key piano')
  const up1 = rangeOf(25, 1)
  check(up1.min === 60 && up1.max === 84, '25 keys up an octave: C4–C6')
  check(rangeOf(61, 2).min === 36, 'a standard size ignores the octave')

  // notes beyond the edges
  check(foldIntoRange(30, 48, 72) === 54, 'F#1 shows on F#3')
  check(foldIntoRange(90, 48, 72) === 66, 'F#6 shows on F#4')
  check(foldIntoRange(60, 48, 72) === 60, 'a note inside stays')

  // a USB keyboard picks its own size
  check(fitKeyboard({ low: 48, high: 72 }, true).size === 25, '25-key keyboard → 25 with Portable keyboards on')
  check(fitKeyboard({ low: 48, high: 72 }, false).size === 61, '…and 61 with it off')
  const shifted = fitKeyboard({ low: 60, high: 84 }, true)
  check(shifted.size === 25 && shifted.octave === 1, '25-key keyboard an octave up → 25 at +1')
  check(fitKeyboard({ low: 36, high: 84 }, true).size === 49, '49-key keyboard → 49')
  check(fitKeyboard({ low: 21, high: 108 }, true).size === 88, '88-key keyboard → 88')

  // key height: 61/73/88 exactly as before (80–140 px, 4 × key width)
  const before = (w: number, whites: number) => Math.round(Math.max(80, Math.min(140, (w / whites) * 4.0)))
  for (const [size, whites] of [[61, 36], [73, 45], [88, 52]] as const) {
    const { min, max } = PIANO_RANGES[size]
    for (const w of [700, 1200, 1600, 2560]) {
      check(keyHeightFor(w, viewOfRange(min, max), 1000) === before(w, whites), `${size} keys at ${w} px: same height as before`)
    }
  }
  const h25 = keyHeightFor(1600, viewOfRange(48, 72), 1000), h37 = keyHeightFor(1600, viewOfRange(48, 84), 1000)
  check(h25 === 140 && h37 === 140, `portable keys are no taller than the others (${h25}, ${h37})`)
  check(labelScaleFor(viewOfRange(48, 72)) <= 1.2, 'labels grow only a little')
  check(labelScaleFor(viewOfRange(36, 96)) === 1 && labelScaleFor(viewOfRange(48, 72)) > 1, 'labels grow only on portable sizes')

  console.log(`keyLayout: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
