import { Chord, Note, Interval, ChordType } from 'tonal'
import type { NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import { getNoteName, convertAccidentals } from './noteNames'
import { PIANO_RANGES } from './keyLayout'

// ---------------------------------------------------------------------------
// Core principle:
// Chord.detect() is called only once — on the note set as-is.
// pickBestRoot() always returns a non-slash root-position chord name.
// Inversion label is computed from bass-vs-root comparison, never re-detected.
// stripMajorSuffix() runs at every return point that feeds Chord.get() —
// tonal.js chord-KEY lookups need a bare "CM"→"C" clean, nothing fancier.
// formatChordSuffix() (below) is the separate DISPLAY-facing formatter —
// localizeChord() is the only place that calls it, since every detection
// path (detectChord, detectChordWithInversion, structured.rawRootName) is
// always piped through localizeChord before being shown to the user. ───────
// ---------------------------------------------------------------------------

// ── Strip trailing M from plain major chord names (CM → C, GM → G) ──────────
// tonal-key-safe only — do not use this for display text, use
// formatChordSuffix() (via localizeChord) instead.
export function stripMajorSuffix(chord: string): string {
  return chord.replace(/^([A-G][b#]?)M$/, '$1')
}

// ── Split a chord symbol into its root token and everything after it ────────
// "BbMb5" → { root: "Bb", suffix: "Mb5" }; "C" → { root: "C", suffix: "" }
function splitChordRoot(chordName: string): { root: string; suffix: string } {
  const m = chordName.match(/^([A-G][b#]?)(.*)$/)
  if (!m) return { root: chordName, suffix: '' }
  return { root: m[1], suffix: m[2] }
}

// ---------------------------------------------------------------------------
// formatChordSuffix — the shared, style-aware DISPLAY formatter for the part
// of a chord symbol after the root. Two responsibilities, always both run:
//
// 1. Generalizes stripMajorSuffix(): tonal.js marks explicit-major quality
//    with a leading "M" (to disambiguate from "m") even when there's no
//    real ambiguity to resolve — a bare "M" is already dropped elsewhere,
//    but "M" followed by an alteration only (no 7th/9th/etc, e.g. "Mb5")
//    was never handled, which is exactly why a major-b5 chord displayed as
//    the confusing "BbMb5" instead of "Bb(b5)".
// 2. Applies the user's chosen naming style (abbreviation vs symbol) via
//    ordered, whole-token substitutions — deliberately NOT an exhaustive
//    mapping of tonal's ~100 chord types: unrecognized tokens pass through
//    unchanged in both styles, which is the correct behavior (no worse
//    than today) rather than a gap to keep chasing.
// ---------------------------------------------------------------------------
export function formatChordSuffix(rawSuffix: string, style: ChordNamingStyle): string {
  let suffix = rawSuffix

  // ── Step 1: resolve the leading "M" marker (style-independent) ───────────
  if (suffix === 'M') {
    suffix = ''
  } else if (/^Madd/.test(suffix)) {
    suffix = suffix.slice(1)                          // "Madd9" → "add9"
  } else if (/^M\d/.test(suffix)) {
    suffix = 'Maj' + suffix.slice(1)                   // "M7" → "Maj7", "M7#11" → "Maj7#11"
  } else if (/^M./.test(suffix)) {
    suffix = `(${suffix.slice(1)})`                    // "Mb5" → "(b5)", "M#5" → "(#5)"
  }
  // "mM7" (minor-major 7th) — the M isn't leading, but the same "add a real
  // extension word" rule applies so it reads as "mMaj7" not "mM7".
  suffix = suffix.replace(/^mM(\d)/, 'mMaj$1')

  // tonal's "altered" chord type (1P 3M 7m 9m, no 5th) has the raw suffix
  // "alt7" — left unformatted this reaches note-naming untouched and, under
  // Central European naming, a "B" root turns it into "Halt7", which reads
  // as a real German word purely by coincidence. ChordExplorer.tsx already
  // simplifies this same raw suffix to "alt" for its catalog display
  // (KEY_TO_RAW_SUFFIX); mirror that here so live playback detection agrees.
  if (suffix === 'alt7') suffix = 'alt'

  if (style === 'abbreviation') return suffix

  // ── Step 2: symbol style — whole-token swaps, longest/most-specific first ─
  suffix = suffix
    .replace(/\baug\b/, '+')
    .replace(/\bdim7\b/, '°7')
    .replace(/\bdim\b/, '°')
    .replace(/\bm7b5\b/, 'ø7')
    .replace(/Maj/g, 'Δ')
    // Accidentals inside alterations only — always digit-adjacent in every
    // tonal suffix token (b5, #11, b9...), never a bare word-forming letter.
    .replace(/b(\d)/g, '♭$1')
    .replace(/#(\d)/g, '♯$1')

  return suffix
}

// ── Ordinal suffix for inversion number labels ───────────────────────────────
// 1 → 'st', 2 → 'nd', 3 → 'rd', 11/12/13 → 'th', else → 'th'
export function ordinalSuffix(n: number): string {
  const abs = Math.abs(n)
  if (abs % 100 >= 11 && abs % 100 <= 13) return 'th'
  switch (abs % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

// "alt7" (tonal's "altered" type: 1P 3M 7m 9m, no 5th) joins this list for
// the same reason as "No5" — an incomplete/obscure voicing that shouldn't
// beat a cleaner reading of the same notes when one exists. Found against
// a real MIDI file (Bruce Hornsby - The Way It Is, 2026-08-21), where it
// won purely because nothing else penalized it.
// 'no5' matches tonal's real omitted-5th suffixes (7no5, 9no5, 13no5) —
// was capitalized 'No5' before, which never matched anything since tonal's
// suffixes are all lowercase. Found while investigating a real "A9no5/G"
// chord (Bruce Hornsby - The Way It Is, 2026-08-21).
const WEIRD = ['m#5', 'aug', 'no5', 'sus2add', 'add#11', 'add#', 'alt7']

// ── Score a candidate chord name — LOWER is better. Complexity/obscurity
// drives the score, not raw string length: a short exotic name (e.g. "A4",
// tonal's quartal-harmony type) must never beat a longer standard one
// (e.g. "D7sus4") just for having fewer characters — that was a real
// regression found against a real MIDI file (Bruce Hornsby - The Way It
// Is, 2026-08-20): C-D-G-A scored "A4/C" best purely on length, when
// "D7sus4/C" and "Gsus24/C" (both far more usable) were also candidates. ──
function scoreChord(name: string): number {
  const typePart = name.split('/')[0].replace(/^[A-G][b#]?/, '')
  let score = 0
  // Each alteration (b5, #9, b13...) is real complexity a listener has to
  // parse — weighted far above the old pure string-length heuristic.
  const alterations = typePart.match(/[b#]\d+/g) ?? []
  score += alterations.length * 15
  if (WEIRD.some(w => name.includes(w))) score += 20
  if (name.includes('/')) score += 5
  // Quartal harmony ("4") is a real tonal.js type but essentially never
  // what's actually meant when a standard sus4-family reading of the same
  // notes exists.
  if (typePart && ChordType.get(typePart).aliases?.includes('quartal')) score += 25
  // Length is a light tiebreaker only, never the primary signal.
  score += name.length * 0.1
  return score
}

// ---------------------------------------------------------------------------
// Pick the single best candidate — slash and non-slash scored on equal
// footing (slash already carries its own scoreChord penalty), filtered
// first to whatever's actually compatible with the real bass note being
// played: non-slash candidates whose own root equals the bass, or slash
// candidates whose slash-bass equals the bass. This matters because tonal
// sometimes has NO non-slash reading of a note set at all — e.g. B-C-D-G
// only detects as "Bmb6b9" (root position, badly altered) while a
// perfectly clean "Cmaj9/B" (3rd-inversion maj9) is also on the table but
// used to be discarded automatically for being a slash chord. A clean
// inversion must be able to beat an obscure "root position" reading of the
// exact same notes — see docs/superpowers/specs (2026-08-20) for the real
// MIDI file (Bruce Hornsby - The Way It Is) this was found against.
// Falls back to scoring the full candidate list if nothing is compatible
// with the real bass (should be rare — Chord.detect always roots its own
// slash forms at the lowest input note).
// ---------------------------------------------------------------------------
function pickBest(matches: string[], bassNote: string): string | null {
  const compatible = matches.filter(m =>
    m.includes('/') ? m.endsWith(`/${bassNote}`) : chordRootPitchClass(m) === bassNote
  )
  const pool = compatible.length > 0 ? compatible : matches
  return [...pool].sort((a, b) => scoreChord(a) - scoreChord(b))[0] ?? null
}

// ---------------------------------------------------------------------------
// detectOmit3 — real voicings very commonly omit the 3rd (a pianist leaves
// it for the melody/other instruments to imply), but tonal.js's dictionary
// has no "omit3" chord types. Without this, Chord.detect() falls back to
// whatever unrelated altered chord the same pitch classes also happen to
// spell from a completely different root — e.g. C-D-G-B (a maj9 missing its
// 3rd) detects as only "Bmb6b9/C", not anything C-rooted, because tonal has
// no dictionary entry for "1P 2M 5P 7M". This tries inserting a hypothetical
// major or minor 3rd above each note in turn and keeps whatever clean chord
// name that produces, PROVIDED tonal itself agrees the resulting chord's
// own root is the note we tested — not merely that its bass lines up. That
// distinction matters: inserting B's own major 3rd (D#) into B-C-D-G also
// "succeeds" in the sense of returning a real chord (tonal detects the
// 5-note result as rooted at C, not B — "CmM9/B"), which would otherwise
// look like a valid match for the B-rooted test and silently crowd out the
// actually-correct "Cmaj9/B" found when C itself is tested. Requiring the
// result's root to match what we tested filters that out for free — the
// accept condition, `chordRootPitchClass(n) === rootPc`, doesn't need to
// branch on slash vs non-slash at all, since a genuinely root-matching
// result is automatically in root position when rootMidi is also the
// lowest note, and automatically the correct slash form otherwise.
// sortedMidi must be real MIDI numbers (register-aware — a 9th and a 2nd
// are different intervals). ─────────────────────────────────────────────
function detectOmit3(sortedMidi: number[]): string[] {
  const found: string[] = []
  for (const rootMidi of sortedMidi) {
    const rootName = Note.fromMidi(rootMidi)
    const rootPc = rootName ? Note.pitchClass(rootName) : null
    if (!rootPc) continue
    // Major third tried first, minor only as a fallback if major found
    // nothing for THIS root — prevents a coincidentally-shorter minor-
    // quality guess from beating the more natural major reading purely on
    // scoreChord's length tiebreak (e.g. "Cm69" over "C6add9").
    for (const third of [4, 3]) {
      const hasThird = sortedMidi.some(m => ((m - rootMidi) % 12 + 12) % 12 === third)
      if (hasThird) continue
      const augmented = [...sortedMidi, rootMidi + third].sort((a, b) => a - b)
      const noteNames = augmented.map(m => Note.fromMidi(m)).filter((n): n is string => !!n)
      const clean = Chord.detect(noteNames).find(n => chordRootPitchClass(n) === rootPc)
      if (clean) { found.push(clean); break }
    }
  }
  return found
}

function detect(noteNames: string[], sortedMidi?: number[]): string[] {
  let matches = Chord.detect(noteNames)
  if (matches.length === 0 && noteNames.length > 3) {
    matches = Chord.detect(noteNames.slice(0, -1))
  }
  if (matches.length === 0) {
    const pcs = noteNames.map(n => Note.pitchClass(n)).filter(Boolean)
    matches = Chord.detect(pcs)
  }
  if (sortedMidi && sortedMidi.length >= 3) {
    matches = [...matches, ...detectOmit3(sortedMidi)]
  }
  return matches
}

// ── Extract the root token from a chord name (strips slash part) ─────────────
function chordRootPitchClass(chordName: string): string {
  const base = chordName.split('/')[0]
  return Note.pitchClass(base.match(/^[A-G][b#]?/)?.[0] ?? '') ?? ''
}

// ---------------------------------------------------------------------------
// Basic detection — playback display (root name or slash if inverted, no label)
// ---------------------------------------------------------------------------
export function detectChord(midiNotes: Set<number>): string | null {
  if (midiNotes.size < 2) return null

  const sorted = Array.from(midiNotes).sort((a, b) => a - b)
  const bassNote = Note.pitchClass(Note.fromMidi(sorted[0]))
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames, sorted)
  if (matches.length === 0) return null

  const best = pickBest(matches, bassNote)
  if (!best) return null

  return stripMajorSuffix(best)
}

// ---------------------------------------------------------------------------
// Structured detection — root-position pitch class + interval set, for
// consumers that need to rebuild a canonical voicing (buildChordMidi) rather
// than just display a name. Always root-position (bass may differ — that's
// the "inversion" case, which callers here don't care about).
// ---------------------------------------------------------------------------
export function detectChordStructured(
  midiNotes: Set<number>,
): { rootPitchClass: number; intervals: string[]; rawRootName: string } | null {
  if (midiNotes.size < 2) return null

  const sorted = Array.from(midiNotes).sort((a, b) => a - b)
  const bassNote = Note.pitchClass(Note.fromMidi(sorted[0]))
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames, sorted)
  if (matches.length === 0) return null

  const best = pickBest(matches, bassNote)
  if (!best) return null
  const cleanRoot = stripMajorSuffix(best.split('/')[0])

  const info = Chord.get(cleanRoot)
  if (!info.intervals || info.intervals.length < 2) return null

  const rootPitchClass = Note.chroma(chordRootPitchClass(cleanRoot))
  if (rootPitchClass === null || rootPitchClass === undefined) return null

  return { rootPitchClass, intervals: info.intervals, rawRootName: cleanRoot }
}

// ---------------------------------------------------------------------------
// Build a root-position MIDI voicing for a chord — one canonical octave,
// clamped to the given keyboard size's playable range. Shared by Chord
// Explorer (its own catalog) and the playback chord-display context menu
// (Keyboard.tsx), so "show on keyboard" and "open in Chord Explorer" always
// render the same voicing for the same chord.
// ---------------------------------------------------------------------------
export function buildChordMidi(rootPitchClass: number, intervals: string[], keyboardSize: number): number[] {
  const { min, max } = PIANO_RANGES[keyboardSize] ?? PIANO_RANGES[73]
  let rootMidi = -1
  for (const oct of [4, 3, 5, 2]) {
    const midi = rootPitchClass + (oct + 1) * 12
    if (midi >= min && midi <= max) { rootMidi = midi; break }
  }
  if (rootMidi < 0) return []
  return intervals
    .map(ivl => { const s = Interval.semitones(ivl); return s !== null ? rootMidi + s : null })
    .filter((n): n is number => n !== null && n >= min && n <= max)
}

// ---------------------------------------------------------------------------
// Detection with inversion info — for locked chord and explorer display.
// Always returns the ROOT-POSITION chord name (never slash).
// Inversion number is derived by locating the bass PC in the chord tone list.
// ---------------------------------------------------------------------------
export function detectChordWithInversion(
  midiNotes: Set<number>,
): { name: string; invLabel: string; ordinal: string } | null {
  if (midiNotes.size < 2) return null

  const sorted = Array.from(midiNotes).sort((a, b) => a - b)
  const bassMidiNote = sorted[0]
  const bassPC = Note.pitchClass(Note.fromMidi(bassMidiNote))
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames, sorted)
  if (matches.length === 0) return null

  const best = pickBest(matches, bassPC)
  if (!best) return null
  const cleanRoot = stripMajorSuffix(best.split('/')[0])
  const chordRootPC = chordRootPitchClass(cleanRoot)

  if (chordRootPC === bassPC) {
    // ── Root position — bass matches chord root ───────────────────────────
    return { name: cleanRoot, invLabel: '', ordinal: '' }
  }

  // ── Inversion — find which degree the bass note occupies ─────────────────
  // Get chord tone pitch classes in their natural (root-upward) order
  const chordInfo = Chord.get(cleanRoot)
  const chordTonePCs = (chordInfo.notes ?? [])
    .map((n: string) => Note.pitchClass(n))
    .filter(Boolean) as string[]

  const invIdx = chordTonePCs.indexOf(bassPC)
  // invIdx 1 = 1st inversion (first non-root tone in bass), 2 = 2nd, etc.
  // If bass PC not found in chord tones (exotic voicing), fall back to 1.
  const invNumber = invIdx > 0 ? invIdx : 1

  return {
    name: cleanRoot,
    invLabel: 'inv',
    ordinal: String(invNumber),
  }
}

// ---------------------------------------------------------------------------
// Format a chord name + inversion number for structured display.
// originalChordName: already localized root+type string (e.g. "C", "Dm7")
// inversionNumber:   raw cumulative count (may exceed noteCount or be negative)
// noteCount:         number of distinct notes in chord — used to wrap the label
//                    so a 3-note chord always cycles root→1st→2nd→root…
// bassNoteMidi:      lowest MIDI note in the current voicing
// showLabel:         pass false on MIDI playback path to suppress ordinal/label
// ---------------------------------------------------------------------------
export function formatInversionDisplay(
  originalChordName: string,
  inversionNumber: number,
  noteCount: number,
  bassNoteMidi: number,
  noteNaming: NoteNaming,
  accidentals: Accidentals,
  showLabel = true,
): { chordLabel: string; invLabel: string; ordinal: string } {
  // ── Wrap count so labels loop: root → 1st → 2nd → root… ─────────────────
  const effectiveInv = noteCount > 0
    ? ((inversionNumber % noteCount) + noteCount) % noteCount
    : Math.abs(inversionNumber)

  if (effectiveInv === 0) {
    return { chordLabel: originalChordName, invLabel: '', ordinal: '' }
  }

  const bassName = getNoteName(bassNoteMidi, noteNaming, accidentals)
  const chordLabel = bassName ? `${originalChordName}/${bassName}` : originalChordName
  return {
    chordLabel,
    invLabel: showLabel ? 'inv' : '',
    ordinal: showLabel ? String(effectiveInv) : '',
  }
}

// ---------------------------------------------------------------------------
// Localize chord name to user's note naming system + accidental preference
// ---------------------------------------------------------------------------
export function localizeChord(
  chord: string | null,
  naming: NoteNaming,
  accidentals: Accidentals = 'flat',
  namingStyle: ChordNamingStyle = 'abbreviation',
): string | null {
  if (!chord) return null
  if (naming === 'hidden') return null

  // ── Convert accidentals first (normalises A# → Bb at PC 10) ─────────────
  let result = convertAccidentals(chord, accidentals)

  // ── Chord-quality naming style — applied to the suffix only, while the
  // root is still in standard A–G form (before Central European/Solfège
  // relabel it below). Root-letter localization then prefix-matches on
  // this already-final suffix and passes it through untouched. This is the
  // single point every chord-name display in the app converges through
  // (detectChord's sequence path and structured.rawRootName's direct path
  // alike), so it's the one place this needs to happen.
  //
  // A trailing "/<bass>" slash annotation is pulled off BEFORE formatting
  // and reattached after — formatChordSuffix only knows about chord-quality
  // tokens, not bass notes, and without this split a slash chord whose
  // quality happens to start with "M" (e.g. "GM/D", a plain G major triad
  // in 2nd inversion) got its bass swallowed into the M-generalization's
  // parenthesization: "G(/D)" instead of "G/D". Found against a real MIDI
  // file, 2026-08-20 (see docs/superpowers/specs). ─────────────────────────
  {
    const { root, suffix } = splitChordRoot(result)
    const slashMatch = suffix.match(/\/([A-G][b#]?)$/)
    const quality = slashMatch ? suffix.slice(0, -slashMatch[0].length) : suffix
    const slashPart = slashMatch ? slashMatch[0] : ''
    result = root + formatChordSuffix(quality, namingStyle) + slashPart
  }

  // ── Central European localisation — single atomic pass ───────────────────────
  // Two sequential replaces are wrong: Bb→B followed by B→H would catch the B
  // just produced from Bb and turn it into H. The alternation Bb|B tries Bb first
  // at every position, so Bb→'B' and bare B→'H' never interfere with each other.
  if (naming === 'central-european') {
    result = result.replace(/Bb|B/g, (m) => m === 'Bb' ? 'B' : 'H')
    return result
  }

  if (naming === 'solfege') {
    const sharpMap: Record<string, string> = {
      'Do#': 'Do#', 'Re#': 'Re#', 'Fa#': 'Fa#', 'Sol#': 'Sol#', 'La#': 'La#',
      'C#': 'Do#', 'D#': 'Re#', 'F#': 'Fa#', 'G#': 'Sol#', 'A#': 'La#',
      'Db': 'Reb', 'Eb': 'Mib', 'Gb': 'Solb', 'Ab': 'Lab', 'Bb': 'Sib',
      'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si',
    }
    const keys = Object.keys(sharpMap).sort((a, b) => b.length - a.length)
    for (const k of keys) {
      if (result.startsWith(k)) return sharpMap[k] + result.slice(k.length)
    }
  }

  return result
}
