import { Chord, Note } from 'tonal'
import type { NoteNaming } from '../types'

// ---------------------------------------------------------------------------
// Real-time chord detection from a set of active MIDI note numbers
// Uses tonal.js for accurate chord naming
// ---------------------------------------------------------------------------

export function detectChord(midiNotes: Set<number>): string | null {
  if (midiNotes.size < 2) return null

  // Convert MIDI numbers to note names (pitch class only, no octave)
  const noteNames = Array.from(midiNotes)
    .sort((a, b) => a - b)
    .map(m => Note.fromMidi(m))
    .filter(Boolean) as string[]

  if (noteNames.length < 2) return null

  // Try to detect chord — tonal returns array of possible matches
  const matches = Chord.detect(noteNames)
  if (matches.length === 0) return null

  return matches[0] // best match first
}

// Localize chord name to the user's note naming system
// e.g. "Bm7" → "Hm7" in Central European
export function localizeChord(chord: string | null, naming: NoteNaming): string | null {
  if (!chord || naming === 'english') return chord
  if (naming === 'hidden') return null

  if (naming === 'central-european') {
    // Replace standalone B with H, and Bb with B
    // Must be careful about order: do Bb→B first, then B→H
    return chord
      .replace(/Bb/g, 'B')
      .replace(/B(?!b)/g, 'H')
  }

  if (naming === 'solfege') {
    const map: Record<string, string> = {
      'C': 'Do', 'C#': 'Do#', 'Db': 'Do#',
      'D': 'Re', 'D#': 'Re#', 'Eb': 'Re#',
      'E': 'Mi', 'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Fa#',
      'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Sol#',
      'A': 'La', 'A#': 'La#', 'Bb': 'La#',
      'B': 'Si',
    }
    // Replace root note at start of chord name
    for (const [eng, solf] of Object.entries(map)) {
      if (chord.startsWith(eng)) {
        return solf + chord.slice(eng.length)
      }
    }
  }

  return chord
}