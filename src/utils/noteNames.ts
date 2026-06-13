import type { NoteNamingSystem } from '@/types'

// MIDI note 0 = C-1, 60 = Middle C (C4)
const CHROMATIC_INDEX = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

const NOTE_NAMES: Record<NoteNamingSystem, string[]> = {
  'english': [
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
  ],
  'central-european': [
    // In German/Slovenian/Croatian system: B natural = H, B♭ = B
    'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B', 'H'
  ],
  'solfege': [
    'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'
  ],
  'hidden': Array(12).fill('')
}

// Flat variants for display
const NOTE_NAMES_FLAT: Record<NoteNamingSystem, string[]> = {
  'english': [
    'C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'
  ],
  'central-european': [
    'C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'
  ],
  'solfege': [
    'Do', 'Re♭', 'Re', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'
  ],
  'hidden': Array(12).fill('')
}

/**
 * Get the display name of a MIDI note number
 * @param midi - MIDI note number (0-127)
 * @param system - note naming system
 * @param useSharps - use sharps (true) or flats (false)
 * @param includeOctave - append octave number
 */
export function getNoteName(
  midi: number,
  system: NoteNamingSystem,
  useSharps = true,
  includeOctave = false
): string {
  if (system === 'hidden') return ''

  const octave = Math.floor(midi / 12) - 1
  const index = midi % 12
  const names = useSharps ? NOTE_NAMES[system] : NOTE_NAMES_FLAT[system]
  const name = names[index]

  return includeOctave ? `${name}${octave}` : name
}

/**
 * Check if a MIDI note is a black key
 */
export function isBlackKey(midi: number): boolean {
  const index = midi % 12
  return [1, 3, 6, 8, 10].includes(index)
}

/**
 * Get the label shown ON the piano key (only for white keys, only C and F typically)
 */
export function getKeyLabel(
  midi: number,
  system: NoteNamingSystem,
  showAll = false
): string {
  if (system === 'hidden') return ''
  if (isBlackKey(midi)) return ''

  const index = midi % 12
  // By default, only label C notes (and optionally all white keys)
  if (!showAll && index !== 0) return ''

  return getNoteName(midi, system, true, index === 0) // include octave only for C
}

/**
 * Convert a note name string to a MIDI number (middle C = 60)
 * Supports English and Central European naming
 */
export function noteNameToMidi(name: string, octave: number): number {
  const normalized = name.toUpperCase()
    .replace('♭', 'b')
    .replace('♯', '#')

  const map: Record<string, number> = {
    'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3,
    'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8,
    'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 10, // B = Bb in CE system
    'H': 11, // Central European B natural
  }

  const chromatic = map[normalized]
  if (chromatic === undefined) return -1
  return (octave + 1) * 12 + chromatic
}

export { NOTE_NAMES, NOTE_NAMES_FLAT, CHROMATIC_INDEX }
