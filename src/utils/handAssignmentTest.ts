import { assignHands, assignHandsByTrack, findStavePairs, type HandInput, type HandTrack } from './handAssignment'

// ── runHandAssignmentTest ─────────────────────────────────────────────────────
// Synthetic checks for the hand engine. Accuracy on real scores is measured by
// the local hand audit (scripts/hand-audit/), not here.
// Returns the number of failed checks (npm test). Also exposed as
// window.__orfeoHandAssignmentTest in development mode.
let failures = 0
function check(ok: boolean, message: string): void {
  if (!ok) { failures++; console.error(`[HandAssignment] FAIL: ${message}`) }
}

export function runHandAssignmentTest(): number {
  failures = 0
  testFastPathOnCleanSplit()
  testWideChordSplitsAcrossHands()
  testMelodicPassageDoesNotFlipFlop()
  testMaxFingersCapEvenSplitBeyondCapacity()
  testFirstNoteAnchorsToCorrectRegister()
  testLeftHandChordStaysTogether()
  testStrideLeftHand()
  testSingleLineStaysInOneHand()
  testTwoHandsAreNotASingleLine()
  testStavesOnOneChannel()
  testStavesTrustedWhenOneIsAlmostEmpty()
  testChordSymbolTrackIsItsOwnInstrument()
  testTwoInstrumentsAreNotStaves()
  testHandNamedStaves()
  testSameRegisterPartsOnOneChannel()
  testThreeTracksOnOneChannelAreNotGuessedIntoStaves()
  testKeptNotesAreLeftAlone()
  return failures
}

const n = (midi: number, time: number, duration = 0.4): HandInput => ({ midi, time, duration })
const track = (name: string, channel: number, notes: HandInput[], group = 'piano'): HandTrack<HandInput> => ({ name, channel, group, notes })
const handOf = (assignments: { note: HandInput; hand: string }[]) => new Map(assignments.map(a => [a.note, a.hand]))

// ── A stream that is visibly two tracks of one instrument → fast path ───────
function testFastPathOnCleanSplit(): void {
  const rh: HandInput[] = [72, 74, 76, 77].map((midi, i) => ({ midi, time: i * 0.5, trackIndex: 0, channel: 0 }))
  const lh: HandInput[] = [48, 50, 52, 53].map((midi, i) => ({ midi, time: i * 0.5, trackIndex: 1, channel: 0 }))
  const { assignments, usedFastPath } = assignHands([...rh, ...lh])
  check(usedFastPath, 'expected fast path for clean 2-track split')
  check(assignments.every(a => (a.note.trackIndex === 0 ? a.hand === 'R' : a.hand === 'L')), 'fast path mislabeled a track')
  check(assignments.every(a => a.confidence === 1), 'fast path should report full confidence')
}

// ── A single 7-note, ~4-octave chord must split across both hands ───────────
function testWideChordSplitsAcrossHands(): void {
  const chord: HandInput[] = [36, 55, 60, 62, 67, 84, 86].map(midi => ({ midi, time: 10.0 }))
  const { assignments, usedFastPath } = assignHands(chord)
  check(!usedFastPath, 'single wide chord should not hit the fast path')
  check(new Set(assignments.map(a => a.hand)).size === 2, 'wide chord must be split across both hands')
  const hands = handOf(assignments)
  // no single split can be comfortable here; the lowest note is the left
  // hand's and the highest the right's whichever way the middle goes
  check(hands.get(chord[0]) === 'L' && hands.get(chord[6]) === 'R', 'wide chord: outer notes on the wrong hands')
}

// ── A mid-register line after a two-hand chord stays in one hand ────────────
function testMelodicPassageDoesNotFlipFlop(): void {
  const anchorChord: HandInput[] = [{ midi: 48, time: 0 }, { midi: 84, time: 0 }]
  const melody: HandInput[] = [65, 67, 69, 67, 65].map((midi, i) => ({ midi, time: 1 + i * 0.5 }))
  const hands = handOf(assignHands([...anchorChord, ...melody]).assignments)
  const line = melody.map(x => hands.get(x))
  check(line.every(h => h === line[0]), `melodic line flip-flopped hands: ${line.join(',')}`)
}

// ── Finger caps: past both hands' capacity, the most even split ─────────────
function testMaxFingersCapEvenSplitBeyondCapacity(): void {
  const chord: HandInput[] = [36, 38, 40, 41, 43, 45, 47, 48, 50, 52].map(midi => ({ midi, time: 5.0 }))
  const { assignments } = assignHands(chord, { rhMaxFingers: 4, lhMaxFingers: 4 })
  const l = assignments.filter(a => a.hand === 'L').length
  check(l === 5, `expected an even 5/5 split beyond combined capacity, got L=${l} R=${10 - l}`)

  const chord9: HandInput[] = [36, 38, 40, 41, 43, 45, 47, 48, 50].map(midi => ({ midi, time: 6.0 }))
  const a9 = assignHands(chord9, { rhMaxFingers: 5, lhMaxFingers: 4 }).assignments
  const l9 = a9.filter(a => a.hand === 'L').length
  check(l9 === 4, `expected 4 left / 5 right at exact capacity, got L=${l9} R=${9 - l9}`)
}

// ── Register decides a hand playing alone ───────────────────────────────────
function testFirstNoteAnchorsToCorrectRegister(): void {
  const low = { midi: 36, time: 0 }, high = { midi: 84, time: 5 }
  const hands = handOf(assignHands([low, high]).assignments)
  check(hands.get(low) === 'L', `opening low note should be left hand, got ${hands.get(low)}`)
  check(hands.get(high) === 'R', `later high note should be right hand, got ${hands.get(high)}`)
}

// ── A close left-hand chord struck with a right-hand melody note above it
// stays together in the left hand (chord-gap rule): neighbours a 4th apart
// share a hand, the 6th up to the melody is where the hands divide. ───────
function testLeftHandChordStaysTogether(): void {
  const notes: HandInput[] = []
  const lhChord = [55, 59, 62, 67]
  const melody = [79, 77, 79, 81, 79, 77, 76, 77]
  for (let beat = 0; beat < 8; beat++) {
    for (const p of lhChord) notes.push(n(p, beat, 0.9))
    notes.push(n(melody[beat], beat, 0.9))
  }
  const hands = handOf(assignHands(notes).assignments)
  check(notes.filter(x => lhChord.includes(x.midi)).every(x => hands.get(x) === 'L'), 'left-hand chord was split between the hands')
  check(notes.filter(x => melody.includes(x.midi)).every(x => hands.get(x) === 'R'), 'melody left the right hand')
}

// ── Oom-pah / stride left hand: a low bass note on the beat, a chord up to
// D4 between the beats, the melody above held across the chord. The whole
// chord is the left hand's; the melody stays in the right. ─────────────────
function testStrideLeftHand(): void {
  const notes: HandInput[] = []
  const lhChord = [50, 54, 57, 62]
  // melody an octave or more above the chord top; with the melody only a 5th
  // above, the chord's top note can still go to the right hand (known limit)
  const melody = [76, 74, 76, 77, 79, 77, 76, 74]
  for (let bar = 0; bar < 8; bar++) {
    notes.push(n(38, bar, 0.5))
    for (const p of lhChord) notes.push(n(p, bar + 0.5, 0.5))
    notes.push(n(melody[bar], bar, 0.75))
  }
  const hands = handOf(assignHands(notes).assignments)
  const wrong = notes.filter(x => hands.get(x) !== (melody.includes(x.midi) && x.midi > 62 ? 'R' : 'L'))
  check(wrong.length === 0, `stride left hand: ${wrong.length} notes on the wrong hand (${wrong.map(x => `${x.midi}@${x.time}`).slice(0, 6).join(' ')})`)
}

// ── A sung melody played with a piano sound: one hand, never split ──────────
function testSingleLineStaysInOneHand(): void {
  const pitches = [62, 64, 66, 67, 69, 71, 74, 76, 74, 71, 69, 67, 57, 59, 62, 64]
  const line = pitches.map((p, i) => n(p, i * 0.5, 0.45))
  const { assignments } = assignHands(line)
  check(assignments.every(a => a.hand === 'R' && a.confidence === 1), `single line was split: ${assignments.map(a => a.hand).join('')}`)

  const bass = [40, 43, 45, 47, 40, 43, 45, 47, 38, 41, 43, 45].map((p, i) => n(p, i * 0.5, 0.45))
  check(assignHands(bass).assignments.every(a => a.hand === 'L'), 'low single line should be left hand')
}

// ── Two voices that sound together (an invention) are two hands, not a line ─
function testTwoHandsAreNotASingleLine(): void {
  const notes: HandInput[] = []
  for (let i = 0; i < 16; i++) { notes.push(n(72 + (i % 5), i * 0.5, 0.5)); notes.push(n(48 + (i % 4), i * 0.5, 0.5)) }
  const hands = handOf(assignHands(notes).assignments)
  check(notes.every(x => hands.get(x) === (x.midi >= 60 ? 'R' : 'L')), 'two sounding voices were treated as one hand')
}

// ── Notation export: two tracks named "Piano" on one channel = staves ───────
function testStavesOnOneChannel(): void {
  // the lower staff climbs above the upper staff's lowest note — staves still win
  const upper = [60, 64, 67, 72, 59].map((p, i) => n(p, i))
  const lower = [36, 43, 48, 62, 40].map((p, i) => n(p, i))
  const tracks = [track('Piano', 0, upper), track('Piano', 0, lower)]
  check(JSON.stringify(findStavePairs(tracks)) === JSON.stringify([{ upper: 0, lower: 1 }]), 'two Piano tracks on one channel are one piano')
  const hands = handOf(assignHandsByTrack(tracks))
  check(upper.every(x => hands.get(x) === 'R') && lower.every(x => hands.get(x) === 'L'), 'staves were second-guessed')
}

// ── The right hand plays alone for a long time, the left hand barely at all —
// the staves are still the answer (the old engine overruled them and called
// the whole piece left hand). ────────────────────────────────────────────────
function testStavesTrustedWhenOneIsAlmostEmpty(): void {
  const upper = Array.from({ length: 60 }, (_, i) => n(55 + (i % 20), i * 0.25))
  const lower = [n(31, 12), n(43, 12.5), n(36, 13)]
  const hands = handOf(assignHandsByTrack([track('Piano', 0, upper), track('Piano', 0, lower)]))
  check(upper.every(x => hands.get(x) === 'R'), 'upper staff must stay right hand')
  check(lower.every(x => hands.get(x) === 'L'), 'lower staff must stay left hand')
}

// ── MuseScore's chord-symbol track (unnamed, another channel) is not part of
// the piano: the staves stay exact and the chord track gets its own hands. ──
function testChordSymbolTrackIsItsOwnInstrument(): void {
  const upper = [72, 74, 76, 77, 79].map((p, i) => n(p, i))
  const lower = [48, 50, 52, 53, 55].map((p, i) => n(p, i))
  const chords = [0, 1, 2, 3, 4].flatMap(i => [43, 50, 55, 59, 62].map(p => n(p, i, 1)))
  const tracks = [track('Piano', 0, upper), track('', 1, chords), track('Piano', 0, lower)]
  const pairs = findStavePairs(tracks)
  check(pairs.length === 1 && pairs[0].upper === 0 && pairs[0].lower === 2, 'chord-symbol track was paired with a staff')
  const hands = handOf(assignHandsByTrack(tracks))
  check(upper.every(x => hands.get(x) === 'R') && lower.every(x => hands.get(x) === 'L'), 'chord-symbol track disturbed the staves')
  check(chords.every(x => hands.has(x)), 'chord-symbol track got no hands')
}

// ── Piano + organ (different channels, different names) are two instruments ─
function testTwoInstrumentsAreNotStaves(): void {
  const piano = [72, 48, 74, 50, 76, 52].map((p, i) => n(p, i))
  const organ = [60, 64, 67, 62, 65, 69].map((p, i) => n(p, i, 1))
  check(findStavePairs([track('Piano', 1, piano), track('Organ 1', 3, organ)]).length === 0, 'piano and organ were read as one instrument')
  check(findStavePairs([track('Organ 1', 1, piano, 'organ'), track('Organ 2', 3, organ, 'organ')]).length === 0, 'Organ 1 and Organ 2 on different channels were read as staves')
}

// ── Right/left names pair across channels; the names decide which is which ──
function testHandNamedStaves(): void {
  const r = [60, 62, 64].map((p, i) => n(p, i))
  const l = [62, 64, 66].map((p, i) => n(p, i)) // left hand written higher on average
  const tracks = [track('Left Hand', 2, l), track('Right Hand', 5, r)]
  check(JSON.stringify(findStavePairs(tracks)) === JSON.stringify([{ upper: 1, lower: 0 }]), 'hand names should decide the staves')
  check(findStavePairs([track('Piano\u0000 RH', 0, r), track('Piano\u0000 LH', 1, l)]).length === 1, 'names padded with control characters should still pair')
}

// ── Two parts on one channel in the same register (two pianos, two choir
// lines) are not one piano's staves ─────────────────────────────────────────
function testSameRegisterPartsOnOneChannel(): void {
  const a = [64, 67, 69, 71, 72].map((p, i) => n(p, i))
  const b = [62, 65, 67, 69, 70].map((p, i) => n(p, i + 0.5))
  check(findStavePairs([track('PianoGrd', 4, a), track('', 4, b)]).length === 0, 'two same-register parts on one channel were paired')
  check(findStavePairs([track('Chorale (2)', 5, a), track('Chorale (3)', 5, b)]).length === 0, 'two choir lines were paired as staves')
}

// ── Three keyboard tracks on one channel: not guessed into staves ───────────
function testThreeTracksOnOneChannelAreNotGuessedIntoStaves(): void {
  const a = [72].map(p => n(p, 0)), b = [60].map(p => n(p, 0)), c = [48].map(p => n(p, 0))
  check(findStavePairs([track('', 0, a), track('', 0, b), track('', 0, c)]).length === 0, 'three tracks on one channel were paired')
}

// ── Notes whose hand is already settled are left out of the result ─────────
function testKeptNotesAreLeftAlone(): void {
  const notes = [n(72, 0), n(48, 0), n(74, 1), n(50, 1)]
  const kept = notes[1]
  const out = assignHandsByTrack([track('Piano', 0, notes)], {}, x => x === kept)
  check(!out.some(a => a.note === kept), 'a kept note was reassigned')
  check(out.length === 3, `expected 3 assigned notes, got ${out.length}`)
}
