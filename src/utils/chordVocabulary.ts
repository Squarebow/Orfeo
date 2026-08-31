import { Chord, ChordType, Interval } from 'tonal'

// ── Curated chord-type catalog — the single source of truth shared by the
// Chord Explorer's tile set, the live sequence detector's template matcher,
// and chordDetection's "prefer a common name" filter. Moved here from
// ChordExplorer.tsx (2026-08-31) so the sequence builder can reuse it
// without importing a React component. ───────────────────────────────────

const COMMON_TYPES = [
  'major', 'minor', 'maj7', 'm7', '7', '6', 'm6',
  'dim', 'aug', 'sus2', 'sus4', '7sus4',
  'mM7', 'maj9', 'm9', '9',
  'm11', '11', 'maj13', 'm13',
]

const EXTENDED_ADD = [
  '13', 'dim7', 'half-diminished', 'maj7#5', '7#5',
  'M7#11', '7#11', '7b9', '7#9',
  'm7b5', '6/9', 'm69', '9sus4',
  '7b5', 'mM9', 'Madd9', 'madd9',
  'M7b6', 'alt7', '7b9#11', '13b9',
  '7b13', '13#11', 'maj9#11', '9#11',
  'Mb5',
]

// Curated catalog KEY → raw tonal-style suffix, for the handful whose key
// isn't already a valid raw suffix. Everything else's key IS a valid raw
// suffix; formatChordSuffix (chordDetection.ts) handles display styling.
const KEY_TO_RAW_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'half-diminished': 'm7b5', 'alt7': 'alt',
}

export interface ChordInfo {
  key: string
  name: string
  intervals: string[]
  suffix: string
  aliases: string[]
}

export function resolveChord(key: string): ChordInfo | null {
  const ct = ChordType.get(key)
  if (!ct || !ct.intervals || ct.intervals.length < 2) return null
  return {
    key,
    name: ct.name || key,
    intervals: ct.intervals,
    suffix: KEY_TO_RAW_SUFFIX[key] ?? key,
    aliases: ct.aliases || [],
  }
}

export const COMMON_CHORDS = COMMON_TYPES
  .map(resolveChord).filter((c): c is ChordInfo => c !== null)
export const ALL_CHORDS = [
  ...COMMON_CHORDS,
  ...EXTENDED_ADD.map(resolveChord).filter((c): c is ChordInfo => c !== null),
]
export const CURATED_KEYS = new Set(ALL_CHORDS.map(c => c.key))
export const FULL_CHORD_TYPES = ChordType.all()
  .filter(ct => ct.aliases.length > 0 && !CURATED_KEYS.has(ct.aliases[0]))
  .map(ct => resolveChord(ct.aliases[0]))
  .filter((c): c is ChordInfo => c !== null)

// ── isCuratedChordName ───────────────────────────────────────────────────
// Every alias + symbol of every curated type. detect() keeps a match only
// if its quality token is in here (or is the bare major triad).
const CURATED_CHORD_ALIASES = new Set<string>(['', 'M'])
for (const info of ALL_CHORDS) {
  const ct = ChordType.get(info.key)
  for (const a of ct.aliases ?? []) CURATED_CHORD_ALIASES.add(a)
  // tonal's ChordType carries no `symbol` field (only Chord instances do);
  // its `aliases` already include the symbol form (e.g. 'maj7' → 'M7', 'Δ').
}

const CHORD_TYPE_TOKEN = /^[A-G][b#]?(.*?)(?:\/[A-G][b#]?)?$/

export function isCuratedChordName(name: string): boolean {
  const m = name.match(CHORD_TYPE_TOKEN)
  if (!m) return false
  const token = m[1]
  return token === '' || token === 'M' || CURATED_CHORD_ALIASES.has(token)
}

// ── CHORD_TEMPLATES ──────────────────────────────────────────────────────
// Pitch-class templates for the live sequence matcher (chordSequenceBuilder).
// Ordered simplest-first; `complexity` is subtracted (× a weight) from the
// match score so a plain triad wins unless an extension carries real energy.
type Template = { suffix: string; pcs: number[]; tonalIntervals: string[]; complexity: number }

const TEMPLATE_SPEC: { suffix: string; complexity: number }[] = [
  { suffix: '',      complexity: 0 },
  { suffix: 'm',     complexity: 0 },
  { suffix: 'dim',   complexity: 0.4 },
  { suffix: 'aug',   complexity: 0.5 },
  { suffix: '7',     complexity: 0.5 },
  { suffix: 'm7',    complexity: 0.5 },
  { suffix: 'maj7',  complexity: 0.7 },
  { suffix: '6',     complexity: 0.8 },
  { suffix: 'm6',    complexity: 0.9 },
  { suffix: 'm7b5',  complexity: 0.9 },
  { suffix: 'dim7',  complexity: 1.0 },
  { suffix: 'sus4',  complexity: 0.7 },
  { suffix: 'sus2',  complexity: 0.8 },
  { suffix: '7sus4', complexity: 1.0 },
  { suffix: 'add9',  complexity: 1.1 },
  { suffix: 'madd9', complexity: 1.1 },
  { suffix: '9',     complexity: 1.3 },
  { suffix: 'maj9',  complexity: 1.4 },
  { suffix: 'm9',    complexity: 1.4 },
  { suffix: '6/9',   complexity: 1.4 },
]

export const CHORD_TEMPLATES: ReadonlyArray<Template> = TEMPLATE_SPEC
  .map(({ suffix, complexity }) => {
    const ct = Chord.get('C' + suffix)
    if (!ct.intervals || ct.intervals.length < 3) return null
    const pcs = ct.intervals
      .map(iv => { const s = Interval.semitones(iv); return s === null ? null : ((s % 12) + 12) % 12 })
      .filter((n): n is number => n !== null)
    return {
      suffix,
      pcs: [...new Set(pcs)],          // unique pitch classes, root first
      tonalIntervals: [...ct.intervals], // verbatim, for buildCompactVoicing
      complexity,
    }
  })
  .filter((t): t is Template => t !== null)
