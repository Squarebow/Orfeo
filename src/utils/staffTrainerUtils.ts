// ── Musical Staff Trainer Utilities ──────────────────────────────────────────
// Pure functions for note generation, diatonic step mapping, ledger line
// calculation, and SMuFL glyph paths.

export type Clef = 'treble' | 'bass'
export type ClefSelection = 'treble' | 'bass' | 'both'
export type TrainerRange = 'staff' | 'standard' | 'extended'
export type AccidentalMode = 'naturals' | 'accidentals'

export interface TrainerNote {
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
  octave: number
  accidental: 'sharp' | 'flat' | null
  midi: number
  diatonicIndex: number // octave * 7 + base
  clef: Clef
}

export const DIATONIC_BASE: Record<string, number> = {
  C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6,
}

export const SEMITONE_BASE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

export function createNote(
  letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B',
  octave: number,
  accidental: 'sharp' | 'flat' | null = null,
  clef: Clef = 'treble',
): TrainerNote {
  let midi = (octave + 1) * 12 + SEMITONE_BASE[letter]
  if (accidental === 'sharp') midi += 1
  if (accidental === 'flat') midi -= 1
  const diatonicIndex = octave * 7 + DIATONIC_BASE[letter]
  return {
    letter,
    octave,
    accidental,
    midi,
    diatonicIndex,
    clef,
  }
}

// ── Note pools for clefs & ranges ─────────────────────────────────────────────
const TREBLE_NATURALS_STAFF: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['E', 4], ['F', 4], ['G', 4], ['A', 4], ['B', 4],
  ['C', 5], ['D', 5], ['E', 5], ['F', 5],
]

const TREBLE_NATURALS_STANDARD: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['C', 4], ['D', 4], // below staff (C4 = Middle C)
  ...TREBLE_NATURALS_STAFF,
  ['G', 5], ['A', 5], // above staff (A5 = 1 ledger line)
]

const TREBLE_NATURALS_EXTENDED: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['A', 3], ['B', 3], // 2 ledger lines below
  ...TREBLE_NATURALS_STANDARD,
  ['B', 5], ['C', 6], // 2 ledger lines above
]

const BASS_NATURALS_STAFF: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['G', 2], ['A', 2], ['B', 2],
  ['C', 3], ['D', 3], ['E', 3], ['F', 3], ['G', 3], ['A', 3],
]

const BASS_NATURALS_STANDARD: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['E', 2], ['F', 2], // below staff (E2 = 1 ledger line)
  ...BASS_NATURALS_STAFF,
  ['B', 3], ['C', 4], // above staff (C4 = Middle C)
]

const BASS_NATURALS_EXTENDED: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][] = [
  ['C', 2], ['D', 2], // 2 ledger lines below
  ...BASS_NATURALS_STANDARD,
  ['D', 4], ['E', 4], // 2 ledger lines above
]

// Natural notes that take sharps or flats
const SHARPABLE_LETTERS = ['C', 'D', 'F', 'G', 'A'] as const
const FLATABLE_LETTERS  = ['D', 'E', 'G', 'A', 'B'] as const

export function getAvailableNotes(
  clef: Clef,
  range: TrainerRange,
  accidentals: AccidentalMode,
): TrainerNote[] {
  let naturalList: [ 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B', number ][]
  if (clef === 'treble') {
    if (range === 'staff') naturalList = TREBLE_NATURALS_STAFF
    else if (range === 'standard') naturalList = TREBLE_NATURALS_STANDARD
    else naturalList = TREBLE_NATURALS_EXTENDED
  } else {
    if (range === 'staff') naturalList = BASS_NATURALS_STAFF
    else if (range === 'standard') naturalList = BASS_NATURALS_STANDARD
    else naturalList = BASS_NATURALS_EXTENDED
  }

  const result: TrainerNote[] = []
  for (const [letter, octave] of naturalList) {
    result.push(createNote(letter, octave, null, clef))

    if (accidentals === 'accidentals') {
      if ((SHARPABLE_LETTERS as readonly string[]).includes(letter)) {
        result.push(createNote(letter, octave, 'sharp', clef))
      }
      if ((FLATABLE_LETTERS as readonly string[]).includes(letter)) {
        result.push(createNote(letter, octave, 'flat', clef))
      }
    }
  }

  return result
}

export function getRandomTrainerNote(
  clefChoice: ClefSelection,
  range: TrainerRange,
  accidentals: AccidentalMode,
  previousMidi?: number,
): TrainerNote {
  const chosenClef: Clef =
    clefChoice === 'both' ? (Math.random() < 0.5 ? 'treble' : 'bass') : clefChoice

  const notes = getAvailableNotes(chosenClef, range, accidentals)
  if (notes.length === 0) {
    return createNote('C', 4, null, chosenClef)
  }

  const filtered = previousMidi !== undefined && notes.length > 1
    ? notes.filter(n => n.midi !== previousMidi)
    : notes

  const pick = filtered[Math.floor(Math.random() * filtered.length)]
  return pick
}

// ── Mathematical staff step calculation ──────────────────────────────────────
// In Treble clef, bottom line (Line 1) is E4 (diatonic = 30).
// In Bass clef, bottom line (Line 1) is G2 (diatonic = 18).
// Top line is step 8 (4 full spaces / lineSpacing * 4 above bottom line).
export function getStaffStepDiff(note: TrainerNote, clef: Clef): number {
  const baseDiatonic = clef === 'treble' ? 30 : 18
  return note.diatonicIndex - baseDiatonic
}

export interface NotePlacement {
  y: number
  stepDiff: number
  ledgerLines: number[] // Y coordinates of ledger lines
}

export function computeNotePlacement(
  note: TrainerNote,
  clef: Clef,
  bottomLineY: number,
  lineSpacing: number,
): NotePlacement {
  const stepDiff = getStaffStepDiff(note, clef)
  const y = bottomLineY - stepDiff * (lineSpacing / 2)

  const ledgerLines: number[] = []

  // Below bottom line (stepDiff < 0)
  // Even steps -2, -4, -6 are ledger lines
  if (stepDiff < 0) {
    for (let s = -2; s >= stepDiff; s -= 2) {
      ledgerLines.push(bottomLineY - s * (lineSpacing / 2))
    }
  }

  // Above top line (stepDiff > 8)
  // Even steps 10, 12, 14 are ledger lines
  if (stepDiff > 8) {
    for (let s = 10; s <= stepDiff; s += 2) {
      ledgerLines.push(bottomLineY - s * (lineSpacing / 2))
    }
  }

  return { y, stepDiff, ledgerLines }
}

// ── SMuFL Standard Vector Paths (from Steinberg Bravura) ─────────────────────
// The glyph outlines below are adapted from the Bravura music font:
// Copyright (c) 2020, Steinberg Media Technologies GmbH (http://www.steinberg.net/),
// with Reserved Font Name "Bravura".
// Licensed under the SIL Open Font License, Version 1.1 (OFL-1.1).
// Scale factor for 1 staff space (250 font units): scale = lineSpacing / 250
export const SMUFL_GLYPHS = {
  gClef: 'M364 -252c-245 0 -364 165 -364 339c0 202 153 345 297 464c12 10 11 12 9 24c-7 41 -14 106 -14 164c0 104 24 229 98 311c20 22 51 48 65 48c11 0 37 -28 52 -50c41 -60 65 -146 65 -233c0 -153 -82 -280 -190 -381c-6 -6 -8 -7 -6 -19l25 -145c3 -18 3 -18 29 -18 c147 0 241 -113 241 -241c0 -113 -67 -198 -168 -238c-14 -6 -15 -5 -13 -17c11 -62 29 -157 29 -214c0 -170 -130 -200 -197 -200c-151 0 -190 98 -190 163c0 62 40 115 107 115c61 0 96 -47 96 -102c0 -58 -36 -85 -67 -94c-23 -7 -32 -10 -32 -17c0 -13 26 -29 80 -29 c59 0 159 18 159 166c0 47 -15 134 -27 201c-2 12 -4 11 -15 9c-20 -4 -46 -6 -69 -6zM80 20c0 -139 113 -236 288 -236c20 0 40 2 56 5c15 3 16 3 14 14l-50 298c-2 11 -4 12 -20 8c-61 -17 -100 -60 -100 -117c0 -46 30 -89 72 -107c7 -3 15 -6 15 -13 c0 -6 -4 -11 -12 -11c-7 0 -19 3 -27 6c-68 23 -115 87 -115 177c0 85 57 164 145 194c18 6 18 5 15 24l-21 128c-2 11 -4 12 -14 4c-47 -38 -93 -75 -153 -142c-83 -94 -93 -173 -93 -232zM470 943c-61 0 -133 -96 -133 -252c0 -32 2 -66 6 -92c2 -13 6 -14 13 -8 c79 69 174 159 174 270c0 55 -27 82 -60 82zM441 117c-12 1 -13 -2 -11 -14l49 -285c2 -12 4 -12 16 -6c56 28 94 79 94 142c0 88 -67 156 -148 163z',
  fClef: 'M8 -635c-9 0 -13 6 -13 12c0 8 6 13 15 18c233 133 371 289 371 568c0 157 -46 261 -152 261c-102 0 -162 -73 -162 -113c0 -10 3 -18 16 -18s23 7 50 7c49 0 96 -40 96 -104c0 -62 -43 -106 -106 -106c-81 0 -123 69 -123 149c0 96 78 223 252 223 c173 0 279 -116 279 -290c0 -304 -260 -482 -506 -602c-6 -3 -12 -5 -17 -5zM629 70c-31 0 -55 24 -55 55s24 55 55 55s55 -24 55 -55s-24 -55 -55 -55zM630 -179c-31 0 -54 23 -54 54s23 54 54 54s54 -23 54 -54s-23 -54 -54 -54z',
  flat: 'M12 -170c-8 10 -12 581 -12 581c1 18 17 28 31 28c10 0 19 -6 19 -17c0 -20 -6 -260 -7 -282c0 -7 4 -14 11 -17c2 -1 3 -1 5 -1c5 0 16 9 22 14c14 9 38 17 55 17c46 -3 90 -39 90 -96c0 -46 -31 -107 -120 -169c-25 -17 -49 -44 -79 -61c0 0 -3 -2 -6 -2s-6 1 -9 5z M46 51c-1 -4 -2 -16 -2 -32c0 -40 3 -100 3 -100c0 -5 2 -15 11 -15c3 0 6 1 10 3c43 27 89 81 89 135c0 25 -12 58 -41 58c-23 0 -63 -29 -70 -49z',
  sharp: 'M8 26c-5 0 -8 3 -8 9v71c0 6 5 14 12 16c0 0 20 8 26 11s12 13 12 27v135c0 6 6 11 16 11c7 0 14 -5 14 -11v-120c0 -8 3 -20 12 -20c17 4 51 18 63 25c9 6 12 19 13 29v130c0 6 6 11 16 11c8 0 14 -5 14 -11v-122c0 -8 7 -13 14 -13c5 1 25 9 25 9c2 1 3 1 5 1 c4 0 7 -3 7 -8v-71c0 -6 -5 -14 -12 -17l-26 -10c-8 -3 -13 -22 -13 -29v-93c0 -12 7 -18 13 -18l26 10c2 1 3 1 5 1c4 0 7 -3 7 -8v-71c0 -6 -5 -14 -12 -17c0 0 -21 -8 -28 -11s-11 -15 -11 -23v-142c0 -6 -6 -11 -17 -11c-7 0 -13 5 -13 11v125c0 6 -5 18 -13 18 c-1 0 -3 -1 -4 -1l-61 -25c-5 -2 -10 -9 -10 -22v-139c0 -6 -7 -11 -17 -11c-7 0 -13 5 -13 11v123c0 5 -5 16 -12 16c-1 0 -2 0 -3 -1c-9 -3 -23 -9 -23 -9c-1 0 -3 -1 -4 -1c-5 0 -8 3 -8 9v71c0 6 5 14 12 16c0 0 21 9 27 11c6 3 11 12 11 23v99c0 8 -6 18 -13 18 c-1 0 -2 -1 -3 -1c-3 -2 -22 -11 -26 -11zM77 -30c0 -24 1 -46 3 -50c1 -3 6 -5 12 -5c23 0 70 20 76 40c2 9 4 37 4 64s-2 52 -4 57c-2 4 -8 6 -15 6c-25 0 -71 -21 -73 -38c-2 -8 -3 -43 -3 -74z',
  natural: 'M0 -186v515c0 7 5 12 12 12h13c6 0 12 -5 12 -12v-167c0 -4 4 -5 10 -5c26 0 90 23 90 23c1 0 2 1 4 1l15 5c1 1 3 1 4 1c4 0 8 -3 8 -8v-502c0 -7 -6 -12 -12 -12h-13c-7 0 -12 5 -12 12v149c0 8 -7 11 -17 11c-29 0 -85 -24 -99 -30c-1 -1 -6 -2 -7 -2c-5 0 -8 3 -8 9z M122 79c-24 0 -85 -26 -85 -40v-103c0 -4 5 -6 12 -6c25 0 82 23 82 41v103c0 4 -3 5 -9 5z',
  noteWhole: 'M0 2c0 68 83 123 216 123c93 0 206 -52 206 -123c0 -70 -52 -127 -216 -127c-149 0 -206 60 -206 127zM108 39c0 -32 15 -66 35 -89c21 -28 58 -52 94 -52c10 0 21 1 31 4c33 8 46 36 46 67c0 60 -55 134 -124 134c-31 0 -68 -5 -79 -40c-2 -8 -3 -16 -3 -24z',
  noteBlack: 'M0 -42c0 86 88 167 198 167c57 0 97 -32 97 -83c0 -85 -109 -167 -198 -167c-54 0 -97 31 -97 83z',
}

export function formatTrainerNoteName(note: TrainerNote): string {
  const acc = note.accidental === 'sharp' ? '♯' : note.accidental === 'flat' ? '♭' : ''
  return `${note.letter}${acc}${note.octave}`
}

export function midiToTrainerNote(
  midi: number,
  clefChoice: ClefSelection,
  preferSharp = true,
): TrainerNote {
  const SEMI_TO_LETTER_SHARP: { letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'; accidental: 'sharp' | null }[] = [
    { letter: 'C', accidental: null },
    { letter: 'C', accidental: 'sharp' },
    { letter: 'D', accidental: null },
    { letter: 'D', accidental: 'sharp' },
    { letter: 'E', accidental: null },
    { letter: 'F', accidental: null },
    { letter: 'F', accidental: 'sharp' },
    { letter: 'G', accidental: null },
    { letter: 'G', accidental: 'sharp' },
    { letter: 'A', accidental: null },
    { letter: 'A', accidental: 'sharp' },
    { letter: 'B', accidental: null },
  ]

  const SEMI_TO_LETTER_FLAT: { letter: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'; accidental: 'flat' | null }[] = [
    { letter: 'C', accidental: null },
    { letter: 'D', accidental: 'flat' },
    { letter: 'D', accidental: null },
    { letter: 'E', accidental: 'flat' },
    { letter: 'E', accidental: null },
    { letter: 'F', accidental: null },
    { letter: 'G', accidental: 'flat' },
    { letter: 'G', accidental: null },
    { letter: 'A', accidental: 'flat' },
    { letter: 'A', accidental: null },
    { letter: 'B', accidental: 'flat' },
    { letter: 'B', accidental: null },
  ]

  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const info = preferSharp ? SEMI_TO_LETTER_SHARP[pc] : SEMI_TO_LETTER_FLAT[pc]

  let clef: Clef
  if (clefChoice === 'treble') {
    clef = 'treble'
  } else if (clefChoice === 'bass') {
    clef = 'bass'
  } else {
    // Grand staff: notes C4 (60) and above on Treble, below on Bass
    clef = midi >= 60 ? 'treble' : 'bass'
  }

  return createNote(info.letter, octave, info.accidental, clef)
}

