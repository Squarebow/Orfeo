import {
  createNote,
  getAvailableNotes,
  getRandomTrainerNote,
  getStaffStepDiff,
  computeNotePlacement,
  formatTrainerNoteName,
  midiToTrainerNote,
} from './staffTrainerUtils'

export function runStaffTrainerUtilsTest(): number {
  console.group('[staffTrainerUtils] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => {
    if (c) {
      pass++
    } else {
      fail++
      console.error('FAIL:', m)
    }
  }

  // 1. Note creation & MIDI
  const middleC = createNote('C', 4, null, 'treble')
  check(middleC.midi === 60, 'Middle C is MIDI 60')
  const a4 = createNote('A', 4, null, 'treble')
  check(a4.midi === 69, 'A4 is MIDI 69')
  const cSharp = createNote('C', 4, 'sharp', 'treble')
  check(cSharp.midi === 61, 'C#4 is MIDI 61')
  const dFlat = createNote('D', 4, 'flat', 'treble')
  check(dFlat.midi === 61, 'Db4 is MIDI 61')

  // 2. getStaffStepDiff
  // Treble clef bottom line is E4 (step 0 diff). C4 is 2 steps below E4.
  check(getStaffStepDiff(middleC, 'treble') === -2, 'C4 is 2 steps below bottom line E4 on treble')
  // Bass clef bottom line is G2 (step 0 diff). C4 is 10 steps above G2.
  check(getStaffStepDiff(middleC, 'bass') === 10, 'C4 is 10 steps above bottom line G2 on bass')

  // 3. computeNotePlacement
  const c4Treble = computeNotePlacement(middleC, 'treble', 100, 14)
  check(c4Treble.stepDiff === -2, 'C4 stepDiff is -2')
  check(c4Treble.ledgerLines.length === 1, 'C4 has 1 ledger line below treble staff')
  check(c4Treble.ledgerLines[0] === 100 + 14, 'C4 ledger line is at bottomY + lineSpacing')

  const c4Bass = computeNotePlacement(middleC, 'bass', 100, 14)
  check(c4Bass.stepDiff === 10, 'C4 stepDiff on bass is 10')
  check(c4Bass.ledgerLines.length === 1, 'Middle C on Bass has 1 ledger line above staff')

  // 4. midiToTrainerNote
  const midC = midiToTrainerNote(60, 'treble', true)
  check(midC.letter === 'C' && midC.octave === 4 && midC.accidental === null, 'MIDI 60 translates to C4')
  check(formatTrainerNoteName(midC) === 'C4', 'formatTrainerNoteName formats C4 correctly')

  const sharpNote = midiToTrainerNote(61, 'treble', true)
  check(sharpNote.letter === 'C' && sharpNote.accidental === 'sharp', 'MIDI 61 prefers sharp')
  check(formatTrainerNoteName(sharpNote) === 'C♯4', 'formatTrainerNoteName formats C♯4')

  const flatNote = midiToTrainerNote(61, 'treble', false)
  check(flatNote.letter === 'D' && flatNote.accidental === 'flat', 'MIDI 61 prefers flat')
  check(formatTrainerNoteName(flatNote) === 'D♭4', 'formatTrainerNoteName formats D♭4')

  // Grand staff split at C4
  const bassSplit = midiToTrainerNote(59, 'both')
  check(bassSplit.clef === 'bass', 'B3 (59) assigns to bass clef in grand staff')
  const trebleSplit = midiToTrainerNote(60, 'both')
  check(trebleSplit.clef === 'treble', 'C4 (60) assigns to treble clef in grand staff')

  // 5. getAvailableNotes & random selection
  const standardTrebleNotes = getAvailableNotes('treble', 'standard', 'naturals')
  check(standardTrebleNotes.length > 0, 'standard treble range contains notes')
  check(standardTrebleNotes.every(n => n.accidental === null), 'naturals mode has no accidentals')

  const extendedAccidentalNotes = getAvailableNotes('bass', 'extended', 'accidentals')
  check(extendedAccidentalNotes.some(n => n.accidental !== null), 'accidentals mode includes sharps and flats')

  const randomNote = getRandomTrainerNote('treble', 'standard', 'naturals')
  check(randomNote.clef === 'treble', 'getRandomTrainerNote produces requested clef')

  console.log(`  staffTrainerUtils: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
