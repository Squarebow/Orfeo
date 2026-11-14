import type { NoteNaming, Accidentals, SargamScript } from '../types'
import type { DetectedKey } from './keyDetection'

// ── Note name lookup tables ──────────────────────────────────────────────────
// PC 10 (Bb/A#): always spelled 'Bb' in English — A# is theoretically valid
// but essentially unused in practice (no standard key of A# major).
const ENGLISH_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
const ENGLISH_FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// Central European: B♭ = B, B natural = H — PC 10 is 'B' in both accidental
// modes because the CE system uses B for Bb and H for B♮ regardless of sharps/flats.
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

// ── Sargam (Hindustani, Bhatkhande style), counted up from Sa. Komal is lowercase in
// Latin and underlined (U+0952) in Devanagari; tivra Ma has a mark (′ / U+0951). Sa and
// Pa never change. Confirmed by the player who asked for it (14. 11. 2026).
const SARGAM_LATIN = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'Ma′', 'Pa', 'dha', 'Dha', 'ni', 'Ni']
const SARGAM_DEVANAGARI = ['सा', 'रे॒', 'रे', 'ग॒', 'ग', 'म', 'म॑', 'प', 'ध॒', 'ध', 'नि॒', 'नि']

/** The Sargam name of a MIDI pitch, with Sa on pitch class `sa` (0 = C) */
export function getSargamName(midi: number, sa: number, script: SargamScript): string {
  const step = (((midi - sa) % 12) + 12) % 12
  return (script === 'devanagari' ? SARGAM_DEVANAGARI : SARGAM_LATIN)[step]
}

/** Where Sa sits: set by hand (0–11), or the song's key as heard (transpose included); C with no key */
export function resolveSa(setting: 'auto' | number, key: DetectedKey | null | undefined): number {
  if (setting !== 'auto') return ((setting % 12) + 12) % 12
  if (!key) return 0
  return (((key.semitone + (key.transpose ?? 0)) % 12) + 12) % 12
}

/** A single note's name for the keyboard and piano roll: Sargam when chosen, else the usual name */
export function noteLabelText(midi: number, naming: NoteNaming, accidentals: Accidentals, sargam: { sa: number; script: SargamScript }): string {
  if (naming === 'sargam') return getSargamName(midi, sargam.sa, sargam.script)
  return getNoteName(midi, naming, accidentals)
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
    // ── Sharp mode accidental conversion ────────────────────────────────────
    // PC 10 exception: A# is always normalised to Bb (A# has no standard key).
    // All other black keys use their sharp spelling.
    return name
      .replace(/A#/g, 'Bb')  // normalise any incoming A# (e.g. from tonal) to Bb
      .replace(/Eb/g, 'D#')
      .replace(/Ab/g, 'G#')
      .replace(/Db/g, 'C#')
      .replace(/Gb/g, 'F#')
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
