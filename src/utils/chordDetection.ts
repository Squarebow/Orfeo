import { Chord, Note } from 'tonal'
import type { NoteNaming, Accidentals } from '../types'
import { convertAccidentals } from './noteNames'

// ---------------------------------------------------------------------------
// Core logic:
// 1. Root position = bass note IS the chord root → show "G", "C", "Am" etc.
// 2. Inversion = bass note is NOT the root → show "G/B" with inversion label
// 3. Never show slash when playing root position
// ---------------------------------------------------------------------------

function stripMajorSuffix(chord: string): string {
  // "CM" → "C", "GM" → "G" — but keep "Cmaj7", "Cm", etc.
  return chord.replace(/^([A-G][b#]?)M$/, '$1')
}

const WEIRD = ['m#5', 'aug', 'No5', 'sus2add', 'add#11', 'add#']

function scoreChord(name: string): number {
  let score = name.length  // shorter = better
  if (WEIRD.some(w => name.includes(w))) score += 20
  if (name.includes('/')) score += 5  // slight penalty for slash (prefer root)
  return score
}

function pickBestRoot(matches: string[]): string | null {
  // From all matches, prefer non-slash names (root position)
  const roots = matches.filter(m => !m.includes('/'))
  const all = roots.length > 0 ? roots : matches
  return all.sort((a, b) => scoreChord(a) - scoreChord(b))[0] ?? null
}

function pickBestSlash(matches: string[], bassNote: string): string | null {
  // From all matches, prefer slash notation matching bass
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

// ---------------------------------------------------------------------------
// Basic detection (for playback display — root name only, clean)
// ---------------------------------------------------------------------------
export function detectChord(midiNotes: Set<number>): string | null {
  if (midiNotes.size < 2) return null

  const sorted = Array.from(midiNotes).sort((a, b) => a - b)
  const bassNote = Note.pitchClass(Note.fromMidi(sorted[0]))
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames)
  if (matches.length === 0) return null

  // Find the best ROOT-POSITION name (no slash)
  const rootName = pickBestRoot(matches)
  if (!rootName) return null

  // Check if the chord root matches the bass note
  // If so: show root name only (G, Am, Cmaj7)
  // If not: show slash notation (the bass is different from the root)
  const chordRoot = Note.pitchClass(rootName.match(/^[A-G][b#]?/)?.[0] ?? '')
  
  if (chordRoot === bassNote) {
    return stripMajorSuffix(rootName)
  } else {
    // Bass ≠ root → this IS an inversion, show slash
    const slashName = pickBestSlash(matches, bassNote)
    return stripMajorSuffix(slashName ?? rootName)
  }
}

// ---------------------------------------------------------------------------
// Detection with inversion label (for locked chord display)
// ---------------------------------------------------------------------------
const INV_LABELS = ['root', '1st inv', '2nd inv', '3rd inv']

export function detectChordWithInversion(midiNotes: Set<number>): { name: string; invLabel: string } | null {
  if (midiNotes.size < 2) return null

  const sorted = Array.from(midiNotes).sort((a, b) => a - b)
  const bassNote = Note.pitchClass(Note.fromMidi(sorted[0]))
  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  if (noteNames.length < 2) return null

  const matches = detect(noteNames)
  if (matches.length === 0) return null

  const rootName = pickBestRoot(matches)
  if (!rootName) return null

  const chordRoot = Note.pitchClass(rootName.match(/^[A-G][b#]?/)?.[0] ?? '')
  const cleanRoot = stripMajorSuffix(rootName)

  if (chordRoot === bassNote) {
    // Root position — show clean name, no inversion label
    return { name: cleanRoot, invLabel: '' }
  }

  // Inversion — figure out which one
  const slashName = pickBestSlash(matches, bassNote) ?? rootName
  const cleanSlash = stripMajorSuffix(slashName)

  // Get the chord tones to find inversion number
  const { notes: chordTones } = Chord.get(cleanRoot)
  const invIdx = chordTones.findIndex(n => Note.pitchClass(n) === bassNote)
  const invLabel = invIdx > 0 ? INV_LABELS[invIdx] ?? 'inv' : ''

  return { name: cleanSlash, invLabel }
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

  // ── Localise chord name to user's accidental + naming preferences ───────────
  // Step 1: convert accidentals. convertAccidentals normalises A# → Bb (PC 10
  // always spelled as Bb regardless of sharp/flat mode — see noteNames.ts).
  let result = convertAccidentals(chord, accidentals)

  // Step 2: apply note naming system
  if (naming === 'central-european') {
    // In CE system: Bb = B, B natural = H
    result = result
      .replace(/Bb/g, 'B')
      .replace(/B(?!b)/g, 'H')
    return result
  }

  if (naming === 'solfege') {
    // Map the root note to solfège — longest match first to avoid partial hits
    const sharpMap: Record<string, string> = {
      'Do#': 'Do#', 'Re#': 'Re#', 'Fa#': 'Fa#', 'Sol#': 'Sol#', 'La#': 'La#', // already correct if sharps
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
