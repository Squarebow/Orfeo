import { Chord, Note, Interval } from 'tonal'
import type { NoteNaming, Accidentals } from '../types'
import { getNoteName, convertAccidentals } from './noteNames'
import { PIANO_RANGES } from './keyLayout'

// ---------------------------------------------------------------------------
// Core principle:
// Chord.detect() is called only once — on the note set as-is.
// pickBestRoot() always returns a non-slash root-position chord name.
// Inversion label is computed from bass-vs-root comparison, never re-detected.
// stripMajorSuffix() runs at every return point — no bare CM/GM ever in UI.
// ---------------------------------------------------------------------------

// ── Strip trailing M from plain major chord names (CM → C, GM → G) ──────────
export function stripMajorSuffix(chord: string): string {
  return chord.replace(/^([A-G][b#]?)M$/, '$1')
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

const WEIRD = ['m#5', 'aug', 'No5', 'sus2add', 'add#11', 'add#']

function scoreChord(name: string): number {
  let score = name.length
  if (WEIRD.some(w => name.includes(w))) score += 20
  if (name.includes('/')) score += 5
  return score
}

// ── Pick the best root-position (non-slash) chord name from candidates ───────
function pickBestRoot(matches: string[]): string | null {
  const roots = matches.filter(m => !m.includes('/'))
  const all = roots.length > 0 ? roots : matches
  return all.sort((a, b) => scoreChord(a) - scoreChord(b))[0] ?? null
}

function pickBestSlash(matches: string[], bassNote: string): string | null {
  const slashes = matches.filter(m => m.endsWith(`/${bassNote}`))
  const pool = slashes.length > 0 ? slashes : matches.filter(m => m.includes('/'))
  if (pool.length === 0) return null
  return pool.sort((a, b) => scoreChord(a) - scoreChord(b))[0] ?? null
}

function detect(noteNames: string[]): string[] {
  let matches = Chord.detect(noteNames)
  if (matches.length === 0 && noteNames.length > 3) {
    matches = Chord.detect(noteNames.slice(0, -1))
  }
  if (matches.length === 0) {
    const pcs = noteNames.map(n => Note.pitchClass(n)).filter(Boolean)
    matches = Chord.detect(pcs)
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

  const matches = detect(noteNames)
  if (matches.length === 0) return null

  const rootName = pickBestRoot(matches)
  if (!rootName) return null

  const chordRoot = chordRootPitchClass(rootName)

  if (chordRoot === bassNote) {
    return stripMajorSuffix(rootName)
  } else {
    const slashName = pickBestSlash(matches, bassNote)
    return stripMajorSuffix(slashName ?? rootName)
  }
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
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames)
  if (matches.length === 0) return null

  const rawRoot = pickBestRoot(matches)
  if (!rawRoot) return null
  const cleanRoot = stripMajorSuffix(rawRoot.split('/')[0])

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

  const matches = detect(noteNames)
  if (matches.length === 0) return null

  // ── Always take the root-position (non-slash) chord name ─────────────────
  const rawRoot = pickBestRoot(matches)
  if (!rawRoot) return null
  const cleanRoot = stripMajorSuffix(rawRoot.split('/')[0])
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
): string | null {
  if (!chord) return null
  if (naming === 'hidden') return null

  // ── Convert accidentals first (normalises A# → Bb at PC 10) ─────────────
  let result = convertAccidentals(chord, accidentals)

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
      if (result.startsWith(k)) return stripMajorSuffix(sharpMap[k] + result.slice(k.length))
    }
  }

  // ── Final safety net — strip bare M suffix that slipped through ──────────
  return stripMajorSuffix(result)
}
