import type { ParsedNote } from '../types'
import { handsCrossedShare, countPracticePianos, trackPracticeState, rescoreForCheck, freshConfidences, songPracticeState, trackHand } from './practiceReadiness'
import { RESTORED_CONFIDENCE } from './handMetadata'
import { assignHands } from './handAssignment'

// A clear two-hand texture: a low bass note and a high tune note on every beat
const twoHands = (bassHand: 'L' | 'R', confidence: number, source?: 'manual'): ParsedNote[] => {
  const out: ParsedNote[] = []
  for (let i = 0; i < 16; i++) {
    out.push({ midi: 36 + (i % 3), time: i * 0.5, duration: 0.45, velocity: 0.7, trackIndex: 0, hand: bassHand, handConfidence: confidence, ...(source ? { handSource: source } : {}) } as ParsedNote)
    out.push({ midi: 79 + (i % 4), time: i * 0.5, duration: 0.45, velocity: 0.7, trackIndex: 0, hand: 'R', handConfidence: confidence } as ParsedNote)
  }
  return out
}
const note = (time: number, hand: 'L' | 'R', handConfidence: number, handSource?: 'manual'): ParsedNote =>
  ({ midi: 60, time, duration: 0.3, velocity: 0.7, trackIndex: 0, hand, handConfidence, ...(handSource ? { handSource } : {}) } as ParsedNote)

export function runPracticeReadinessTest(): number {
  console.group('[practiceReadiness] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── Which tracks count ──
  check(countPracticePianos([
    { group: 'piano', included: true }, { group: 'organ', included: true },
    { group: 'piano', included: false }, { group: 'piano', isDrum: true, included: true }, { group: 'bass', included: true },
  ]) === 1, 'only playing piano-family tracks count; organ, excluded, drums and bass do not')
  check(countPracticePianos([{ group: 'piano', included: true }, { group: 'piano', included: true }, { group: 'piano', included: true }]) === 3, 'three pianos counted')

  // ── A track read this session ──
  check(trackPracticeState([note(0, 'R', 0.9), note(1, 'L', 0.95)]).state === 'ready', 'sure everywhere: ready')
  const unsure = trackPracticeState([note(0, 'R', 0.9), note(2, 'L', 0.2), note(2.4, 'R', 0.3), note(10, 'L', 0.1)])
  check(unsure.state === 'almost' && unsure.passages === 2, `two unsure passages: almost, got ${unsure.state} ${unsure.passages}`)
  check(trackPracticeState([note(0, 'R', 0.9), note(2, 'L', 0.2, 'manual'), note(3, 'R', 0.95)]).state === 'ready', 'an unsure note you fixed or confirmed counts as sure')
  check(trackPracticeState([note(0, 'R', 0.2), note(5, 'L', 0.1)], { fromScore: true }).state === 'ready', "a score's two staves: ready")
  check(trackPracticeState([note(0, 'L', 0.2), note(5, 'L', 0.1)], { oneHand: true }).state === 'ready', 'one hand of a split piano: ready')
  check(trackPracticeState([]).state === 'ready', 'an empty track blocks nothing')
  check(trackPracticeState([{ ...note(0, 'R', 0.9), hand: undefined } as unknown as ParsedNote, note(1, 'L', 0.9)]).state === 'almost', 'a note with no hand is worth a look')

  // ── A saved song: hands kept, how sure worked out again ──
  const fresh = assignHands(twoHands('L', 1).map(n => ({ midi: n.midi, time: n.time, duration: n.duration }))).assignments
  const engineSure = fresh.every(a => a.confidence >= 0.5)
  check(engineSure, 'the clear test texture reads as sure (test set-up)')
  const savedRight = twoHands('L', RESTORED_CONFIDENCE)
  check(trackPracticeState(savedRight).state === 'ready', 'saved hands that match what Orfeo reads: ready')
  const savedWrong = twoHands('R', RESTORED_CONFIDENCE)
  const wrongState = trackPracticeState(savedWrong)
  check(wrongState.state === 'almost', `saved bass in the right hand, never checked: worth a look, got ${wrongState.state}`)
  const savedWrongButYours = twoHands('R', RESTORED_CONFIDENCE, 'manual')
  check(trackPracticeState(savedWrongButYours).state === 'ready', "the same, but it's your own correction: ready")

  // rescoring gives the passage check something to find, and never changes a hand
  const handsBefore = savedWrong.map(n => n.hand).join('')
  rescoreForCheck(savedWrong)
  check(savedWrong.map(n => n.hand).join('') === handsBefore, 'rescoring never changes a hand')
  check(savedWrong.some(n => n.handConfidence !== RESTORED_CONFIDENCE && n.handConfidence! < 0.5), 'after rescoring, the doubtful notes are marked unsure')
  check(freshConfidences(savedWrong) === freshConfidences(savedWrong), 'worked out once per track, then remembered')
  const mine = twoHands('R', RESTORED_CONFIDENCE, 'manual')
  rescoreForCheck(mine)
  check(mine.filter(n => n.handSource === 'manual').every(n => n.handConfidence === RESTORED_CONFIDENCE), 'your own notes are left alone')

  // ── The song rule: two piano tracks, one per hand ──
  const hands = (h: 'L' | 'R') => [note(0, h, 0.95), note(1, h, 0.95)]
  // a real piano part: the notes given, then sure notes of the same hand later on,
  // so every track is long enough to count (MIN_PRACTICE_NOTES)
  const pad = (ns: ParsedNote[]) => [...ns, ...Array.from({ length: 60 }, (_, i) => ({ ...ns[0], time: 100 + i, handConfidence: 0.95 }))]
  const T = (index: number, group: string, notes: ParsedNote[], name = '') => ({ index, group, name, notes: pad(notes) })
  check(songPracticeState([T(0, 'piano', hands('L'), 'Piano LH'), T(1, 'piano', hands('R'), 'Piano RH'), T(2, 'bass', hands('L'))]).state === 'ready', 'Piano LH + Piano RH: ready')
  const rd = songPracticeState([T(3, 'piano', hands('R')), T(5, 'piano', hands('L'))])
  check(rd.state === 'ready' && (rd as any).left === 5 && (rd as any).right === 3, 'two tracks, each one hand throughout: ready, hands found')
  check(songPracticeState([T(0, 'piano', [note(0, 'R', 0.9), note(1, 'L', 0.9)])]).state === 'prepare', 'one piano track with both hands: prepare (check, then split)')
  // a lesson is exactly two piano tracks (24. 11.): named hands beside two more pianos aren't ready
  const four = songPracticeState([T(0, 'piano', hands('L'), 'Piano LH'), T(1, 'piano', hands('R'), 'Piano RH'), T(2, 'piano', hands('R')), T(3, 'piano', hands('L'))])
  check(four.state === 'cant' && (four as any).reason === 'too-many', 'four piano tracks, two of them the hands: not ready (Lesson check)')
  // harpsichord and clavinet aren't piano lessons
  check(songPracticeState([{ ...T(0, 'piano', hands('L'), 'Harpsichord'), program: 6 }, { ...T(1, 'piano', hands('R'), 'Harpsichord'), program: 6 }]).state === 'cant', 'a harpsichord in two staves: no piano to practise')
  const prep = songPracticeState([T(0, 'piano', [note(0, 'R', 0.9), note(2, 'L', 0.2), note(3, 'R', 0.95)])])
  check(prep.state === 'prepare' && (prep as any).passages === 1, 'one piano track: its unsure passages counted')
  // one hand throughout: preparation, unless a person set every note's hand
  check(songPracticeState([T(0, 'piano', hands('R'))]).state === 'prepare', 'a piano track all in one hand: prepare, not ready')
  const mine1 = T(0, 'piano', hands('R')); mine1.notes.forEach(n => { n.handSource = 'manual' })
  const one = songPracticeState([mine1])
  check(one.state === 'one-hand' && (one as any).hand === 'R', 'one hand throughout, every hand set by you: ready for that hand')
  // two hand tracks must play like hands: the left one not above the right one
  const at = (time: number, midi: number, h: 'L' | 'R') => ({ ...note(time, h, 0.95), midi })
  const lowL = Array.from({ length: 60 }, (_, i) => at(i, 40 + (i % 5), 'L')), highR = Array.from({ length: 60 }, (_, i) => at(i, 72 + (i % 5), 'R'))
  check(handsCrossedShare(lowL, highR) === 0, 'left low, right high: never crossed')
  const swapped = Array.from({ length: 60 }, (_, i) => at(i, 84 + (i % 5), 'L'))
  check(handsCrossedShare(swapped, highR) === 1, 'left above right throughout: crossed every time')
  const tr = (index: number, notes: ParsedNote[], name: string) => ({ index, group: 'piano', name, notes })
  check(songPracticeState([tr(0, lowL, 'Piano LH'), tr(1, highR, 'Piano RH')]).state === 'ready', 'two hand tracks that play like hands: ready')
  check(songPracticeState([tr(0, swapped, 'Piano LH'), tr(1, highR, 'Piano RH')]).state === 'prepare', 'a "left hand" track above the right hand: prepare (two separate parts, not hands)')
  const both = [note(0, 'R', 0.9), note(1, 'L', 0.9)]
  const two = songPracticeState([T(0, 'piano', both), T(1, 'piano', [...both])])
  check(two.state === 'prepare' && (two as any).tracks.length === 2, 'two pianos that are not the hands: prepared together as one piano')
  check(songPracticeState([T(0, 'piano', both), T(1, 'piano', both)], { stavePairs: [[1, 0]] }).state === 'ready', "a score's two staves: ready")
  check((songPracticeState([T(0, 'piano', both), T(1, 'piano', both), T(2, 'piano', both)]) as any).reason === 'too-many', 'three pianos: too many')
  check((songPracticeState([T(0, 'organ', both)]) as any).reason === 'no-piano', 'an organ is not the piano part')
  // a few notes of piano: with a band, a touch of colour; on its own, a piece to play
  check((songPracticeState([{ index: 0, group: 'piano', notes: hands('R') }, T(1, 'bass', hands('L'))]) as any).reason === 'no-piano', 'a piano of a few notes in a band is part of the band, not a part to practise')
  check(songPracticeState([{ index: 0, group: 'piano', notes: hands('R') }, { index: 1, group: 'piano', notes: hands('L') }]).state === 'ready', 'a short piano piece on its own counts, however short')
  // one hand throughout, but Orfeo reads both hands in it: prepare, don't call it a one-hand tune
  const allLeft = [...Array.from({ length: 30 }, (_, i) => ({ ...note(i, 'L', RESTORED_CONFIDENCE), midi: 40 + (i % 8) })),
    ...Array.from({ length: 30 }, (_, i) => ({ ...note(i + 0.01, 'L', RESTORED_CONFIDENCE), midi: 76 + (i % 8) }))]
  check(songPracticeState([{ index: 0, group: 'piano', notes: allLeft }]).state === 'prepare', 'a two-handed piano saved all left hand: prepare, not ready')
  check(trackHand({ name: 'Left Hand', notes: [] }) === 'L' && trackHand({ trackName: 'Grand RH', notes: [] }) === 'R', 'hands read from the names Orfeo writes')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
