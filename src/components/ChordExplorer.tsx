import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChordType, Interval } from 'tonal'
import { Search, Hand, RotateCcw, Square, CircleOff, ListOrdered, Shuffle, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import Fuse from 'fuse.js'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { getGenreVoicing, GENRE_LABELS } from '../utils/genreVoicing'
import type { Genre } from '../utils/genreVoicing'
import type { NoteNaming } from '../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import SpeedControl from './SpeedControl'
import OrfeoMark from './OrfeoMark'
import Tooltip from './Tooltip'
import { getPianoRollCenterX, getKeyboardHeaderTop } from '../utils/modalAnchors'
import { useAnchorBottomOnResize } from '../hooks/useAnchorBottomOnResize'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import { buildChordMidi, formatChordSuffix } from '../utils/chordDetection'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

// ── Modal dimensions for default positioning above the keyboard ───────────
const MODAL_WIDTH = 720
const MODAL_HEIGHT = 532

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
  // Major triad with a flattened 5th (tonal.js key 'Mb5', e.g. Bb-D-Fb) —
  // the triad-tier counterpart to 'dim' (minor 3rd + b5) that was missing
  // entirely, so any real chord detected as this type (Chord.detect/
  // detectChordStructured both already recognize it) had no catalog match:
  // right-click "Open in Chord Explorer" fell through to no-op past its
  // interval-equality lookup, and note-search could never find it either
  // since both search the same ALL_CHORDS list. ─────────────────────────────
  'Mb5',
]

// ── Maps our curated catalog KEYS to a raw tonal-style suffix, for the
// handful that aren't already symbol-shaped (word keys like 'major', or a
// deliberate simplification like 'alt7'→'alt'). Everything else's key IS
// already a valid raw suffix — formatChordSuffix (imported from
// chordDetection.ts, the same formatter every other chord display in the
// app uses) handles the rest, including style (abbreviation/symbol). This
// used to be its own full DISPLAY_SUFFIX override map, duplicating and
// disagreeing with the playback display's formatting — see
// docs/superpowers/specs/2026-08-20-chord-settings-design.md. ─────────────
const KEY_TO_RAW_SUFFIX: Record<string, string> = {
  'major': '', 'minor': 'm', 'half-diminished': 'm7b5', 'alt7': 'alt',
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
  isRotation?: true
  baseName?: string
}

// ── Single-chevron play icon — matches Scales Explorer's icon exactly, same
// shape as SpeedControl's "slow" icon, reused for the Progressions PLAY
// button and the footer's prev/next inversion buttons. ─────────────────────
function ChevronPlayIcon({ size = 14, mirrored = false }: { size?: number; mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 17 26" width={Math.round(size * 17 / 26)} height={size} fill="none" aria-hidden="true"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path
        d="M1,4c0-1.66,1.34-3,3-3,.8,0,1.56.32,2.12.88l9,9c1.17,1.17,1.17,3.07,0,4.24l-9,9c-1.17,1.17-3.07,1.17-4.24,0-.56-.56-.88-1.33-.88-2.12V4Z"
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

// ── suffix stores the RAW (style-independent) suffix — style is applied at
// every display site via formatChordSuffix(chord.suffix, chordNamingStyle),
// same as chordDetection.ts's localizeChord, so it stays live/reactive
// instead of being baked into this module-level catalog. ──────────────────
function resolveChord(key: string): ChordInfo | null {
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

function applyNthInversion(baseMidi: number[], n: number): number[] {
  if (n <= 0) return baseMidi
  let notes = [...baseMidi].sort((a, b) => a - b)
  for (let i = 0; i < n; i++) {
    const [lowest, ...rest] = notes
    notes = [...rest, lowest + 12]
  }
  return notes
}

// ── Average MIDI pitch of a note array ───────────────────────────────────
function avgPitch(notes: number[]): number {
  return notes.reduce((s, n) => s + n, 0) / notes.length
}

// ── Closest-voicing selector for smooth progression voice leading ─────────
// Generates every root-position + inversion candidate for the given chord
// across all octaves that fit within the keyboard's playable range, then
// returns the candidate whose average pitch is nearest to prevAvgPitch.
// This prevents the fixed-octave default from jumping an octave when the
// pitch class wraps around (e.g. B above C instead of B below it).
// Falls back to buildChordMidi if no valid candidate is found.
function closestVoicing(
  rootPitchClass: number,
  intervals: string[],
  keyboardSize: number,
  prevAvgPitch: number,
): number[] {
  const { min, max } = RANGES[keyboardSize as 61 | 73 | 88] ?? RANGES[73]
  const candidates: number[][] = []
  for (let oct = 2; oct <= 6; oct++) {
    const rootMidi = rootPitchClass + (oct + 1) * 12
    if (rootMidi < min || rootMidi > max) continue
    const baseMidi = intervals
      .map(ivl => { const s = Interval.semitones(ivl); return s !== null ? rootMidi + s : null })
      .filter((n): n is number => n !== null && n >= min && n <= max)
    if (baseMidi.length < 2) continue
    candidates.push(baseMidi)
    for (let inv = 1; inv < baseMidi.length; inv++) {
      const inverted = applyNthInversion(baseMidi, inv)
      if (inverted.every(n => n >= min && n <= max)) candidates.push(inverted)
    }
  }
  if (candidates.length === 0) return buildChordMidi(rootPitchClass, intervals, keyboardSize)
  let best = candidates[0]
  let bestDist = Math.abs(avgPitch(best) - prevAvgPitch)
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(avgPitch(candidates[i]) - prevAvgPitch)
    if (d < bestDist) { bestDist = d; best = candidates[i] }
  }
  return best
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

// ── Progressions ordered by name-family: Pop cluster → Rock cluster →
//    Jazz cluster → exotic/uniquely-named progressions ────────────────────
const PROGRESSIONS: Progression[] = [
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

// ── Build flat list of base progressions + their deduplicated rotations ───
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

const ALL_PROGRESSIONS = buildAllProgressions()

const SPEED_MS = { slow: 1500, med: 800, fast: 400 } as const

// ── Genre voicing descriptions — shared by the Style dropdown's trigger
// tooltip and its two-column list (name left / description right). ─────────
const GENRE_DESCRIPTIONS: Record<Genre, string> = {
  classic:   'Plain diatonic triads',
  coltrane:  'Adds 9ths and 13ths for sophisticated jazz harmony',
  cinematic: 'Open, clean voicings — add9 and suspended chords',
  roadhouse: 'Dominant 7ths on the I and IV chords — classic blues sound',
  ipanema:   'Smooth 9ths and 11ths with a tritone-substitution lean — bossa nova character',
  carnival:  'Bright, festive 7th chords — samba character',
  velvet:    'Deep 11ths and 13ths, mellow and laid-back — neo-soul character',
}

const COMMON_CHORDS = COMMON_TYPES.map(resolveChord).filter((c): c is ChordInfo => c !== null)
const ALL_CHORDS = [...COMMON_CHORDS, ...EXTENDED_ADD.map(resolveChord).filter((c): c is ChordInfo => c !== null)]

// ── Fallback dictionary — every OTHER chord type tonal.js recognizes,
// beyond the hand-picked ALL_CHORDS above. ALL_CHORDS stays a deliberately
// curated, browsable tile set (adding every tonal.js type there would blow
// it up to 100+ tiles); this exists purely so a chord actually detected in
// a MIDI file, or typed into note-search, can never come back "not found"
// just because nobody thought to curate it into a tile. playChordAt, the
// pendingChordExplorerSeed effect, and filteredChords's search all check
// this ONLY when the curated list has no match — see each call site. ──────
const CURATED_KEYS = new Set(ALL_CHORDS.map(c => c.key))
const FULL_CHORD_TYPES = ChordType.all()
  .filter(ct => ct.aliases.length > 0 && !CURATED_KEYS.has(ct.aliases[0]))
  .map(ct => resolveChord(ct.aliases[0]))
  .filter((c): c is ChordInfo => c !== null)

// ── Shared row label style — dim uppercase, used across all control rows ──────
const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--text-dimmest)', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}

// ── Shared row container — flex row with separator ────────────────────────────
const ROW: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex', alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 12px',
  borderBottom: '1px solid var(--border)',
}

export default function ChordExplorer() {
  const chordExplorerOpen       = useStore(s => s.chordExplorerOpen)
  const chordExplorerMinimized  = useStore(s => s.chordExplorerMinimized)
  const setChordExplorerOpen    = useStore(s => s.setChordExplorerOpen)
  const setScaleExplorerOpen    = useStore(s => s.setScaleExplorerOpen)
  const explorerKeys = useStore(s => s.explorerKeys)
  const setExplorerKeys = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys = useStore(s => s.clearExplorerKeys)
  const clearDisplayedChord = useStore(s => s.clearDisplayedChord)
  const clearLockedKeys = useStore(s => s.clearLockedKeys)
  const setExplorerChordDisplay = useStore(s => s.setExplorerChordDisplay)
  const clearExplorerChordDisplay = useStore(s => s.clearExplorerChordDisplay)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const setAccidentals = useStore(s => s.setAccidentals)
  // ── Window drag position — bottom edge on the keyboard header, horizontally
  // centered on the piano roll; recomputed each time the modal opens, but not
  // while it's open (side-panel toggles don't move it). ─────────────────────
  const [pos, setPos] = useState(() => ({
    x: Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2),
    y: Math.round(getKeyboardHeaderTop() - MODAL_HEIGHT) - 78,
  }))
  const panelRef = useRef<HTMLDivElement>(null)
  useAnchorBottomOnResize(panelRef, setPos, chordExplorerOpen && !chordExplorerMinimized, 44)
  useFocusTrap(panelRef, chordExplorerOpen && !chordExplorerMinimized)
  const [selectedRoot, setSelectedRoot] = useState(0)
  const [tier, setTier] = useState<'common' | 'extended' | 'power'>('common')
  const [selectedPowerRoot, setSelectedPowerRoot] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchScope, setSearchScope] = useState<'name' | 'notes' | 'both'>('both')
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
  const [progGenre, setProgGenre] = useState<Genre>('classic')
  // ── Currently-sounding notes, in real ascending sounding order — drives the
  // fixed-width note-names slot in the style row's right corner. ────────────
  const [playingNotes, setPlayingNotes] = useState<number[]>([])
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)
  const [styleDropdownRect, setStyleDropdownRect] = useState<{ top: number; left: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const progTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progRunningRef = useRef(false)
  const progTriggerRef = useRef<HTMLButtonElement>(null)
  const progDropRef = useRef<HTMLDivElement>(null)
  const styleTriggerRef = useRef<HTMLButtonElement>(null)
  const styleDropRef = useRef<HTMLDivElement>(null)

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
    setPlayingNotes([])
  }, [])

  // Reset transient state on open; no keyboard size change (61 is for ScaleExplorer only).
  useEffect(() => {
    if (chordExplorerOpen) {
      // ── Recompute anchor position every time the modal opens ────────────
      setPos({
        x: Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2),
        y: Math.round(getKeyboardHeaderTop() - MODAL_HEIGHT) - 78,
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
      setSelectedPowerRoot(null)
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
    clearExplorerChordDisplay()
    setChordExplorerOpen(false)
    setSelectedKey(null)
  }, [stopProgression, clearExplorerKeys, clearExplorerChordDisplay, setChordExplorerOpen])

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

  // Outside-click to close style dropdown
  useEffect(() => {
    if (!styleDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (
        styleDropRef.current?.contains(e.target as Node) ||
        styleTriggerRef.current?.contains(e.target as Node)
      ) return
      setStyleDropdownOpen(false)
      setStyleDropdownRect(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [styleDropdownOpen])

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

  // ── Clear search whenever the user switches tiers ─────────────────────────
  // On entering Power mode: also clear any previously selected chord so
  // Play Inversion buttons are visually disabled and explorer keys are reset.
  useEffect(() => {
    setSearch('')
    setSearchOpen(false)
    if (tier === 'power') {
      setSelectedKey(null)
      clearExplorerKeys()
      clearExplorerChordDisplay()
    }
  }, [tier, clearExplorerKeys, clearExplorerChordDisplay])

  // ── One searchable record per chord — shared shape for both the curated
  // tier's own list and the FULL_CHORD_TYPES fallback below. Rebuilt
  // whenever the source list, root, naming system, or accidentals change so
  // that displayed names, note spellings, and numeric tokens stay in sync.
  // typeName is the bare suffix without root so name-scope search is
  // root-independent. ────────────────────────────────────────────────────
  const buildSearchable = useCallback((chords: ChordInfo[]) =>
    chords.map(chord => {
      const styledSuffix = formatChordSuffix(chord.suffix, chordNamingStyle)
      return {
        chord,
        display: `${rootLabels.find(r => r.pitchClass === selectedRoot)?.label ?? ''}${styledSuffix}`,
        typeName: styledSuffix,
        aliases: chord.aliases,
        notes: buildChordMidi(selectedRoot, chord.intervals, 61)
          .map(m => getNoteName(m, displayNaming, accidentals)).filter(Boolean).join(' '),
        numerics: (styledSuffix + ' ' + chord.aliases.join(' ')).match(/\d+/g)?.join(' ') ?? '',
      }
    }),
    [selectedRoot, rootLabels, displayNaming, accidentals, chordNamingStyle]
  )

  const searchableChords = useMemo(() => buildSearchable(tierChords), [tierChords, buildSearchable])
  // ── Fallback searchable set — the full tonal.js dictionary, independent of
  // tier/curation. Only ever queried when a search comes up empty against
  // the curated tier (see filteredChords below), so normal curated search
  // results are never diluted by obscure dictionary entries. ────────────────
  const searchableChordsFallback = useMemo(() => buildSearchable(FULL_CHORD_TYPES), [buildSearchable])

  // ── Fuse instances — keys vary by scope; rebuilt when data or scope changes ─
  // aliases excluded: tonal.js aliases contain long English words ("minor",
  // "dominant") that produce spurious matches for single letters like n/o/i/u.
  const fuseKeys = useMemo(() =>
    searchScope === 'name'  ? ['typeName', 'numerics'] :
    searchScope === 'notes' ? ['notes'] :
    /* both */                ['display', 'typeName', 'notes', 'numerics'],
    [searchScope]
  )
  const fuseOpts = { threshold: 0.2, includeScore: true, minMatchCharLength: 1, ignoreLocation: true, useExtendedSearch: false }
  const fuseInstance = useMemo(() => new Fuse(searchableChords, { keys: fuseKeys, ...fuseOpts }), [searchableChords, fuseKeys])
  const fuseInstanceFallback = useMemo(() => new Fuse(searchableChordsFallback, { keys: fuseKeys, ...fuseOpts }), [searchableChordsFallback, fuseKeys])

  // ── Filter chords: Fuse search + note-count + hand-span filters ───────────
  const filteredChords = useMemo(() => {
    let result: ChordInfo[]

    if (searchOpen && search.trim()) {
      const curated = fuseInstance.search(search.trim()).map(r => r.item.chord)
      // ── Curated tier has nothing — fall back to the full tonal.js
      // dictionary rather than showing "no results" for a chord that
      // genuinely exists (e.g. an obscure altered type nobody curated
      // into a tile). ─────────────────────────────────────────────────
      result = curated.length > 0 ? curated : fuseInstanceFallback.search(search.trim()).map(r => r.item.chord)
    } else {
      result = tierChords
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
  }, [tierChords, search, searchOpen, noteFilter, handFilter, selectedRoot, fuseInstance, fuseInstanceFallback])

  // ── Recursive progression step player ───────────────────────────────────
  // prevMidi: the MIDI notes played at the previous step, used to pick the
  // closest-register voicing for the current step. Null for the first step.
  // When invMode is not 'off' the user's explicit inversion choice takes
  // precedence and voice leading is skipped for that run.
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    chordKey: string,
    root: number,
    speed: 'slow' | 'med' | 'fast',
    invMode: 'off' | 'sequential' | 'random',
    genre: Genre,
    loopCount: number,
    prevMidi: number[] | null,
  ) => {
    if (!progRunningRef.current) return
    const prog = ALL_PROGRESSIONS[progIndex]
    if (!prog) return
    const offset = prog.offsets[step]
    const actualRoot = (root + offset) % 12
    // ── Genre voicing: re-voice chord type for selected genre style ───────
    const effectiveKey = getGenreVoicing(genre, prog.labels[step], chordKey)
    const info = ALL_CHORDS.find(c => c.key === effectiveKey) ?? ALL_CHORDS.find(c => c.key === chordKey)
    if (!info) return
    const durationMs = SPEED_MS[speed]

    // ── Voice selection: closest register when no explicit inversion mode ─
    let midiNotes: number[]
    if (step > 0 && prevMidi !== null && invMode === 'off') {
      midiNotes = closestVoicing(actualRoot, info.intervals, 61, avgPitch(prevMidi))
    } else {
      const baseMidi = buildChordMidi(actualRoot, info.intervals, 61)
      midiNotes = baseMidi
      if (baseMidi.length > 0 && invMode !== 'off') {
        let invIdx = 0
        if (invMode === 'sequential') invIdx = loopCount % baseMidi.length
        else invIdx = Math.floor(Math.random() * baseMidi.length)
        midiNotes = applyNthInversion(baseMidi, invIdx)
      }
    }

    if (midiNotes.length > 0) {
      const keys = new Set(midiNotes)
      const colors = new Map(midiNotes.map(m => [m, 'var(--text-amber)'] as [number, string]))
      setExplorerKeys(keys, colors)
      // ── Update chord name display above keyboard for this step ───────────
      const rootLbl = rootLabels.find(r => r.pitchClass === actualRoot)?.label ?? ''
      const chordSuffix = formatChordSuffix(info.suffix, chordNamingStyle)
      setExplorerChordDisplay({ name: `${rootLbl}${chordSuffix}`, invCount: 0, noteCount: midiNotes.length })
      // ── Real sounding order (ascending, matches inversion voicing) for the
      // style row's fixed-width note-names slot. ────────────────────────────
      setPlayingNotes([...midiNotes].sort((a, b) => a - b))
      const playNote = (window as any).__orfeoPlayNote
      if (playNote) midiNotes.forEach(m => playNote(m, 0.75, Math.round(durationMs * 0.9), undefined, false))
    }
    setProgStep(step)

    const nextStep = (step + 1) % prog.offsets.length
    const nextLoopCount = nextStep === 0 ? loopCount + 1 : loopCount
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, chordKey, root, speed, invMode, genre, nextLoopCount, midiNotes)
    }, durationMs)
  }, [setExplorerKeys, setExplorerChordDisplay, rootLabels, chordNamingStyle])

  const startProgression = useCallback(() => {
    if (selectedProg === null) return
    const chordKey = selectedKey ?? 'major'
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    setProgStep(0)
    playProgStepAt(0, selectedProg, chordKey, selectedRoot, progSpeed, progInversionMode, progGenre, 0, null)
  }, [selectedProg, selectedKey, selectedRoot, progSpeed, progInversionMode, progGenre, stopProgression, playProgStepAt])

  // ── Spacebar plays/pauses the progression while this modal is open ────────
  useEffect(() => {
    if (!chordExplorerOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (selectedProg === null) return
      e.preventDefault()
      if (progPlaying) stopProgression(); else startProgression()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, selectedProg, progPlaying, stopProgression, startProgression])

  const playChordAt = useCallback((chordKey: string, rootPitchClass: number) => {
    stopProgression()
    // ── FULL_CHORD_TYPES fallback: chordKey can come from a filteredChords
    // tile that fell back to the full dictionary (see filteredChords below),
    // or from the seed-match effect's own fallback — not just the curated
    // ALL_CHORDS list. ─────────────────────────────────────────────────────
    const info = ALL_CHORDS.find(c => c.key === chordKey) ?? FULL_CHORD_TYPES.find(c => c.key === chordKey)
    if (!info) return
    const midiNotes = buildChordMidi(rootPitchClass, info.intervals, 61)
    if (midiNotes.length === 0) return
    const keys = new Set(midiNotes)
    const colors = new Map(midiNotes.map(m => [m, 'var(--text-amber)'] as [number, string]))
    setExplorerKeys(keys, colors)
    setSelectedKey(chordKey)
    // ── Store chord identity in Zustand so Keyboard.tsx can display it ────
    const chordName = `${rootLabels.find(r => r.pitchClass === rootPitchClass)?.label ?? ''}${formatChordSuffix(info.suffix, chordNamingStyle)}`
    setExplorerChordDisplay({ name: chordName, invCount: 0, noteCount: midiNotes.length })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) midiNotes.forEach(m => playNote(m, 0.75, 1200, undefined, false))
  }, [stopProgression, setExplorerKeys, rootLabels, chordNamingStyle])

  // ── Consume a "open pre-seeded with this chord" signal from the playback
  // chord-display context menu (Keyboard.tsx) — matched by interval-array
  // equality against our own catalog rather than a key string, since the
  // detector's raw chord type may use a different tonal.js alias than the
  // one this catalog happens to be keyed by. One-shot: cleared immediately
  // whether or not a match was found, so it never re-fires on its own. ─────
  useEffect(() => {
    if (!chordExplorerOpen) return
    const seed = useStore.getState().pendingChordExplorerSeed
    if (!seed) return
    useStore.getState().setPendingChordExplorerSeed(null)

    // ── Root always follows the seed, match or not — same root the playback
    // display and "Show on keyboard" already agreed on, independent of
    // whether this catalog happens to have a tile for the chord's type. ─────
    setSelectedRoot(seed.rootPitchClass)

    const intervalsMatch = (c: ChordInfo) =>
      c.intervals.length === seed.intervals.length && c.intervals.every((iv, i) => iv === seed.intervals[i])
    const match = ALL_CHORDS.find(intervalsMatch) ?? FULL_CHORD_TYPES.find(intervalsMatch)
    if (!match) return

    if (!COMMON_CHORDS.some(c => c.key === match.key)) setTier('extended')
    playChordAt(match.key, seed.rootPitchClass)
  }, [chordExplorerOpen, playChordAt])

  // ── Play a power chord (root + P5) for the given pitch class ─────────────
  const playPowerChord = useCallback((pitchClass: number) => {
    stopProgression()
    setSelectedPowerRoot(pitchClass)
    const { min, max } = RANGES[61]
    let rootMidi = -1
    for (const oct of [4, 3, 5, 2]) {
      const midi = pitchClass + (oct + 1) * 12
      if (midi >= min && midi <= max) { rootMidi = midi; break }
    }
    if (rootMidi < 0) return
    const midiNotes = [rootMidi, rootMidi + 7].filter(n => n <= max)
    const keys = new Set(midiNotes)
    const colors = new Map(midiNotes.map(m => [m, 'var(--text-amber)'] as [number, string]))
    setExplorerKeys(keys, colors)
    const rootLbl = rootLabels.find(r => r.pitchClass === pitchClass)?.label ?? ''
    setExplorerChordDisplay({ name: `${rootLbl}5`, invCount: 0, noteCount: midiNotes.length })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) midiNotes.forEach(m => playNote(m, 0.75, 1200, undefined, false))
  }, [stopProgression, setExplorerKeys, rootLabels, setExplorerChordDisplay])

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
    const state = useStore.getState()
    const current = state.explorerKeys
    if (current.size === 0) return
    const newNotes = dir === 'next' ? nextInversion(current) : prevInversion(current)
    const colors = new Map(Array.from(newNotes).map(m => [m, 'var(--text-amber)'] as [number, string]))
    setExplorerKeys(newNotes, colors)
    // ── Update inversion count in store so Keyboard.tsx label updates ─────
    const cd = state.explorerChordDisplay
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + (dir === 'next' ? 1 : -1) })
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) Array.from(newNotes).forEach(m => playNote(m, 0.75, 1000, undefined, false))
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
      // 44, not 0 — keeps the top edge clear of the 40px titleBarOverlay
      // (electron/main.ts) where Windows draws its own window controls on
      // top of everything in the DOM.
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(44, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const rootLabel = (pc: number) => rootLabels.find(r => r.pitchClass === pc)?.label ?? ''

  // ── Pill button base — active: amber text + tinted bg; inactive: dim ─────────
  const btnBase = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: 'none',
    background: active ? 'var(--state-hover-bg)' : 'transparent',
    color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
    fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  })

  // Closed (open=false): unmount entirely. Minimized (open=true, minimized=true): render but hide.
  if (!chordExplorerOpen) return null

  const isPowerMode = tier === 'power'
  const activeProg = selectedProg !== null ? ALL_PROGRESSIONS[selectedProg] : null

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Chords Explorer" className="orfeo-modal-glow" style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MODAL_WIDTH,
      maxHeight: '65vh',
      background: 'var(--bg-modal)',
      border: '1px solid var(--state-hover-bg)',
      borderRadius: 10,
      zIndex: 401,
      display: chordExplorerMinimized ? 'none' : 'flex', flexDirection: 'column',
      overflow: 'hidden',
      '--_modal-shadow': 'var(--elevation-modal)',
    } as CSSProperties}>

      {/* Header — draggable */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 36, flexShrink: 0,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 var(--space-3)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <OrfeoMark height={22} />
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Chords Explorer
          </span>
        </div>
        <div
          onMouseDown={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {/* ── Search scope toggle — visible when search bar is open ────── */}
          {searchOpen && (
            <div style={{ display: 'flex', background: 'var(--bg-tile)', borderRadius: 4, padding: 2, gap: 1 }}>
              {(['name', 'notes', 'both'] as const).map(scope => (
                <Tooltip
                  key={scope}
                  title={scope === 'name' ? 'Search by name' : scope === 'notes' ? 'Search by notes' : 'Search both'}
                  description={
                    scope === 'name'  ? 'Matches chord names and types, like m7, maj7, dim…' :
                    scope === 'notes' ? 'Matches note names in the chord for the selected root' :
                    'Matches chord names and note names together'
                  }
                >
                <button
                  onClick={() => setSearchScope(scope)}
                  style={{
                    padding: '2px 6px', borderRadius: 'var(--radius-sm)', border: 'none',
                    background: searchScope === scope ? 'var(--state-hover-bg)' : 'transparent',
                    color: searchScope === scope ? 'var(--text-amber)' : 'var(--text-inactive)',
                    fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', textTransform: 'capitalize',
                    transition: 'color 0.12s, background 0.12s',
                  }}
                  onMouseEnter={e => { if (searchScope !== scope) e.currentTarget.style.color = 'var(--text-muted)' }}
                  onMouseLeave={e => { if (searchScope !== scope) e.currentTarget.style.color = 'var(--text-inactive)' }}
                >
                  {scope === 'name' ? 'Name' : scope === 'notes' ? 'Notes' : 'Both'}
                </button>
                </Tooltip>
              ))}
            </div>
          )}
          {/* ── Text input ───────────────────────────────────────────────── */}
          {searchOpen && (
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search …"
              style={{
                height: 22, width: 120,
                background: 'var(--bg-tile)',
                border: '1px solid var(--state-hover-bg)',
                borderRadius: 4,
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-ui)', fontSize: 11,
                padding: '0 8px', outline: 'none',
                caretColor: 'var(--text-amber)',
              }}
            />
          )}
          <Tooltip
            title={isPowerMode ? 'Search unavailable' : searchOpen ? 'Close search' : 'Find a chord'}
            description={isPowerMode ? 'Switch out of Power mode to search chords' : searchOpen ? 'Hides the chord search bar' : 'Search by chord name or by the notes it contains'}
          >
          <button
            onClick={isPowerMode ? undefined : toggleSearch}
            style={{ background: 'none', border: 'none', cursor: isPowerMode ? 'default' : 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: isPowerMode ? 'var(--text-muted)' : searchOpen ? 'var(--text-amber)' : 'var(--text-dimmest)', opacity: isPowerMode ? 0.35 : 1, transition: 'opacity 0.15s' }}
            onMouseEnter={e => { if (!isPowerMode) e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { if (!isPowerMode) e.currentTarget.style.color = searchOpen ? 'var(--text-amber)' : 'var(--text-dimmest)' }}
          >
            <Search size={14} />
          </button>
          </Tooltip>
          <button
            onClick={close}
            style={{ ...modalCloseButtonStyle, fontSize: 'var(--text-lg)', lineHeight: 1, fontFamily: 'var(--font-ui)' }}
            onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
            onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
          >×</button>
        </div>
      </div>

      {/* ── Root row — label left, 12 pitch-class buttons right ─────────────── */}
      <div style={{ ...ROW, minHeight: 'var(--row-height)' }}>
        <span style={ROW_LABEL}>Root</span>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
          {rootLabels.map(({ pitchClass, label }) => {
            const isSel = selectedRoot === pitchClass
            return (
              <button
                key={pitchClass}
                onClick={() => handleRootChange(pitchClass)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 4, border: 'none',
                  background: isSel ? 'var(--text-amber)' : 'var(--border)',
                  color: isSel ? 'var(--bg)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', transition: 'background 0.1s, color 0.1s',
                  minWidth: 30, textAlign: 'center',
                }}
                onMouseEnter={e => { if (!isSel) { e.currentTarget.style.background = 'var(--state-hover-bg)'; e.currentTarget.style.color = 'var(--text-pill-hover)' } }}
                onMouseLeave={e => { if (!isSel) { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)' } }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Filter row — label left, tier / hand / notes controls right ──────── */}
      <div style={{ ...ROW, minHeight: 'var(--row-height)' }}>
        <span style={ROW_LABEL}>Filter</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {/* Tier */}
          <div style={{ display: 'flex', background: 'var(--bg-tile)', borderRadius: 'var(--radius-md)', padding: 2, gap: 1 }}>
            {(['common', 'power', 'extended'] as const).map(t => (
              <Tooltip
                key={t}
                title={t === 'common' ? 'Common' : t === 'power' ? 'Power' : 'Extended'}
                description={
                  t === 'common'   ? 'Triads, sevenths, everyday voicings' :
                  t === 'power'    ? 'Root + fifth, one per pitch class' :
                                     '9ths, 11ths, 13ths, altered tensions'
                }
              >
              <button onClick={() => setTier(t)} style={btnBase(tier === t)}>
                {t === 'common' ? 'Common' : t === 'power' ? 'Power' : 'Extended'}
              </button>
              </Tooltip>
            ))}
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--state-hover-bg)' }} />

          {/* Hand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: isPowerMode ? 0.35 : 1, pointerEvents: isPowerMode ? 'none' : 'auto', transition: 'opacity 0.15s' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hand</span>
            <div style={{ display: 'flex', background: 'var(--bg-tile)', borderRadius: 4, padding: 2, gap: 1 }}>
              <Tooltip title="All" description="Chords playable with either hand">
                <button onClick={() => setHandFilter('all')} style={btnBase(handFilter === 'all')}>All</button>
              </Tooltip>
              <Tooltip title="One hand" description="Chords playable with a single hand">
                <button onClick={() => setHandFilter('one')} style={btnBase(handFilter === 'one')}>
                  <span style={{ display: 'inline-flex', transform: 'rotate(-20deg)' }}><Hand size={12} /></span>
                </button>
              </Tooltip>
              <Tooltip title="Two hands" description="Chords that need both hands">
                <button onClick={() => setHandFilter('two')} style={btnBase(handFilter === 'two')}>
                  <span style={{ display: 'inline-flex', transform: 'rotate(20deg)' }}><Hand size={12} /></span>
                  <span style={{ display: 'inline-flex', transform: 'scaleX(-1) rotate(20deg)' }}><Hand size={12} /></span>
                </button>
              </Tooltip>
            </div>
          </div>

          <div style={{ width: 1, height: 16, background: 'var(--state-hover-bg)' }} />

          {/* Notes */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: isPowerMode ? 0.35 : 1, pointerEvents: isPowerMode ? 'none' : 'auto', transition: 'opacity 0.15s' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</span>
            <div style={{ display: 'flex', background: 'var(--bg-tile)', borderRadius: 4, padding: 2, gap: 1 }}>
              {(['any', '3', '4', '5', '6+'] as const).map(n => (
                <Tooltip
                  key={n}
                  oneLine
                  title={n === 'any' ? 'Chords regardless of note count' : n === '6+' ? 'Chords with 6 or more notes' : `Chords with exactly ${n} notes`}
                >
                  <button onClick={() => setNoteFilter(n)} style={{ ...btnBase(noteFilter === n), minWidth: 22 }}>{n}</button>
                </Tooltip>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PROGRESSIONS + INVERSIONS row — two sub-rows; genre nested below ── */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', opacity: isPowerMode ? 0.35 : 1, pointerEvents: isPowerMode ? 'none' : 'auto', transition: 'opacity 0.15s' }}>

        {/* ── Sub-row 1: Progressions / Play / Inversions — three-column layout ─ */}
        {/* No borderBottom here — the outer container div owns the separator.   */}
        <div style={{ flexShrink: 0, minHeight: 'var(--row-height)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', position: 'relative' }}>

          {/* Left group: PROGRESSIONS dropdown | STYLE dropdown | INVERSIONS —
              all in sequence, separated by thin dividers. ────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={ROW_LABEL}>Progressions</span>
            {/* Dropdown trigger */}
            <button
              ref={progTriggerRef}
              onClick={openProgDropdown}
              style={{
                ...btnBase(false),
                fontSize: 10,
                color: activeProg ? 'var(--text-amber)' : 'var(--text-muted)',
                padding: '2px 6px',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => { e.currentTarget.style.color = activeProg ? 'var(--text-amber)' : 'var(--text-muted)' }}
            >
              {activeProg ? activeProg.name : 'Select'} ▾
            </button>
            {activeProg && (
              <Tooltip title="Clear progression" description="Stops playback and clears the selected progression">
              <button
                onClick={() => { stopProgression(); setSelectedProg(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)', fontSize: 14, lineHeight: 1, padding: '0 2px', fontFamily: 'var(--font-ui)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
              >×</button>
              </Tooltip>
            )}
            <span style={{ width: 1, height: 14, background: 'var(--state-hover-bg)', margin: '0 16px' }} />
            <span style={ROW_LABEL}>Style</span>
            <Tooltip oneLine title={GENRE_DESCRIPTIONS[progGenre]}>
            <button
              ref={styleTriggerRef}
              onClick={() => {
                if (styleDropdownOpen) { setStyleDropdownOpen(false); setStyleDropdownRect(null); return }
                const r = styleTriggerRef.current?.getBoundingClientRect()
                if (r) setStyleDropdownRect({ top: r.bottom + 2, left: r.left })
                setStyleDropdownOpen(true)
              }}
              style={{ ...btnBase(false), color: 'var(--text-amber)', padding: '2px 6px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-amber)'}
            >
              {GENRE_LABELS[progGenre]} ▾
            </button>
            </Tooltip>
            <span style={{ width: 1, height: 14, background: 'var(--state-hover-bg)', margin: '0 16px' }} />
            <span style={ROW_LABEL}>Inversions</span>
            {/* Off — CircleOff icon */}
            <Tooltip oneLine title="Plays each chord in root position">
            <button
              onClick={() => setProgInversionMode('off')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'off' ? 'var(--text-amber)' : 'var(--text-inactive)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'off' ? 'var(--text-amber)' : 'var(--text-inactive)'}
            ><CircleOff size={14} /></button>
            </Tooltip>
            {/* Sequential — ListOrdered icon */}
            <Tooltip oneLine title="Cycles for smooth voice leading">
            <button
              onClick={() => setProgInversionMode('sequential')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'sequential' ? 'var(--text-amber)' : 'var(--text-inactive)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'sequential' ? 'var(--text-amber)' : 'var(--text-inactive)'}
            ><ListOrdered size={14} /></button>
            </Tooltip>
            {/* Random — Shuffle icon */}
            <Tooltip oneLine title="Picks a random inversion">
            <button
              onClick={() => setProgInversionMode('random')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', color: progInversionMode === 'random' ? 'var(--text-amber)' : 'var(--text-inactive)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = progInversionMode === 'random' ? 'var(--text-amber)' : 'var(--text-inactive)'}
            ><Shuffle size={14} /></button>
            </Tooltip>
          </div>

          {/* Right corner: PLAY/STOP button + SpeedControl — swapped with
              Inversions, which moved into the left group above. ──────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* ── Progression play/stop button — green ready, red stop. Tooltip
                only while disabled — PLAY/STOP already says what a click does
                once a pattern's picked, so a hover explanation would be noise. ── */}
            {(() => {
              const playButton = (
                <button
                  onClick={() => progPlaying ? stopProgression() : startProgression()}
                  disabled={selectedProg === null && !progPlaying}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    padding: '3px 10px', borderRadius: 4, cursor: selectedProg !== null || progPlaying ? 'pointer' : 'default',
                    background: 'none',
                    border: `1.5px solid ${progPlaying ? 'var(--status-error)' : selectedProg !== null ? 'var(--status-success)' : 'var(--text-inactive)'}`,
                    boxShadow: progPlaying ? '0 0 6px var(--status-error)' : selectedProg !== null ? '0 0 6px var(--status-success)' : 'none',
                    color: progPlaying ? 'var(--status-error)' : selectedProg !== null ? 'var(--status-success)' : 'var(--text-inactive)',
                  }}
                >
                  {progPlaying ? <Square size={12} /> : <ChevronPlayIcon size={12} />}
                  {progPlaying ? 'STOP' : 'PLAY'}
                </button>
              )
              return selectedProg === null
                ? <Tooltip oneLine title="Pick a pattern first">{playButton}</Tooltip>
                : playButton
            })()}
            {/* Speed selector — chevrons, matching Scales Explorer's sizing */}
            <SpeedControl value={progSpeed} onChange={setProgSpeed} size={7} />
          </div>
        </div>

        {/* ── Sub-row 2: roman numerals | sequence/notes legend | note names ──── */}
        {/* CSS grid, three real columns (1fr / auto / 1fr) — the centre column
            is structurally centered by grid layout itself, not computed via
            position:absolute + transform math. Row height matches the other
            three rows exactly (same minHeight/padding/border-box model). ──── */}
        <div style={{
          minHeight: 'var(--row-height)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', alignItems: 'center',
          borderTop: '1px solid var(--border)',
          padding: '5px 12px',
          pointerEvents: selectedProg === null ? 'none' : 'auto',
        }}>
          {/* Left: roman-numeral progression display, active step amber ──────── */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6, justifySelf: 'start',
            opacity: selectedProg === null ? 0.35 : 1, transition: 'opacity 0.15s',
          }}>
            {activeProg?.labels.map((label, i) => (
              <span key={i} style={{
                fontFamily: 'var(--font-ui)',
                fontSize: i === progStep && progPlaying ? 14 : 13,
                fontWeight: i === progStep && progPlaying ? 700 : 400,
                color: i === progStep && progPlaying ? 'var(--text-amber)' : 'var(--text-inactive)',
                userSelect: 'none', lineHeight: 1,
              }}>{label}</span>
            ))}
          </div>

          {/* Centre: SEQUENCE / NOTES legend — labels what's on the left (roman
              numeral sequence) and right (note names) of this row, amber
              arrows pointing outward toward each. Own grid column, so it's
              genuinely centered between the other two regardless of their
              content width. No alignSelf override — inherits the grid's
              alignItems:center, same as the left/right columns, so all three
              sit on the same vertical centerline. ────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifySelf: 'center', gap: 6,
            opacity: selectedProg === null ? 0.35 : 1, transition: 'opacity 0.15s',
          }}>
            <ChevronLeft size={12} color="var(--text-amber)" />
            <span style={ROW_LABEL}>Sequence</span>
            <span style={{ color: 'var(--text-inactive)', fontSize: 10 }}>|</span>
            <span style={ROW_LABEL}>Notes</span>
            <ChevronRight size={12} color="var(--text-amber)" />
          </div>

          {/* Right: currently-sounding note names, real order, amber, sized to
              match the roman numerals on the left. Fixed-width reserved slot
              sized for a realistic worst case (extended chord, several notes)
              so the centred legend never shifts. ──────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', justifySelf: 'end',
            opacity: selectedProg === null ? 0.35 : 1, transition: 'opacity 0.15s',
          }}>
            <span style={{
              minWidth: '11ch', textAlign: 'right',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
              color: 'var(--text-amber)', userSelect: 'none', whiteSpace: 'nowrap',
            }}>
              {playingNotes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
            </span>
          </div>
        </div>

      </div>

      {/* Results grid — power chord tiles when tier === 'power', chord grid otherwise */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: 'var(--space-2) var(--space-3)',
        display: 'grid',
        gridTemplateColumns: isPowerMode ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
        gap: 6,
        alignContent: 'start',
      }}>
        {isPowerMode ? (
          // ── 12 power chord tiles, one per pitch class C–B ─────────────────
          ROOT_MIDIS.map(midi => {
            const pc = midi % 12
            const rootMidi = pc + 60
            const fifthMidi = rootMidi + 7
            const rootName = getNoteName(rootMidi, displayNaming, accidentals)
            const fifthName = getNoteName(fifthMidi, displayNaming, accidentals)
            const isSel = selectedPowerRoot === pc
            return (
              <button
                key={pc}
                onClick={() => playPowerChord(pc)}
                style={{
                  background: isSel ? 'var(--state-selected-bg)' : 'var(--bg-tile)',
                  border: `1px solid ${isSel ? 'var(--text-amber)' : 'transparent'}`,
                  borderRadius: 6,
                  padding: '6px 8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  transition: 'border-color 0.1s, background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--state-hover-border)' }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'transparent' }}
              >
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 700, color: isSel ? 'var(--text-amber)' : 'var(--text-dim)', lineHeight: 1.2 }}>
                  {rootName}5
                </span>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-tile-subtext)', lineHeight: '11.7px' }}>
                  {rootName} {fifthName}
                </span>
              </button>
            )
          })
        ) : (
          // ── Standard chord grid ────────────────────────────────────────────
          <>
            {filteredChords.map(chord => {
              const isSel = selectedKey === chord.key
              const midiNotes = buildChordMidi(selectedRoot, chord.intervals, 61)
              const noteNames = midiNotes
                .map(m => getNoteName(m, displayNaming, accidentals))
                .filter(Boolean)
                .join(' ')
              const chordLabel = `${rootLabel(selectedRoot)}${formatChordSuffix(chord.suffix, chordNamingStyle)}`
              const showRoman = progPlaying && selectedProg !== null && isSel

              return (
                <button
                  key={chord.key}
                  onClick={() => playChordAt(chord.key, selectedRoot)}
                  style={{
                    position: 'relative',
                    background: isSel ? 'var(--state-selected-bg)' : 'var(--bg-tile)',
                    border: `1px solid ${isSel ? 'var(--text-amber)' : 'transparent'}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 2,
                    transition: 'border-color 0.1s, background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = 'var(--state-hover-border)' }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = 'transparent' }}
                >
                  {/* ── Current roman numeral during progression playback — top-right
                      corner overlay, bigger than the chord name, no tile resize. ── */}
                  {showRoman && (
                    <span style={{
                      position: 'absolute', top: 4, right: 6,
                      fontFamily: 'var(--font-ui)', fontSize: 'var(--text-base)', fontWeight: 700,
                      color: 'var(--text-amber)', lineHeight: 1,
                    }}>
                      {ALL_PROGRESSIONS[selectedProg!].labels[progStep]}
                    </span>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: 'var(--text-sm)', fontWeight: 700,
                    color: isSel ? 'var(--text-amber)' : 'var(--text-dim)',
                    lineHeight: 1.2,
                  }}>
                    {chordLabel || rootLabel(selectedRoot)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-tile-subtext)', lineHeight: '11.7px' }}>
                    {noteNames || chord.name}
                  </span>
                </button>
              )
            })}

            {filteredChords.length === 0 && (
              <div style={{
                gridColumn: '1 / -1', textAlign: 'center',
                color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-ui)', padding: '20px 0',
              }}>
                No results
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer — show-as left, play inversion centred, scale explorer right ─ */}
      <div style={{
        ...ROW,
        minHeight: 'var(--row-height)',
        borderTop: '1px solid var(--border)',
        borderBottom: 'none',
        background: 'var(--bg-modal-header)',
        padding: '0 var(--space-3)',
        position: 'relative',
      }}>
        {/* Left: accidentals */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...ROW_LABEL, fontSize: 10 }}>Show as</span>
          {(['flat', 'sharp'] as const).map(a => (
            <button key={a} onClick={() => setAccidentals(a)} style={{
              background: 'none', border: 'none', padding: '0 4px',
              cursor: 'pointer',
              color: accidentals === a ? 'var(--text-amber)' : 'var(--text-inactive)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 600,
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
          opacity: isPowerMode ? 0.35 : 1, pointerEvents: isPowerMode ? 'none' : 'auto', transition: 'opacity 0.15s',
        }}>
          {/* Previous inversion — Play icon mirrored */}
          <Tooltip oneLine title="Previous inversion">
          <button
            onClick={() => handleInversion('prev')}
            disabled={!selectedKey}
            style={{ background: 'none', border: 'none', cursor: selectedKey ? 'pointer' : 'default', color: selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)' }}
          ><ChevronPlayIcon size={14} mirrored /></button>
          </Tooltip>
          {/* Static grey label — chord display is above the keyboard only */}
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'var(--text-inactive)', letterSpacing: '0.12em', textTransform: 'uppercase', userSelect: 'none' }}>
            Play Inversion
          </span>
          {/* Next inversion — Play icon normal */}
          <Tooltip oneLine title="Next inversion">
          <button
            onClick={() => handleInversion('next')}
            disabled={!selectedKey}
            style={{ background: 'none', border: 'none', cursor: selectedKey ? 'pointer' : 'default', color: selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)' }}
          ><ChevronPlayIcon size={14} /></button>
          </Tooltip>
          <Tooltip oneLine title="Clear selection">
          <button
            onClick={() => { clearExplorerKeys(); clearDisplayedChord(); clearLockedKeys(); clearExplorerChordDisplay(); setSelectedKey(null) }}
            disabled={!selectedKey}
            style={{
              background: 'none', border: 'none',
              cursor: selectedKey ? 'pointer' : 'default',
              color: selectedKey ? 'var(--text-inactive)' : 'var(--state-hover-bg)',
              padding: '0 2px', display: 'flex', alignItems: 'center',
              transition: 'color 0.1s',
            }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? 'var(--text-inactive)' : 'var(--state-hover-bg)' }}
          ><RotateCcw size={13} /></button>
          </Tooltip>
        </div>

        {/* Right: Scale Explorer switch — matches ScaleExplorer's own footer link */}
        <Tooltip oneLine title="Switch to Scales Explorer">
        <button
          onClick={() => { setChordExplorerOpen(false); setScaleExplorerOpen(true) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', whiteSpace: 'nowrap', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
        >Scales Explorer <ArrowUpRight size={11} /></button>
        </Tooltip>
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
            background: 'var(--bg-tile)',
            border: '1px solid var(--state-hover-bg)',
            borderRadius: 6,
            zIndex: 1000,
            minWidth: 300,
            maxHeight: 340,
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          }}
        >
          {/* ── Base progressions with their rotations indented below ─── */}
          {ALL_PROGRESSIONS.map((p, i) => {
            const isRot = !!p.isRotation
            const baseColor = selectedProg === i ? 'var(--text-amber)' : (isRot ? 'var(--text-dim-control)' : 'var(--text-muted)')
            const rotLabel = isRot ? p.name.replace(p.baseName! + ' ', '') : ''
            return (
              <button
                key={p.name}
                onClick={() => { setSelectedProg(i); setProgDropdownOpen(false); setDropdownRect(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', textAlign: 'left',
                  background: selectedProg === i ? 'var(--state-hover-bg)' : 'none',
                  border: 'none',
                  padding: isRot ? '3px 10px 3px 22px' : '5px 10px',
                  color: baseColor,
                  fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--state-hover-bg)'; e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { e.currentTarget.style.background = selectedProg === i ? 'var(--state-hover-bg)' : 'none'; e.currentTarget.style.color = baseColor }}
              >
                {/* Left column: name — rotations show "↳ (vi start)" short form */}
                <span style={{ minWidth: 110, flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {isRot ? `↳ ${rotLabel}` : p.name}
                </span>
                {/* Right column: roman numerals */}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, opacity: isRot ? 0.40 : 0.65, whiteSpace: 'nowrap' }}>
                  {p.labels.join('  ')}
                </span>
              </button>
            )
          })}
        </div>,
        document.body
      )}

      {/* Style (genre voicing) dropdown — portalled, two columns: name left,
          description right — matches the progression dropdown above it. ──── */}
      {styleDropdownOpen && styleDropdownRect && createPortal(
        <div
          ref={styleDropRef}
          style={{
            position: 'fixed',
            top: styleDropdownRect.top,
            left: styleDropdownRect.left,
            background: 'var(--bg-tile)',
            border: '1px solid var(--state-hover-bg)',
            borderRadius: 6,
            zIndex: 1000,
            minWidth: 340,
            maxHeight: 340,
            overflowY: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          }}
        >
          {(Object.keys(GENRE_LABELS) as Genre[]).map(g => {
            const sel = progGenre === g
            return (
              <button
                key={g}
                onClick={() => { setProgGenre(g); setStyleDropdownOpen(false); setStyleDropdownRect(null) }}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 12,
                  width: '100%', textAlign: 'left',
                  background: sel ? 'var(--state-hover-bg)' : 'none',
                  border: 'none', padding: '5px 10px',
                  color: sel ? 'var(--text-amber)' : 'var(--text-muted)',
                  fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--state-hover-bg)'; e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { e.currentTarget.style.background = sel ? 'var(--state-hover-bg)' : 'none'; e.currentTarget.style.color = sel ? 'var(--text-amber)' : 'var(--text-muted)' }}
              >
                {/* Left column: genre name */}
                <span style={{ minWidth: 80, flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 600, textTransform: 'uppercase' }}>{GENRE_LABELS[g]}</span>
                {/* Right column: description */}
                <span style={{ fontSize: 10, opacity: 0.7, color: 'var(--text-muted)' }}>{GENRE_DESCRIPTIONS[g]}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
