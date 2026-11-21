import { buildScore, splitLength, onTheGrid, fifthsOf, keySpecOf, spell, type ScoreNote } from './score'

// 4/4 at 120: a beat every half second
const beats = Array.from({ length: 33 }, (_, i) => i * 0.5)
const bars4 = [0, 2, 4, 6, 8, 10, 12, 14]
const sig44 = [{ num: 4, den: 4, time: 0 }]
const N = (midi: number, time: number, dur: number, hand: 'L' | 'R' = 'R'): ScoreNote => ({ midi, time, dur, hand })
const show = (evs: { len: number; keys: number[] | null; tie: boolean }[]) => evs.map(e => (e.keys ? e.keys.join('+') : 'r') + ':' + e.len + (e.tie ? '~' : '')).join(' ')

export function runScoreTest(): number {
  console.group('[score] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string, got?: unknown) => { c ? pass++ : (fail++, console.error('FAIL:', m, got ?? '')) }

  // ── note values that keep the beats visible ──
  check(splitLength(0, 16, 16).join() === '16', 'a whole bar: a whole note')
  check(splitLength(4, 8, 16).join() === '4,4', 'a half note from beat 2: two quarters tied (the middle of the bar shows)')
  check(splitLength(2, 4, 16).join() === '2,2', 'an off-beat quarter: two eighths tied over the beat')
  check(splitLength(0, 6, 16).join() === '6', 'a dotted quarter on the beat')
  check(splitLength(0, 12, 12).join() === '12', 'a whole bar of 3/4: a dotted half')
  check(splitLength(0, 6, 12, true).join() === '6' && splitLength(6, 6, 12, true).join() === '6', '6/8: two dotted quarters')
  check(splitLength(6, 6, 12).join() === '2,4', '3/4: the same length from the middle of beat 2 shows beat 3')

  // ── a simple tune ──
  {
    const s = buildScore({ notes: [N(60, 0, 0.5), N(62, 0.5, 0.5), N(64, 1, 1), N(48, 0, 1, 'L')], beatTimes: beats, barStarts: bars4.slice(0, 2), timeSigs: sig44, duration: 4, keyFifths: 0 })
    check(show(s.bars[0].R) === '60:4 62:4 64:8', 'quarter, quarter, half', show(s.bars[0].R))
    check(show(s.bars[0].L) === '48:8 r:8', 'left hand: a half note, then a half rest', show(s.bars[0].L))
    check(show(s.bars[1].R) === 'r:16', 'an empty bar: a whole-bar rest')
    check(Math.abs(s.bars[0].R[1].time - 0.5) < 1e-9, 'each note knows where it sounds')
  }
  // ── played in by hand: a little early or late still lands on the beat ──
  {
    const s = buildScore({ notes: [N(60, 0.02, 0.45), N(62, 0.48, 0.5), N(64, 1.03, 0.95)], beatTimes: beats, barStarts: [0, 2], timeSigs: sig44, duration: 4, keyFifths: 0 })
    check(show(s.bars[0].R).startsWith('60:4 62:4 64:'), 'loose timing rounded to the beat', show(s.bars[0].R))
  }
  // ── chords, and a held note cut where the next one starts ──
  {
    const s = buildScore({ notes: [N(60, 0, 2), N(64, 0, 2), N(67, 0, 2), N(72, 1, 1)], beatTimes: beats, barStarts: [0, 2], timeSigs: sig44, duration: 4, keyFifths: 0 })
    check(show(s.bars[0].R) === '60+64+67:8 72:8', 'a chord, then the next note: one voice', show(s.bars[0].R))
  }
  // ── over the bar line: tied ──
  {
    const s = buildScore({ notes: [N(60, 1.5, 1)], beatTimes: beats, barStarts: [0, 2], timeSigs: sig44, duration: 4, keyFifths: 0 })
    check(show(s.bars[0].R) === 'r:8 r:4 60:4~', 'the note starts on beat 4…', show(s.bars[0].R))
    check(show(s.bars[1].R).startsWith('60:4'), '…and is tied into the next bar', show(s.bars[1].R))
  }
  // ── eighths only, for a file played in by hand ──
  {
    const s = buildScore({ notes: [N(60, 0, 0.12), N(62, 0.13, 0.12)], beatTimes: beats, barStarts: [0], timeSigs: sig44, duration: 2, keyFifths: 0, grid: 2 })
    check(s.bars[0].R.every(e => e.len % 2 === 0), 'nothing shorter than an eighth', show(s.bars[0].R))
  }
  // ── tempo changes don't matter: it's all in beats ──
  {
    const slow = [0, 1, 2, 3, 4, 4.25, 4.5, 4.75, 5]   // bar 1 at 60, bar 2 at 240
    const s = buildScore({ notes: [N(60, 1, 1), N(62, 4.5, 0.25)], beatTimes: slow, barStarts: [0, 4], timeSigs: sig44, duration: 5, keyFifths: 0 })
    check(show(s.bars[0].R) === 'r:4 60:4 r:8' && show(s.bars[1].R) === 'r:8 62:4 r:4', 'the same note values at any tempo', show(s.bars[0].R) + ' | ' + show(s.bars[1].R))
  }
  // ── the key ──
  check(fifthsOf(7, false) === 1 && fifthsOf(9, true) === 0 && fifthsOf(5, false) === -1 && fifthsOf(2, true) === -1, 'G major one sharp, A minor none, F major and D minor one flat')
  check(keySpecOf(-3) === 'Eb' && keySpecOf(4) === 'E', 'key names for the drawing')
  check(spell(61, 2) === 'c#/4' && spell(61, -3) === 'db/4' && spell(60, 0) === 'c/4' && spell(21, 0) === 'a/0', 'sharps in sharp keys, flats in flat keys')
  // ── on the grid or not ──
  check(onTheGrid([N(60, 0, 1), N(62, 0.125, 1)], beats) === 1, 'written in a program: all on sixteenths')
  check(onTheGrid([N(60, 0.04, 1), N(62, 0.19, 1)], beats) < 0.6, 'played in by hand: off the grid')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
