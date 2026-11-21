import { buildScore, splitLength, onTheGrid, isSwung, fifthsOf, keySpecOf, spell, type ScoreNote, type ScoreEvent } from './score'

// 4/4 at 120: a beat every half second. Lengths below are in 48ths of a whole
// note: 12 a quarter, 6 an eighth, 3 a sixteenth, 4 a triplet eighth.
const beats = Array.from({ length: 65 }, (_, i) => i * 0.5)
const sig44 = [{ num: 4, den: 4, time: 0 }]
const N = (midi: number, time: number, dur: number, hand: 'L' | 'R' = 'R'): ScoreNote => ({ midi, time, dur, hand })
const show = (evs: ScoreEvent[] = []) => evs.map(e => (e.keys ? e.keys.join('+') : e.ghost ? 'g' : 'r') + ':' + e.len + (e.tie ? '~' : '') + (e.triplet !== undefined ? '³' : '')).join(' ')
const one = (notes: ScoreNote[], extra: Partial<Parameters<typeof buildScore>[0]> = {}) =>
  buildScore({ notes, beatTimes: beats, barStarts: [0, 2, 4, 6], timeSigs: sig44, duration: 8, keyFifths: 0, ...extra })

export function runScoreTest(): number {
  console.group('[score] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string, got?: unknown) => { c ? pass++ : (fail++, console.error('FAIL:', m, got ?? '')) }

  // ── note values that keep the beats visible (in sixteenths) ──
  check(splitLength(0, 16, 16).join() === '16', 'a whole bar: a whole note')
  check(splitLength(4, 8, 16).join() === '4,4', 'a half note from beat 2: two quarters tied (the middle of the bar shows)')
  check(splitLength(2, 4, 16).join() === '2,2', 'an off-beat quarter: two eighths tied over the beat')
  check(splitLength(0, 6, 16).join() === '6', 'a dotted quarter on the beat')
  check(splitLength(0, 12, 12).join() === '12', 'a whole bar of 3/4: a dotted half')
  check(splitLength(0, 6, 12, true).join() === '6' && splitLength(6, 6, 12, true).join() === '6', '6/8: two dotted quarters')
  check(splitLength(6, 6, 12).join() === '2,4', '3/4: the same length from the middle of beat 2 shows beat 3')

  // ── a simple tune ──
  {
    const s = one([N(60, 0, 0.5), N(62, 0.5, 0.5), N(64, 1, 1), N(48, 0, 1, 'L')])
    check(show(s.bars[0].R) === '60:12 62:12 64:24', 'quarter, quarter, half', show(s.bars[0].R))
    check(show(s.bars[0].L) === '48:24 r:24', 'left hand: a half note, then a half rest', show(s.bars[0].L))
    check(show(s.bars[1].R) === 'r:48', 'an empty bar: a whole-bar rest')
    check(Math.abs(s.bars[0].R[1].time - 0.5) < 1e-9, 'each note knows where it sounds')
    check(!s.swing, 'straight')
  }
  // ── played in by hand: a little early or late still lands on the beat ──
  check(show(one([N(60, 0.02, 0.45), N(62, 0.48, 0.5), N(64, 1.03, 0.95)]).bars[0].R).startsWith('60:12 62:12 64:'), 'loose timing rounded to the beat')
  // ── chords, and a held note cut where the next one starts ──
  check(show(one([N(60, 0, 2), N(64, 0, 2), N(67, 0, 2), N(72, 1, 1)]).bars[0].R) === '60+64+67:24 72:24', 'a chord, then the next note: one voice')
  // ── over the bar line: tied ──
  {
    const s = one([N(60, 1.5, 1)])
    check(show(s.bars[0].R) === 'r:24 r:12 60:12~' && show(s.bars[1].R).startsWith('60:12'), 'from beat 4, tied into the next bar', show(s.bars[0].R) + ' | ' + show(s.bars[1].R))
  }
  // ── eighths only, for a file played in by hand ──
  check(one([N(60, 0, 0.12), N(62, 0.13, 0.12)], { grid: 2 }).bars[0].R.every(e => e.len % 6 === 0), 'nothing shorter than an eighth')
  // ── tempo changes don't matter: it's all in beats ──
  {
    const slow = [0, 1, 2, 3, 4, 4.25, 4.5, 4.75, 5]
    const s = buildScore({ notes: [N(60, 1, 1), N(62, 4.5, 0.25)], beatTimes: slow, barStarts: [0, 4], timeSigs: sig44, duration: 5, keyFifths: 0 })
    check(show(s.bars[0].R) === 'r:12 60:12 r:24' && show(s.bars[1].R) === 'r:24 62:12 r:12', 'the same note values at any tempo', show(s.bars[0].R) + ' | ' + show(s.bars[1].R))
  }

  // ── triplets ──
  {
    const third = 0.5 / 3
    const s = one([N(60, 0, third), N(62, third, third), N(64, 2 * third, third), N(65, 0.5, 0.5), N(67, 1, 1)])
    check(show(s.bars[0].R) === '60:4³ 62:4³ 64:4³ 65:12 67:24', 'three in a beat: a triplet, then straight again', show(s.bars[0].R))
    const t = s.bars[0].R.filter(e => e.triplet !== undefined)
    check(t.length === 3 && new Set(t.map(e => e.triplet)).size === 1, 'one bracket for the three')
    const lq = one([N(60, 0, 2 * third), N(62, 2 * third, third)])
    check(show(lq.bars[0].R).startsWith('60:8³ 62:4³'), 'long-short in three: a quarter and an eighth under one triplet', show(lq.bars[0].R))
  }
  // ── swing: written straight, with the swing mark ──
  {
    const sw: ScoreNote[] = []
    for (let b = 0; b < 12; b++) { sw.push(N(60 + (b % 5), b * 0.5, 0.3)); sw.push(N(62 + (b % 4), b * 0.5 + 0.5 * 2 / 3, 0.15)) }
    check(isSwung(sw, beats), 'off-beats two thirds in: swung')
    const s = one(sw)
    check(s.swing && s.bars[0].R.every(e => e.len === 6 && e.triplet === undefined), 'swung eighths written as straight eighths', show(s.bars[0].R))
    check(!isSwung([N(60, 0, 0.25), N(62, 0.25, 0.25), N(64, 0.5, 0.25)], beats), 'straight eighths are not swing')
  }
  // ── two voices: a note held under moving ones ──
  {
    const s = one([N(48, 0, 2, 'L'), N(55, 0, 0.5, 'L'), N(60, 0.5, 0.5, 'L'), N(64, 1, 0.5, 'L'), N(60, 1.5, 0.5, 'L')])
    check(show(s.bars[0].L2) === '48:48', 'the held bass note: its own voice, a whole note', show(s.bars[0].L2))
    check(show(s.bars[0].L) === '55:12 60:12 64:12 60:12', 'the moving notes above: four quarters', show(s.bars[0].L))
    check(!s.bars[1].L2, 'no second voice where it isn\'t needed')
    check(!one([N(48, 0, 2, 'L'), N(52, 0, 2, 'L')]).bars[0].L2, 'a plain chord stays one voice')
  }
  // ── the pedal ──
  {
    const s = one([N(60, 0, 1)], { pedal: [{ down: 0, up: 1.9 }, { down: 2, up: 3 }] })
    check(s.bars[0].pedal?.length === 2 && s.bars[0].pedal[0].down && !s.bars[0].pedal[1].down, 'down and up in bar 1')
    check(s.bars[1].pedal?.length === 2, 'and again in bar 2')
  }
  // ── chord names above the score, weighted for when there isn't room ──
  {
    const s = one([N(60, 0, 2)], { chords: [{ time: 0, name: 'C' }, { time: 0.9, name: 'C' }, { time: 1.02, name: 'Am' }, { time: 1.27, name: 'D7' }, { time: 1.5, name: 'G' }, { time: 2, name: 'C' }] })
    check(s.bars[0].chords?.map(c => `${c.name}@${c.pos}`).join() === 'C@0,Am@24,D7@30,G@36', 'chord names where they change, a repeat left out', s.bars[0].chords)
    const w = Object.fromEntries((s.bars[0].chords ?? []).map(c => [c.name, c.weight]))
    check(w.C > w.Am && w.Am > w.D7 && w.G > w.D7, 'the bar\'s first chord carries most, a passing one least', w)
    check(s.bars[1].chords?.[0]?.name === 'C', 'the next bar starts with its own chord')
  }
  // ── each part can be switched off ──
  {
    const third = 0.5 / 3
    const trip = [N(60, 0, third), N(62, third, third), N(64, 2 * third, third)]
    check(one(trip, { triplets: false }).bars[0].R.every(e => e.triplet === undefined), 'no triplets when switched off')
    check(!one([N(48, 0, 2, 'L'), N(55, 0, 0.5, 'L'), N(60, 0.5, 0.5, 'L'), N(64, 1, 0.5, 'L')], { voices: false }).bars[0].L2, 'no second voice when switched off')
    const sw: ScoreNote[] = []
    for (let b = 0; b < 12; b++) { sw.push(N(60, b * 0.5, 0.3)); sw.push(N(62, b * 0.5 + 0.5 * 2 / 3, 0.15)) }
    check(!one(sw, { swing: false }).swing, 'swing left as played when switched off')
  }

  // ── the key ──
  check(fifthsOf(7, false) === 1 && fifthsOf(9, true) === 0 && fifthsOf(5, false) === -1 && fifthsOf(2, true) === -1, 'G major one sharp, A minor none, F major and D minor one flat')
  check(keySpecOf(-3) === 'Eb' && keySpecOf(4) === 'E', 'key names for the drawing')
  check(spell(61, 2) === 'c#/4' && spell(61, -3) === 'db/4' && spell(60, 0) === 'c/4' && spell(21, 0) === 'a/0', 'sharps in sharp keys, flats in flat keys')
  // ── on the grid or not ──
  check(onTheGrid([N(60, 0, 1), N(62, 0.125, 1), N(64, 0.5 / 3, 1)], beats) === 1, 'written in a program: sixteenths and triplets all on the grid')
  check(onTheGrid([N(60, 0.04, 1), N(62, 0.21, 1)], beats) < 0.6, 'played in by hand: off the grid')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
