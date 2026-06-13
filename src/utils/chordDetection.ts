import { Chord, Note } from 'tonal'
import type { DetectedChord, NoteNamingSystem } from '@/types'

/**
 * Detect chord from a set of active MIDI note numbers
 * Returns null if fewer than 2 notes or no chord match
 */
export function detectChord(
  midiNotes: number[],
  system: NoteNamingSystem = 'english'
): DetectedChord | null {
  if (midiNotes.length < 2) return null

  // Convert MIDI numbers to note names (tonal uses English internally)
  const noteNames = midiNotes.map(midi => {
    const name = Note.fromMidi(midi)
    return Note.pitchClass(name) // e.g. "C", "F#"
  })

  // Remove duplicates (same pitch class)
  const unique = [...new Set(noteNames)]

  // Try to detect chord
  const detected = Chord.detect(unique)
  if (!detected || detected.length === 0) return null

  const chordName = detected[0]
  const chord = Chord.get(chordName)

  return {
    name: translateChordName(chordName, system),
    root: translateNote(chord.tonic ?? '', system),
    quality: chord.aliases[0] ?? '',
    notes: midiNotes.sort((a, b) => a - b),
    inversion: 0, // TODO: detect inversion from bass note
  }
}

/**
 * Translate an English chord name to the selected naming system
 * e.g. "Bm7" → "Hm7" in Central European system
 */
export function translateChordName(name: string, system: NoteNamingSystem): string {
  if (system === 'english' || system === 'hidden') return name

  if (system === 'central-european') {
    // B natural → H, Bb → B
    return name
      .replace(/^Bb/, 'B')   // Bb chord → B chord
      .replace(/^B(?!b)/, 'H') // B chord → H chord
  }

  if (system === 'solfege') {
    const map: Record<string, string> = {
      'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa',
      'G': 'Sol', 'A': 'La', 'B': 'Si',
      'C#': 'Do#', 'D#': 'Re#', 'F#': 'Fa#', 'G#': 'Sol#', 'A#': 'La#',
      'Db': 'Reb', 'Eb': 'Mib', 'Gb': 'Solb', 'Ab': 'Lab', 'Bb': 'Sib',
    }
    const match = name.match(/^([A-G][b#]?)(.*)$/)
    if (!match) return name
    const [, root, quality] = match
    return (map[root] ?? root) + quality
  }

  return name
}

/**
 * Translate a single note name
 */
export function translateNote(note: string, system: NoteNamingSystem): string {
  if (!note) return ''
  return translateChordName(note, system)
}
