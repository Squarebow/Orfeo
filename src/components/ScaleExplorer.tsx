import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Chord, Note } from 'tonal'
import { Hand, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import type { NoteNaming, Accidentals } from '../types'

// ── Keyboard range constants ────────────────────────────────────────────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

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

// ── Circle of Fifths ────────────────────────────────────────────────────────
// 12 positions clockwise from top (C)
const COF_MAJOR_PC  = [0, 7, 2, 9, 4, 11, 6,  1,  8, 3, 10, 5]
const COF_MINOR_PC  = [9, 4,11, 6, 1,  8, 3, 10,  5, 0,  7, 2]
// Key signature: positive = sharps, negative = flats
const COF_KEYSIG    = [0, 1, 2, 3, 4,  5, 6, -5, -4,-3,  -2,-1]

// ── Progressions (same 15 as ChordExplorer) ────────────────────────────────
interface Progression { name: string; labels: string[]; offsets: number[] }

const PROGRESSIONS: Progression[] = [
  { name: 'I–IV–V',        labels: ['I','IV','V'],                                        offsets: [0,5,7] },
  { name: 'I–V–vi–IV',     labels: ['I','V','vi','IV'],                                   offsets: [0,7,9,5] },
  { name: 'I–vi–IV–V',     labels: ['I','vi','IV','V'],                                   offsets: [0,9,5,7] },
  { name: 'ii–V–I',        labels: ['ii','V','I'],                                        offsets: [2,7,0] },
  { name: 'I–IV–vi–V',     labels: ['I','IV','vi','V'],                                   offsets: [0,5,9,7] },
  { name: 'I–IV–I–V',      labels: ['I','IV','I','V'],                                    offsets: [0,5,0,7] },
  { name: 'vi–IV–I–V',     labels: ['vi','IV','I','V'],                                   offsets: [9,5,0,7] },
  { name: 'I–III–IV–iv',   labels: ['I','III','IV','iv'],                                 offsets: [0,4,5,5] },
  { name: '12-bar Blues',  labels: ['I','I','I','I','IV','IV','I','I','V','IV','I','V'],  offsets: [0,0,0,0,5,5,0,0,7,5,0,7] },
  { name: 'I–ii–IV–V',     labels: ['I','ii','IV','V'],                                   offsets: [0,2,5,7] },
  { name: 'I–V–IV–V',      labels: ['I','V','IV','V'],                                    offsets: [0,7,5,7] },
  { name: 'ii–IV–I',       labels: ['ii','IV','I'],                                       offsets: [2,5,0] },
  { name: 'I–vi–ii–V',     labels: ['I','vi','ii','V'],                                   offsets: [0,9,2,7] },
  { name: 'iii–vi–ii–V–I', labels: ['iii','vi','ii','V','I'],                             offsets: [4,9,2,7,0] },
  { name: 'I–IV–V–IV',     labels: ['I','IV','V','IV'],                                   offsets: [0,5,7,5] },
]

const SPEED_MS = { slow: 1500, med: 800, fast: 400 } as const

// Maps roman numeral labels → 0-based scale degree index
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

// ── SVG helpers ─────────────────────────────────────────────────────────────
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

function labelPos(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ── Diatonic chord building ─────────────────────────────────────────────────
interface DiatonicChord {
  degree: number
  roman: string
  rootPC: number
  midiNotes: number[]
  chordName: string  // localized root + suffix
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

  // Place root in a playable octave
  let baseMidi = -1
  for (const oct of [4, 3, 5, 2]) {
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

function applyNthInversion(baseMidi: number[], n: number): number[] {
  if (n <= 0) return baseMidi
  let notes = [...baseMidi].sort((a, b) => a - b)
  for (let i = 0; i < n; i++) {
    const [lowest, ...rest] = notes
    notes = [...rest, lowest + 12]
  }
  return notes
}

// ── Hand filter heuristic ────────────────────────────────────────────────────
function handSpan(midiNotes: number[]): number {
  if (midiNotes.length < 2) return 0
  const sorted = [...midiNotes].sort((a, b) => a - b)
  return sorted[sorted.length - 1] - sorted[0]
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ScaleExplorer() {
  const scaleExplorerOpen = useStore(s => s.scaleExplorerOpen)
  const setScaleExplorerOpen = useStore(s => s.setScaleExplorerOpen)
  const setChordExplorerOpen = useStore(s => s.setChordExplorerOpen)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  const setKeyboardSize = useStore(s => s.setKeyboardSize)
  const keyboardSize = useStore(s => s.keyboardSize)

  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.floor((window.innerWidth - 720) / 2)),
    y: Math.max(0, Math.floor((window.innerHeight - 680) / 2)),
  }))

  // Circle of fifths selection
  const [cofPos, setCofPos] = useState<number | null>(null)
  const [cofRing, setCofRing] = useState<'major' | 'minor' | null>(null)
  const [selectedScaleIdx, setSelectedScaleIdx] = useState(0)
  const [selectedDegree, setSelectedDegree] = useState<number | null>(null)

  // Filters
  const [handFilter, setHandFilter] = useState<'all' | 'one' | 'two'>('all')
  const [noteFilter, setNoteFilter] = useState<'any' | '3' | '4' | '5' | '6+'>('any')

  // Progression state
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progDropdownOpen, setProgDropdownOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<'slow' | 'med' | 'fast'>('med')
  const [progInversionMode, setProgInversionMode] = useState<'off' | 'sequential' | 'random'>('off')

  // Inversion browser (for footer ‹ PLAY INVERSION ›)
  const [inversionStep, setInversionStep] = useState(0)

  const prevSizeRef = useRef<61 | 73 | 88 | null>(null)
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progRunningRef = useRef(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const progDropRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ ox: number; oy: number; mx: number; my: number } | null>(null)
  const scalePlayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // Derived root from CoF selection
  const selectedRoot = useMemo(() => {
    if (cofPos === null || cofRing === null) return null
    return cofRing === 'major' ? COF_MAJOR_PC[cofPos] : COF_MINOR_PC[cofPos]
  }, [cofPos, cofRing])

  const scale = SCALES[selectedScaleIdx]

  // Build diatonic chords whenever root/scale changes
  const diatonicChords = useMemo<DiatonicChord[]>(() => {
    if (selectedRoot === null) return []
    return scale.intervals.map((_, deg) =>
      buildDiatonicChord(selectedRoot, scale.intervals, deg, 61, displayNaming, accidentals)
    )
  }, [selectedRoot, scale, displayNaming, accidentals])

  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
  }, [])

  const clearScalePlayTimers = useCallback(() => {
    scalePlayTimersRef.current.forEach(t => clearTimeout(t))
    scalePlayTimersRef.current = []
  }, [])

  // On open: force 61 keys, pause playback, reset state
  useEffect(() => {
    if (scaleExplorerOpen) {
      prevSizeRef.current = useStore.getState().keyboardSize as 61 | 73 | 88
      setKeyboardSize(61)
      if (useStore.getState().playbackState === 'playing') {
        ;(window as any).__orfeoPlayer?.pause?.()
        useStore.getState().setPlaybackState('paused')
      }
      setHandFilter('all')
      setNoteFilter('any')
      stopProgression()
      setSelectedProg(null)
      setProgDropdownOpen(false)
      setDropdownRect(null)
      setProgInversionMode('off')
      setInversionStep(0)
      setSelectedDegree(null)
    } else if (prevSizeRef.current !== null) {
      setKeyboardSize(prevSizeRef.current)
      prevSizeRef.current = null
      stopProgression()
      clearScalePlayTimers()
      clearExplorerKeys()
    }
  }, [scaleExplorerOpen, setKeyboardSize, stopProgression, clearScalePlayTimers, clearExplorerKeys])

  // Play + light scale notes ascending when root/scale changes
  useEffect(() => {
    if (!scaleExplorerOpen || selectedRoot === null) return
    clearScalePlayTimers()
    const playNote = (window as any).__orfeoPlayNote
    const { min, max } = RANGES[61]
    const noteMidis: number[] = []
    for (const interval of scale.intervals) {
      let m = selectedRoot + 60 + interval
      // nudge into range
      while (m < min) m += 12
      while (m > max) m -= 12
      if (m >= min && m <= max) noteMidis.push(m)
    }
    const keys = new Set(noteMidis)
    const colors = new Map<number, string>()
    noteMidis.forEach((m, i) => {
      colors.set(m, i === 0 ? '#e8a027' : '#6080d0')
    })
    setExplorerKeys(keys, colors)
    setSelectedDegree(null)
    setInversionStep(0)

    if (playNote) {
      noteMidis.forEach((m, i) => {
        const t = setTimeout(() => playNote(m, 0.6, 400), i * 80)
        scalePlayTimersRef.current.push(t)
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx, scaleExplorerOpen])

  // Play a diatonic chord tile
  const playDegree = useCallback((chord: DiatonicChord) => {
    setSelectedDegree(chord.degree)
    setInversionStep(0)
    const keys = new Set(chord.midiNotes)
    const colors = new Map<number, string>()
    chord.midiNotes.forEach(m => colors.set(m, '#6080d0'))
    if (chord.midiNotes[0] !== undefined) colors.set(chord.midiNotes[0], '#e8a027')
    setExplorerKeys(keys, colors)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) chord.midiNotes.forEach(m => playNote(m, 0.7, 600))
  }, [setExplorerKeys])

  // ── Inversion browser ──────────────────────────────────────────────────────
  const currentBaseMidi = useMemo(() => {
    if (selectedDegree === null || !diatonicChords[selectedDegree]) return []
    return diatonicChords[selectedDegree].midiNotes
  }, [selectedDegree, diatonicChords])

  const playInversion = useCallback((step: number) => {
    if (!currentBaseMidi.length) return
    const notes = applyNthInversion(currentBaseMidi, step % currentBaseMidi.length)
    const keys = new Set(notes)
    const colors = new Map<number, string>()
    notes.forEach((m, i) => colors.set(m, i === 0 ? '#e8a027' : '#6080d0'))
    setExplorerKeys(keys, colors)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) notes.forEach(m => playNote(m, 0.7, 600))
  }, [currentBaseMidi, setExplorerKeys])

  const handlePrevInversion = useCallback(() => {
    const next = ((inversionStep - 1) % (currentBaseMidi.length || 1) + (currentBaseMidi.length || 1)) % (currentBaseMidi.length || 1)
    setInversionStep(next)
    playInversion(next)
  }, [inversionStep, currentBaseMidi.length, playInversion])

  const handleNextInversion = useCallback(() => {
    const next = (inversionStep + 1) % (currentBaseMidi.length || 1)
    setInversionStep(next)
    playInversion(next)
  }, [inversionStep, currentBaseMidi.length, playInversion])

  // ── Progression playback ───────────────────────────────────────────────────
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    speed: 'slow' | 'med' | 'fast',
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

    const playNote = (window as any).__orfeoPlayNote
    if (playNote) notes.forEach(m => playNote(m, 0.75, SPEED_MS[speed] - 60))

    const nextStep = (step + 1) % labels.length
    const nextLoop = nextStep === 0 ? loopCount + 1 : loopCount
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, speed, invMode, nextLoop)
    }, SPEED_MS[speed])
  }, [diatonicChords, setExplorerKeys])

  const startProgression = useCallback(() => {
    if (selectedProg === null || diatonicChords.length === 0) return
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    playProgStepAt(0, selectedProg, progSpeed, progInversionMode, 0)
  }, [selectedProg, diatonicChords.length, progSpeed, progInversionMode, stopProgression, playProgStepAt])

  // Stop progression if diatonic chords change (root/scale switched)
  useEffect(() => {
    if (progPlaying) stopProgression()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoot, selectedScaleIdx])

  // ── Close on outside click / dropdown ─────────────────────────────────────
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

  // ── Drag ──────────────────────────────────────────────────────────────────
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

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredChords = useMemo(() => {
    return diatonicChords.filter(chord => {
      const span = handSpan(chord.midiNotes)
      if (handFilter === 'one' && span > 12) return false
      if (handFilter === 'two' && span <= 12) return false
      const nc = chord.noteCount
      if (noteFilter === '3' && nc !== 3) return false
      if (noteFilter === '4' && nc !== 4) return false
      if (noteFilter === '5' && nc !== 5) return false
      if (noteFilter === '6+' && nc < 6) return false
      return true
    })
  }, [diatonicChords, handFilter, noteFilter])

  // ── CoF label helpers ─────────────────────────────────────────────────────
  function getMajorLabel(pos: number): string {
    return getNoteName(60 + COF_MAJOR_PC[pos], displayNaming, accidentals)
  }
  function getMinorLabel(pos: number): string {
    return getNoteName(60 + COF_MINOR_PC[pos], displayNaming, accidentals) + 'm'
  }
  function getKeySigSymbol(pos: number): string {
    const sig = COF_KEYSIG[pos]
    if (sig === 0) return ''
    if (sig > 0) return '♯'.repeat(sig)
    return '♭'.repeat(-sig)
  }

  // ── Info row content ──────────────────────────────────────────────────────
  const infoText = useMemo(() => {
    if (selectedRoot === null) return null
    const rootName = getNoteName(60 + selectedRoot, displayNaming, accidentals)
    const noteNames = scale.intervals.map(iv => {
      const pc = (selectedRoot + iv) % 12
      return getNoteName(60 + pc, displayNaming, accidentals)
    })
    return { rootName, scaleName: scale.name, noteNames }
  }, [selectedRoot, scale, displayNaming, accidentals])

  if (!scaleExplorerOpen) return null

  // SVG geometry
  const CX = 190, CY = 190
  const R_OUTER1 = 110, R_OUTER2 = 175
  const R_INNER1 = 55,  R_INNER2 = 110

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 720,
        maxHeight: '85vh',
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
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        onMouseDown={onDragStart}
        style={{
          flexShrink: 0,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          background: '#0f0f18',
          borderBottom: '1px solid #1e1e2a',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Scale Explorer
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => { stopProgression(); clearExplorerKeys(); setScaleExplorerOpen(false) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
          onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
          onMouseLeave={e => e.currentTarget.style.color = '#505068'}
        >×</button>
      </div>

      {/* ── Info row ───────────────────────────────────────────────────────── */}
      <div style={{ ...ROW, height: 36, justifyContent: 'center', borderBottom: '1px solid #1e1e2a', padding: '0 16px' }}>
        {infoText ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: '#e8a027' }}>
              {infoText.rootName}
            </span>
            <span style={{ fontSize: 11, color: '#9090a8' }}>{infoText.scaleName}</span>
            <span style={{ fontSize: 9, color: '#505068', letterSpacing: '0.06em', fontFamily: 'JetBrains Mono' }}>
              {infoText.noteNames.join(' · ')}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: '#404055' }}>Select a key from the circle below</span>
        )}
      </div>

      {/* ── Circle of Fifths ───────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '8px 0', background: '#0f0f18', borderBottom: '1px solid #1e1e2a' }}>
        <svg
          width={380}
          height={380}
          viewBox="0 0 380 380"
          style={{ overflow: 'visible' }}
        >
          {Array.from({ length: 12 }, (_, i) => {
            const startDeg = -90 + i * 30
            const endDeg   = startDeg + 30
            const midDeg   = startDeg + 15
            const isSelOuter = cofPos === i && cofRing === 'major'
            const isSelInner = cofPos === i && cofRing === 'minor'

            const outerFill   = isSelOuter ? '#e8a02722' : '#1e1e2a'
            const outerStroke = isSelOuter ? '#e8a027'   : '#2a2a3a'
            const innerFill   = isSelInner ? '#e8a02722' : '#181820'
            const innerStroke = isSelInner ? '#e8a027'   : '#2a2a3a'

            const outerLabel = labelPos(CX, CY, (R_OUTER1 + R_OUTER2) / 2, midDeg)
            const innerLabel = labelPos(CX, CY, (R_INNER1 + R_INNER2) / 2, midDeg)
            const sigLabel   = labelPos(CX, CY, R_OUTER2 + 18, midDeg)
            const keySig = getKeySigSymbol(i)

            return (
              <g key={i}>
                {/* Outer wedge — major */}
                <path
                  d={wedgePath(CX, CY, R_OUTER1, R_OUTER2, startDeg, endDeg)}
                  fill={outerFill}
                  stroke={outerStroke}
                  strokeWidth={1}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                  onClick={() => {
                    setCofPos(i)
                    setCofRing('major')
                    setSelectedScaleIdx(0)
                  }}
                  onMouseEnter={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', '#2a2a3a') }}
                  onMouseLeave={e => { if (!isSelOuter) (e.target as SVGPathElement).setAttribute('fill', '#1e1e2a') }}
                />
                {/* Inner wedge — minor */}
                <path
                  d={wedgePath(CX, CY, R_INNER1, R_INNER2, startDeg, endDeg)}
                  fill={innerFill}
                  stroke={innerStroke}
                  strokeWidth={1}
                  style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                  onClick={() => {
                    setCofPos(i)
                    setCofRing('minor')
                    setSelectedScaleIdx(1)
                  }}
                  onMouseEnter={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', '#222230') }}
                  onMouseLeave={e => { if (!isSelInner) (e.target as SVGPathElement).setAttribute('fill', '#181820') }}
                />
                {/* Centre dot */}
                <circle cx={CX} cy={CY} r={R_INNER1} fill="#0f0f18" stroke="#2a2a3a" strokeWidth={1} style={{ pointerEvents: 'none' }} />
                {/* Outer label */}
                <text
                  x={outerLabel.x} y={outerLabel.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={13} fontWeight={700} fontFamily="JetBrains Mono"
                  fill={isSelOuter ? '#e8a027' : '#c0c0d8'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >{getMajorLabel(i)}</text>
                {/* Inner label */}
                <text
                  x={innerLabel.x} y={innerLabel.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fontFamily="Inter"
                  fill={isSelInner ? '#e8a027' : '#707088'}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >{getMinorLabel(i)}</text>
                {/* Key signature symbols */}
                {keySig && (
                  <text
                    x={sigLabel.x} y={sigLabel.y}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={8} fontFamily="Inter"
                    fill="#505068"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >{keySig}</text>
                )}
              </g>
            )
          })}
          {/* Centre label */}
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
            fontSize={8} fontFamily="Inter" fill="#404055" style={{ userSelect: 'none' }}>
            CoF
          </text>
        </svg>
      </div>

      {/* ── Scale type row ─────────────────────────────────────────────────── */}
      <div style={{ ...ROW, alignItems: 'flex-start', padding: '6px 12px' }}>
        <span style={{ ...ROW_LABEL, paddingTop: 4 }}>Scale</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end', maxWidth: 600 }}>
          {SCALES.map((s, i) => {
            const sel = selectedScaleIdx === i
            return (
              <button key={s.name} onClick={() => setSelectedScaleIdx(i)}
                style={{
                  fontFamily: 'Inter', fontSize: 10, padding: '2px 8px',
                  background: sel ? '#e8a02722' : '#1a1a28',
                  color: sel ? '#e8a027' : '#9090a8',
                  border: `1px solid ${sel ? '#e8a027' : '#2a2a3a'}`,
                  borderRadius: 4, cursor: 'pointer',
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.color = '#c0c0d8' }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.color = '#9090a8' }}
              >{s.name}</button>
            )
          })}
        </div>
      </div>

      {/* ── Filter row ─────────────────────────────────────────────────────── */}
      <div style={ROW}>
        <span style={ROW_LABEL}>Filter</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Hand filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {(['all', 'one', 'two'] as const).map(v => {
              const sel = handFilter === v
              const label = v === 'all' ? 'All' : v === 'one'
                ? <Hand size={12} style={{ transform: 'rotate(-20deg)' }} />
                : <span style={{ display: 'flex', gap: 2 }}><Hand size={12} style={{ transform: 'rotate(-15deg)' }} /><Hand size={12} style={{ transform: 'rotate(15deg) scaleX(-1)' }} /></span>
              return (
                <button key={v} onClick={() => setHandFilter(v)}
                  style={{
                    fontFamily: 'Inter', fontSize: 10, padding: '2px 6px',
                    background: sel ? '#e8a02722' : 'none',
                    color: sel ? '#e8a027' : '#707088',
                    border: `1px solid ${sel ? '#e8a027' : '#2a2a3a'}`,
                    borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >{label}</button>
              )
            })}
          </div>

          <span style={{ color: '#2a2a3a', fontSize: 14 }}>·</span>

          {/* Note count filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {(['any','3','4','5','6+'] as const).map(v => {
              const sel = noteFilter === v
              return (
                <button key={v} onClick={() => setNoteFilter(v)}
                  style={{
                    fontFamily: 'Inter', fontSize: 10, padding: '2px 6px',
                    background: sel ? '#e8a02722' : 'none',
                    color: sel ? '#e8a027' : '#707088',
                    border: `1px solid ${sel ? '#e8a027' : '#2a2a3a'}`,
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >{v === 'any' ? 'Any' : `${v} notes`}</button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Progressions + Inversions row ──────────────────────────────────── */}
      <div style={ROW}>
        <span style={ROW_LABEL}>Progressions</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Dropdown trigger */}
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
              whiteSpace: 'nowrap', minWidth: 110,
            }}
          >
            {selectedProg !== null ? PROGRESSIONS[selectedProg].name : 'Select…'}
          </button>
          {selectedProg !== null && (
            <button onClick={() => { setSelectedProg(null); stopProgression() }}
              style={{ background: 'none', border: 'none', color: '#505068', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#505068'}
            >×</button>
          )}

          <span style={{ color: '#2a2a3a', margin: '0 3px' }}>·</span>

          {/* Speed */}
          {(['slow','med','fast'] as const).map(s => (
            <button key={s} onClick={() => setProgSpeed(s)}
              style={{
                fontFamily: 'Inter', fontSize: 10, padding: '2px 6px',
                background: progSpeed === s ? '#e8a02722' : 'none',
                color: progSpeed === s ? '#e8a027' : '#707088',
                border: `1px solid ${progSpeed === s ? '#e8a027' : '#2a2a3a'}`,
                borderRadius: 4, cursor: 'pointer',
              }}
            >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
          ))}

          {/* Play/Stop */}
          <button
            onClick={() => { if (progPlaying) stopProgression(); else startProgression() }}
            disabled={selectedProg === null || diatonicChords.length === 0}
            style={{
              fontFamily: 'Inter', fontSize: 10, padding: '2px 8px',
              background: progPlaying ? '#e8a02733' : '#1a1a28',
              color: progPlaying ? '#e8a027' : '#9090a8',
              border: `1px solid ${progPlaying ? '#e8a027' : '#2a2a3a'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >{progPlaying ? `Stop  ${PROGRESSIONS[selectedProg!].labels[progStep]}` : 'Play'}</button>

          <span style={{ width: 1, height: 14, background: '#2a2a3a', margin: '0 4px' }} />

          {/* Inversions */}
          <span style={{ ...ROW_LABEL }}>Inversions</span>
          {(['off','sequential','random'] as const).map(v => (
            <button key={v} onClick={() => setProgInversionMode(v)}
              style={{
                fontFamily: 'Inter', fontSize: 10, padding: '2px 6px',
                background: progInversionMode === v ? '#e8a02722' : 'none',
                color: progInversionMode === v ? '#e8a027' : '#707088',
                border: `1px solid ${progInversionMode === v ? '#e8a027' : '#2a2a3a'}`,
                borderRadius: 4, cursor: 'pointer',
              }}
            >{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* ── Diatonic chord grid ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }}>
        {selectedRoot === null ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 11, color: '#404055' }}>Select a key from the circle above to see diatonic chords</span>
          </div>
        ) : filteredChords.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <span style={{ fontSize: 11, color: '#404055' }}>No chords match the current filters</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {filteredChords.map(chord => {
              const sel = selectedDegree === chord.degree
              return (
                <button
                  key={chord.degree}
                  onClick={() => playDegree(chord)}
                  style={{
                    background: sel ? '#1e2a3a' : '#1a1a28',
                    border: `1px solid ${sel ? '#6080d0' : '#2a2a3a'}`,
                    borderRadius: 6, padding: '7px 10px',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#3a3a5a' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#2a2a3a' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700, color: sel ? '#a0b8e8' : '#c0c0d8' }}>
                      {chord.chordName}
                    </span>
                    <span style={{ fontFamily: 'Inter', fontSize: 9, color: sel ? '#6080d0' : '#505068', fontStyle: 'italic' }}>
                      {chord.roman}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#606080' }}>
                    {chord.midiNotes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{
        ...ROW,
        height: 40,
        borderTop: '1px solid #1e1e2a',
        borderBottom: 'none',
        background: '#0d0d12',
        padding: '0 12px',
        position: 'relative',
      }}>
        {/* Left: Show As ♭/# */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...ROW_LABEL }}>Show As</span>
          {(['flat', 'sharp'] as const).map(v => (
            <button key={v} onClick={() => setAccidentals(v)}
              style={{
                fontFamily: 'Inter', fontSize: 12,
                background: 'none', border: 'none',
                color: accidentals === v ? '#e8a027' : '#505068',
                cursor: 'pointer', padding: '0 3px',
              }}
              onMouseEnter={e => { if (accidentals !== v) e.currentTarget.style.color = '#9090a8' }}
              onMouseLeave={e => { if (accidentals !== v) e.currentTarget.style.color = '#505068' }}
            >{v === 'flat' ? '♭' : '♯'}</button>
          ))}
        </div>

        {/* Centre: ‹ PLAY INVERSION › ↺ — absolutely positioned */}
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={handlePrevInversion}
            disabled={!currentBaseMidi.length}
            style={{ background: 'none', border: 'none', color: currentBaseMidi.length ? '#e8a027' : '#303048', fontSize: 14, cursor: currentBaseMidi.length ? 'pointer' : 'default', padding: '0 2px' }}
          >‹</button>
          <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 700, color: '#505068', letterSpacing: '0.12em', textTransform: 'uppercase', userSelect: 'none' }}>
            Play Inversion
          </span>
          <button
            onClick={handleNextInversion}
            disabled={!currentBaseMidi.length}
            style={{ background: 'none', border: 'none', color: currentBaseMidi.length ? '#e8a027' : '#303048', fontSize: 14, cursor: currentBaseMidi.length ? 'pointer' : 'default', padding: '0 2px' }}
          >›</button>
          <button
            onClick={() => {
              setInversionStep(0)
              clearExplorerKeys()
              useStore.getState().clearDisplayedChord()
              setSelectedDegree(null)
            }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = '#505068'}
          ><RotateCcw size={13} /></button>
        </div>

        {/* Right: Chord Explorer → */}
        <button
          onClick={() => { setScaleExplorerOpen(false); setChordExplorerOpen(true) }}
          title="Switch to Chord Explorer"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#505068', fontFamily: 'Inter', fontSize: 9,
            whiteSpace: 'nowrap', padding: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
          onMouseLeave={e => e.currentTarget.style.color = '#505068'}
        >Chord Explorer →</button>
      </div>

      {/* Progression dropdown — portalled */}
      {progDropdownOpen && dropdownRect && createPortal(
        <div
          ref={progDropRef}
          style={{
            position: 'fixed',
            top: dropdownRect.top,
            left: dropdownRect.left,
            background: '#1a1a26',
            border: '1px solid #2a2a3a',
            borderRadius: 6,
            zIndex: 1000,
            minWidth: 160,
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          }}
        >
          {PROGRESSIONS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => { setSelectedProg(i); setProgDropdownOpen(false); setDropdownRect(null) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: selectedProg === i ? '#2a2a3a' : 'none',
                border: 'none', padding: '5px 10px',
                color: selectedProg === i ? '#e8a027' : '#9090a8',
                fontFamily: 'Inter', fontSize: 10, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a2a3a'; e.currentTarget.style.color = '#e8a027' }}
              onMouseLeave={e => { e.currentTarget.style.background = selectedProg === i ? '#2a2a3a' : 'none'; e.currentTarget.style.color = selectedProg === i ? '#e8a027' : '#9090a8' }}
            >{p.name}</button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
