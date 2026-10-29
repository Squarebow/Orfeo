// ── explorerShared ───────────────────────────────────────────────────────────
// Music logic the Chord Explorer and the Scales Explorer must share exactly:
// the progression list (+ rotations), how a progression step becomes a chord,
// playback speeds, the keyboard range and starting register, the octave
// shift, inversion stepping and how a clicked chord rings. Both explorers
// import from here so a change to any of it lands in both at once.

import type { CSSProperties } from 'react'
import { Music2, TrendingUp, Spline } from 'lucide-react'
import { getGenreVoicing, isTritoneSub, TRITONE_SUB_CHORD, type Genre } from './genreVoicing'
import { ALL_CHORDS, resolveChord, type ChordInfo } from './chordVocabulary'
import { humanizeChord, type ProgressionVoicing, type VoicingRange } from './voiceLeading'

// ── Explorer keyboard range — both explorers play on the 61-key layout ──────
export const EXPLORER_RANGE: VoicingRange = { min: 36, max: 96 }

// ── Starting register: roots land in C3–B3, moved by whole octaves ──────────
const EXPLORER_BASE_MIDI = 48
export const EXPLORER_OCTAVE_MIN = -1
export const EXPLORER_OCTAVE_MAX = 2
export function explorerLowRoot(octave: number): number {
  return EXPLORER_BASE_MIDI + 12 * octave
}

// ── The "switch to the other Explorer" button — the same in both: dashed
// amber border, dim text that turns amber on hover. ─────────────────────
export const EXPLORER_SWITCH_STYLE: CSSProperties = {
  background: 'none', border: '1px dashed var(--text-amber)', borderRadius: 4, cursor: 'pointer',
  color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 3,
}

// ── Progression playback speeds (ms per chord) ──────────────────────────────
export type ProgSpeed = 'slow' | 'med' | 'fast'
export const SPEED_MS: Record<ProgSpeed, number> = { slow: 1500, med: 800, fast: 400 }

// ── Voicing mode → toolbar icon ─────────────────────────────────────────────
export const VOICING_ICON: Record<ProgressionVoicing, typeof Music2> = {
  roots: Music2, climbing: TrendingUp, smooth: Spline,
}

// ── Progressions ordered by name-family: Pop cluster → Rock cluster →
//    Jazz cluster → exotic/uniquely-named progressions ────────────────────
export interface Progression {
  name: string
  labels: string[]
  offsets: number[]
  isRotation?: true
  baseName?: string
}

export const PROGRESSIONS: Progression[] = [
  { name: 'Pop',               labels: ['I','V','vi','IV'],                    offsets: [0,7,9,5] },
  { name: 'Pop/Rock Inv.',     labels: ['vi','IV','I','V'],                    offsets: [9,5,0,7] },
  { name: 'Energetic Pop',     labels: ['I','IV','vi','V'],                    offsets: [0,5,9,7] },
  { name: 'Minor Pop',         labels: ['i','VI','III','VII'],                 offsets: [0,8,3,10] },
  { name: 'Doo-Wop',           labels: ['I','vi','IV','V'],                    offsets: [0,9,5,7] },
  { name: 'Rock · Blues',      labels: ['I','IV','V'],                         offsets: [0,5,7] },
  { name: 'Mixolydian Rock',   labels: ['I','bVII','IV'],                      offsets: [0,10,5] },
  { name: 'Grunge · Modal',    labels: ['I','bIII','IV'],                      offsets: [0,3,5] },
  { name: 'Minor Blues',       labels: ['i','iv','v'],                         offsets: [0,5,7] },
  { name: 'Jazz Standard',     labels: ['ii','V','I'],                         offsets: [2,7,0] },
  { name: 'Minor Jazz',        labels: ['ii°','V','i'],                        offsets: [2,7,0] },
  { name: 'Andalusian',        labels: ['i','VII','VI','V'],                   offsets: [0,10,8,7] },
  { name: 'Pachelbel',         labels: ['I','V','vi','iii','IV','I','IV','V'], offsets: [0,7,9,4,5,0,5,7] },
  { name: 'Circle of Fifths',  labels: ['vi','ii','V','I'],                    offsets: [9,2,7,0] },
  { name: 'Royal Road',        labels: ['IV','V','iii','vi'],                  offsets: [5,7,4,9] },
  { name: 'Epic · Heroic',     labels: ['VI','VII','i'],                       offsets: [8,10,0] },
  { name: 'Sentimental',       labels: ['IV','V','I','vi'],                    offsets: [5,7,0,9] },
  { name: 'Sad · Hopeful',     labels: ['I','vi','iii','IV'],                  offsets: [0,9,4,5] },
  { name: 'Plagal Turnaround', labels: ['I','IV','I','V'],                     offsets: [0,5,0,7] },
  { name: 'Step-Down',         labels: ['i','v','IV','bIII'],                  offsets: [0,7,5,3] },
]

// ── Pure helper: cyclic shift of a progression by `offset` steps ─────────
function rotateProgression(base: Progression, offset: number): Progression {
  return {
    name: `${base.name} (${base.labels[offset]} start)`,
    labels: [...base.labels.slice(offset), ...base.labels.slice(0, offset)],
    offsets: [...base.offsets.slice(offset), ...base.offsets.slice(0, offset)],
    isRotation: true,
    baseName: base.name,
  }
}

// ── Flat list of base progressions + their deduplicated rotations ─────────
// Two skip rules per rotation candidate:
//   (a) start label already appears earlier in the same base — avoids
//       ambiguous names (e.g. two "V start" under Pachelbel) and musically
//       near-duplicate rotations for progressions with internal repetition.
//   (b) offset sequence already in the seen-set — avoids emitting the same
//       cyclic pattern twice when different bases share offsets (Jazz Standard
//       / Minor Jazz, Rock·Blues / Minor Blues) or when one base IS a rotation
//       of another (Pop/Rock Inv., Sentimental).
function buildAllProgressions(): Progression[] {
  const result: Progression[] = []
  const seen = new Set(PROGRESSIONS.map(p => p.offsets.join(',')))
  for (const base of PROGRESSIONS) {
    result.push(base)
    for (let offset = 1; offset < base.offsets.length; offset++) {
      if (base.labels.indexOf(base.labels[offset]) < offset) continue
      const rot = rotateProgression(base, offset)
      const key = rot.offsets.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      result.push(rot)
    }
  }
  return result
}

export const ALL_PROGRESSIONS = buildAllProgressions()

// ── One progression step → the chord it names ────────────────────────────
// The step's root is the key's tonic moved by the step's semitone offset, and
// its quality comes from the numeral exactly as written — uppercase major,
// lowercase minor, ° diminished — so I–bVII–IV plays C–B♭–F in C, and a
// major progression stays major whichever scale is selected. A style other
// than Classic swaps in its own richer chord for that numeral; Ipanema also
// swaps a V resolving down a fifth for its tritone substitute (♭II7♯11).
export function resolveProgressionStep(
  prog: Progression,
  step: number,
  keyRoot: number,
  genre: Genre = 'classic',
): { rootPc: number; label: string; info: ChordInfo } | null {
  const label = prog.labels[step]
  let offset = prog.offsets[step]
  if (label === undefined || offset === undefined) return null
  let typeKey = getGenreVoicing(genre, label)
  if (isTritoneSub(genre, label, offset, prog.offsets[(step + 1) % prog.offsets.length])) {
    offset += 6
    typeKey = TRITONE_SUB_CHORD
  }
  // Curated tile chords first; a style's rarer chord (7♭9♭13) from the full dictionary.
  const info = ALL_CHORDS.find(c => c.key === typeKey) ?? resolveChord(typeKey)
  if (!info) return null
  return { rootPc: (((keyRoot + offset) % 12) + 12) % 12, label, info }
}

// ── Inversion stepping — rotate the live chord up or down one voicing ──────
// Operates on the lit keys so inversions accumulate across octaves rather
// than wrapping at chord length.
export function nextInversionSet(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}
export function prevInversionSet(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  return new Set([highest - 12, ...sorted.slice(0, -1)])
}

// ── A clicked chord (tile or inversion step) — struck together and left to
// ring like a held sustain pedal, rather than a short stab. ────────────────
const CLICK_RING_MS = 2600
const CLICK_VELOCITY = 0.72
export function ringChord(notes: number[]): void {
  const playNote = (window as any).__orfeoPlayNote
  if (playNote) notes.forEach(m => playNote(m, CLICK_VELOCITY, CLICK_RING_MS, undefined, false))
}

// ── Shift lit keys by whole octaves when the octave control moves — keeps
// the current inversion; skipped if it would run off the keyboard. ─────────
export function shiftNotesByOctaves(notes: number[], delta: number): number[] | null {
  const shifted = notes.map(m => m + 12 * delta)
  if (shifted.some(m => m < EXPLORER_RANGE.min || m > EXPLORER_RANGE.max)) return null
  return shifted
}

// ── Inversion reset (↺ beside the inversion arrows) — the chord's shape
// before the first arrow press, so ↺ puts it back after any number of steps,
// even if the Octave control has moved it since. Cleared whenever a new chord
// is struck. ──────────────────────────────────────────────────────────────
export interface StruckShape { notes: number[]; invCount: number; octave: number }

export function captureStruckShape(prev: StruckShape | null, lit: Iterable<number>, invCount: number, octave: number): StruckShape {
  return prev ?? { notes: Array.from(lit).sort((a, b) => a - b), invCount, octave }
}

export function restoreStruckShape(shape: StruckShape, octaveNow: number): number[] | null {
  return shiftNotesByOctaves(shape.notes, octaveNow - shape.octave)
}

// ── One step of a running sequence (progression or chords-in-the-scale) —
// rolled bottom-up with a slight velocity spread, ringing a touch past the
// next step for legato. Notes still queued are dropped if playback stops. ──
export function strikeStep(notes: number[], durMs: number, stillRunning: () => boolean): void {
  const playNote = (window as any).__orfeoPlayNote
  if (!playNote) return
  for (const h of humanizeChord(notes)) {
    setTimeout(() => { if (stillRunning()) playNote(h.midi, h.vel, durMs, undefined, false) }, h.delayMs)
  }
}

// ── Which inversion a voicing is — the bass note's place in the chord's
// root-position stack (0 = root in the bass) — fed to the keyboard's chord
// display so it shows the right slash bass and inversion number. ──────────
export function inversionOf(rootPc: number, semis: number[], voicing: number[]): number {
  if (voicing.length === 0) return 0
  const bassPc = Math.min(...voicing) % 12
  const tones = semis.map(s => (rootPc + s) % 12)
  return Math.max(0, tones.indexOf(bassPc))
}

// ── Key colours for a lit chord — amber, with the chord's own root (any
// octave) in pink when "Accent root note" is on. One rule for every chord
// both explorers light, in every voicing mode. ─────────────────────────────
export function explorerKeyColors(notes: number[], rootPc: number | null, accentRoot: boolean): Map<number, string> {
  return new Map(notes.map(m => [
    m,
    accentRoot && rootPc !== null && ((m % 12) + 12) % 12 === rootPc ? 'var(--accent-root)' : 'var(--text-amber)',
  ] as const))
}
