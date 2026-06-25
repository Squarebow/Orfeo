import type { NoteNaming, Accidentals } from '../types'

const ENGLISH_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const ENGLISH_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Central European: B♭ = B, B natural = H
const CENTRAL_EU_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B',  'H']
const CENTRAL_EU_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'B',  'H']

const SOLFEGE_SHARP = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
const SOLFEGE_FLAT  = ['Do', 'Reb', 'Re', 'Mib', 'Mi', 'Fa', 'Solb', 'Sol', 'Lab', 'La', 'Sib', 'Si']

/** Returns just the note name (no octave) for a MIDI pitch, in the chosen system + accidental style */
export function getNoteName(midi: number, naming: NoteNaming, accidentals: Accidentals = 'flat'): string {
  if (naming === 'hidden') return ''
  const note = midi % 12
  const useSharp = accidentals === 'sharp'
  switch (naming) {
    case 'central-european': return useSharp ? CENTRAL_EU_SHARP[note] : CENTRAL_EU_FLAT[note]
    case 'solfege':          return useSharp ? SOLFEGE_SHARP[note]    : SOLFEGE_FLAT[note]
    default:                 return useSharp ? ENGLISH_SHARP[note]    : ENGLISH_FLAT[note]
  }
}

/** Returns note name + octave for labels (e.g. "C4", "H3") */
export function getNoteLabel(midi: number, naming: NoteNaming, accidentals: Accidentals = 'flat'): string {
  if (naming === 'hidden') return ''
  const octave = Math.floor(midi / 12) - 1
  return getNoteName(midi, naming, accidentals) + octave
}

// Enharmonic equivalents: flat → sharp mapping for chord/key name conversion
const FLAT_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
  // Central European
  'B': 'A#',
}
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
}

/**
 * Converts accidentals in a chord or key name string.
 * e.g. "Bb" → "A#" when switching to sharp; "C#m" → "Dbm" when switching to flat.
 * Works on any string containing note names (chord names, key names, etc.)
 */
export function convertAccidentals(name: string, accidentals: Accidentals): string {
  if (!name || name === '—') return name

  if (accidentals === 'sharp') {
    // Replace flat names with sharp equivalents (longest match first to avoid partial matches)
    return name
      .replace(/Bb/g, 'A#')
      .replace(/Eb/g, 'D#')
      .replace(/Ab/g, 'G#')
      .replace(/Db/g, 'C#')
      .replace(/Gb/g, 'F#')
      // Central European: B (= Bb) → A# when using sharps
      .replace(/(?<=[^A-GH])B(?!b|#|[a-z])|^B(?!b|#|[a-z])/g, 'A#')
  } else {
    // Replace sharp names with flat equivalents
    return name
      .replace(/A#/g, 'Bb')
      .replace(/D#/g, 'Eb')
      .replace(/G#/g, 'Ab')
      .replace(/C#/g, 'Db')
      .replace(/F#/g, 'Gb')
  }
}

/** Formats a chord name using the chosen note naming system */
export function localizeChordName(chord: string, naming: NoteNaming): string {
  if (naming === 'english' || naming === 'hidden' || naming === 'solfege') return chord

  // Replace B (natural) with H in chord names for Central European display
  return chord
    .replace(/B#/g, 'H#')
    .replace(/Bb/g, 'B')   // B-flat stays as B in Central European
    .replace(/(?<![A-Z])B(?!b|#)/g, 'H')  // B natural → H
}
