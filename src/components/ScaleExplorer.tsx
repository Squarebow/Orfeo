import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Chord, Note } from 'tonal'
import { RotateCcw, Play, Square, CircleOff, ListOrdered, Shuffle, ArrowUpRight } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import type { NoteNaming, Accidentals } from '../types'
import SpeedControl from './SpeedControl'
import OrfeoMark from './OrfeoMark'

// ── Keyboard range constants ────────────────────────────────────────────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

// ── Modal dimensions for default positioning above the keyboard ───────────
const MODAL_WIDTH = 720
const MODAL_HEIGHT = 600
const KEYBOARD_HEIGHT = 200

// ── Scale definitions ───────────────────────────────────────────────────────
interface ScaleDef {
  name: string
  intervals: number[]
  romans: string[]
}

const SCALES: ScaleDef[] = [
  { name: 'Major',            intervals: [0,2,4,5,7,9,11], romans: ['I','ii','iii','IV','V','vi','vii°'] },
  { name: 'Natural Minor',    intervals: [0,2,3,5,7,8,10], romans: ['i','ii°','III','iv','v','VI','VII'] },
  { name: 'Harmonic Minor',   intervals: [0,2,3,5,7,8,11], romans: ['i','ii°','III+','iv','V','VI','vii°'] },
  { name: 'Melodic Minor',    intervals: [0,2,3,5,7,9,11], romans: ['i','ii','III+','IV','V','vi°','vii°'] },
  { name: 'Major Pentatonic', intervals: [0,2,4,7,9],       romans: ['I','II','III','V','VI'] },
  { name: 'Minor Pentatonic', intervals: [0,3,5,7,10],      romans: ['i','III','IV','v','VII'] },
  { name: 'Dorian',           intervals: [0,2,3,5,7,9,10], romans: ['i','ii','III','IV','v','vi°','VII'] },
  { name: 'Phrygian',         intervals: [0,1,3,5,7,8,10], romans: ['i','II','III','iv','v°','VI','VII'] },
  { name: 'Lydian',           intervals: [0,2,4,6,7,9,11], romans: ['I','II','iii','#iv°','V','vi','vii'] },
  { name: 'Mixolydian',       intervals: [0,2,4,5,7,9,10], romans: ['I','ii','iii°','IV','v','vi','VII'] },
]

// ── Minor scale names — used to append 'm' to the Key display ───────────────
const MINOR_SCALES = new Set(['Natural Minor', 'Harmonic Minor', 'Melodic Minor', 'Minor Pentatonic', 'Phrygian'])

// ── Circle of Fifths position tables ────────────────────────────────────────
// 12 positions clockwise from top (C)
const COF_MAJOR_PC  = [0, 7, 2, 9, 4, 11, 6,  1,  8, 3, 10, 5]
const COF_MINOR_PC  = [9, 4,11, 6, 1,  8, 3, 10,  5, 0,  7, 2]
// Key signature: positive = sharps, negative = flats
const COF_KEYSIG    = [0, 1, 2, 3, 4,  5, 6, -5, -4,-3,  -2,-1]

// ── Progressions ────────────────────────────────────────────────────────────
interface Progression { name: string; labels: string[]; offsets: number[] }

const PROGRESSIONS: Progression[] = [
  { name: 'Pop',               labels: ['I','V','vi','IV'],                    offsets: [0,7,9,5] },
  { name: 'Doo-Wop',           labels: ['I','vi','IV','V'],                    offsets: [0,9,5,7] },
  { name: 'Rock · Blues',      labels: ['I','IV','V'],                         offsets: [0,5,7] },
  { name: 'Jazz Standard',     labels: ['ii','V','I'],                         offsets: [2,7,0] },
  { name: 'Andalusian',        labels: ['i','VII','VI','V'],                   offsets: [0,10,8,7] },
  { name: 'Pachelbel',         labels: ['I','V','vi','iii','IV','I','IV','V'], offsets: [0,7,9,4,5,0,5,7] },
  { name: 'Minor Pop',         labels: ['i','VI','III','VII'],                 offsets: [0,8,3,10] },
  { name: 'Pop/Rock Inv.',     labels: ['vi','IV','I','V'],                    offsets: [9,5,0,7] },
  { name: 'Epic · Heroic',     labels: ['VI','VII','i'],                       offsets: [8,10,0] },
  { name: 'Royal Road',        labels: ['IV','V','iii','vi'],                  offsets: [5,7,4,9] },
  { name: 'Sentimental',       labels: ['IV','V','I','vi'],                    offsets: [5,7,0,9] },
  { name: 'Sad · Hopeful',     labels: ['I','vi','iii','IV'],                  offsets: [0,9,4,5] },
  { name: 'Mixolydian Rock',   labels: ['I','bVII','IV'],                      offsets: [0,10,5] },
  { name: 'Plagal Turnaround', labels: ['I','IV','I','V'],                     offsets: [0,5,0,7] },
  { name: 'Minor Jazz',        labels: ['ii°','V','i'],                        offsets: [2,7,0] },
  { name: 'Step-Down',         labels: ['i','v','IV','bIII'],                  offsets: [0,7,5,3] },
  { name: 'Circle of Fifths',  labels: ['vi','ii','V','I'],                    offsets: [9,2,7,0] },
  { name: 'Energetic Pop',     labels: ['I','IV','vi','V'],                    offsets: [0,5,9,7] },
  { name: 'Minor Blues',       labels: ['i','iv','v'],                         offsets: [0,5,7] },
  { name: 'Grunge · Modal',    labels: ['I','bIII','IV'],                      offsets: [0,3,5] },
]

const SPEED_MS = { slow: 1500, med: 800, fast: 400 } as const

// ── Roman numeral → 0-based degree index ────────────────────────────────────
const ROMAN_TO_DEGREE: Record<string, number> = {
  'I':0,'i':0,'II':1,'ii':1,'ii°':1,'III':2,'iii':2,'III+':2,'iii°':2,
  'IV':3,'iv':3,'#iv°':3,'V':4,'v':4,'v°':4,'VI':5,'vi':5,'vi°':5,
  'VII':6,'vii°':6,'vii':6,
}

// ── Shared row styles ───────────────────────────────────────────────────────
const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'Inter', fontSize: 9, fontWeight: 700,
  color: '#707088', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}
const ROW: React.CSSProperties = {
  flexShrink: 0, display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', padding: '5px 12px',
  borderBottom: '1px solid #1e1e2a',
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

// ── Diatonic chord type ─────────────────────────────────────────────────────
interface DiatonicChord {
  degree: number
  roman: string
  rootPC: number
  midiNotes: number[]
  chordName: string
  suffix: string
  noteCount: number
}

const QUALITY_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'diminished': 'dim', 'augmented': 'aug',
  'suspended fourth': 'sus4', 'suspended second': 'sus2',
  'dominant seventh': '7', 'major seventh': 'maj7', 'minor seventh': 'm7',
  'half-diminished seventh': 'ø7', 'diminished seventh': 'dim7',
  'major sixth': '6', 'minor sixth': 'm6', 'dominant ninth': '9',
  'power chord': '5',
}

// ── Build one triad from a scale degree, detect quality via tonal ────────────
function buildDiatonicChord(
  root: number,
  scaleIntervals: number[],
  degree: number,
  keyboardSize: number,
  naming: NoteNaming,
  accidentals: Accidentals,
): DiatonicChord {
  const n = scaleIntervals.length
  const scalePCs = scaleIntervals.map(s => (root + s) % 12)
  const { min, max } = RANGES[keyboardSize as 61 | 73 | 88] ?? RANGES[73]

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

  // Detect chord quality via tonal
  const noteNames = midiNotes.map(m => Note.fromMidi(m))
  const detected = Chord.detect(noteNames)
  const best = detected.find(c => !c.includes('/')) ?? detected[0] ?? ''
  let suffix = '?'
  if (best) {
    const info = Chord.get(best)
    suffix = QUALITY_SUFFIX[info.quality?.toLowerCase() ?? ''] ??
             QUALITY_SUFFIX[info.name?.toLowerCase() ?? ''] ??
             (info.aliases?.[0] ?? info.quality ?? '')
  }

  const rootName = getNoteName(baseMidi, naming, accidentals)
  return {
    degree,
    roman: SCALES.find(s => s.intervals === scaleIntervals)?.romans[degree] ?? String(degree + 1),
    rootPC: triadPCs[0],
    midiNotes,
    chordName: rootName + suffix,
    suffix,
    noteCount: midiNotes.length,
  }
}

// ── Apply N-th inversion by rotating the lowest note up an octave ────────────
function applyNthInversion(baseMidi: number[], n: number): number[] {
  if (n <= 0) return baseMidi
  let notes = [...baseMidi].sort((a, b) => a - b)
  for (let i = 0; i < n; i++) {
    const [lowest, ...rest] = notes
    notes = [...rest, lowest + 12]
  }
  return notes
}

// ── Inversion helpers — rotate live chord up or down one voicing ──────────────
// Same pattern as ChordExplorer: operate on the live explorerKeys set so
// inversions accumulate across octaves rather than wrapping at chord length.
function nextInversionSet(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}
function prevInversionSet(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  return new Set([highest - 12, ...sorted.slice(0, -1)])
}


// ── Component ────────────────────────────────────────────────────────────────
export default function ScaleExplorer() {
  // ── Store subscriptions ───────────────────────────────────────────────────
  const scaleExplorerOpen = useStore(s => s.scaleExplorerOpen)
  const setScaleExplorerOpen = useStore(s => s.setScaleExplorerOpen)
  const setChordExplorerOpen = useStore(s => s.setChordExplorerOpen)
  const explorerKeys = useStore(s => s.explorerKeys)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const setExplorerChordDisplay = useStore(s => s.setExplorerChordDisplay)
  const clearExplorerChordDisplay = useStore(s => s.clearExplorerChordDisplay)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  const setKeyboardSize = useStore(s => s.setKeyboardSize)
  const keyboardSize = useStore(s => s.keyboardSize)

  // ── Window drag position — recomputed on every open against live dimensions
  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth - MODAL_WIDTH) / 2),
    y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2) - 160,
  }))

  // ── CoF + scale selection state ───────────────────────────────────────────
  const [cofPos, setCofPos] = useState<number | null>(null)
  const [cofRing, setCofRing] = useState<'major' | 'minor' | null>(null)
  const [selectedScaleIdx, setSelectedScaleIdx] = useState(0)
  const [selectedDegree, setSelectedDegree] = useState<number | null>(null)

  // ── Progression state ─────────────────────────────────────────────────────
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progDropdownOpen, setProgDropdownOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<'slow' | 'med' | 'fast'>('med')
  const [progInversionMode, setProgInversionMode] = useState<'off' | 'sequential' | 'random'>('off')

  // ── Info row: currently playing chord context ─────────────────────────────
  const [infoRowChord, setInfoRowChord] = useState<{ progName: string; labels: string[]; notes: string[]; step: number } | null>(null)

  // ── Octave tile selection — separate from selectedDegree (0-6) ────────────
  // True when the 8th tile (tonic +12) is the active selection.
  const [octaveTileSelected, setOctaveTileSelected] = useState(false)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const prevSizeRef = useRef<61 | 73 | 88 | null>(null)
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // speedRef lets playProgStepAt read the live speed without restarting the chain
  const speedRef = useRef<'slow' | 'med' | 'fast'>('med')
  const progRunningRef = useRef(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const progDropRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ ox: number; oy: number; mx: number; my: number } | null>(null)
  const scalePlayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // ── Scale replay trigger — incremented on every CoF click so the play ─────
  // effect fires even when the same segment is clicked twice in a row
  const playTriggerRef = useRef(0)
  const [playTrigger, setPlayTrigger] = useState(0)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // ── Derived root pitch class from CoF selection ───────────────────────────
  const selectedRoot = useMemo(() => {
    if (cofPos === null || cofRing === null) return null
    return cofRing === 'major' ? COF_MAJOR_PC[cofPos] : COF_MINOR_PC[cofPos]
  }, [cofPos, cofRing])

  const scale = SCALES[selectedScaleIdx]

  // ── Build all diatonic triads when root or scale type changes ─────────────
  const diatonicChords = useMemo<DiatonicChord[]>(() => {
    if (selectedRoot === null) return []
    return scale.intervals.map((_, deg) =>
      buildDiatonicChord(selectedRoot, scale.intervals, deg, 61, displayNaming, accidentals)
    )
  }, [selectedRoot, scale, displayNaming, accidentals])

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

  // ── On open: force 61 keys, pause playback, reset all transient state ─────
  useEffect(() => {
    if (scaleExplorerOpen) {
      // ── Recentre on live window dimensions every time modal opens ───────
      setPos({
        x: Math.round((window.innerWidth - MODAL_WIDTH) / 2),
        y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2) - 160,
      })
      prevSizeRef.current = useStore.getState().keyboardSize as 61 | 73 | 88
      setKeyboardSize(61)
      if (useStore.getState().playbackState === 'playing') {
        ;(window as any).__orfeoPlayer?.pause?.()
        useStore.getState().setPlaybackState('paused')
      }
      setCofPos(null); setCofRing(null); setSelectedScaleIdx(0)
      stopProgression()
      setSelectedProg(null)
      setProgDropdownOpen(false)
      setDropdownRect(null)
      setProgInversionMode('off')
      setProgSpeed('med'); speedRef.current = 'med'
      setSelectedDegree(null)
      setOctaveTileSelected(false)
      setInfoRowChord(null)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    } else if (prevSizeRef.current !== null) {
      setKeyboardSize(prevSizeRef.current)
      prevSizeRef.current = null
      stopProgression()
      clearScalePlayTimers()
      clearExplorerKeys()
      clearExplorerChordDisplay()
    }
  }, [scaleExplorerOpen, setKeyboardSize, stopProgression, clearScalePlayTimers, clearExplorerKeys, clearExplorerChordDisplay])

  // ── Play scale notes ascending and light keys when root/scale changes ──────
  useEffect(() => {
    if (!scaleExplorerOpen || selectedRoot === null) return
    clearScalePlayTimers()
    const playNote = (window as any).__orfeoPlayNote
    const { min, max } = RANGES[61]
    const noteMidis: number[] = []
    for (const interval of scale.intervals) {
      let m = selectedRoot + 60 + interval
      while (m < min) m += 12
      while (m > max) m -= 12
      if (m >= min && m <= max) noteMidis.push(m)
    }
    // Append octave root
    if (noteMidis.length > 0) {
      const octaveUp = noteMidis[0] + 12
      const octaveDown = noteMidis[0] - 12
      if (octaveUp <= max) noteMidis.push(octaveUp)
      else if (octaveDown >= min) noteMidis.push(octaveDown)
    }
    const keys = new Set(noteMidis)
    const colors = new Map<number, string>()
    noteMidis.forEach((m, i) => {
      colors.set(m, i === 0 || i === noteMidis.length - 1 ? '#e8a027' : '#4a90d9')
    })
    setExplorerKeys(keys, colors)
    setSelectedDegree(null)
    setOctaveTileSelected(false)

    if (playNote) {
      noteMidis.forEach((m, i) => {
        const t = setTimeout(() => playNote(m, 0.6, 400), i * 220)
        scalePlayTimersRef.current.push(t)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx, scaleExplorerOpen, playTrigger])

  // ── Play a diatonic chord tile and light its keys ─────────────────────────
  const playDegree = useCallback((chord: DiatonicChord) => {
    setOctaveTileSelected(false)
    setSelectedDegree(chord.degree)
    const keys = new Set(chord.midiNotes)
    const colors = new Map<number, string>()
    chord.midiNotes.forEach(m => colors.set(m, '#6080d0'))
    if (chord.midiNotes[0] !== undefined) colors.set(chord.midiNotes[0], '#e8a027')
    setExplorerKeys(keys, colors)
    // ── Store chord identity in Zustand so Keyboard.tsx can display it ────
    setExplorerChordDisplay({ name: chord.chordName, invCount: 0, noteCount: chord.midiNotes.length })
    setInfoRowChord({
      progName: '',
      labels: [chord.roman],
      notes: chord.midiNotes.map(m => getNoteName(m, displayNaming, accidentals)),
      step: 0,
    })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) chord.midiNotes.forEach(m => playNote(m, 0.7, 600))
  }, [setExplorerKeys, displayNaming, accidentals])

  // ── Play the tonic chord one octave higher (8th tile) ────────────────────
  // Transposes every MIDI note in diatonicChords[0] up by 12. Clears regular
  // degree selection so only the octave tile appears highlighted.
  const playOctaveDegree = useCallback(() => {
    if (!diatonicChords[0]) return
    const tonic = diatonicChords[0]
    const octaveMidi = tonic.midiNotes.map(n => n + 12)
    setSelectedDegree(null)
    setOctaveTileSelected(true)
    const keys = new Set(octaveMidi)
    const colors = new Map<number, string>()
    octaveMidi.forEach((m, i) => colors.set(m, i === 0 ? '#e8a027' : '#6080d0'))
    setExplorerKeys(keys, colors)
    // ── Store chord identity in Zustand so Keyboard.tsx can display it ────
    setExplorerChordDisplay({ name: tonic.chordName, invCount: 0, noteCount: octaveMidi.length })
    setInfoRowChord({
      progName: '',
      labels: [tonic.roman + '⁸'],
      notes: octaveMidi.map(m => getNoteName(m, displayNaming, accidentals)),
      step: 0,
    })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) octaveMidi.forEach(m => playNote(m, 0.7, 600))
  }, [diatonicChords, setExplorerKeys, displayNaming, accidentals])

  // ── Base MIDI notes for the currently selected tile (inversion source) ─────
  // Octave tile takes precedence: returns tonic notes +12 when that tile is
  // active so the inversion buttons remain enabled and operate at the right pitch.
  const currentBaseMidi = useMemo(() => {
    if (octaveTileSelected && diatonicChords[0]) return diatonicChords[0].midiNotes.map(n => n + 12)
    if (selectedDegree === null || !diatonicChords[selectedDegree]) return []
    return diatonicChords[selectedDegree].midiNotes
  }, [selectedDegree, octaveTileSelected, diatonicChords])

  // ── Rotate the live chord voicing down (prev) or up (next) ──────────────
  // Mirrors ChordExplorer's handleInversion: reads explorerKeys from the store
  // each time so rotations accumulate across octaves instead of wrapping at
  // chord length. Bass note is amber, upper notes are blue.
  const handlePrevInversion = useCallback(() => {
    const state = useStore.getState()
    if (state.explorerKeys.size === 0) return
    const notes = prevInversionSet(state.explorerKeys)
    const sorted = Array.from(notes).sort((a, b) => a - b)
    const colors = new Map<number, string>()
    sorted.forEach((m, i) => colors.set(m, i === 0 ? '#e8a027' : '#6080d0'))
    setExplorerKeys(notes, colors)
    const cd = state.explorerChordDisplay
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount - 1 })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) sorted.forEach(m => playNote(m, 0.7, 600))
  }, [setExplorerKeys])

  // ── Step to next inversion ────────────────────────────────────────────────
  const handleNextInversion = useCallback(() => {
    const state = useStore.getState()
    if (state.explorerKeys.size === 0) return
    const notes = nextInversionSet(state.explorerKeys)
    const sorted = Array.from(notes).sort((a, b) => a - b)
    const colors = new Map<number, string>()
    sorted.forEach((m, i) => colors.set(m, i === 0 ? '#e8a027' : '#6080d0'))
    setExplorerKeys(notes, colors)
    const cd = state.explorerChordDisplay
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + 1 })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) sorted.forEach(m => playNote(m, 0.7, 600))
  }, [setExplorerKeys])

  // ── Play one progression step and schedule the next ──────────────────────
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    invMode: 'off' | 'sequential' | 'random',
    loopCount: number,
  ) => {
    if (!progRunningRef.current) return
    if (diatonicChords.length === 0) return
    const prog = PROGRESSIONS[progIndex]
    if (!prog) return
    const labels = prog.labels
    const label = labels[step % labels.length]
    const degreeIdx = ROMAN_TO_DEGREE[label] ?? 0
    const clampedDeg = degreeIdx % diatonicChords.length
    const chord = diatonicChords[clampedDeg]
    if (!chord) return

    let inv = 0
    if (invMode === 'sequential') {
      inv = loopCount % chord.midiNotes.length
    } else if (invMode === 'random') {
      inv = Math.floor(Math.random() * chord.midiNotes.length)
    }
    const notes = applyNthInversion(chord.midiNotes, inv)

    const keys = new Set(notes)
    const colors = new Map<number, string>()
    notes.forEach((m, i) => colors.set(m, i === 0 ? '#e8a027' : '#6080d0'))
    setExplorerKeys(keys, colors)
    setProgStep(step)
    setSelectedDegree(clampedDeg)
    setInfoRowChord({
      progName: prog.name,
      labels: prog.labels,
      notes: notes.map(m => getNoteName(m, displayNaming, accidentals)),
      step,
    })

    const currentSpeed = speedRef.current
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) notes.forEach(m => playNote(m, 0.75, SPEED_MS[currentSpeed] - 60))

    const nextStep = (step + 1) % labels.length
    const nextLoop = nextStep === 0 ? loopCount + 1 : loopCount
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, invMode, nextLoop)
    }, SPEED_MS[speedRef.current])
  }, [diatonicChords, setExplorerKeys, displayNaming, accidentals])

  // ── Start progression from step 0 ────────────────────────────────────────
  const startProgression = useCallback(() => {
    if (selectedProg === null || diatonicChords.length === 0) return
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    playProgStepAt(0, selectedProg, progInversionMode, 0)
  }, [selectedProg, diatonicChords.length, progInversionMode, stopProgression, playProgStepAt])

  // ── Stop progression when root or scale type changes ──────────────────────
  useEffect(() => {
    if (progPlaying) stopProgression()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx])

  // ── Close progression dropdown on outside click ───────────────────────────
  useEffect(() => {
    if (!progDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (
        progDropRef.current && !progDropRef.current.contains(e.target as Node) &&
        progTriggerRef.current && !progTriggerRef.current.contains(e.target as Node)
      ) {
        setProgDropdownOpen(false)
        setDropdownRect(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [progDropdownOpen])

  // ── Window drag handler ───────────────────────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { ox: pos.x, oy: pos.y, mx: e.clientX, my: e.clientY }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.mx),
        y: Math.max(0, dragRef.current.oy + ev.clientY - dragRef.current.my),
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

  if (!scaleExplorerOpen) return null

  // ── SVG geometry constants ─────────────────────────────────────────────────
  // Circle centre in SVG coordinate space; viewBox offset (-40) keeps top symbols visible
  const CX = 190, CY = 190
  const R_OUTER1 = 110, R_OUTER2 = 175
  const R_INNER1 = 55,  R_INNER2 = 110

  return (
    // ── Modal container ────────────────────────────────────────────────────
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 720,
        maxHeight: '96vh',
        background: '#13131c',
        border: '1px solid #2a2a3a',
        borderRadius: 10,
        boxShadow: '0 8px 48px rgba(0,0,0,0.85)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Inter',
      }}
    >
      {/* Header — drag handle */}
      <div onMouseDown={onDragStart} style={{
        flexShrink: 0, height: 32, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px',
        background: '#0f0f18', borderBottom: '1px solid #1e1e2a',
        cursor: 'grab', userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <OrfeoMark height={14} />
          <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Scale Explorer
          </span>
        </div>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { stopProgression(); clearExplorerKeys(); clearExplorerChordDisplay(); setScaleExplorerOpen(false) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
          onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
          onMouseLeave={e => e.currentTarget.style.color = '#505068'}
        >×</button>
      </div>

      {/* CoF section — scale buttons | Circle of Fifths SVG with info overlay */}
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '16px 16px 46px 12px',
        background: '#0f0f18', borderBottom: '1px solid #1e1e2a',
        gap: 8, overflow: 'visible', position: 'relative',
      }}>
        {/* Guideline text — absolute top-left of CoF section, always visible */}
        <div style={{
          position: 'absolute', top: 16, left: 12, right: 12,
          fontFamily: 'Inter', fontSize: 9, color: '#707088', lineHeight: '1.6',
          pointerEvents: 'none', zIndex: 5,
        }}>
          <div>Click a key on the circle to explore its scale and</div>
          <div>diatonic chords. Select a progression and click play</div>
          <div>to hear the chords in the scale. Try inversions!</div>
        </div>
        {/* Scale type buttons — centred at CoF middle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 116, flexShrink: 0, alignSelf: 'center', marginTop: 20 }}>
          <span style={{ ...ROW_LABEL, marginBottom: 3 }}>Scale</span>
          {SCALES.map((s, i) => {
            const sel = selectedScaleIdx === i
            return (
              <button key={s.name} onClick={() => setSelectedScaleIdx(i)}
                style={{
                  fontFamily: 'Inter', fontSize: 10, padding: '3px 6px',
                  background: sel ? '#e8a02722' : 'none',
                  color: sel ? '#e8a027' : '#9090a8',
                  border: `1px solid ${sel ? '#e8a027' : 'transparent'}`,
                  borderRadius: 4, cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.color = '#c0c0d8' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.color = '#9090a8' }}
              >{s.name}</button>
            )
          })}
        </div>

        {/* CoF SVG — flex:1 with relative positioning for the info overlay */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'visible', position: 'relative' }}>
          {/* Scale info — single line, top aligns with left guideline text, centred on CoF vertical axis */}
          {infoText && (
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'baseline', gap: 8,
              background: 'rgba(15,15,24,0.88)', borderRadius: 6, padding: '4px 10px',
              zIndex: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#e8a027' }}>
                {infoText.rootName}
              </span>
              <span style={{ fontSize: 11, color: '#9090a8' }}>{infoText.scaleName}</span>
              <span style={{ fontSize: 9, color: '#505068', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono' }}>
                {infoText.noteNames.join(' · ')}
              </span>
            </div>
          )}
          <svg width={380} height={420} viewBox="0 -40 380 420" style={{ overflow: 'visible', flexShrink: 0 }}>
            {Array.from({ length: 12 }, (_, i) => {
              const startDeg = -90 + i * 30
              const endDeg   = startDeg + 30
              const midDeg   = startDeg + 15
              const isSelOuter = cofPos === i && cofRing === 'major'
              const isSelInner = cofPos === i && cofRing === 'minor'
              const outerFill = isSelOuter ? '#e8a02722' : '#1e1e2a'
              const innerFill = isSelInner ? '#e8a02722' : '#181820'
              const outerLabel = labelPos(CX, CY, (R_OUTER1 + R_OUTER2) / 2, midDeg)
              const innerLabel = labelPos(CX, CY, (R_INNER1 + R_INNER2) / 2, midDeg)
              const keySig = getKeySigSymbol(i)
              // Shrink font for longer strings so inner text edge stays ~8px from ring for all lengths
              const sigFontSize = keySig.length <= 3 ? 11 : keySig.length <= 5 ? 9 : 8
              const sigCharHW = sigFontSize <= 8 ? 2.5 : sigFontSize <= 9 ? 2.75 : 3.5
              const sigR = Math.round(R_OUTER2 + 8 + keySig.length * sigCharHW)
              const sigLabel = labelPos(CX, CY, sigR, midDeg)
              return (
                <g key={i}>
                  {/* Outer ring wedge — major key */}
                  <path
                    d={wedgePath(CX, CY, R_OUTER1, R_OUTER2, startDeg, endDeg)}
                    fill={outerFill} stroke="#2a2a3a" strokeWidth={1}
                    style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                    onClick={() => { setCofPos(i); setCofRing('major'); setSelectedScaleIdx(0); setInfoRowChord(null); setSelectedDegree(null); clearExplorerChordDisplay(); playTriggerRef.current += 1; setPlayTrigger(playTriggerRef.current) }}
                    onMouseEnter={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', '#2a2a3a') }}
                    onMouseLeave={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', '#1e1e2a') }}
                  >
                    <title>Harmonic Major</title>
                  </path>
                  {/* Inner ring wedge — minor key */}
                  <path
                    d={wedgePath(CX, CY, R_INNER1, R_INNER2, startDeg, endDeg)}
                    fill={innerFill} stroke="#2a2a3a" strokeWidth={1}
                    style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                    onClick={() => { setCofPos(i); setCofRing('minor'); setSelectedScaleIdx(1); setInfoRowChord(null); setSelectedDegree(null); clearExplorerChordDisplay(); playTriggerRef.current += 1; setPlayTrigger(playTriggerRef.current) }}
                    onMouseEnter={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', '#222230') }}
                    onMouseLeave={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', '#181820') }}
                  >
                    <title>Natural Minor</title>
                  </path>
                  <circle cx={CX} cy={CY} r={R_INNER1} fill="#0f0f18" stroke="#2a2a3a" strokeWidth={1} style={{ pointerEvents: 'none' }} />
                  {/* Major key label */}
                  <text x={outerLabel.x} y={outerLabel.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={13} fontWeight={700} fontFamily="JetBrains Mono"
                    fill={isSelOuter ? '#e8a027' : '#e0e0e0'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{getMajorLabel(i)}</text>
                  {/* Minor key label */}
                  <text x={innerLabel.x} y={innerLabel.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontFamily="Inter"
                    fill={isSelInner ? '#e8a027' : '#e0e0e0'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{getMinorLabel(i)}</text>
                  {/* Key signature accidentals — font scales with length to keep equal gap from ring */}
                  {keySig && (
                    <text x={sigLabel.x} y={sigLabel.y}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={sigFontSize} fontFamily="Inter"
                      fill="#e8a02799"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >{keySig}</text>
                  )}
                </g>
              )
            })}
            {/* Centre label */}
            <text x={CX} y={CY - 8} textAnchor="middle" dominantBaseline="middle"
              fontSize={13} fontFamily="Inter" fontWeight={400} fill="#e8a027"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>Circle</text>
            <text x={CX} y={CY + 8} textAnchor="middle" dominantBaseline="middle"
              fontSize={13} fontFamily="Inter" fontWeight={400} fill="#e8a027"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>of Fifths</text>
          </svg>
        </div>
        {/* Chords in the Scale label — absolute at bottom of CoF section */}
        <div style={{ position: 'absolute', bottom: 6, left: 12, pointerEvents: 'none' }}>
          <span style={{ ...ROW_LABEL }}>Chords in the Scale</span>
        </div>
      </div>

      {/* Diatonic chord tiles — 7 tiles in a horizontal row */}
      <div style={{ flexShrink: 0, padding: '4px 12px', minHeight: 44 }}>
        {selectedRoot === null ? (
          <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: '#404055' }}>Select a key from the circle above to see diatonic chords</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4 }}>
            {diatonicChords.map(chord => {
              const sel = selectedDegree === chord.degree
              return (
                // Chord tile: chord name left, notes + roman stacked right-aligned
                <button
                  key={chord.degree}
                  onClick={() => playDegree(chord)}
                  style={{
                    flex: 1, background: sel ? '#1e2a3a' : '#1a1a28',
                    border: `1px solid ${sel ? '#6080d0' : '#2a2a3a'}`,
                    borderRadius: 6,
                    paddingTop: 8, paddingBottom: 8, paddingLeft: 6, paddingRight: 6,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'row',
                    justifyContent: 'space-between', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#3a3a5a' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#2a2a3a' }}
                >
                  {/* Left: chord name */}
                  <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: '#e0e0e0', lineHeight: 1, flexShrink: 0 }}>
                    {chord.chordName}
                  </span>
                  {/* Right: note names + roman numeral stacked, right-aligned */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, alignItems: 'flex-end' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#9090a8', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {chord.midiNotes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
                    </span>
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#e8a02799', lineHeight: 1, textAlign: 'right' }}>
                      {chord.roman}
                    </span>
                  </div>
                </button>
              )
            })}
            {/* ── 8th tile: tonic chord one octave higher — completes the run ── */}
            {diatonicChords[0] && (() => {
              const tonic = diatonicChords[0]
              const sel = octaveTileSelected
              const octaveMidi = tonic.midiNotes.map(n => n + 12)
              return (
                <button
                  onClick={playOctaveDegree}
                  style={{
                    flex: 1, background: sel ? '#1e2a3a' : '#1a1a28',
                    border: `1px solid ${sel ? '#6080d0' : '#2a2a3a'}`,
                    borderRadius: 6,
                    paddingTop: 8, paddingBottom: 8, paddingLeft: 6, paddingRight: 6,
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'row',
                    justifyContent: 'space-between', alignItems: 'center', gap: 4,
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#3a3a5a' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#2a2a3a' }}
                >
                  {/* Left: chord name — same as tonic */}
                  <span style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: '#e0e0e0', lineHeight: 1, flexShrink: 0 }}>
                    {tonic.chordName}
                  </span>
                  {/* Right: octave note names + roman numeral with ⁸ superscript */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, alignItems: 'flex-end' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#9090a8', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {octaveMidi.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
                    </span>
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#e8a02799', lineHeight: 1, textAlign: 'right' }}>
                      {tonic.roman}⁸
                    </span>
                  </div>
                </button>
              )
            })()}
          </div>
        )}
      </div>

      {/* Chord/inversion info display row */}
      <div style={{
        flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px',
        borderTop: '1px solid #1e1e2a', background: '#0d0d12',
        position: 'relative',
      }}>
        {infoRowChord ? (
          <>
            {/* Left — CHORD QUALITY label + all progression steps on one line.
                Active step amber/bold; inactive steps dim.
                Single-tile clicks have labels.length === 1 so only one span renders. */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 60, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#707088', letterSpacing: '0.10em', textTransform: 'uppercase', userSelect: 'none', flexShrink: 0 }}>
                Chord Quality
              </span>
              {infoRowChord.labels.map((label, i) => (
                <span key={i} style={{
                  fontFamily: 'Inter',
                  fontSize: i === infoRowChord.step ? 12 : 11,
                  fontWeight: i === infoRowChord.step ? 700 : 400,
                  color: i === infoRowChord.step ? '#e8a027' : '#505068',
                  userSelect: 'none', lineHeight: 1,
                }}>{label}</span>
              ))}
            </div>
            {/* Centre — note names, large, absolutely centred in the row */}
            <span style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'JetBrains Mono', fontSize: 16, color: '#b0b0cc',
              letterSpacing: '0.06em', userSelect: 'none', whiteSpace: 'nowrap',
            }}>
              {infoRowChord.notes.join('  ')}
            </span>
            {/* Right — chord name (when available) then fixed KEY: label */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minWidth: 60 }}>
              {infoText && (
                <span style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 700, color: '#e8a027', userSelect: 'none', lineHeight: 1 }}>
                  {infoText.rootName}{keyQuality}
                </span>
              )}
              <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#707088', letterSpacing: '0.10em', textTransform: 'uppercase', userSelect: 'none' }}>
                Key
              </span>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 10, color: '#303048', fontFamily: 'Inter', margin: '0 auto' }}>—</span>
        )}
      </div>

      {/* Progressions + inversion mode row — three-column layout */}
      <div style={{ ...ROW, minHeight: 44, borderTop: '1px solid #1e1e2a', position: 'relative' }}>
        {/* Left column: PROGRESSIONS label + pattern dropdown ─────────────── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={ROW_LABEL}>Progressions</span>
          {/* Pattern picker dropdown trigger */}
          <button
            ref={progTriggerRef}
            onClick={() => {
              if (progDropdownOpen) { setProgDropdownOpen(false); setDropdownRect(null); return }
              const rect = progTriggerRef.current?.getBoundingClientRect()
              if (rect) setDropdownRect({ top: rect.bottom + 4, left: rect.left })
              setProgDropdownOpen(true)
            }}
            style={{
              fontFamily: 'Inter', fontSize: 10, padding: '2px 8px',
              background: '#1a1a28', color: selectedProg !== null ? '#e8a027' : '#707088',
              border: '1px solid #2a2a3a', borderRadius: 4, cursor: 'pointer',
              whiteSpace: 'nowrap', minWidth: 130,
            }}
          >
            {selectedProg !== null ? PROGRESSIONS[selectedProg].name : 'Pick a pattern …'}
          </button>
          {selectedProg !== null && (
            <button onClick={() => { setSelectedProg(null); stopProgression() }}
              style={{ background: 'none', border: 'none', color: '#505068', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#505068'}
            >×</button>
          )}
        </div>

        {/* Centre column: PLAY/STOP button + SpeedControl — absolute centred ─ */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {/* Outlined play/stop — amber at rest, red during playback */}
          <button
            onClick={() => { if (progPlaying) stopProgression(); else startProgression() }}
            disabled={selectedProg === null || diatonicChords.length === 0}
            title={selectedProg === null ? 'Pick a pattern to play a progression' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
              background: 'none',
              border: `1.5px solid ${progPlaying ? '#c0392b' : selectedProg !== null && diatonicChords.length > 0 ? '#e8a027' : '#505068'}`,
              boxShadow: progPlaying ? '0 0 6px #c0392b' : selectedProg !== null && diatonicChords.length > 0 ? '0 0 6px #e8a027' : 'none',
              color: progPlaying ? '#c0392b' : selectedProg !== null && diatonicChords.length > 0 ? '#e8a027' : '#505068',
            }}
          >
            {progPlaying ? <Square size={12} /> : <Play size={12} />}
            {progPlaying ? 'STOP' : 'PLAY'}
          </button>
          {/* Speed selector SVG component */}
          <SpeedControl
            value={progSpeed}
            onChange={v => { setProgSpeed(v); speedRef.current = v }}
          />
        </div>

        {/* Right column: INVERSIONS label + icon buttons ────────────────────── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <span style={ROW_LABEL}>Inversions</span>
          {/* Off — CircleOff icon */}
          <button
            onClick={() => setProgInversionMode('off')}
            title="Inversions off"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'off' ? '#e8a027' : '#505068' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'off' ? '#e8a027' : '#505068'}
          ><CircleOff size={14} /></button>
          {/* Sequential — ListOrdered icon */}
          <button
            onClick={() => setProgInversionMode('sequential')}
            title="Sequential inversions"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'sequential' ? '#e8a027' : '#505068' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'sequential' ? '#e8a027' : '#505068'}
          ><ListOrdered size={14} /></button>
          {/* Random — Shuffle icon */}
          <button
            onClick={() => setProgInversionMode('random')}
            title="Random inversions"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'random' ? '#e8a027' : '#505068' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'random' ? '#e8a027' : '#505068'}
          ><Shuffle size={14} /></button>
        </div>
      </div>

      {/* Footer — SHOW AS + inversion browser + Chord Explorer switch */}
      <div style={{
        ...ROW, minHeight: 44,
        borderTop: '1px solid #1e1e2a', borderBottom: 'none',
        background: '#0d0d12', padding: '0 12px', position: 'relative',
      }}>
        {/* Accidentals toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...ROW_LABEL }}>Show As</span>
          {(['flat', 'sharp'] as const).map(v => (
            <button key={v} onClick={() => setAccidentals(v)}
              style={{
                fontFamily: 'Inter', fontSize: 16, background: 'none', border: 'none',
                color: accidentals === v ? '#e8a027' : '#505068', cursor: 'pointer', padding: '0 3px',
              }}
              onMouseEnter={e => { if (accidentals !== v) e.currentTarget.style.color = '#9090a8' }}
              onMouseLeave={e => { if (accidentals !== v) e.currentTarget.style.color = '#505068' }}
            >{v === 'flat' ? '♭' : '♯'}</button>
          ))}
        </div>

        {/* Centre: inversion browser — Play icons + static grey label */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Previous inversion — Play icon mirrored on vertical axis */}
          <button onClick={handlePrevInversion} disabled={!currentBaseMidi.length}
            style={{ background: 'none', border: 'none', color: currentBaseMidi.length ? '#e8a027' : '#303048', cursor: currentBaseMidi.length ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (currentBaseMidi.length) e.currentTarget.style.color = '#ffb84d' }}
            onMouseLeave={e => { e.currentTarget.style.color = currentBaseMidi.length ? '#e8a027' : '#303048' }}
          ><Play size={14} style={{ transform: 'scaleX(-1)' }} /></button>
          {/* Static grey label — chord display is above the keyboard only */}
          <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 700, color: '#505068', letterSpacing: '0.12em', textTransform: 'uppercase', userSelect: 'none' }}>
            Play Inversion
          </span>
          {/* Next inversion — Play icon normal */}
          <button onClick={handleNextInversion} disabled={!currentBaseMidi.length}
            style={{ background: 'none', border: 'none', color: currentBaseMidi.length ? '#e8a027' : '#303048', cursor: currentBaseMidi.length ? 'pointer' : 'default', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (currentBaseMidi.length) e.currentTarget.style.color = '#ffb84d' }}
            onMouseLeave={e => { e.currentTarget.style.color = currentBaseMidi.length ? '#e8a027' : '#303048' }}
          ><Play size={14} /></button>
          {/* Reset button */}
          <button
            onClick={() => {
              setCofPos(null); setCofRing(null); setSelectedScaleIdx(0)
              setSelectedDegree(null); stopProgression(); setSelectedProg(null)
              setProgInversionMode('off'); setProgSpeed('med'); speedRef.current = 'med'
              setInfoRowChord(null); clearExplorerChordDisplay()
              clearExplorerKeys(); clearLockedKeys(); useStore.getState().clearDisplayedChord()
            }}
            title="Clear & reset"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = '#505068'}
          ><RotateCcw size={13} /></button>
        </div>

        {/* Switch to Chord Explorer */}
        <button
          onClick={() => { setScaleExplorerOpen(false); setChordExplorerOpen(true) }}
          title="Switch to Chord Explorer"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
          onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
          onMouseLeave={e => e.currentTarget.style.color = '#505068'}
        >Chord Explorer <ArrowUpRight size={11} /></button>
      </div>

      {/* Progression dropdown — portalled to body to avoid modal clipping */}
      {progDropdownOpen && dropdownRect && createPortal(
        <div ref={progDropRef} style={{
          position: 'fixed', top: dropdownRect.top, left: dropdownRect.left,
          background: '#1a1a26', border: '1px solid #2a2a3a',
          borderRadius: 6, zIndex: 1000, minWidth: 260, maxHeight: 260,
          overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
        }}>
          {PROGRESSIONS.map((p, i) => (
            <button key={p.name}
              onClick={() => { setSelectedProg(i); setProgDropdownOpen(false); setDropdownRect(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                width: '100%', textAlign: 'left',
                background: selectedProg === i ? '#2a2a3a' : 'none',
                border: 'none', padding: '5px 10px',
                color: selectedProg === i ? '#e8a027' : '#9090a8',
                fontFamily: 'Inter', fontSize: 10, cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a2a3a'; e.currentTarget.style.color = '#e8a027' }}
              onMouseLeave={e => { e.currentTarget.style.background = selectedProg === i ? '#2a2a3a' : 'none'; e.currentTarget.style.color = selectedProg === i ? '#e8a027' : '#9090a8' }}
            >
              {/* Left column: progression name */}
              <span style={{ minWidth: 90, flexShrink: 0, whiteSpace: 'nowrap' }}>{p.name}</span>
              {/* Right column: roman numerals — dimmer, monospace */}
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, opacity: 0.65, whiteSpace: 'nowrap' }}>
                {p.labels.join('  ')}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
