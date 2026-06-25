import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChordType, Interval } from 'tonal'
import { Search, Hand, RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import type { NoteNaming } from '../types'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

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

const COMMON_CHORDS = COMMON_TYPES.map(resolveChord).filter((c): c is ChordInfo => c !== null)
const ALL_CHORDS = [...COMMON_CHORDS, ...EXTENDED_ADD.map(resolveChord).filter((c): c is ChordInfo => c !== null)]

export default function ChordExplorer() {
  const chordExplorerOpen = useStore(s => s.chordExplorerOpen)
  const setChordExplorerOpen = useStore(s => s.setChordExplorerOpen)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const setAccidentals = useStore(s => s.setAccidentals)
  const setKeyboardSize = useStore(s => s.setKeyboardSize)

  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.floor((window.innerWidth - 540) / 2)),
    y: Math.max(0, Math.floor((window.innerHeight - 500) / 2)),
  }))
  const [selectedRoot, setSelectedRoot] = useState(0)
  const [tier, setTier] = useState<'common' | 'extended'>('common')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [handFilter, setHandFilter] = useState<'all' | 'one' | 'two'>('all')
  const [noteFilter, setNoteFilter] = useState<'any' | '3' | '4' | '5' | '6+'>('any')

  const prevSizeRef = useRef<61 | 73 | 88 | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // Force 61-key while open; restore on close. Also reset transient filter state on each open.
  useEffect(() => {
    if (chordExplorerOpen) {
      prevSizeRef.current = useStore.getState().keyboardSize as 61 | 73 | 88
      setKeyboardSize(61)
      setSearch('')
      setSearchOpen(false)
      setHandFilter('all')
      setNoteFilter('any')
    } else if (prevSizeRef.current !== null) {
      setKeyboardSize(prevSizeRef.current)
      prevSizeRef.current = null
    }
  }, [chordExplorerOpen, setKeyboardSize])

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
    clearExplorerKeys()
    setChordExplorerOpen(false)
    setSelectedKey(null)
  }, [clearExplorerKeys, setChordExplorerOpen])

  useEffect(() => {
    if (!chordExplorerOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, close])

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

  const playChordAt = useCallback((chordKey: string, rootPitchClass: number) => {
    const info = ALL_CHORDS.find(c => c.key === chordKey)
    if (!info) return
    const midiNotes = buildChordMidi(rootPitchClass, info.intervals, 61)
    if (midiNotes.length === 0) return
    const keys = new Set(midiNotes)
    const colors = new Map(midiNotes.map(m => [m, '#e8a027'] as [number, string]))
    setExplorerKeys(keys, colors)
    setSelectedKey(chordKey)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) midiNotes.forEach(m => playNote(m, 0.75, 1200))
  }, [setExplorerKeys])

  const handleRootChange = (pitchClass: number) => {
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
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) Array.from(newNotes).forEach(m => playNote(m, 0.75, 1000))
  }, [selectedKey, setExplorerKeys])

  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
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

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: 540,
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

      {/* Root selector */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '7px 12px',
        gap: 4,
        borderBottom: '1px solid #1e1e2a',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 8, fontFamily: 'Inter', color: '#505068', marginRight: 2, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
          Root
        </span>
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

      {/* Filter row: tier · hand · notes */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 12px',
        borderBottom: '1px solid #1e1e2a',
      }}>
        {/* Tier */}
        <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 5, padding: 2, gap: 1, flexShrink: 0 }}>
          {(['common', 'extended'] as const).map(t => (
            <button key={t} onClick={() => setTier(t)} style={btnBase(tier === t)}>
              {t === 'common' ? 'Common' : 'Extended'}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 16, background: '#2a2a3a', flexShrink: 0 }} />

        {/* Hand */}
        <span style={{ fontSize: 8, color: '#404055', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Hand</span>
        <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 4, padding: 2, gap: 1, flexShrink: 0 }}>
          <button onClick={() => setHandFilter('all')} title="All chords" style={btnBase(handFilter === 'all')}>
            All
          </button>
          <button onClick={() => setHandFilter('one')} title="One hand chords" style={btnBase(handFilter === 'one')}>
            <span style={{ display: 'inline-flex', transform: 'rotate(-20deg)' }}>
              <Hand size={12} />
            </span>
          </button>
          <button onClick={() => setHandFilter('two')} title="Two hand chords" style={btnBase(handFilter === 'two')}>
            <span style={{ display: 'inline-flex', transform: 'rotate(20deg)' }}>
              <Hand size={12} />
            </span>
            <span style={{ display: 'inline-flex', transform: 'scaleX(-1) rotate(20deg)' }}>
              <Hand size={12} />
            </span>
          </button>
        </div>

        <div style={{ width: 1, height: 16, background: '#2a2a3a', flexShrink: 0 }} />

        {/* Notes */}
        <span style={{ fontSize: 8, color: '#404055', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Notes</span>
        <div style={{ display: 'flex', background: '#1a1a26', borderRadius: 4, padding: 2, gap: 1 }}>
          {(['any', '3', '4', '5', '6+'] as const).map(n => (
            <button key={n} onClick={() => setNoteFilter(n)} style={{ ...btnBase(noteFilter === n), minWidth: 22 }}>
              {n}
            </button>
          ))}
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

      {/* Footer: accidentals (left) + play inversion (centered) */}
      <div style={{
        flexShrink: 0, height: 40,
        borderTop: '1px solid #1e1e2a',
        background: '#0d0d12',
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        position: 'relative',
      }}>
        {/* Accidentals — left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 8, color: '#707088', fontFamily: 'Inter', letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none' }}>
            Show as
          </span>
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

        {/* Inversion controls — absolutely centered */}
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
          <span style={{
            fontFamily: 'Inter', fontSize: 9, fontWeight: 700,
            color: selectedKey ? '#e8a027' : '#303040',
            letterSpacing: '0.1em', textTransform: 'uppercase', userSelect: 'none',
          }}>
            Play Inversion
          </span>
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
            onClick={() => { clearExplorerKeys(); setSelectedKey(null) }}
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
      </div>
    </div>
  )
}
