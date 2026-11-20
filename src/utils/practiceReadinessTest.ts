import type { ParsedNote } from '../types'
import { countPracticePianos, trackPracticeState, rescoreForCheck, freshConfidences } from './practiceReadiness'
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

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
