import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChordType, Interval } from 'tonal'
import { Search, Hand, RotateCcw, Play, Square, CircleOff, ListOrdered, Shuffle } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'
import type { NoteNaming } from '../types'
import SpeedControl from './SpeedControl'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

// ── Modal dimensions for default positioning above the keyboard ───────────
const MODAL_WIDTH = 600
const MODAL_HEIGHT = 520
const KEYBOARD_HEIGHT = 200

const ROOT_MIDIS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]

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
]

const DISPLAY_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'diminished': 'dim', 'augmented': 'aug',
  'half-diminished': 'ø', 'mM7': 'mMaj7', 'mM9': 'mMaj9',
  'M7#11': 'Maj7#11', 'M7b6': 'Maj7b6', 'Madd9': 'add9', 'alt7': 'alt',
}

interface ChordInfo {
  key: string
  name: string
  intervals: string[]
  suffix: string
  aliases: string[]
}

interface Progression {
  name: string
  labels: string[]
  offsets: number[]
}

function resolveChord(key: string): ChordInfo | null {
  const ct = ChordType.get(key)
  if (!ct || !ct.intervals || ct.intervals.length < 2) return null
  return {
    key,
    name: ct.name || key,
    intervals: ct.intervals,
    suffix: DISPLAY_SUFFIX[key] ?? key,
    aliases: ct.aliases || [],
  }
}

function buildChordMidi(rootPitchClass: number, intervals: string[], keyboardSize: number): number[] {
  const { min, max } = RANGES[keyboardSize as 61 | 73 | 88] ?? RANGES[73]
  let rootMidi = -1
  for (const oct of [4, 3, 5, 2]) {
    const midi = rootPitchClass + (oct + 1) * 12
    if (midi >= min && midi <= max) { rootMidi = midi; break }
  }
  if (rootMidi < 0) return []
  return intervals
    .map(ivl => { const s = Interval.semitones(ivl); return s !== null ? rootMidi + s : null })
    .filter((n): n is number => n !== null && n >= min && n <= max)
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

function nextInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}

function prevInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  const rest = sorted.slice(0, -1)
  return new Set([highest - 12, ...rest])
}

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

const COMMON_CHORDS = COMMON_TYPES.map(resolveChord).filter((c): c is ChordInfo => c !== null)
const ALL_CHORDS = [...COMMON_CHORDS, ...EXTENDED_ADD.map(resolveChord).filter((c): c is ChordInfo => c !== null)]

// Shared row label style
const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'Inter', fontSize: 9, fontWeight: 700,
  color: '#707088', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}

// Shared row container style
const ROW: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex', alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 12px',
  borderBottom: '1px solid #1e1e2a',
}

export default function ChordExplorer() {
  const chordExplorerOpen = useStore(s => s.chordExplorerOpen)
  const setChordExplorerOpen = useStore(s => s.setChordExplorerOpen)
  const setScaleExplorerOpen = useStore(s => s.setScaleExplorerOpen)
  const explorerKeys = useStore(s => s.explorerKeys)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearDisplayedChord = useStore(s => s.clearDisplayedChord)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  // ── Window drag position — recomputed on every open against live dimensions
  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth - MODAL_WIDTH) / 2),
    y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2) - 160,
  }))
  const [selectedRoot, setSelectedRoot] = useState(0)
  const [tier, setTier] = useState<'common' | 'extended'>('common')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [handFilter, setHandFilter] = useState<'all' | 'one' | 'two'>('all')
  const [noteFilter, setNoteFilter] = useState<'any' | '3' | '4' | '5' | '6+'>('any')
  const [selectedProg, setSelectedProg] = useState<number | null>(null)
  const [progDropdownOpen, setProgDropdownOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null)
  const [progPlaying, setProgPlaying] = useState(false)
  const [progStep, setProgStep] = useState(0)
  const [progSpeed, setProgSpeed] = useState<'slow' | 'med' | 'fast'>('med')
  const [progInversionMode, setProgInversionMode] = useState<'off' | 'sequential' | 'random'>('off')
  // ── Original chord identity preserved across inversion cycling ────────────
  const [originalChordName, setOriginalChordName] = useState<string | null>(null)
  const [inversionCount, setInversionCount] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progRunningRef = useRef(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const progDropRef = useRef<HTMLDivElement>(null)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
  }, [])

  // Reset transient state on open; no keyboard size change (61 is for ScaleExplorer only).
  useEffect(() => {
    if (chordExplorerOpen) {
      // ── Recentre on live window dimensions every time modal opens ───────
      setPos({
        x: Math.round((window.innerWidth - MODAL_WIDTH) / 2),
        y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2) - 160,
      })
      setSearch('')
      setSearchOpen(false)
      setHandFilter('all')
      setNoteFilter('any')
      stopProgression()
      setSelectedProg(null)
      setProgDropdownOpen(false)
      setDropdownRect(null)
      setProgInversionMode('off')
    } else {
      stopProgression()
    }
  }, [chordExplorerOpen, stopProgression])

  // Pause playback when modal opens
  useEffect(() => {
    if (!chordExplorerOpen) return
    const { playbackState } = useStore.getState()
    if (playbackState === 'playing') {
      ;(window as any).__orfeoPlayer?.pause?.()
      useStore.setState({ playbackState: 'paused' })
    }
  }, [chordExplorerOpen])

  const close = useCallback(() => {
    stopProgression()
    clearExplorerKeys()
    setChordExplorerOpen(false)
    setSelectedKey(null)
    setOriginalChordName(null)
    setInversionCount(0)
  }, [stopProgression, clearExplorerKeys, setChordExplorerOpen])

  useEffect(() => {
    if (!chordExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (progDropdownOpen) { setProgDropdownOpen(false); setDropdownRect(null); return }
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, close, progDropdownOpen])

  // Outside-click to close progression dropdown
  useEffect(() => {
    if (!progDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (
        progDropRef.current?.contains(e.target as Node) ||
        progTriggerRef.current?.contains(e.target as Node)
      ) return
      setProgDropdownOpen(false)
      setDropdownRect(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [progDropdownOpen])

  const toggleSearch = () => {
    if (searchOpen) {
      setSearch('')
      setSearchOpen(false)
    } else {
      setSearchOpen(true)
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }

  const rootLabels = useMemo(() =>
    ROOT_MIDIS.map(midi => ({
      pitchClass: midi % 12,
      label: getNoteName(midi, displayNaming, accidentals),
    })),
    [displayNaming, accidentals]
  )

  const tierChords = tier === 'common' ? COMMON_CHORDS : ALL_CHORDS

  const filteredChords = useMemo(() => {
    let result = tierChords

    if (searchOpen) {
      const q = search.trim()
      if (q) {
        const normalize = (s: string) => s.toLowerCase().replace(/b/g, '♭')
        const qNorm = normalize(q)
        const currentRoot = rootLabels.find(r => r.pitchClass === selectedRoot)?.label ?? ''
        result = result.filter(c => normalize(`${currentRoot}${c.suffix}`).includes(qNorm))
      }
    }

    if (noteFilter !== 'any') {
      result = result.filter(c => {
        const n = c.intervals.length
        if (noteFilter === '3') return n === 3
        if (noteFilter === '4') return n === 4
        if (noteFilter === '5') return n === 5
        return n >= 6
      })
    }

    if (handFilter !== 'all') {
      result = result.filter(c => {
        const midiNotes = buildChordMidi(selectedRoot, c.intervals, 61)
        if (midiNotes.length === 0) return false
        const span = Math.max(...midiNotes) - Math.min(...midiNotes)
        const isOne = span <= 12 && midiNotes.length <= 5
        return handFilter === 'one' ? isOne : !isOne
      })
    }

    return result
  }, [tierChords, search, searchOpen, noteFilter, handFilter, selectedRoot, rootLabels])

  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    chordKey: string,
    root: number,
    speed: 'slow' | 'med' | 'fast',
    invMode: 'off' | 'sequential' | 'random',
    loopCount: number,
  ) => {
    if (!progRunningRef.current) return
    const prog = PROGRESSIONS[progIndex]
    if (!prog) return
    const offset = prog.offsets[step]
    const actualRoot = (root + offset) % 12
    const info = ALL_CHORDS.find(c => c.key === chordKey)
    if (!info) return
    const durationMs = SPEED_MS[speed]
    const baseMidi = buildChordMidi(actualRoot, info.intervals, 61)

    let midiNotes = baseMidi
    if (baseMidi.length > 0 && invMode !== 'off') {
      let invIdx = 0
      if (invMode === 'sequential') invIdx = loopCount % baseMidi.length
      else invIdx = Math.floor(Math.random() * baseMidi.length)
      midiNotes = applyNthInversion(baseMidi, invIdx)
    }

    if (midiNotes.length > 0) {
      const keys = new Set(midiNotes)
      const colors = new Map(midiNotes.map(m => [m, '#e8a027'] as [number, string]))
      setExplorerKeys(keys, colors)
      const playNote = (window as any).__orfeoPlayNote
      if (playNote) midiNotes.forEach(m => playNote(m, 0.75, Math.round(durationMs * 0.9)))
    }
    setProgStep(step)

    const nextStep = (step + 1) % prog.offsets.length
    const nextLoopCount = nextStep === 0 ? loopCount + 1 : loopCount
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, chordKey, root, speed, invMode, nextLoopCount)
    }, durationMs)
  }, [setExplorerKeys])

  const startProgression = useCallback(() => {
    if (selectedProg === null) return
    const chordKey = selectedKey ?? 'major'
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    setProgStep(0)
    playProgStepAt(0, selectedProg, chordKey, selectedRoot, progSpeed, progInversionMode, 0)
  }, [selectedProg, selectedKey, selectedRoot, progSpeed, progInversionMode, stopProgression, playProgStepAt])

  const playChordAt = useCallback((chordKey: string, rootPitchClass: number) => {
    stopProgression()
    const info = ALL_CHORDS.find(c => c.key === chordKey)
    if (!info) return
    const midiNotes = buildChordMidi(rootPitchClass, info.intervals, 61)
    if (midiNotes.length === 0) return
    const keys = new Set(midiNotes)
    const colors = new Map(midiNotes.map(m => [m, '#e8a027'] as [number, string]))
    setExplorerKeys(keys, colors)
    setSelectedKey(chordKey)
    // ── Store original chord name and reset inversion count ───────────────
    setOriginalChordName(`${rootLabels.find(r => r.pitchClass === rootPitchClass)?.label ?? ''}${DISPLAY_SUFFIX[chordKey] ?? chordKey}`)
    setInversionCount(0)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) midiNotes.forEach(m => playNote(m, 0.75, 1200))
  }, [stopProgression, setExplorerKeys, rootLabels])

  const handleRootChange = (pitchClass: number) => {
    stopProgression()
    setSelectedRoot(pitchClass)
    setSearch('')
    setSearchOpen(false)
    setHandFilter('all')
    setNoteFilter('any')
    if (selectedKey !== null) playChordAt(selectedKey, pitchClass)
  }

  const handleInversion = useCallback((dir: 'prev' | 'next') => {
    if (!selectedKey) return
    const current = useStore.getState().explorerKeys
    if (current.size === 0) return
    const newNotes = dir === 'next' ? nextInversion(current) : prevInversion(current)
    const colors = new Map(Array.from(newNotes).map(m => [m, '#e8a027'] as [number, string]))
    setExplorerKeys(newNotes, colors)
    // ── Track inversion step for display ─────────────────────────────────
    setInversionCount(c => c + (dir === 'next' ? 1 : -1))
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) Array.from(newNotes).forEach(m => playNote(m, 0.75, 1000))
  }, [selectedKey, setExplorerKeys])

  const openProgDropdown = () => {
    if (progDropdownOpen) {
      setProgDropdownOpen(false)
      setDropdownRect(null)
    } else if (progTriggerRef.current) {
      const r = progTriggerRef.current.getBoundingClientRect()
      setDropdownRect({ top: r.bottom + 2, left: r.left })
      setProgDropdownOpen(true)
    }
  }

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    setProgDropdownOpen(false)
    setDropdownRect(null)
    const sx = e.clientX, sy = e.clientY, spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(0, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const rootLabel = (pc: number) => rootLabels.find(r => r.pitchClass === pc)?.label ?? ''

  const btnBase = (active: boolean): React.CSSProperties => ({
    padding: '2px 7px', borderRadius: 3, border: 'none',
    background: active ? '#2a2a3a' : 'transparent',
    color: active ? '#e8a027' : '#505068',
    fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  if (!chordExplorerOpen) return null

  const activeProg = selectedProg !== null ? PROGRESSIONS[selectedProg] : null

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 600,
      maxHeight: '65vh',
      background: '#13131c',
      border: '1px solid #2a2a3a',
      borderRadius: 10,
      zIndex: 401,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(232,160,39,0.08)',
    }}>

      {/* Header — draggable */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 32, flexShrink: 0,
          background: '#0d0d12',
          borderBottom: '1px solid #1e1e2a',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Chord Explorer
        </span>
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {searchOpen && (
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search …"
              style={{
                height: 22, width: 120,
                background: '#1a1a26',
                border: '1px solid #2a2a3a',
                borderRadius: 4,
                color: '#b0b0cc',
                fontFamily: 'Inter', fontSize: 11,
                padding: '0 7px', outline: 'none',
                caretColor: '#e8a027',
              }}
            />
          )}
          <button
            onClick={toggleSearch}
            title={searchOpen ? 'Close search' : 'Find a chord'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: searchOpen ? '#e8a027' : '#707088' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => { e.currentTarget.style.color = searchOpen ? '#e8a027' : '#707088' }}
          >
            <Search size={14} />
          </button>
          <button
            onClick={close}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontSize: 16, lineHeight: 1, padding: '0 2px', fontFamily: 'Inter' }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => e.currentTarget.style.color = '#505068'}
          >×</button>
        </div>
      </div>

      {/* ROOT row — label left, 12 buttons right */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 12px',
        borderBottom: '1px solid #1e1e2a',
      }}>
        <span style={ROW_LABEL}>Root</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {rootLabels.map(({ pitchClass, label }) => {
            const isSel = selectedRoot === pitchClass
            return (
              <button
                key={pitchClass}
                onClick={() => handleRootChange(pitchClass)}
                style={{
                  padding: '3px 7px',
                  borderRadius: 4, border: 'none',
                  background: isSel ? '#e8a027' : '#1e1e2a',
                  color: isSel ? '#12121c' : '#9090a8',
                  fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
                  minWidth: 30, textAlign: 'center',
                }}
                onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = '#2a2a3a'; e.currentTarget.style.color = '#c0c0d4' } }}
                onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = '#1e1e2a'; e.currentTarget.style.color = '#9090a8' } }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* FILTER row — label left, controls right */}
      <div style={ROW}>
        <span style={ROW_LABEL}>Filter</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Tier */}
          <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 5, padding: 2, gap: 1 }}>
            {(['common', 'extended'] as const).map(t => (
              <button key={t} onClick={() => setTier(t)} style={btnBase(tier === t)}>
                {t === 'common' ? 'Common' : 'Extended'}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: '#2a2a3a' }} />

          {/* Hand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8, color: '#404055', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hand</span>
            <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 4, padding: 2, gap: 1 }}>
              <button onClick={() => setHandFilter('all')} title="All chords" style={btnBase(handFilter === 'all')}>All</button>
              <button onClick={() => setHandFilter('one')} title="One-hand chords" style={btnBase(handFilter === 'one')}>
                <span style={{ display: 'inline-flex', transform: 'rotate(-20deg)' }}><Hand size={12} /></span>
              </button>
              <button onClick={() => setHandFilter('two')} title="Two-hand chords" style={btnBase(handFilter === 'two')}>
                <span style={{ display: 'inline-flex', transform: 'rotate(20deg)' }}><Hand size={12} /></span>
                <span style={{ display: 'inline-flex', transform: 'scaleX(-1) rotate(20deg)' }}><Hand size={12} /></span>
              </button>
            </div>
          </div>

          <div style={{ width: 1, height: 16, background: '#2a2a3a' }} />

          {/* Notes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8, color: '#404055', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</span>
            <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 4, padding: 2, gap: 1 }}>
              {(['any', '3', '4', '5', '6+'] as const).map(n => (
                <button key={n} onClick={() => setNoteFilter(n)} style={{ ...btnBase(noteFilter === n), minWidth: 22 }}>{n}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PROGRESSIONS + INVERSIONS row — three-column layout */}
      <div style={{ ...ROW, position: 'relative' }}>
        {/* Left column: PROGRESSIONS label + pattern dropdown ─────────────── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={ROW_LABEL}>Progressions</span>
          {/* Dropdown trigger */}
          <button
            ref={progTriggerRef}
            onClick={openProgDropdown}
            style={{
              ...btnBase(false),
              color: activeProg ? '#e8a027' : '#9090a8',
              padding: '2px 6px',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
            onMouseLeave={e => { e.currentTarget.style.color = activeProg ? '#e8a027' : '#9090a8' }}
          >
            {activeProg ? activeProg.name : 'None'} ▾
          </button>
          {activeProg && (
            <button
              onClick={() => { stopProgression(); setSelectedProg(null) }}
              title="Clear progression"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontSize: 14, lineHeight: 1, padding: '0 2px', fontFamily: 'Inter' }}
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
            onClick={() => progPlaying ? stopProgression() : startProgression()}
            disabled={selectedProg === null && !progPlaying}
            title={selectedProg === null ? 'Pick a pattern to play a progression' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              padding: '3px 10px', borderRadius: 4, cursor: selectedProg !== null || progPlaying ? 'pointer' : 'default',
              background: 'none',
              border: `1.5px solid ${progPlaying ? '#c0392b' : selectedProg !== null ? '#e8a027' : '#505068'}`,
              boxShadow: progPlaying ? '0 0 6px #c0392b' : selectedProg !== null ? '0 0 6px #e8a027' : 'none',
              color: progPlaying ? '#c0392b' : selectedProg !== null ? '#e8a027' : '#505068',
            }}
          >
            {progPlaying ? <Square size={12} /> : <Play size={12} />}
            {progPlaying ? 'STOP' : 'PLAY'}
          </button>
          {/* Speed selector SVG component */}
          <SpeedControl value={progSpeed} onChange={setProgSpeed} />
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

      {/* Results grid */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '8px 12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        alignContent: 'start',
      }}>
        {filteredChords.map(chord => {
          const isSel = selectedKey === chord.key
          const midiNotes = buildChordMidi(selectedRoot, chord.intervals, 61)
          const noteNames = midiNotes
            .map(m => getNoteName(m, displayNaming, accidentals))
            .filter(Boolean)
            .join(' ')
          const chordLabel = `${rootLabel(selectedRoot)}${chord.suffix}`
          const showRoman = progPlaying && selectedProg !== null && isSel

          return (
            <button
              key={chord.key}
              onClick={() => playChordAt(chord.key, selectedRoot)}
              style={{
                background: isSel ? '#1f1a0e' : '#1a1a26',
                border: `1px solid ${isSel ? '#e8a027' : 'transparent'}`,
                borderRadius: 6,
                padding: '6px 8px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 2,
                transition: 'border-color 0.1s, background 0.1s',
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = '#3a3a4a' }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'transparent' }}
            >
              <span style={{
                fontFamily: 'Inter', fontSize: 12, fontWeight: 700,
                color: isSel ? '#e8a027' : '#b0b0cc',
                lineHeight: 1.2,
              }}>
                {chordLabel || rootLabel(selectedRoot)}
              </span>
              <span style={{ fontFamily: 'Inter', fontSize: 9, color: '#8080a0', lineHeight: 1.3 }}>
                {noteNames || chord.name}
              </span>
              {showRoman && (
                <span style={{ fontFamily: 'Inter', fontSize: 8, fontWeight: 700, color: '#e8a027', lineHeight: 1 }}>
                  {PROGRESSIONS[selectedProg!].labels[progStep]}
                </span>
              )}
            </button>
          )
        })}

        {filteredChords.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', textAlign: 'center',
            color: '#404055', fontSize: 11, fontFamily: 'Inter', padding: '20px 0',
          }}>
            No results
          </div>
        )}
      </div>

      {/* Footer — show-as left, play inversion centred, scale explorer right */}
      <div style={{
        ...ROW,
        height: 40,
        borderTop: '1px solid #1e1e2a',
        borderBottom: 'none',
        background: '#0d0d12',
        padding: '0 12px',
        position: 'relative',
      }}>
        {/* Left: accidentals */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...ROW_LABEL, fontSize: 8, color: '#707088' }}>Show as</span>
          {(['flat', 'sharp'] as const).map(a => (
            <button key={a} onClick={() => setAccidentals(a)} style={{
              background: 'none', border: 'none', padding: '0 4px',
              cursor: 'pointer',
              color: accidentals === a ? '#e8a027' : '#505068',
              fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 600,
              lineHeight: 1,
            }}>
              {a === 'flat' ? '♭' : '#'}
            </button>
          ))}
        </div>

        {/* Centre: inversion controls — absolutely positioned */}
        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <button
            onClick={() => handleInversion('prev')}
            disabled={!selectedKey}
            title="Previous inversion"
            style={{
              background: 'none', border: 'none',
              cursor: selectedKey ? 'pointer' : 'default',
              color: selectedKey ? '#c0c0d0' : '#2a2a3a',
              fontSize: 18, lineHeight: 1, padding: '0 2px', fontFamily: 'Inter',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = '#e8a027' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? '#c0c0d0' : '#2a2a3a' }}
          >‹</button>
          {/* ── Chord name with inversion label; falls back to PLAY INVERSION ── */}
          {(() => {
            const bassNoteMidi = explorerKeys.size > 0 ? Math.min(...explorerKeys) : 0
            const inv = originalChordName && explorerKeys.size > 0
              ? formatInversionDisplay(originalChordName, inversionCount, bassNoteMidi, displayNaming, accidentals, true)
              : null
            return inv ? (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, userSelect: 'none' }}>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#e8a027' }}>
                  {inv.chordLabel}
                </span>
                {inv.ordinal && (
                  <span style={{ fontFamily: 'Inter', fontSize: 9, color: '#c0c0d0' }}>
                    {inv.ordinal}
                    <span style={{ fontSize: 7, verticalAlign: 'super' }}>
                      {ordinalSuffix(Number(inv.ordinal))}
                    </span>
                    {' inv'}
                  </span>
                )}
              </span>
            ) : (
              <span style={{
                fontFamily: 'Inter', fontSize: 9, fontWeight: 700,
                color: selectedKey ? '#e8a027' : '#303040',
                letterSpacing: '0.1em', textTransform: 'uppercase', userSelect: 'none',
              }}>
                Play Inversion
              </span>
            )
          })()}
          <button
            onClick={() => handleInversion('next')}
            disabled={!selectedKey}
            title="Next inversion"
            style={{
              background: 'none', border: 'none',
              cursor: selectedKey ? 'pointer' : 'default',
              color: selectedKey ? '#c0c0d0' : '#2a2a3a',
              fontSize: 18, lineHeight: 1, padding: '0 2px', fontFamily: 'Inter',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = '#e8a027' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? '#c0c0d0' : '#2a2a3a' }}
          >›</button>
          <button
            onClick={() => { clearExplorerKeys(); clearDisplayedChord(); clearLockedKeys(); setSelectedKey(null); setOriginalChordName(null); setInversionCount(0) }}
            disabled={!selectedKey}
            title="Clear selection"
            style={{
              background: 'none', border: 'none',
              cursor: selectedKey ? 'pointer' : 'default',
              color: selectedKey ? '#505068' : '#2a2a3a',
              padding: '0 2px', display: 'flex', alignItems: 'center',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = '#e8a027' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? '#505068' : '#2a2a3a' }}
          ><RotateCcw size={13} /></button>
        </div>

        {/* Right: Scale Explorer placeholder */}
        <button
          onClick={() => { setChordExplorerOpen(false); setScaleExplorerOpen(true) }}
          title="Switch to Scale Explorer"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#505068', fontFamily: 'Inter', fontSize: 9,
            whiteSpace: 'nowrap', padding: 0,
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
          onMouseLeave={e => e.currentTarget.style.color = '#505068'}
        >Scale Explorer →</button>
      </div>

      {/* Progression dropdown — portalled to body to escape overflow:hidden */}
      {/* Progression dropdown — portalled to body to escape overflow:hidden */}
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
            minWidth: 260,
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
