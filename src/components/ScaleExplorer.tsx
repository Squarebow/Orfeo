import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { Chord, Note } from 'tonal'
import { RotateCcw, Play, Square, ArrowUpRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { formatChordSuffix, detectChordStructured, localizeChord } from '../utils/chordDetection'
import type { NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import SpeedControl from './SpeedControl'
import OrfeoMark from './OrfeoMark'
import ChevronPlayIcon from './ChevronPlayIcon'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { getKeyboardHeaderTop } from '../utils/modalAnchors'
import { useAnchorBottomOnResize } from '../hooks/useAnchorBottomOnResize'
import { useClampPositionOnZoom } from '../hooks/useClampPositionOnZoom'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import Tooltip from './Tooltip'
import {
  nextVoicing, voiceProgression, semisFromMidi, intervalsToSemis,
  PROGRESSION_VOICINGS, PROGRESSION_VOICING_LABEL, PROGRESSION_VOICING_HINT,
} from '../utils/voiceLeading'
import {
  EXPLORER_RANGE, explorerLowRoot, SPEED_MS, VOICING_ICON, ALL_PROGRESSIONS,
  resolveProgressionStep, nextInversionSet, prevInversionSet, ringChord, strikeStep, inversionOf,
  explorerKeyColors, captureStruckShape, restoreStruckShape, EXPLORER_SWITCH_STYLE, type ProgSpeed, type StruckShape,
} from '../utils/explorerShared'
import { ALL_CHORDS } from '../utils/chordVocabulary'
import ExplorerOctaveControl from './ExplorerOctaveControl'
import CofTitleMark from './CofTitleMark'
import StarmapRing, { type LitChord } from './Starmap/StarmapRing'
import { STAR_MIN_NOTES, STAR_MAX_NOTES, type RingLayout } from '../utils/starmap'
import { t } from '../utils/i18n'

// ── Modal dimensions — explorer area on the left, settings column on the
// right. The modal opens centred on the window with its bottom edge just
// above the keyboard's chord display row (MODAL_HEIGHT is only the first
// guess; the real height is measured once the content is in). ───────────
const LEFT_WIDTH = 770
const SETTINGS_WIDTH = 250
const MODAL_WIDTH = LEFT_WIDTH + SETTINGS_WIDTH
const MODAL_HEIGHT = 700
const ANCHOR_GAP = 6
// ── Floor is 44, not a token-adjacent 8 — the Electron window uses a 40px
// titleBarOverlay (electron/main.ts) where Windows draws its own native
// minimize/maximize/close buttons ON TOP of the page regardless of DOM
// z-index; anything higher put the × under Windows' real maximize button. ──
const MIN_TOP = 44
// ── Circle of Fifths drawing scale — the circle is drawn in a 380-unit
// space and scaled up to fill the explorer area. ──────────────────────────
const COF_SCALE = 1.12
const COF_VIEW = { x: -8, y: -8, w: 396, h: 404 }

const defaultPos = (height: number) => ({
  x: Math.max(0, Math.round(window.innerWidth / 2 - MODAL_WIDTH / 2)),
  y: Math.max(MIN_TOP, Math.round(getKeyboardHeaderTop() - height - ANCHOR_GAP)),
})

// ── Scale definitions ───────────────────────────────────────────────────────
// `chords` (blues scales only): the tiles are the chords the scale is played
// OVER, not chords stacked from its own notes — stacking every other note of
// a blues scale gives odd results (C–E♭–G reads as Cm in C Major Blues).
interface ScaleDef {
  name: string
  intervals: number[]
  romans: string[]
  chords?: { offset: number; type: string }[]
  // blues scales: the "blue note", semitones above the tonic (Starmap marks it)
  blueNote?: number
}

const SCALES: ScaleDef[] = [
  { name: 'Major',            intervals: [0,2,4,5,7,9,11], romans: ['I','ii','iii','IV','V','vi','vii°'] },
  { name: 'Natural Minor',    intervals: [0,2,3,5,7,8,10], romans: ['i','ii°','III','iv','v','VI','VII'] },
  { name: 'Harmonic Minor',   intervals: [0,2,3,5,7,8,11], romans: ['i','ii°','III+','iv','V','VI','vii°'] },
  { name: 'Melodic Minor',    intervals: [0,2,3,5,7,9,11], romans: ['i','ii','III+','IV','V','vi°','vii°'] },
  { name: 'Major Pentatonic', intervals: [0,2,4,7,9],       romans: ['I','II','III','V','VI'] },
  { name: 'Minor Pentatonic', intervals: [0,3,5,7,10],      romans: ['i','III','IV','v','VII'] },
  { name: 'Major Blues',      intervals: [0,2,3,4,7,9],     romans: ['I7','I6','VI7','I7♯9'], blueNote: 3,
    chords: [{ offset: 0, type: '7' }, { offset: 0, type: '6' }, { offset: 9, type: '7' }, { offset: 0, type: '7#9' }] },
  { name: 'Minor Blues',      intervals: [0,3,5,6,7,10],    romans: ['i7','I7','IV7','V7'], blueNote: 6,
    chords: [{ offset: 0, type: 'm7' }, { offset: 0, type: '7' }, { offset: 5, type: '7' }, { offset: 7, type: '7' }] },
  { name: 'Dorian',           intervals: [0,2,3,5,7,9,10], romans: ['i','ii','III','IV','v','vi°','VII'] },
  { name: 'Phrygian',         intervals: [0,1,3,5,7,8,10], romans: ['i','II','III','iv','v°','VI','VII'] },
  { name: 'Lydian',           intervals: [0,2,4,6,7,9,11], romans: ['I','II','iii','#iv°','V','vi','vii'] },
  { name: 'Mixolydian',       intervals: [0,2,4,5,7,9,10], romans: ['I','ii','iii°','IV','v','vi','VII'] },
]

// ── Minor scale names — used to append 'm' to the Key display ───────────────
const MINOR_SCALES = new Set(['Natural Minor', 'Harmonic Minor', 'Melodic Minor', 'Minor Pentatonic', 'Minor Blues', 'Phrygian'])

// ── Circle of Fifths position tables ────────────────────────────────────────
// 12 positions clockwise from top (C)
const COF_MAJOR_PC  = [0, 7, 2, 9, 4, 11, 6,  1,  8, 3, 10, 5]
const COF_MINOR_PC  = [9, 4,11, 6, 1,  8, 3, 10,  5, 0,  7, 2]
// Key signature: positive = sharps, negative = flats
const COF_KEYSIG    = [0, 1, 2, 3, 4,  5, 6, -5, -4,-3,  -2,-1]

// ── Shared row label style — dim uppercase, used across all control rows ──────
const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--text-dimmest)', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}
// ── Settings column — every setting is one row: its control on the left,
// title and a one-line description right-aligned beside it. ───────────────
const SETTING_DESC: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 10, lineHeight: 1.35,
  color: 'var(--text-dimmest)', opacity: 0.75, textAlign: 'right', userSelect: 'none',
  textWrap: 'balance',
} as React.CSSProperties

// oneLine: the description never wraps (rows whose control changes width
// must keep the same height, or the column jumps).
function SettingRow({ title, desc, oneLine, children }: { title: string; desc: string; oneLine?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'center', columnGap: 12 }}>
      <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center' }}>{children}</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
        <span style={{ ...ROW_LABEL, fontSize: 11, whiteSpace: 'nowrap' }}>{title}</span>
        <span style={oneLine ? { ...SETTING_DESC, whiteSpace: 'nowrap' } : SETTING_DESC}>{desc}</span>
      </div>
    </div>
  )
}


// ── SVG wedge path for CoF rings ─────────────────────────────────────────────
function wedgePath(cx: number, cy: number, r1: number, r2: number, a1Deg: number, a2Deg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180
  const a1 = toRad(a1Deg)
  const a2 = toRad(a2Deg)
  const x1i = cx + r1 * Math.cos(a1), y1i = cy + r1 * Math.sin(a1)
  const x2i = cx + r1 * Math.cos(a2), y2i = cy + r1 * Math.sin(a2)
  const x1o = cx + r2 * Math.cos(a1), y1o = cy + r2 * Math.sin(a1)
  const x2o = cx + r2 * Math.cos(a2), y2o = cy + r2 * Math.sin(a2)
  return [
    `M ${x1i} ${y1i}`,
    `L ${x1o} ${y1o}`,
    `A ${r2} ${r2} 0 0 1 ${x2o} ${y2o}`,
    `L ${x2i} ${y2i}`,
    `A ${r1} ${r1} 0 0 0 ${x1i} ${y1i}`,
    'Z',
  ].join(' ')
}

// ── SVG label position from centre + radius + angle ──────────────────────────
function labelPos(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── Key-signature label placement — equalize the visual gap to the ring ─────
// The accidental string stays screen-aligned (never rotated to face the
// centre), so a fixed anchor radius leaves a different gap at every angle:
// near the horizontal midline the string's *width* eats into the gap, near
// the vertical midline its *height* does — and both grow with symbol count.
// The constants below are the real glyph metrics of ♯/♭ at KEYSIG_FONT_SIZE
// (fitted from the rendered SVG's getBBox() — width scales ~linearly per
// glyph, height maxes out once any symbol is raised). keySigRadius() solves,
// per angle, for the radius that keeps the label's near edge a constant
// KEYSIG_GAP from the ring for every position, 1 through 6 accidentals.
const KEYSIG_FONT_SIZE = 12
const KEYSIG_RAISE = 5
const KEYSIG_GAP = 9
const keySigSharpWidth = (len: number) => 0.516 + 6.484 * len
const keySigFlatWidth  = (len: number) => 5.905 * len
const KEYSIG_BOTTOM_EXTENT = 6
const keySigTopExtent = (len: number) => (len <= 1 ? 9 : 9 + KEYSIG_RAISE)

function keySigRadius(angleDeg: number, sig: string, ringOuterR: number): number {
  if (!sig.length) return ringOuterR
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const halfWidth = (sig[0] === '♯' ? keySigSharpWidth(sig.length) : keySigFlatWidth(sig.length)) / 2
  const halfHeight = Math.sin(rad) > 0 ? keySigTopExtent(sig.length) : KEYSIG_BOTTOM_EXTENT
  const targetDist = ringOuterR + KEYSIG_GAP
  const k = c * halfWidth + s * halfHeight
  return k + Math.sqrt(Math.max(0, k * k - (halfWidth * halfWidth + halfHeight * halfHeight - targetDist * targetDist)))
}

// ── Diatonic chord type ─────────────────────────────────────────────────────
interface DiatonicChord {
  degree: number
  roman: string
  rootPC: number
  midiNotes: number[]
  chordName: string
  suffix: string
  noteCount: number
  // ── Name without the slash bass + which inversion the tile's voicing is
  // (0 for every 7-note scale; pentatonic stacks are often inverted, e.g.
  // C–E–A = Am, 1st inversion) — fed to the keyboard's chord display so the
  // inversion buttons count from the tile's real inversion. ────────────────
  baseName: string
  inversion: number
  // ── Shape the voicing engine builds from (offsets above rootPC), the
  // chord's real root (differs from rootPC when a pentatonic stack is
  // inverted, e.g. C–E–A = Am) and its tones in root-position order. ─────
  semis: number[]
  harmonicRootPC: number
  tonePcs: number[]
}

// ── Maps tonal's quality/name WORDS to a raw suffix — formatChordSuffix
// (same shared formatter chordDetection.ts and ChordExplorer.tsx use) then
// applies the user's naming style on top, so this map only ever needs to
// store the raw/abbreviation-shaped form, never a style-specific one. ─────
const QUALITY_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'diminished': 'dim', 'augmented': 'aug',
  'suspended fourth': 'sus4', 'suspended second': 'sus2',
  'dominant seventh': '7', 'major seventh': 'maj7', 'minor seventh': 'm7',
  'half-diminished seventh': 'm7b5', 'diminished seventh': 'dim7',
  'major sixth': '6', 'minor sixth': 'm6', 'dominant ninth': '9',
  'power chord': '5',
}

// ── Build one triad from a scale degree, detect quality via tonal ────────────
function buildDiatonicChord(
  root: number,
  scaleIntervals: number[],
  degree: number,
  naming: NoteNaming,
  accidentals: Accidentals,
  namingStyle: ChordNamingStyle,
): DiatonicChord {
  const n = scaleIntervals.length
  const scalePCs = scaleIntervals.map(s => (root + s) % 12)
  const { min, max } = EXPLORER_RANGE

  // Stack thirds within the scale (degrees: deg, deg+2, deg+4)
  const triadPCs = [
    scalePCs[degree % n],
    scalePCs[(degree + 2) % n],
    scalePCs[(degree + 4) % n],
  ]

  // Place root in a playable octave — prefer oct 3 (C3–B3) to centre chords in C3–C5
  let baseMidi = -1
  for (const oct of [3, 4, 2, 5]) {
    const m = triadPCs[0] + (oct + 1) * 12
    if (m >= min && m <= max) { baseMidi = m; break }
  }
  if (baseMidi < 0) baseMidi = triadPCs[0] + 60

  // Build ascending MIDI notes
  const midiNotes: number[] = [baseMidi]
  for (let i = 1; i < triadPCs.length; i++) {
    let m = triadPCs[i] + (Math.floor(baseMidi / 12)) * 12
    while (m <= midiNotes[i - 1]) m += 12
    if (m > max) m -= 12
    midiNotes.push(m)
  }

  // Detect chord quality via tonal. Every 7-note scale stacks into a
  // root-position triad, so tonal answers with a plain chord on the stacked
  // root. A pentatonic stack is usually an inverted or sus chord instead
  // (C–E–A, D–G–C) and tonal only offers slash answers, unranked — its first
  // pick for E–A–C# is "C#m#5/E", not A/E. Those go through the app's own
  // ranked picker (the one playback uses), then get named by that chord's
  // real root and quality with the stacked bass after the slash — never the
  // bass note glued to another chord's quality (was "Cm" for C–E–A).
  const noteNames = midiNotes.map(m => Note.fromMidi(m))
  const detected = Chord.detect(noteNames)
  const rootPosition = detected.find(c => !c.includes('/'))
  const structured = rootPosition ? null : detectChordStructured(new Set(midiNotes))
  const baseChord = rootPosition ?? structured?.rawRootName ?? detected[0]?.split('/')[0] ?? ''
  let suffix = '?'
  let chordRootPC = triadPCs[0]
  let inversion = 0
  let tonePcs = triadPCs
  if (baseChord) {
    const info = Chord.get(baseChord)
    const rawSuffix = QUALITY_SUFFIX[info.quality?.toLowerCase() ?? ''] ??
             QUALITY_SUFFIX[info.name?.toLowerCase() ?? ''] ??
             (info.aliases?.[0] ?? info.quality ?? '')
    suffix = formatChordSuffix(rawSuffix, namingStyle)
    const tonicPC = info.tonic ? Note.chroma(info.tonic) : undefined
    if (tonicPC !== undefined && tonicPC !== null && tonicPC !== triadPCs[0]) {
      chordRootPC = tonicPC
      const chordPcs = info.notes.map(n => Note.chroma(n))
      inversion = Math.max(0, chordPcs.indexOf(triadPCs[0]))
      if (chordPcs.length === triadPCs.length) tonePcs = chordPcs
    }
  }

  const baseName = getNoteName(chordRootPC, naming, accidentals) + suffix
  const chordName = chordRootPC !== triadPCs[0] ? `${baseName}/${getNoteName(baseMidi, naming, accidentals)}` : baseName
  return {
    degree,
    roman: SCALES.find(s => s.intervals === scaleIntervals)?.romans[degree] ?? String(degree + 1),
    rootPC: triadPCs[0],
    midiNotes,
    chordName,
    suffix,
    noteCount: midiNotes.length,
    baseName,
    inversion,
    semis: semisFromMidi(midiNotes),
    harmonicRootPC: chordRootPC,
    tonePcs,
  }
}

// ── Blues tiles — a fixed chord on a fixed root per tile (see ScaleDef) ─────
function buildScaleChord(
  root: number,
  scaleDef: ScaleDef,
  degree: number,
  naming: NoteNaming,
  accidentals: Accidentals,
  namingStyle: ChordNamingStyle,
): DiatonicChord | null {
  const spec = scaleDef.chords?.[degree]
  const info = spec ? ALL_CHORDS.find(c => c.key === spec.type) : undefined
  if (!spec || !info) return null
  const rootPC = (root + spec.offset) % 12
  const semis = intervalsToSemis(info.intervals)
  const suffix = formatChordSuffix(info.suffix, namingStyle)
  const baseName = getNoteName(rootPC, naming, accidentals) + suffix
  return {
    degree,
    roman: scaleDef.romans[degree] ?? String(degree + 1),
    rootPC,
    midiNotes: semis.map(st => 48 + rootPC + st),
    chordName: baseName,
    suffix,
    noteCount: semis.length,
    baseName,
    inversion: 0,
    semis,
    harmonicRootPC: rootPC,
    tonePcs: semis.map(st => (rootPC + st) % 12),
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ScaleExplorer() {
  // ── Store subscriptions ───────────────────────────────────────────────────
  const scaleExplorerOpen       = useStore(s => s.scaleExplorerOpen)
  const scaleExplorerMinimized  = useStore(s => s.scaleExplorerMinimized)
  const setScaleExplorerOpen    = useStore(s => s.setScaleExplorerOpen)
  const setChordExplorerOpen    = useStore(s => s.setChordExplorerOpen)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const colorRootNoteEnabled = useStore(s => s.colorRootNoteEnabled)
  const setColorRootNoteEnabled = useStore(s => s.setColorRootNoteEnabled)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const setExplorerChordDisplay = useStore(s => s.setExplorerChordDisplay)
  const clearExplorerChordDisplay = useStore(s => s.clearExplorerChordDisplay)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const progressionVoicing = useStore(s => s.progressionVoicing)
  const setProgressionVoicing = useStore(s => s.setProgressionVoicing)
  const setAccidentals = useStore(s => s.setAccidentals)
  const explorerOctave = useStore(s => s.explorerOctave)
  const starmapEnabled = useStore(s => s.starmapEnabled)
  const midiHeldKeys = useStore(s => s.midiHeldKeys)

  // ── Window drag position — centred on the window, bottom edge just above
  // the keyboard's chord display row; recomputed each time the modal opens. ─
  const [pos, setPos] = useState(() => defaultPos(MODAL_HEIGHT))
  const panelRef = useRef<HTMLDivElement>(null)
  // ── Set on open; the first render after the open state has settled
  // measures the real height and anchors the bottom edge from it. ─────────
  const needsAnchorRef = useRef(false)
  useAnchorBottomOnResize(panelRef, setPos, scaleExplorerOpen && !scaleExplorerMinimized, MIN_TOP)
  useFocusTrap(panelRef, scaleExplorerOpen && !scaleExplorerMinimized)
  useClampPositionOnZoom(pos, setPos, panelRef)

  // ── CoF + scale selection state ───────────────────────────────────────────
  const [cofPos, setCofPos] = useState<number | null>(null)
  const [cofRing, setCofRing] = useState<'major' | 'minor' | null>(null)
  const [selectedScaleIdx, setSelectedScaleIdx] = useState(0)
  const [selectedDegree, setSelectedDegree] = useState<number | null>(null)
  // ── The chord sounding now, for the Starmap's star — set beside every
  // chord the explorer strikes, cleared when the key or scale changes. ────
  const [litChord, setLitChord] = useState<LitChord | null>(null)
  // ── Circle shown: the Circle of Fifths by default, the Starmap when the
  // STARMAP row's switch is on — available once Settings › Appearance ›
  // Starmap is on. Kept for the session (closing the explorer keeps it). ──
  const [starmapView, setStarmapView] = useState(false)
  const showStarmap = starmapEnabled && starmapView
  // ── Starmap ring order: by semitone (default) or by fifths ───────────────
  const [ringLayout, setRingLayout] = useState<RingLayout>('chromatic')


  // ── Progression state ─────────────────────────────────────────────────────
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<ProgSpeed>('med')

  // ── Info row: currently playing chord context ─────────────────────────────
  const [infoRowChord, setInfoRowChord] = useState<{ progName: string; labels: string[]; notes: string[]; step: number } | null>(null)

  // ── Octave tile selection — separate from selectedDegree (0-6) ────────────
  // True when the 8th tile (tonic +12) is the active selection.
  const [octaveTileSelected, setOctaveTileSelected] = useState(false)

  // ── Which note-names-row note is currently sounding during scale playback —
  // index into [...scale.intervals, octaveRoot], -1 = none. Drives the
  // sequential amber highlight on the note-names row. ───────────────────────
  const [scalePlayIndex, setScalePlayIndex] = useState(-1)

  // ── "Chords in the Scale" auto-sequence — playing/stopped, so the play
  // button toggles (stop on click / spacebar) instead of restarting. ───────
  const [chordSeqPlaying, setChordSeqPlaying] = useState(false)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // speedRef lets both the progression and the chords-in-the-scale run read
  // the live speed without restarting the chain
  const speedRef = useRef<ProgSpeed>('med')
  const progRunningRef = useRef(false)
  const dragRef = useRef<{ ox: number; oy: number; mx: number; my: number } | null>(null)
  const scalePlayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const chordSeqTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const chordSeqRunningRef = useRef(false)
  // ── Root whose pitch class is accented on the lit keys right now — kept so
  // flipping "Accent root note" recolors what's already on the keyboard. ──
  const accentRootRef = useRef<number | null>(null)
  // ── Shape the inversion ↺ returns to (null until an arrow is pressed) ──
  const struckShapeRef = useRef<StruckShape | null>(null)
  const [inverted, setInverted] = useState(false)
  // ── Scale replay trigger — incremented on every CoF click so the play ─────
  // effect fires even when the same segment is clicked twice in a row
  const playTriggerRef = useRef(0)
  const [playTrigger, setPlayTrigger] = useState(0)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // ── A chord held on the MIDI keyboard (3–6 different notes) takes over the
  // Starmap's star while it's held — drawing only, the explorer's own chord
  // and keys stay as they are, and the star glides back on release. Read a
  // moment after the last key change so a rolled chord doesn't flicker
  // through its first two notes. ──────────────────────────────────────────
  const [heldChord, setHeldChord] = useState<LitChord | null>(null)
  useEffect(() => {
    if (!showStarmap) { setHeldChord(null); return }
    const id = setTimeout(() => {
      const pcs = new Set(Array.from(midiHeldKeys, m => m % 12))
      if (pcs.size < STAR_MIN_NOTES || pcs.size > STAR_MAX_NOTES) { setHeldChord(null); return }
      const found = detectChordStructured(midiHeldKeys)
      const lowest = Math.min(...midiHeldKeys) % 12
      const name = found ? (localizeChord(found.rawRootName, displayNaming, accidentals, chordNamingStyle) ?? '') : ''
      setHeldChord({ pcs: Array.from(pcs), rootPc: found?.rootPitchClass ?? lowest, name })
    }, 40)
    return () => clearTimeout(id)
  }, [midiHeldKeys, showStarmap, displayNaming, accidentals, chordNamingStyle])

  // ── Derived root pitch class from CoF selection ───────────────────────────
  const selectedRoot = useMemo(() => {
    if (cofPos === null || cofRing === null) return null
    return cofRing === 'major' ? COF_MAJOR_PC[cofPos] : COF_MINOR_PC[cofPos]
  }, [cofPos, cofRing])

  const scale = SCALES[selectedScaleIdx]

  // ── Build all diatonic triads when root or scale type changes ─────────────
  const diatonicChords = useMemo<DiatonicChord[]>(() => {
    if (selectedRoot === null) return []
    if (scale.chords) {
      return scale.chords
        .map((_, deg) => buildScaleChord(selectedRoot, scale, deg, displayNaming, accidentals, chordNamingStyle))
        .filter((c): c is DiatonicChord => c !== null)
    }
    return scale.intervals.map((_, deg) =>
      buildDiatonicChord(selectedRoot, scale.intervals, deg, displayNaming, accidentals, chordNamingStyle)
    )
  }, [selectedRoot, scale, displayNaming, accidentals, chordNamingStyle])

  // ── Where each tile sits on the keyboard — the whole row voiced as one run
  // from the tonic under the Voicing mode, starting in the octave the Octave
  // control picks (C3–B3 by default), plus the tonic again at the end for
  // the octave tile. Tiles, the chords-in-the-scale run and the keyboard all
  // read this one list, so they always agree, in every key. ──────────────
  const lowRoot = explorerLowRoot(explorerOctave)
  const tileVoicings = useMemo<number[][]>(() => {
    if (diatonicChords.length === 0) return []
    const spec = diatonicChords.map(c => ({ rootPc: c.rootPC, semis: c.semis }))
    return voiceProgression([...spec, spec[0]], progressionVoicing, EXPLORER_RANGE, lowRoot)
  }, [diatonicChords, progressionVoicing, lowRoot])
  const tileVoicingsRef = useRef(tileVoicings)
  tileVoicingsRef.current = tileVoicings
  const lowRootRef = useRef(lowRoot)
  lowRootRef.current = lowRoot

  // ── Scale-type button — also re-syncs the Circle of Fifths highlight so the
  // lit segment always matches the chosen scale's family (minor-family scales
  // light the inner ring, everything else the outer ring) while keeping the
  // same tonic pitch class. Without this, switching e.g. Cm → Major Pentatonic
  // left "Cm" lit on the circle even though "Key of" had moved to C. ────────
  const selectScaleType = useCallback((idx: number) => {
    setSelectedScaleIdx(idx)
    setInfoRowChord(null)
    setSelectedDegree(null)
    setOctaveTileSelected(false)
    clearExplorerChordDisplay()
    if (selectedRoot !== null) {
      const ring: 'major' | 'minor' = MINOR_SCALES.has(SCALES[idx].name) ? 'minor' : 'major'
      const table = ring === 'major' ? COF_MAJOR_PC : COF_MINOR_PC
      const newPos = table.indexOf(selectedRoot)
      if (newPos >= 0) { setCofRing(ring); setCofPos(newPos) }
    }
  }, [selectedRoot, clearExplorerChordDisplay])

  // ── Pick a key — a wedge on the Circle of Fifths, a note on the Starmap, or
  // the Starmap's Major | Minor switch. A wedge sets Major or Natural Minor;
  // the Starmap keeps the selected scale when it already fits the chosen
  // major/minor side (Dorian stays Dorian), else switches to Major / Natural
  // Minor. Replays the scale either way. ────────────────────────────────────
  const pickKey = useCallback((pc: number, ring: 'major' | 'minor', keepScale: boolean) => {
    const table = ring === 'major' ? COF_MAJOR_PC : COF_MINOR_PC
    setCofPos(table.indexOf(pc)); setCofRing(ring)
    const side = MINOR_SCALES.has(SCALES[selectedScaleIdx].name) ? 'minor' : 'major'
    if (!keepScale || side !== ring) setSelectedScaleIdx(ring === 'major' ? 0 : 1)
    setInfoRowChord(null); setSelectedDegree(null); clearExplorerChordDisplay()
    playTriggerRef.current += 1; setPlayTrigger(playTriggerRef.current)
  }, [selectedScaleIdx, clearExplorerChordDisplay])

  // ── Stop progression and clear its timer ─────────────────────────────────
  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
  }, [])

  // ── Cancel all scheduled scale-play note timers ───────────────────────────
  const clearScalePlayTimers = useCallback(() => {
    scalePlayTimersRef.current.forEach(t => clearTimeout(t))
    scalePlayTimersRef.current = []
  }, [])

  // ── Cancel the chords-in-scale auto-sequence ───────────────────────────────
  const stopChordSequence = useCallback(() => {
    chordSeqRunningRef.current = false
    chordSeqTimersRef.current.forEach(t => clearTimeout(t))
    chordSeqTimersRef.current = []
    setChordSeqPlaying(false)
  }, [])

  // ── On open: pause playback, reset all transient state ────────────────────
  useEffect(() => {
    if (scaleExplorerOpen) {
      // ── Recompute anchor position every time the modal opens ────────────
      setPos(defaultPos(MODAL_HEIGHT))
      needsAnchorRef.current = true
      // unless switched off: Settings › Playback › Explorers pause playback
      if (useStore.getState().playbackState === 'playing' && useStore.getState().explorerPausesPlayback) {
        ;(window as any).__orfeoPlayer?.pause?.()
        useStore.getState().setPlaybackState('paused')
      }
      // ── Default to C major, as if it were already clicked — keeps the modal
      // at its fully-expanded height on open instead of the empty placeholder
      // state. COF_MAJOR_PC[0] === 0 (C), so position 0 on the major ring. ────
      setCofPos(0); setCofRing('major'); setSelectedScaleIdx(0)
      stopProgression()
      setSelectedProg(null)
      setProgSpeed('med'); speedRef.current = 'med'
      setSelectedDegree(null)
      setOctaveTileSelected(false)
      setInfoRowChord(null)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    } else {
      stopProgression()
      clearScalePlayTimers()
      stopChordSequence()
      setScalePlayIndex(-1)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    }
  }, [scaleExplorerOpen, stopProgression, clearScalePlayTimers, stopChordSequence, clearExplorerKeys, clearExplorerChordDisplay])

  // ── Once the opening key (C major) is in and the tiles have rendered, put
  // the bottom edge just above the chord display row using the real height.
  // Later height changes are handled by useAnchorBottomOnResize. ──────────
  useLayoutEffect(() => {
    if (!needsAnchorRef.current || !scaleExplorerOpen || selectedRoot === null) return
    const el = panelRef.current
    if (!el) return
    needsAnchorRef.current = false
    setPos(defaultPos(el.offsetHeight))
  })

  // ── Light keys on the keyboard, remembering which root is accented — the
  // shared colour rule reads the "Accent root note" toggle live, so a run
  // already playing picks up a flip on its next chord. ─────────────────────
  // keepShape: an inversion step or a recolour, not a newly struck chord —
  // keeps the shape the inversion ↺ returns to.
  const lightKeys = useCallback((notes: number[], rootPc: number | null, keepShape = false) => {
    accentRootRef.current = rootPc
    if (!keepShape) { struckShapeRef.current = null; setInverted(false) }
    setExplorerKeys(new Set(notes), explorerKeyColors(notes, rootPc, useStore.getState().colorRootNoteEnabled))
  }, [setExplorerKeys])

  // ── ↺ beside the inversion arrows — back to the shape the chord had when
  // it was struck (shared rule, utils/explorerShared.ts). ──────────────────
  const resetInversion = useCallback(() => {
    const shape = struckShapeRef.current
    if (!shape) return
    const state = useStore.getState()
    const notes = restoreStruckShape(shape, state.explorerOctave)
    if (!notes) return
    lightKeys(notes, accentRootRef.current)
    const cd = state.explorerChordDisplay
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: shape.invCount })
    ringChord(notes)
  }, [lightKeys])

  // ── "Accent root note" flipped — recolor whatever is lit right now ────────
  useEffect(() => {
    if (!scaleExplorerOpen) return
    const lit = Array.from(useStore.getState().explorerKeys)
    if (lit.length > 0) lightKeys(lit, accentRootRef.current, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorRootNoteEnabled])

  // ── Play scale notes ascending and light keys when root/scale changes ──────
  // Starts on the tonic in the octave the Octave control picks (C3–B3 by
  // default), same register the chords start in.
  useEffect(() => {
    if (!scaleExplorerOpen || selectedRoot === null) return
    clearScalePlayTimers()
    const playNote = (window as any).__orfeoPlayNote
    const rootMidi = lowRoot + selectedRoot
    const noteMidis = [...scale.intervals.map(iv => rootMidi + iv), rootMidi + 12]
      .filter(m => m >= EXPLORER_RANGE.min && m <= EXPLORER_RANGE.max)
    lightKeys(noteMidis, selectedRoot)
    setLitChord(null)
    setSelectedDegree(null)
    setOctaveTileSelected(false)

    setScalePlayIndex(-1)
    if (playNote) {
      noteMidis.forEach((m, i) => {
        const t = setTimeout(() => { playNote(m, 0.6, 400); setScalePlayIndex(i) }, i * 220)
        scalePlayTimersRef.current.push(t)
      })
      const resetT = setTimeout(() => setScalePlayIndex(-1), noteMidis.length * 220 + 400)
      scalePlayTimersRef.current.push(resetT)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx, scaleExplorerOpen, playTrigger])

  // ── Tile name as voiced — slash bass when the voicing doesn't have the
  // chord's root at the bottom. ─────────────────────────────────────────────
  const voicedName = useCallback((chord: DiatonicChord, voicing: number[] | undefined) => {
    if (!voicing || voicing.length === 0) return chord.chordName
    const bassPc = Math.min(...voicing) % 12
    return bassPc === chord.harmonicRootPC
      ? chord.baseName
      : `${chord.baseName}/${getNoteName(bassPc, displayNaming, accidentals)}`
  }, [displayNaming, accidentals])

  // ── Play one tile — index 0..n-1 are the scale's chords, n is the octave
  // tile. Clicked tiles ring like a held pedal; the chords-in-the-scale run
  // rolls each chord and lets it ring into the next. The chord's own root is
  // the accented note, in every voicing mode. ───────────────────────────────
  const playTile = useCallback((idx: number, how: 'click' | 'run') => {
    const voicing = tileVoicingsRef.current[idx]
    const isOctave = idx === diatonicChords.length
    const chord = diatonicChords[isOctave ? 0 : idx]
    if (!voicing || !chord) return
    const notes = [...voicing].sort((a, b) => a - b)
    setSelectedDegree(isOctave ? null : idx)
    setOctaveTileSelected(isOctave)
    lightKeys(notes, chord.harmonicRootPC)
    setLitChord({ pcs: notes.map(m => m % 12), rootPc: chord.harmonicRootPC, name: chord.baseName })
    setExplorerChordDisplay({
      name: chord.baseName,
      invCount: inversionOf(chord.harmonicRootPC, chord.tonePcs.map(pc => (pc - chord.harmonicRootPC + 12) % 12), notes),
      noteCount: notes.length,
    })
    setInfoRowChord({
      progName: '',
      labels: [isOctave ? chord.roman + '⁸' : chord.roman],
      notes: notes.map(m => getNoteName(m, displayNaming, accidentals)),
      step: 0,
    })
    if (how === 'click') ringChord(notes)
    else strikeStep(notes, Math.round(SPEED_MS[speedRef.current] * 1.12), () => chordSeqRunningRef.current)
  }, [diatonicChords, lightKeys, setExplorerChordDisplay, displayNaming, accidentals])
  const playTileRef = useRef(playTile)
  playTileRef.current = playTile

  // ── Voicing mode switched — re-light the selected tile where it now sits
  // (silently; the next click or run plays it there). ──────────────────────
  const prevVoicingRef = useRef(progressionVoicing)
  useEffect(() => {
    if (prevVoicingRef.current === progressionVoicing) return
    prevVoicingRef.current = progressionVoicing
    if (progRunningRef.current || chordSeqRunningRef.current) return
    const idx = octaveTileSelected ? diatonicChords.length : selectedDegree
    const voicing = idx === null ? undefined : tileVoicings[idx]
    const chord = idx === null ? undefined : diatonicChords[idx === diatonicChords.length ? 0 : idx]
    if (!voicing || !chord) return
    lightKeys(voicing, chord.harmonicRootPC)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressionVoicing])

  // ── Auto-play all chords in the scale, one after another — the "Chords in
  // the Scale" play button. Plays every tile, octave tile last, at the
  // progression speed; voicing, speed and the root accent are all read live,
  // so changing any of them mid-run takes effect on the next chord. A second
  // click (or spacebar) stops it. ────────────────────────────────────────────
  const playChordsInSequence = useCallback(() => {
    if (chordSeqPlaying) { stopChordSequence(); return }
    if (diatonicChords.length === 0) return
    stopChordSequence()
    stopProgression()
    chordSeqRunningRef.current = true
    setChordSeqPlaying(true)
    const step = (i: number) => {
      if (!chordSeqRunningRef.current) return
      const last = tileVoicingsRef.current.length - 1
      playTileRef.current(i, 'run')
      const t = setTimeout(
        () => i < last ? step(i + 1) : stopChordSequence(),
        SPEED_MS[speedRef.current],
      )
      chordSeqTimersRef.current.push(t)
    }
    step(0)
  }, [chordSeqPlaying, diatonicChords.length, stopChordSequence, stopProgression])

  const hasTileSelected = selectedDegree !== null || octaveTileSelected

  // ── Rotate the live chord voicing down (prev) or up (next) ──────────────
  // Same as ChordExplorer's handleInversion: reads the lit keys from the store
  // each time so rotations accumulate across octaves instead of wrapping at
  // chord length. The accented root stays pink wherever it lands. ─────────
  const stepInversion = useCallback((dir: 'prev' | 'next') => {
    const state = useStore.getState()
    if (state.explorerKeys.size === 0) return
    const cd = state.explorerChordDisplay
    struckShapeRef.current = captureStruckShape(struckShapeRef.current, state.explorerKeys, cd?.invCount ?? 0, state.explorerOctave)
    setInverted(true)
    const notes = dir === 'next' ? nextInversionSet(state.explorerKeys) : prevInversionSet(state.explorerKeys)
    const sorted = Array.from(notes).sort((a, b) => a - b)
    lightKeys(sorted, accentRootRef.current, true)
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + (dir === 'next' ? 1 : -1) })
    ringChord(sorted)
  }, [lightKeys])

  // ── Play one progression step and schedule the next ──────────────────────
  // Same rules as the Chord Explorer (utils/explorerShared.ts): the step's
  // chord is exactly what its numeral says in this key — I–bVII–IV plays
  // C–B♭–F in C — and the shared voice-leading engine picks its voicing from
  // the one that just played, under the live Voicing mode. A step whose chord
  // is one of the tiles lights that tile.
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    prevMidi: number[] | null,
  ) => {
    if (!progRunningRef.current) return
    if (selectedRoot === null) return
    const prog = ALL_PROGRESSIONS[progIndex]
    if (!prog) return
    const resolved = resolveProgressionStep(prog, step, selectedRoot)
    if (!resolved) return
    const semis = intervalsToSemis(resolved.info.intervals)

    const voicingMode = useStore.getState().progressionVoicing
    const notes = nextVoicing(prevMidi, resolved.rootPc, semis, voicingMode, EXPLORER_RANGE, lowRootRef.current)

    lightKeys(notes, resolved.rootPc)
    const stepName = getNoteName(resolved.rootPc, displayNaming, accidentals) + formatChordSuffix(resolved.info.suffix, chordNamingStyle)
    setLitChord({ pcs: notes.map(m => m % 12), rootPc: resolved.rootPc, name: stepName })
    setExplorerChordDisplay({
      name: stepName,
      invCount: inversionOf(resolved.rootPc, semis, notes),
      noteCount: notes.length,
    })
    setProgStep(step)
    const pcs = new Set(semis.map(st => (resolved.rootPc + st) % 12))
    const tileIdx = diatonicChords.findIndex(c => c.tonePcs.length === pcs.size && c.tonePcs.every(pc => pcs.has(pc)))
    setSelectedDegree(tileIdx >= 0 ? tileIdx : null)
    // ── Octave tile has its own bool, independent of selectedDegree — must be
    // cleared explicitly or it stays stuck "selected" (stale highlight) once a
    // progression starts stepping through the regular degree tiles. ─────────
    setOctaveTileSelected(false)
    setInfoRowChord({
      progName: prog.name,
      labels: prog.labels,
      notes: notes.map(m => getNoteName(m, displayNaming, accidentals)),
      step,
    })

    strikeStep(notes, Math.round(SPEED_MS[speedRef.current] * 1.12), () => progRunningRef.current)

    const nextStep = (step + 1) % prog.labels.length
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, notes)
    }, SPEED_MS[speedRef.current])
  }, [diatonicChords, lightKeys, setExplorerChordDisplay, displayNaming, accidentals, chordNamingStyle, selectedRoot])

  // ── Start progression from step 0 ────────────────────────────────────────
  const startProgression = useCallback(() => {
    if (selectedProg === null || diatonicChords.length === 0) return
    stopProgression()
    stopChordSequence()
    progRunningRef.current = true
    setProgPlaying(true)
    playProgStepAt(0, selectedProg, null)
  }, [selectedProg, diatonicChords.length, stopProgression, stopChordSequence, playProgStepAt])

  // ── Stop progression + chords-in-scale sequence when root/scale changes ───
  useEffect(() => {
    if (progPlaying) stopProgression()
    stopChordSequence()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx])

  // ── Pick a progression from the list — clicking the picked one again
  // clears it. Picking another while one plays switches straight to it. ────
  const pickProgression = useCallback((i: number) => {
    if (selectedProg === i) { setSelectedProg(null); stopProgression(); return }
    setSelectedProg(i)
    if (progRunningRef.current && diatonicChords.length > 0) {
      stopProgression()
      progRunningRef.current = true
      setProgPlaying(true)
      playProgStepAt(0, i, null)
    }
  }, [selectedProg, diatonicChords.length, stopProgression, playProgStepAt])

  // ── Close on Escape ────────────────────────────────────────────────────────
  const close = useCallback(() => {
    stopProgression()
    clearExplorerKeys()
    clearExplorerChordDisplay()
    setScaleExplorerOpen(false)
  }, [stopProgression, clearExplorerKeys, clearExplorerChordDisplay, setScaleExplorerOpen])

  useEffect(() => {
    if (!scaleExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scaleExplorerOpen, close])

  // ── Spacebar while this modal is open — controls the progression when one
  // is selected, otherwise toggles the "Chords in the Scale" auto-sequence. ─
  useEffect(() => {
    if (!scaleExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      e.preventDefault()
      if (selectedProg !== null) {
        if (progPlaying) stopProgression(); else startProgression()
      } else {
        playChordsInSequence()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scaleExplorerOpen, selectedProg, progPlaying, stopProgression, startProgression, playChordsInSequence])

  // ── Window drag handler ───────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.mx),
        // MIN_TOP, not 0 — same titleBarOverlay clearance as the initial
        // position; dragging the header up to y=0 put it under Windows' native
        // maximize/close buttons just as easily as the auto-computed position did.
        y: Math.max(MIN_TOP, dragRef.current.oy + ev.clientY - dragRef.current.my),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  // ── CoF label helpers ─────────────────────────────────────────────────────
  // Major key name for outer ring position
  function getMajorLabel(p: number): string {
    return getNoteName(60 + COF_MAJOR_PC[p], displayNaming, accidentals)
  }
  // Minor key name (with "m" suffix) for inner ring position
  function getMinorLabel(p: number): string {
    return getNoteName(60 + COF_MINOR_PC[p], displayNaming, accidentals) + 'm'
  }
  // Repeated sharp/flat symbols for the given key signature count
  function getKeySigSymbol(p: number): string {
    const sig = COF_KEYSIG[p]
    if (sig === 0) return ''
    if (sig > 0) return '♯'.repeat(sig)
    return '♭'.repeat(-sig)
  }
  // Split a key-signature string into tspans with every second symbol raised
  // like a printed superscript, matching how engraved key signatures stagger
  // repeated accidentals for legibility — same size throughout, only offset.
  function renderKeySigTspans(sig: string, raise: number) {
    return Array.from(sig).map((ch, idx) => {
      const isSup = idx % 2 === 1
      const dy = idx === 0 ? 0 : (isSup ? -raise : raise)
      return <tspan key={idx} dy={dy}>{ch}</tspan>
    })
  }

  // ── Scale info: root name, scale name, note list ──────────────────────────
  const infoText = useMemo(() => {
    if (selectedRoot === null) return null
    const rootName = getNoteName(60 + selectedRoot, displayNaming, accidentals)
    const noteNames = scale.intervals.map(iv => {
      const pc = (selectedRoot + iv) % 12
      return getNoteName(60 + pc, displayNaming, accidentals)
    })
    return { rootName, scaleName: scale.name, noteNames }
  }, [selectedRoot, scale, displayNaming, accidentals])

  // ── Key quality suffix — 'm' for minor-family scales, '' for major-family ───
  const keyQuality = MINOR_SCALES.has(scale.name) ? 'm' : ''
  const starmapSide: 'major' | 'minor' = MINOR_SCALES.has(scale.name) ? 'minor' : 'major'

  // Closed (open=false): unmount entirely. Minimized (open=true, minimized=true): render but hide.
  if (!scaleExplorerOpen) return null

  // ── SVG geometry constants ─────────────────────────────────────────────────
  // Circle centre in SVG coordinate space; viewBox offset (-40) keeps top symbols visible
  const CX = 190, CY = 190
  const R_OUTER1 = 110, R_OUTER2 = 175
  const R_INNER1 = 55,  R_INNER2 = 110

  return (
    // ── Modal container — app-no-drag: wherever the modal sits over the top
    // bar (Windows treats that strip as the window's own title bar), clicks
    // on it must reach the modal, not grab and un-maximize the app window. ─
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Scales Explorer"
      className="orfeo-modal-glow app-no-drag"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: MODAL_WIDTH,
        maxHeight: '96vh',
        background: 'var(--bg-modal)',
        border: '1px solid var(--state-hover-bg)',
        borderRadius: 10,
        zIndex: 200,
        display: scaleExplorerMinimized ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
        '--_modal-shadow': 'var(--elevation-explorer)',
      } as CSSProperties}
    >
      {/* Header — drag handle */}
      <div onMouseDown={onDragStart} style={{
        flexShrink: 0, height: 36, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 var(--space-3)',
        background: 'var(--bg-modal-header)', borderBottom: '1px solid var(--border)',
        cursor: 'grab', userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <OrfeoMark height={22} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Scales Explorer
          </span>
        </div>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { stopProgression(); clearExplorerKeys(); clearExplorerChordDisplay(); setScaleExplorerOpen(false) }}
          style={{ ...modalCloseButtonStyle, fontSize: 16, lineHeight: 1 }}
          onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
          onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
        >×</button>
      </div>

      {/* Body — explorer area | settings column */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `${LEFT_WIDTH}px ${SETTINGS_WIDTH}px` }}>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>

      {/* CoF section — guideline + scale list | Circle of Fifths + note names,
          then the Chords in the Scale play button centred above the tiles */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '14px 12px 10px',
        background: 'var(--bg-modal-header)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', alignItems: 'start' }}>
          {/* Left — guideline text, evenly broken lines, then the scale list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 44, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-dimmest)', opacity: 0.75, lineHeight: '1.6',
              textWrap: 'balance', userSelect: 'none',
            } as CSSProperties}>
              {showStarmap
                ? t`Click a note on the ring to explore its scale and chords: every chord you play lights up as a star. Select a progression and click play to watch the stars move.`
                : 'Click a key on the circle to explore its scale and diatonic chords. Select a progression and click play to hear the chords in the scale. Try chord inversions and variations!'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: 116 }}>
              <span style={{ ...ROW_LABEL, fontSize: 12, marginBottom: 3, color: 'var(--text-amber)' }}>Scale</span>
              {SCALES.map((s, i) => {
                const sel = selectedScaleIdx === i
                return (
                  <button key={s.name} onClick={() => selectScaleType(i)}
                    style={{
                      fontFamily: 'var(--font-ui)', fontSize: 12, padding: '4px 6px',
                      background: sel ? 'var(--accent-amber-medium)' : 'none',
                      color: sel ? 'var(--text-amber)' : 'var(--text-muted)',
                      border: `1px solid ${sel ? 'var(--text-amber)' : 'transparent'}`,
                      borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.color = 'var(--text-list-hover)' }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.color = 'var(--text-muted)' }}
                  >{s.name}</button>
                )
              })}
            </div>
          </div>

          {/* Right — CoF SVG with the note-names row under it, centred in the
              space beside the guideline/scale column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, minWidth: 0, position: 'relative' }}>
          {/* Starmap ring order — by semitone or by fifths, in the corner the
              round disc leaves free */}
          {showStarmap && (
            <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 1, display: 'flex', background: 'var(--bg-tile)', borderRadius: 'var(--radius-md)', padding: 2, gap: 1 }}>
              {(['chromatic', 'fifths'] as const).map(l => {
                const active = ringLayout === l
                return (
                  <Tooltip key={l} oneLine title={l === 'chromatic' ? t`Notes in semitone order` : t`Notes in Circle of Fifths order`}>
                    <button onClick={() => setRingLayout(l)} aria-pressed={active}
                      style={{
                        padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: 'none',
                        background: active ? 'var(--state-hover-bg)' : 'transparent',
                        color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
                        fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      }}
                    >{l === 'chromatic' ? t`Semitones` : t`Fifths`}</button>
                  </Tooltip>
                )
              })}
            </div>
          )}
          <svg
            width={Math.round(COF_VIEW.w * COF_SCALE)} height={Math.round(COF_VIEW.h * COF_SCALE)}
            viewBox={`${COF_VIEW.x} ${COF_VIEW.y} ${COF_VIEW.w} ${COF_VIEW.h}`}
            style={{ overflow: 'visible', flexShrink: 0 }}
          >
            {showStarmap ? (
              <StarmapRing
                cx={CX} cy={CY}
                layout={ringLayout}
                scaleName={scale.name}
                tonicPc={selectedRoot}
                scalePcs={selectedRoot === null ? [] : scale.intervals.map(iv => (selectedRoot + iv) % 12)}
                blueNotePc={selectedRoot !== null && scale.blueNote !== undefined ? (selectedRoot + scale.blueNote) % 12 : null}
                litChord={heldChord ?? litChord}
                naming={displayNaming}
                accidentals={accidentals}
                keyQuality={starmapSide}
                morphMs={Math.min(400, Math.round(SPEED_MS[progSpeed] * 0.6))}
                onPickNote={pc => pickKey(pc, starmapSide, true)}
              />
            ) : (<>
            {Array.from({ length: 12 }, (_, i) => {
              const startDeg = -90 + i * 30
              const endDeg   = startDeg + 30
              const midDeg   = startDeg + 15
              const isSelOuter = cofPos === i && cofRing === 'major'
              const isSelInner = cofPos === i && cofRing === 'minor'
              const outerFill = isSelOuter ? 'var(--accent-amber-medium)' : 'var(--border)'
              const innerFill = isSelInner ? 'var(--accent-amber-medium)' : 'var(--border-row)'
              const outerLabel = labelPos(CX, CY, (R_OUTER1 + R_OUTER2) / 2, midDeg)
              const innerLabel = labelPos(CX, CY, (R_INNER1 + R_INNER2) / 2, midDeg)
              const keySig = getKeySigSymbol(i)
              // Fixed size for every position — only every second symbol is raised
              // (superscript-style), never shrunk. Radius is solved per-angle via
              // keySigRadius() so the visual gap to the ring stays constant.
              const sigFontSize = KEYSIG_FONT_SIZE
              const sigR = keySigRadius(midDeg, keySig, R_OUTER2)
              const sigLabel = labelPos(CX, CY, sigR, midDeg)
              return (
                <g key={i}>
                  {/* Outer ring wedge — major key */}
                  <path
                    d={wedgePath(CX, CY, R_OUTER1, R_OUTER2, startDeg, endDeg)}
                    fill={outerFill} stroke="var(--state-hover-bg)" strokeWidth={1}
                    style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                    onClick={() => pickKey(COF_MAJOR_PC[i], 'major', false)}
                    onMouseEnter={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', 'var(--state-hover-bg)') }}
                    onMouseLeave={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', 'var(--border)') }} />
                  {/* Inner ring wedge — minor key */}
                  <path
                    d={wedgePath(CX, CY, R_INNER1, R_INNER2, startDeg, endDeg)}
                    fill={innerFill} stroke="var(--state-hover-bg)" strokeWidth={1}
                    style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                    onClick={() => pickKey(COF_MINOR_PC[i], 'minor', false)}
                    onMouseEnter={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', 'var(--state-hover-bg-inner)') }}
                    onMouseLeave={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', 'var(--border-row)') }} />
                  <circle cx={CX} cy={CY} r={R_INNER1} fill="var(--bg-circle-center)" stroke="var(--state-hover-bg)" strokeWidth={1} style={{ pointerEvents: 'none' }} />
                  {/* Major key label */}
                  <text x={outerLabel.x} y={outerLabel.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={15} fontWeight={700} fontFamily="var(--font-mono)"
                    fill={isSelOuter ? 'var(--text-amber)' : 'var(--text-key-label)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{getMajorLabel(i)}</text>
                  {/* Minor key label */}
                  <text x={innerLabel.x} y={innerLabel.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={12} fontFamily="var(--font-ui)"
                    fill={isSelInner ? 'var(--text-amber)' : 'var(--text-key-label)'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{getMinorLabel(i)}</text>
                  {/* Key signature accidentals — every second symbol staggered as a
                      raised "superscript" the way engraved key signatures do, same size throughout */}
                  {keySig && (
                    <text x={sigLabel.x} y={sigLabel.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={sigFontSize} fontFamily="var(--font-ui)"
                      fill="var(--accent-amber-bold)"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{renderKeySigTspans(keySig, KEYSIG_RAISE)}</text>
                  )}
                </g>
              )
            })}
            {/* Centre label — hand-lettered "Circle of Fifths" title */}
            <CofTitleMark cx={CX} cy={CY} width={80} fill="var(--text-amber)" />
            </>)}
          </svg>
          {/* Note-names row — centred under the CoF (same column, same width),
              pushed down below it. Trailing octave-repeat note completes the
              run; each note highlights amber in sequence as the scale plays. ── */}
          {infoText && (
            <div style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              background: 'var(--bg-info-overlay)', borderRadius: 6, padding: '5px 12px',
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, lineHeight: '22px', fontWeight: 700, color: 'var(--text-amber)' }}>
                {infoText.rootName}
              </span>
              <span style={{ fontSize: 14, lineHeight: '16px', color: 'var(--text-muted)' }}>{infoText.scaleName}</span>
              <span style={{ fontSize: 14, lineHeight: '16px', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                {infoText.noteNames.map((n, i) => (
                  <span key={i} style={{ color: i === scalePlayIndex ? 'var(--text-amber)' : 'var(--text-inactive)' }}>
                    {n}{i < infoText.noteNames.length - 1 ? ' ' : ''}
                  </span>
                ))}
                <span style={{ color: 'var(--text-inactive)' }}> · </span>
                <span style={{ color: scalePlayIndex === infoText.noteNames.length ? 'var(--text-amber)' : 'var(--text-inactive)' }}>
                  {infoText.rootName}
                </span>
              </span>
            </div>
          )}
          </div>
        </div>

        {/* Chords in the Scale — label + play on top, hint below, centred
            under the circle (same columns as the grid above) */}
        <div style={{ marginTop: 'auto', paddingTop: 32, display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)' }}>
        <div style={{ gridColumn: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...ROW_LABEL, fontSize: 13 }}>Chords in the Scale</span>
            <Tooltip title="Play Chords" description={chordSeqPlaying ? 'Stop playback.' : 'Play all chords in the scale one after another.'}>
              <button
                onClick={playChordsInSequence}
                disabled={selectedRoot === null}
                style={{
                  background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center',
                  cursor: selectedRoot === null ? 'default' : 'pointer',
                  color: selectedRoot === null ? 'var(--state-disabled)' : 'var(--text-amber)',
                }}
                onMouseEnter={e => { if (selectedRoot !== null) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = selectedRoot === null ? 'var(--state-disabled)' : 'var(--text-amber)' }}
              >
                {chordSeqPlaying
                  ? <Square size={13} fill="currentColor" strokeWidth={0} />
                  : <Play size={15} fill="currentColor" strokeWidth={0} />}
              </button>
            </Tooltip>
          </div>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--text-dimmest)', opacity: 0.75, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
            {t`Click tiles to hear chords`}
          </span>
        </div>
        </div>
      </div>

      {/* Diatonic chord tiles — one per chord, plus the octave tile */}
      <div style={{ flexShrink: 0, padding: 'var(--space-1) var(--space-3)', minHeight: 'var(--row-height)' }}>
        {selectedRoot === null ? (
          <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select a key from the circle above to see diatonic chords</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
            {[...diatonicChords, ...(diatonicChords[0] ? [diatonicChords[0]] : [])].map((chord, idx) => {
              const isOctave = idx === diatonicChords.length
              const sel = isOctave ? octaveTileSelected : selectedDegree === idx
              const voicing = tileVoicings[idx]
              const notes = voicing ? [...voicing].sort((a, b) => a - b) : chord.midiNotes
              return (
                // Chord tile: notes on top, chord name + roman numeral below
                <button
                  key={isOctave ? 'octave' : chord.degree}
                  onMouseDown={() => { stopChordSequence(); playTile(idx, 'click') }}
                  style={{
                    flex: 1, minWidth: 0, background: sel ? 'var(--accent-amber-medium)' : 'var(--bg-tile)',
                    border: `1px solid ${sel ? 'var(--text-amber)' : 'var(--state-hover-bg)'}`,
                    borderRadius: 6,
                    paddingTop: 6, paddingBottom: 'var(--space-2)', paddingLeft: 6, paddingRight: 6,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 5,
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--state-hover-border)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = 'var(--state-hover-bg)' }}
                >
                  {/* Top: every note of the voicing, low to high, on its own line */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                    {notes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
                  </span>
                  {/* Bottom: chord name as voiced, roman numeral on the right */}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: sel ? 'var(--text-amber)' : 'var(--text-key-label)', lineHeight: 1, whiteSpace: 'nowrap' }}>
                      {voicedName(chord, voicing)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--accent-amber-bold)', lineHeight: 1, flexShrink: 0 }}>
                      {chord.roman}{isOctave ? '⁸' : ''}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Chord/inversion info display row */}
      <div style={{
        flexShrink: 0, minHeight: 'var(--row-height)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 var(--space-3)',
        borderTop: '1px solid var(--border)', background: 'var(--bg-modal-header)',
        position: 'relative',
      }}>
        {selectedRoot === null ? (
          <span style={{ fontSize: 10, color: 'var(--state-disabled)', fontFamily: 'var(--font-ui)', margin: '0 auto' }}>—</span>
        ) : (
          <>
            {/* Left — CHORD QUALITY label + all progression steps on one line.
                Active step amber/bold; inactive steps dim. Only once a tile
                has been played; the "Key Of" block on the right shows from
                the moment a key is picked on the circle. */}
            {infoRowChord ? (
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 'var(--space-1)', minWidth: 60, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--text-dimmest)', letterSpacing: '0.10em', textTransform: 'uppercase', userSelect: 'none', flexShrink: 0 }}>
                  Chord Quality
                </span>
                {infoRowChord.labels.map((label, i) => (
                  <span key={i} style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: i === infoRowChord.step ? 14 : 13,
                    fontWeight: i === infoRowChord.step ? 700 : 400,
                    color: i === infoRowChord.step ? 'var(--text-amber)' : 'var(--text-inactive)',
                    userSelect: 'none', lineHeight: 1,
                  }}>{label}</span>
                ))}
              </div>
            ) : <span style={{ minWidth: 60 }} />}
            {/* Centre — note names, large, absolutely centred in the row */}
            {infoRowChord && (
              <span style={{
                position: 'absolute', left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', color: 'var(--text-dim)',
                letterSpacing: '0.06em', userSelect: 'none', whiteSpace: 'nowrap',
              }}>
                {infoRowChord.notes.join('  ')}
              </span>
            )}
            {/* Right — fixed "KEY OF [root]" label; root sits in a fixed-width
                slot (worst case: 3 chars, e.g. "C#m") so it never shifts. ──── */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-1)', minWidth: 60 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700, color: 'var(--text-dimmest)', letterSpacing: '0.10em', textTransform: 'uppercase', userSelect: 'none' }}>
                Key Of
              </span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-amber)', userSelect: 'none', lineHeight: 1, minWidth: '3ch', display: 'inline-block' }}>
                {infoText ? `${infoText.rootName}${keyQuality}` : ''}
              </span>
            </div>
          </>
        )}
      </div>

      </div>

      {/* Settings column — progressions list + PLAY, then one row per
          setting (control left, title + description right) */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, minWidth: 0,
        padding: '14px 16px', borderLeft: '1px solid var(--border)',
      }}>
        {/* Progressions — always-open list in a fixed, scrolling box; the
            same list as the Chord Explorer, rotations indented under each */}
        <div style={{ flex: '1 1 0', minHeight: 150, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...ROW_LABEL, fontSize: 11, textAlign: 'right' }}>{t`Progressions`}</span>
          <div className="amber-scroll" style={{
            flex: '1 1 0', minHeight: 0, overflowY: 'auto',
            background: 'var(--bg-tile)', border: '1px solid var(--state-hover-bg)', borderRadius: 6,
            padding: 3,
          }}>
            {ALL_PROGRESSIONS.map((p, i) => {
              const sel = selectedProg === i
              const isRot = !!p.isRotation
              const baseColor = sel ? 'var(--text-amber)' : (isRot ? 'var(--text-dim-control)' : 'var(--text-muted)')
              const rotLabel = isRot ? p.name.replace(p.baseName! + ' ', '') : ''
              return (
                <button key={p.name}
                  onClick={() => pickProgression(i)}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    width: '100%', textAlign: 'left',
                    // ── The picked one stays pinned to the top of the box while
                    // scrolling — amber tint over the box colour so the rows
                    // scrolling underneath never show through it. ───────────
                    background: sel ? 'linear-gradient(var(--accent-amber-medium), var(--accent-amber-medium)) var(--bg-tile)' : 'none',
                    position: sel ? 'sticky' : undefined, top: sel ? 0 : undefined, zIndex: sel ? 1 : undefined,
                    border: `1px solid ${sel ? 'var(--text-amber)' : 'transparent'}`, borderRadius: 4,
                    padding: isRot ? '2px 6px 2px 16px' : '3px 6px',
                    color: baseColor,
                    fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.color = 'var(--text-amber)' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.color = baseColor }}
                >
                  <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{isRot ? `↳ ${rotLabel}` : p.name}</span>
                  <span style={{
                    flex: 1, minWidth: 0, textAlign: 'right',
                    fontFamily: 'var(--font-mono)', fontSize: 9, opacity: isRot ? 0.45 : 0.65,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{p.labels.join(' ')}</span>
                </button>
              )
            })}
          </div>
          {/* Clear & Reset icon (left) | PLAY / STOP (right) — PLAY always shown, greyed
              out until a progression is picked */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Tooltip oneLine title={t`Clear progression`}>
              <button
                onClick={() => { setSelectedProg(null); stopProgression() }}
                disabled={selectedProg === null}
                style={{
                  background: 'none', border: 'none', padding: '0 1px', display: 'flex', alignItems: 'center',
                  color: selectedProg === null ? 'var(--state-hover-bg)' : 'var(--text-inactive)',
                  cursor: selectedProg === null ? 'default' : 'pointer',
                }}
                onMouseEnter={e => { if (selectedProg !== null) e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { e.currentTarget.style.color = selectedProg === null ? 'var(--state-hover-bg)' : 'var(--text-inactive)' }}
              ><RotateCcw size={12} /></button>
            </Tooltip>
            {(() => {
              const canPlay = selectedProg !== null && diatonicChords.length > 0
              const tone = progPlaying ? 'var(--status-error)' : canPlay ? 'var(--status-success)' : 'var(--state-disabled)'
              return (
                <button
                  onClick={() => { if (progPlaying) stopProgression(); else startProgression() }}
                  disabled={!canPlay && !progPlaying}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '4px 12px', borderRadius: 4, background: 'none',
                    cursor: canPlay || progPlaying ? 'pointer' : 'default',
                    border: `1.5px solid ${tone}`, color: tone,
                    boxShadow: canPlay || progPlaying ? `0 0 6px ${tone}` : 'none',
                  }}
                >
                  {progPlaying ? <Square size={12} /> : <ChevronPlayIcon size={12} />}
                  {progPlaying ? 'STOP' : 'PLAY'}
                </button>
              )
            })()}
          </div>
        </div>

        <SettingRow title={t`Inversions`} desc={t`Step through inversions`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Tooltip oneLine title="Previous inversion">
              <button onMouseDown={() => stepInversion('prev')} disabled={!hasTileSelected}
                style={{ background: 'none', border: 'none', color: hasTileSelected ? 'var(--text-amber)' : 'var(--state-disabled)', cursor: hasTileSelected ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => { if (hasTileSelected) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = hasTileSelected ? 'var(--text-amber)' : 'var(--state-disabled)' }}
              ><ChevronPlayIcon size={14} mirrored /></button>
            </Tooltip>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'var(--text-inactive)', letterSpacing: '0.12em', textTransform: 'uppercase', userSelect: 'none' }}>
              {t`Play`}
            </span>
            <Tooltip oneLine title="Next inversion">
              <button onMouseDown={() => stepInversion('next')} disabled={!hasTileSelected}
                style={{ background: 'none', border: 'none', color: hasTileSelected ? 'var(--text-amber)' : 'var(--state-disabled)', cursor: hasTileSelected ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => { if (hasTileSelected) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = hasTileSelected ? 'var(--text-amber)' : 'var(--state-disabled)' }}
              ><ChevronPlayIcon size={14} /></button>
            </Tooltip>
            <Tooltip oneLine title={t`Reset inversion`}>
              <button
                onClick={resetInversion}
                disabled={!inverted}
                style={{ background: 'none', border: 'none', cursor: inverted ? 'pointer' : 'default', color: inverted ? 'var(--text-inactive)' : 'var(--state-hover-bg)', padding: '0 1px', marginLeft: 2, display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => { if (inverted) e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { e.currentTarget.style.color = inverted ? 'var(--text-inactive)' : 'var(--state-hover-bg)' }}
              ><RotateCcw size={12} /></button>
            </Tooltip>
          </div>
        </SettingRow>

        {/* Voicing — shared with the Chord Explorer; sets how the tiles, the
            chords-in-the-scale run and progressions are voiced */}
        <SettingRow title={t`Chord voicing`} desc={t`Roots, climbing or smooth`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {PROGRESSION_VOICINGS.map(v => {
              const Icon = VOICING_ICON[v]
              const active = progressionVoicing === v
              return (
                <Tooltip key={v} oneLine title={`${PROGRESSION_VOICING_LABEL[v]} — ${PROGRESSION_VOICING_HINT[v]}`}>
                  <button
                    onClick={() => setProgressionVoicing(v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: active ? 'var(--text-amber)' : 'var(--text-inactive)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                    onMouseLeave={e => e.currentTarget.style.color = active ? 'var(--text-amber)' : 'var(--text-inactive)'}
                  ><Icon size={15} /></button>
                </Tooltip>
              )
            })}
          </div>
        </SettingRow>

        <SettingRow title={t`Playback speed`} desc={t`How fast the chords change`}>
          <SpeedControl
            value={progSpeed}
            onChange={v => { setProgSpeed(v); speedRef.current = v }}
            size={11}
          />
        </SettingRow>

        <SettingRow title={t`Octave`} desc={t`Move it all up or down`}>
          <ExplorerOctaveControl showLabel={false} />
        </SettingRow>

        <SettingRow title={t`Accidentals`} desc={t`Show flats or sharps`}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {(['flat', 'sharp'] as const).map(v => (
              <button key={v} onClick={() => setAccidentals(v)}
                style={{
                  fontFamily: 'var(--font-ui)', fontSize: 'var(--text-lg)', lineHeight: 1, background: 'none', border: 'none',
                  color: accidentals === v ? 'var(--text-amber)' : 'var(--text-inactive)', cursor: 'pointer', padding: '0 4px',
                }}
                onMouseEnter={e => { if (accidentals !== v) e.currentTarget.style.color = 'var(--text-muted)' }}
                onMouseLeave={e => { if (accidentals !== v) e.currentTarget.style.color = 'var(--text-inactive)' }}
              >{v === 'flat' ? '♭' : '♯'}</button>
            ))}
          </div>
        </SettingRow>

        {/* Accent root note — on by default: each chord's root (any octave)
            shows pink on the keyboard instead of blending into the amber */}
        <SettingRow title={t`Accent root note`} desc={t`Each chord's root lights pink`}>
          <button
            onClick={() => setColorRootNoteEnabled(!colorRootNoteEnabled)}
            aria-pressed={colorRootNoteEnabled}
            style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: colorRootNoteEnabled ? 'var(--text-amber)' : 'var(--text-inactive)' }}
          >
            {colorRootNoteEnabled ? <ToggleRight size={20} strokeWidth={1.5} /> : <ToggleLeft size={20} strokeWidth={1.5} />}
          </button>
        </SettingRow>

        {/* Starmap — swaps the Circle of Fifths for the Starmap (made
            available in Settings › Appearance); in Starmap mode Major | Minor
            decides which key a clicked note picks */}
        <SettingRow
          title={t`Starmap`}
          oneLine
          desc={!starmapEnabled ? t`Turn on in Settings › Appearance` : showStarmap ? t`Major or minor keys` : t`Swap the circle for the Starmap`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tooltip oneLine title={!starmapEnabled ? t`Turn on in Settings › Appearance` : showStarmap ? t`Back to the Circle of Fifths` : t`Show the Starmap`}>
              <button
                onClick={() => { if (starmapEnabled) setStarmapView(v => !v) }}
                disabled={!starmapEnabled}
                aria-pressed={showStarmap}
                style={{
                  display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0,
                  cursor: starmapEnabled ? 'pointer' : 'default',
                  color: !starmapEnabled ? 'var(--state-disabled)' : showStarmap ? 'var(--text-amber)' : 'var(--text-inactive)',
                }}
              >
                {showStarmap ? <ToggleRight size={20} strokeWidth={1.5} /> : <ToggleLeft size={20} strokeWidth={1.5} />}
              </button>
            </Tooltip>
            {showStarmap && (
              <div style={{ display: 'flex', background: 'var(--bg-tile)', borderRadius: 'var(--radius-md)', padding: 2, gap: 1 }}>
                {(['major', 'minor'] as const).map(side => {
                  const active = starmapSide === side
                  return (
                    <button key={side}
                      onClick={() => { if (selectedRoot !== null && !active) pickKey(selectedRoot, side, true) }}
                      aria-pressed={active}
                      style={{
                        padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: 'none',
                        background: active ? 'var(--state-hover-bg)' : 'transparent',
                        color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
                        fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}
                    >{side === 'major' ? t`Maj` : t`Min`}</button>
                  )
                })}
              </div>
            )}
          </div>
        </SettingRow>

        {/* Start over — clears the key, scale, progression and speed and
            turns the keys off */}
        <SettingRow title={t`Reset explorer`} desc={t`Clear key, scale and progression`}>
          <Tooltip oneLine title={t`Clear & Reset`}>
            <button
              onClick={() => {
                setCofPos(null); setCofRing(null); setSelectedScaleIdx(0)
                setSelectedDegree(null); setOctaveTileSelected(false)
                stopProgression(); stopChordSequence(); setSelectedProg(null)
                setProgSpeed('med'); speedRef.current = 'med'
                setInfoRowChord(null); clearExplorerChordDisplay(); setLitChord(null)
                clearExplorerKeys(); clearLockedKeys(); useStore.getState().clearDisplayedChord()
                struckShapeRef.current = null; setInverted(false)
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)', padding: '0 1px', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
            ><RotateCcw size={12} /></button>
          </Tooltip>
        </SettingRow>

        {/* Switch to Chord Explorer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip oneLine title="Switch to Chords Explorer">
            <button
              onClick={() => { setScaleExplorerOpen(false); setChordExplorerOpen(true) }}
              style={EXPLORER_SWITCH_STYLE}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)' }}
            >Chords Explorer <ArrowUpRight size={11} /></button>
          </Tooltip>
        </div>
      </div>
      </div>
    </div>
  )
}
