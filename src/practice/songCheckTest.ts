import { fileFaults, tracksFaults, handsPlayable, findCopies, findTunes, checkSong, sharedShare, type CheckNote, type CheckTrack } from './songCheck'
import { songPracticeState } from '../utils/practiceReadiness'
import type { ParsedNote } from '../types'

export function runSongCheckTest(): number {
  console.group('[songCheck] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a left hand on C3 chords, a right hand tune, one bar a second
  const lh = (): CheckNote[] => Array.from({ length: 32 }, (_, i) => [48, 52, 55].map(m => ({ midi: m, time: i * 0.5, duration: 0.45, hand: 'L' as const }))).flat()
  const rh = (): CheckNote[] => Array.from({ length: 32 }, (_, i) => ({ midi: 72 + (i % 5), time: i * 0.5, duration: 0.45, hand: 'R' as const }))
  const tr = (index: number, notes: CheckNote[], group = 'piano', name = `T${index}`): CheckTrack => ({ index, name, group, isDrum: false, notes })
  const read = (ns: CheckNote[]) => ns.map(n => ({ ...n, hand: (n.midi < 60 ? 'L' : 'R') as 'L' | 'R' }))

  // ── The notes themselves ──
  {
    const f = fileFaults([...rh(), ...rh()])
    check(f.stacked === 32 && f.tooFast === 0, `every note struck twice at once ${f.stacked}`)
    const fast = Array.from({ length: 20 }, (_, i) => ({ midi: 60, time: i * 0.04, duration: 0.03 }))
    check(fileFaults(fast).tooFast === 19, 'a key re-struck every 40 ms is too fast for a hand')
    check(fileFaults([{ midi: 110, time: 0, duration: 1 }, { midi: 20, time: 1, duration: 1 }]).outOfRange === 2, 'keys outside the 88')
    check(tracksFaults([{ notes: rh() }, { notes: rh() }]).stacked === 0, 'the same key on two tracks is a copy or a unison, not a doubled note')
  }

  // ── Hands that can play it ──
  {
    check(handsPlayable([...lh(), ...rh()]).bad === 0, 'ordinary hands play everything')
    const six = [60, 62, 64, 65, 67, 69].map(m => ({ midi: m, time: 0, duration: 1, hand: 'R' as const }))
    check(handsPlayable(six).tooMany === 1, 'six keys at once in one hand')
    check(handsPlayable([{ midi: 48, time: 0, duration: 1, hand: 'L' }, { midi: 67, time: 0, duration: 1, hand: 'L' }]).tooWide === 1, 'a twelfth in one hand')
    check(handsPlayable([{ midi: 48, time: 0, duration: 1, hand: 'L' }, { midi: 64, time: 0, duration: 1, hand: 'L' }]).tooWide === 0, 'a tenth is fine')
    check(handsPlayable([{ midi: 40, time: 0, duration: 0.05, hand: 'L' }, { midi: 64, time: 0.05, duration: 0.2, hand: 'L' }]).tooFar === 1, 'two octaves in 50 ms')
    check(handsPlayable([{ midi: 40, time: 0, duration: 0.2, hand: 'L' }, { midi: 64, time: 0.25, duration: 0.2, hand: 'L' }]).tooFar === 0, 'two octaves in a quarter of a second: a stride leap')
  }

  // ── Copies and tunes ──
  {
    check(sharedShare(rh(), rh()) === 1 && sharedShare(lh(), rh()) === 0, 'shared notes')
    const s = findCopies([tr(0, [...lh(), ...rh()]), tr(1, rh())])
    check(s.length === 1 && s[0].kind === 'leave-out' && s[0].track === 1 && (s[0] as any).of === 0, 'a piano copying the other piano is left out')
    check(findCopies([tr(0, rh()), tr(1, rh(), 'strings')]).length === 0, 'the only piano doubling the strings stays')
    check(findCopies([tr(0, rh(), 'piano'), tr(1, rh(), 'piano')]).length === 1, 'of two identical pianos one goes')
    const tune = rh().map(n => ({ ...n, midi: n.midi - 12 }))
    const t = findTunes([tr(0, [...lh(), ...rh()]), tr(1, tune), tr(2, rh(), 'voice')], new Set())
    check(t.length === 1 && t[0].kind === 'leave-out' && t[0].track === 1, 'a piano doubling the voice an octave down is left out')
    check(findTunes([tr(1, tune), tr(2, rh(), 'voice')], new Set()).length === 0, 'unless it is the only piano')
  }

  // ── The whole check ──
  {
    const c = checkSong([tr(0, lh()), tr(1, rh()), tr(2, rh()), tr(3, [{ midi: 60, time: 0, duration: 16 }, ...Array.from({ length: 10 }, (_, i) => ({ midi: 84, time: i, duration: 0.5 }))])], { read })
    check(c.suggestions.some(s => s.kind === 'leave-out' && s.track === 2 && s.why === 'copy'), 'the copy is suggested out')
    check(c.suggestions.some(s => s.kind === 'merge' && s.tracks.join() === '0,1,3'), `three parts of one piano merged ${JSON.stringify(c.suggestions)}`)
    // more than two hands can play: the smallest part goes
    const cluster = (t0: number) => [60, 62, 64, 65, 67, 69, 71].map(m => ({ midi: m, time: t0, duration: 0.4 }))
    const extra = Array.from({ length: 32 }, (_, i) => cluster(i * 0.5)).flat().map(n => ({ ...n, midi: n.midi + 12 }))
    const c2 = checkSong([tr(0, lh()), tr(1, rh()), tr(2, extra.slice(0, 70))], { read })
    check(c2.suggestions.some(s => s.kind === 'leave-out' && s.why === 'too-much' && s.track === 2), `too much for two hands: the smallest part out ${JSON.stringify(c2.suggestions)}`)
    // the file's own hands that no hand could play
    const badR = Array.from({ length: 32 }, (_, i) => [72, 91].map(m => ({ midi: m, time: i * 0.5, duration: 0.4 }))).flat()
    const c3 = checkSong([tr(0, lh()), tr(1, badR)], { read, hands: new Map([[0, 'L'], [1, 'R']]) })
    check(c3.problems.some(p => p.kind === 'unplayable'), 'right hand stretching more than an octave and a half all through')
    const c4 = checkSong([tr(0, [...rh(), ...rh()])], { read })
    check(c4.problems.some(p => p.kind === 'stacked'), 'doubled notes reported')
  }

  // ── Names that say another instrument; the file's own hands ──
  {
    const bassLine = Array.from({ length: 60 }, (_, i) => ({ midi: 36 + (i % 5), time: i * 0.5, duration: 0.4 }))
    const c = checkSong([tr(0, [...lh(), ...rh()]), tr(1, bassLine, 'piano', 'Bass')], { read })
    check(c.suggestions.some(s => s.kind === 'instrument' && s.track === 1 && s.program === 33), 'a single line named "Bass" on a piano sound gets a bass')
    const c2 = checkSong([tr(0, rh(), 'piano', 'Treble'), tr(1, lh(), 'piano', 'Bass')], { read })
    check(!c2.suggestions.some(s => s.kind === 'instrument'), 'a staff of chords named "Bass" stays the piano')
    check(!checkSong([tr(0, rh(), 'piano', 'Piano RH'), tr(1, lh(), 'piano', 'Piano LH')], { read }).suggestions.length, 'hand tracks keep their piano')
    const c3 = checkSong([tr(0, lh(), 'piano', 'Piano LH'), tr(1, rh(), 'piano', 'Piano RH'), tr(2, rh(), 'piano', 'E.Piano')], { read, own: { left: 0, right: 1 } })
    check(c3.suggestions.length === 0 && c3.pianos.join() === '0,1', 'the file\'s own two hands are the lesson; another keyboard plays in the band')
  }

  // ── Readiness follows ──
  {
    const pn = (ns: CheckNote[], hand: 'L' | 'R') => ns.map(n => ({ ...n, velocity: 0.7, trackIndex: 0, hand, handConfidence: 1 } as unknown as ParsedNote))
    const badR = Array.from({ length: 32 }, (_, i) => [72, 91].map(m => ({ midi: m, time: i * 0.5, duration: 0.4 }))).flat()
    const two = (r: CheckNote[]) => [
      { index: 0, group: 'piano', isDrum: false, name: 'Piano LH', notes: pn(lh(), 'L') },
      { index: 1, group: 'piano', isDrum: false, name: 'Piano RH', notes: pn(r, 'R') },
    ]
    check(songPracticeState(two(rh())).state === 'ready', 'two hand tracks that play like hands: ready')
    check(songPracticeState(two(badR)).state === 'prepare', 'two hand tracks no hand could play: prepare, not ready')
    const doubled = [{ index: 0, group: 'piano', isDrum: false, name: 'Piano', notes: pn([...lh(), ...lh(), ...rh(), ...rh()], 'R') }]
    const st = songPracticeState(doubled)
    check(st.state === 'cant' && st.reason === 'messy', 'every note doubled: no lesson')
  }

  console.log(`  songCheck: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
