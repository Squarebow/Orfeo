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
import { detectChordStructured, inversionForKnownChord, localizeChord, ordinalSuffix } from './chordDetection'
import { getNoteName } from './noteNames'
import type { NoteNaming, Accidentals, ChordNamingStyle } from '../types'

/** A remembered Explorer position, kept inside the app window: it may be smaller
 *  now than when the Explorer was last moved */
export function explorerPosInWindow(p: { x: number; y: number }, width: number, height: number, minTop: number) {
  return {
    x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - width)),
    y: Math.min(Math.max(minTop, p.y), Math.max(minTop, window.innerHeight - height)),
  }
}

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

// ── Listening to your keyboard ───────────────────────────────────────────────
// Both Explorers follow what you play on a connected keyboard, by one rule: hold
// three or more different notes and, a moment after the last one goes down, the
// Explorers read them. The Chord Explorer names and selects the chord; the
// Scales Explorer lists the scales those notes fit. Letting keys go changes
// nothing, so the reading stays on screen after you release. ───────────────────
export const PLAYED_MIN_NOTES = 3
export const PLAYED_SETTLE_MS = 120

export interface PlayedNotes {
  notes: number[]          // the keys held, low to high
  pcs: number[]            // their pitch classes, each once
  chord: { rootPitchClass: number; intervals: string[]; rawRootName: string } | null
  invCount: number         // 0 root position, 1 first inversion…
}

/** What a set of held keys is, or null for fewer than three different notes */
export function readPlayedNotes(held: Iterable<number>): PlayedNotes | null {
  const notes = Array.from(new Set(held)).sort((a, b) => a - b)
  const pcs = Array.from(new Set(notes.map(m => ((m % 12) + 12) % 12)))
  if (pcs.length < PLAYED_MIN_NOTES) return null
  const chord = detectChordStructured(new Set(notes))
  const inv = chord ? inversionForKnownChord(chord.rootPitchClass, chord.intervals, notes[0]) : null
  return { notes, pcs, chord, invCount: inv?.ordinal ? Number(inv.ordinal) : 0 }
}

/** How both Explorers write what you played: the chord as voiced (a slash and the
 *  bass note when it isn't in root position), the inversion ("1st inv"), and the
 *  held notes low to high. No chord name when the notes don't make a chord. */
export function playedLabel(
  p: PlayedNotes, naming: NoteNaming, accidentals: Accidentals, style: ChordNamingStyle,
): { chord: string | null; inversion: string; notes: string } {
  const names: NoteNaming = naming === 'hidden' ? 'english' : naming
  const notes = p.notes.map(m => getNoteName(m, names, accidentals)).join(' ')
  const base = p.chord ? localizeChord(p.chord.rawRootName, names, accidentals, style) : null
  if (!base) return { chord: null, inversion: '', notes }
  if (p.invCount === 0) return { chord: base, inversion: '', notes }
  return { chord: `${base}/${getNoteName(p.notes[0], names, accidentals)}`, inversion: `${p.invCount}${ordinalSuffix(p.invCount)} inv`, notes }
}

/** A fresh reading is due only when a key went down: letting go of keys one by
 *  one must not re-read the notes still held as a different chord */
export function keyWentDown(prev: ReadonlySet<number>, next: ReadonlySet<number>): boolean {
  for (const m of next) if (!prev.has(m)) return true
  return false
}

// steps round the circle of fifths between two keys, 0–6
const fifthsApart = (a: number, b: number) => {
  const d = (((b - a) % 12) + 12) % 12
  for (let k = 0; k <= 6; k++) if ((7 * k) % 12 === d || (12 - (7 * k) % 12) % 12 === d) return k
  return 6
}

/** The scales the played notes fit, most likely first. Major and natural minor
 *  keys come first, then keys starting on the chord's root, then the nearest keys
 *  on the circle of fifths (a minor key counts from its relative major, so C major
 *  and A minor sit together). Each scale: its intervals and whether it's minor. */
export function scalesThatFit(
  pcs: number[], chordRootPc: number | null,
  scales: { intervals: number[]; minor: boolean }[], limit = 4,
): { rootPc: number; scaleIdx: number }[] {
  const ref = chordRootPc ?? pcs[0]
  const found: { rootPc: number; scaleIdx: number; score: number; dist: number }[] = []
  scales.forEach((s, scaleIdx) => {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const inScale = new Set(s.intervals.map(iv => (rootPc + iv) % 12))
      if (!pcs.every(pc => inScale.has(pc))) continue
      const main = scaleIdx <= 1 ? 10 : 0                   // Major, Natural Minor
      const onRoot = rootPc === chordRootPc ? 6 : 0
      const keyOf = s.minor ? (rootPc + 3) % 12 : rootPc    // the major key with the same signature
      found.push({ rootPc, scaleIdx, score: main + onRoot, dist: fifthsApart(ref, keyOf) })
    }
  })
  found.sort((a, b) => b.score - a.score || a.dist - b.dist || a.scaleIdx - b.scaleIdx)
  return found.slice(0, limit).map(({ rootPc, scaleIdx }) => ({ rootPc, scaleIdx }))
}
