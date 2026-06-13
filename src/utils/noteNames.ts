import type { NoteNaming } from '../types'

const ENGLISH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// German/Central European: B♭ = B, B natural = H
const CENTRAL_EU = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B', 'H']

const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

/** Returns just the note name (no octave) for a MIDI pitch, in the chosen system */
export function getNoteName(midi: number, naming: NoteNaming): string {
  if (naming === 'hidden') return ''
  const note = midi % 12
  switch (naming) {
    case 'central-european': return CENTRAL_EU[note]
    case 'solfege': return SOLFEGE[note]
    default: return ENGLISH[note]
  }
}

/** Returns note name + octave for labels (e.g. "C4", "H3") */
export function getNoteLabel(midi: number, naming: NoteNaming): string {
  if (naming === 'hidden') return ''
  const octave = Math.floor(midi / 12) - 1
  return getNoteName(midi, naming) + octave
}

/** Formats a chord name using the chosen note naming system */
export function localizeChordName(chord: string, naming: NoteNaming): string {
  if (naming === 'english' || naming === 'hidden' || naming === 'solfege') return chord

  // Replace B (natural) with H in chord names for Central European display
  // Order matters: replace B# first, then B
  return chord
    .replace(/B#/g, 'H#')
    .replace(/Bb/g, 'B')   // B-flat stays as B in Central European
    .replace(/(?<![A-Z])B(?!b|#)/g, 'H')  // B natural → H
}
