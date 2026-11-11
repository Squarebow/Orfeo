import { readPlayedNotes, keyWentDown, scalesThatFit, playedLabel } from './explorerShared'

// The Explorers listening to your keyboard (explorerShared): reading held keys,
// when to read again, and which scales the notes fit.
const SCALES = [
  { intervals: [0, 2, 4, 5, 7, 9, 11], minor: false }, // Major
  { intervals: [0, 2, 3, 5, 7, 8, 10], minor: true },  // Natural Minor
  { intervals: [0, 2, 4, 7, 9], minor: false },        // Major Pentatonic
  { intervals: [0, 2, 4, 6, 7, 9, 11], minor: false }, // Lydian
]

export function runPlayedNotesTest(): number {
  console.group('[playedNotes] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Reading what's held
  check(readPlayedNotes([60, 64]) === null, 'two notes are not read')
  check(readPlayedNotes([60, 72, 84]) === null, 'one note in three octaves is not a chord')
  const c = readPlayedNotes([67, 60, 64])!
  check(c.notes.join() === '60,64,67' && c.chord?.rootPitchClass === 0 && c.invCount === 0, 'C E G held in any order reads as C, root position')
  const c1 = readPlayedNotes([64, 67, 72])!
  check(c1.chord?.rootPitchClass === 0 && c1.invCount === 1, 'E G C reads as C, first inversion')
  const cm7 = readPlayedNotes([48, 63, 67, 70])!
  check(cm7.chord?.rootPitchClass === 0 && cm7.pcs.length === 4, 'C E♭ G B♭ reads with root C and four notes')

  // When to read again
  check(keyWentDown(new Set([60, 64]), new Set([60, 64, 67])), 'a new key going down reads again')
  check(!keyWentDown(new Set([60, 64, 67]), new Set([60, 64])), 'letting a key go does not')
  check(keyWentDown(new Set([60, 64, 67]), new Set([62, 65, 69])), 'moving to another chord does')

  // Which scales fit
  const fitsC = scalesThatFit([0, 4, 7], 0, SCALES)
  const label = (f: { rootPc: number; scaleIdx: number }) => `${f.rootPc}:${f.scaleIdx}`
  check(label(fitsC[0]) === '0:0', `C major comes first for a C chord, got ${fitsC.map(label)}`)
  check(fitsC.length === 4 && fitsC.slice(1).every(f => f.scaleIdx <= 1), 'then other major and minor keys, before modes and pentatonics')
  check(fitsC.some(f => label(f) === '9:1'), 'A minor (same notes as C major) is offered')
  const fitsAll = scalesThatFit([0, 4, 7], 0, SCALES, 50)
  check(fitsAll.every(f => SCALES[f.scaleIdx].intervals.map(iv => (f.rootPc + iv) % 12).includes(4)), 'every scale offered holds every played note')
  check(scalesThatFit([0, 1, 2, 3], 0, SCALES).length === 0, 'four semitones in a row fit none of the scales')
  const fitsAm = scalesThatFit([9, 0, 4], 9, SCALES)
  check(label(fitsAm[0]) === '9:1', `A minor comes first for an A minor chord, got ${fitsAm.map(label)}`)

  // How it's written
  const l1 = playedLabel(c1, 'english', 'flat', 'abbreviation')
  check(l1.chord === 'C/E' && l1.inversion === '1st inv' && l1.notes === 'E G C', `first inversion: C/E, 1st inv, notes low to high, got ${JSON.stringify(l1)}`)
  const l0 = playedLabel(c, 'english', 'flat', 'abbreviation')
  check(l0.chord === 'C' && l0.inversion === '' && l0.notes === 'C E G', `root position has no inversion, got ${JSON.stringify(l0)}`)
  const none = playedLabel(readPlayedNotes([60, 61, 62])!, 'english', 'flat', 'abbreviation')
  check(none.chord === null && none.notes === 'C Db D', `notes that make no chord give just the notes, got ${JSON.stringify(none)}`)

  console.log(`playedNotes: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
