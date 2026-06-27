import { Chord, Note } from 'tonal'
import type { NoteNaming, Accidentals } from '../types'
import { getNoteName, convertAccidentals } from './noteNames'

// ---------------------------------------------------------------------------
// Core principle:
// Chord.detect() is called only once — on the note set as-is.
// pickBestRoot() always returns a non-slash root-position chord name.
// Inversion label is computed from bass-vs-root comparison, never re-detected.
// stripMajorSuffix() runs at every return point — no bare CM/GM ever in UI.
// ---------------------------------------------------------------------------

// ── Strip trailing M from plain major chord names (CM → C, GM → G) ──────────
function stripMajorSuffix(chord: string): string {
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
// inversionNumber:   0 = root; 1+ = nth inversion
// bassNoteMidi:      lowest MIDI note in the current voicing
// showLabel:         pass false on MIDI playback path to suppress ordinal/label
// ---------------------------------------------------------------------------
export function formatInversionDisplay(
  originalChordName: string,
  inversionNumber: number,
  bassNoteMidi: number,
  noteNaming: NoteNaming,
  accidentals: Accidentals,
  showLabel = true,
): { chordLabel: string; invLabel: string; ordinal: string } {
  if (inversionNumber === 0) {
    return { chordLabel: originalChordName, invLabel: '', ordinal: '' }
  }

  const bassName = getNoteName(bassNoteMidi, noteNaming, accidentals)
  const chordLabel = bassName ? `${originalChordName}/${bassName}` : originalChordName
  const n = Math.abs(inversionNumber)
  return {
    chordLabel,
    invLabel: showLabel ? 'inv' : '',
    ordinal: showLabel ? String(n) : '',
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

  if (naming === 'central-european') {
    result = result
      .replace(/Bb/g, 'B')
      .replace(/B(?!b)/g, 'H')
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
