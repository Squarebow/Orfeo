import { Chord, Interval } from 'tonal'
import { detectChord } from './chordDetection'
import { isCuratedChordName, CHORD_TEMPLATES, ALL_CHORDS } from './chordVocabulary'

export function runChordVocabularyTest(): void {
  console.group('[chordVocabulary] self-check')
  let pass = 0, fail = 0
  const check = (cond: boolean, msg: string) => {
    if (cond) { pass++ } else { fail++; console.error('FAIL:', msg) }
  }

  // ── isCuratedChordName ──────────────────────────────────────────────────
  check(isCuratedChordName('C'), 'bare major is curated')
  check(isCuratedChordName('Cm'), 'minor is curated')
  check(isCuratedChordName('Cmaj7'), 'maj7 is curated')
  check(isCuratedChordName('C7/E'), 'slash chord: quality still tested')
  check(!isCuratedChordName('Csus24'), 'sus24 is NOT curated')
  check(!isCuratedChordName('Cmb6b9'), 'mb6b9 is NOT curated')
  check(!isCuratedChordName('C7no5'), '7no5 is NOT curated')

  // ── CHORD_TEMPLATES: pcs are the unique pitch classes of the real chord ──
  for (const t of CHORD_TEMPLATES) {
    const ct = Chord.get('C' + t.suffix)
    const wantPcs = [...new Set((ct.intervals ?? [])
      .map(iv => (((Interval.semitones(iv) ?? 0) % 12) + 12) % 12))]
    check(
      JSON.stringify(t.pcs) === JSON.stringify(wantPcs),
      `template "${t.suffix}" pcs ${JSON.stringify(t.pcs)} === tonal ${JSON.stringify(wantPcs)}`,
    )
    check(
      JSON.stringify(t.tonalIntervals) === JSON.stringify(ct.intervals),
      `template "${t.suffix}" tonalIntervals match Chord.get`,
    )
  }
  check(ALL_CHORDS.length > 20, 'ALL_CHORDS populated')

  // ── detect() is curated-first (Task 2 makes these pass) ─────────────────
  const n1 = detectChord(new Set([60, 62, 64, 67, 69])) // C D E G A
  check(!!n1 && isCuratedChordName(n1), `C-D-E-G-A -> curated ("${n1}")`)
  const n2 = detectChord(new Set([59, 60, 62, 67]))      // B C D G
  check(!!n2 && isCuratedChordName(n2), `B-C-D-G -> curated ("${n2}")`)

  console.log(`chordVocabulary: ${pass} passed, ${fail} failed`)
  console.groupEnd()
}
