import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Search, Hand, RotateCcw, Square, ArrowUpRight, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import Fuse from 'fuse.js'
import { useStore } from '../store'
import { getNoteName } from '../utils/noteNames'
import { GENRE_LABELS } from '../utils/genreVoicing'
import type { Genre } from '../utils/genreVoicing'
import type { NoteNaming } from '../types'
import { useFocusTrap } from '../hooks/useFocusTrap'
import SpeedControl from './SpeedControl'
import OrfeoMark from './OrfeoMark'
import Tooltip from './Tooltip'
import { getPianoRollCenterX, getKeyboardHeaderTop } from '../utils/modalAnchors'
import { useAnchorBottomOnResize } from '../hooks/useAnchorBottomOnResize'
import { useClampPositionOnZoom } from '../hooks/useClampPositionOnZoom'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import { buildChordMidi, formatChordSuffix, formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'
import {
  nextVoicing, intervalsToSemis, rootPositionFrom,
  PROGRESSION_VOICINGS, PROGRESSION_VOICING_LABEL, PROGRESSION_VOICING_HINT,
} from '../utils/voiceLeading'
import {
  EXPLORER_RANGE, explorerLowRoot, SPEED_MS, VOICING_ICON, ALL_PROGRESSIONS,
  resolveProgressionStep, nextInversionSet, prevInversionSet, ringChord, strikeStep, inversionOf,
  explorerKeyColors, captureStruckShape, restoreStruckShape, EXPLORER_SWITCH_STYLE, type ProgSpeed, type StruckShape,
} from '../utils/explorerShared'
import ChevronPlayIcon from './ChevronPlayIcon'
import ExplorerOctaveControl from './ExplorerOctaveControl'
import { t } from '../utils/i18n'
import {
  COMMON_CHORDS, ALL_CHORDS, FULL_CHORD_TYPES, type ChordInfo,
} from '../utils/chordVocabulary'

// ── Modal dimensions for default positioning above the keyboard ───────────
const MODAL_WIDTH = 770
const MODAL_HEIGHT = 532

const ROOT_MIDIS = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]

// ── Genre voicing descriptions — shared by the Style dropdown's trigger
// tooltip and its two-column list (name left / description right). ─────────
const GENRE_DESCRIPTIONS: Record<Genre, string> = {
  classic:   'Plain diatonic triads',
  coltrane:  'Adds 9ths and 13ths for sophisticated jazz harmony',
  cinematic: 'Open, clean voicings — add9 and suspended chords',
  roadhouse: 'Dominant 7ths on the I and IV chords — classic blues sound',
  gospel:    t`Church harmony — 6/9 and maj9 chords, minor 9ths and 11ths, a 13th on V`,
  ipanema:   t`Smooth 9ths and 11ths, and a tritone substitution on V (D♭7♯11 for G7) — bossa nova character`,
  carnival:  'Bright, festive 7th chords — samba character',
  flamenco:  t`Phrygian fire — a 7♭9 on V and open maj7♯11 chords, flamenco guitar colours`,
  velvet:    'Deep 11ths and 13ths, mellow and laid-back — neo-soul character',
}

// ── Easter egg — the "Rite of Spring" chord (Stravinsky, 1913): an E♭7
// stacked on an F♭ major triad, struck as a pounding pulse. ────────────────
const RITE_LOW = [40, 47, 52, 56]    // F♭ major — F♭2 C♭3 F♭3 A♭3
const RITE_HIGH = [63, 67, 70, 73]   // E♭7 — E♭4 G4 B♭4 D♭5
const RITE_PULSES = 8
const RITE_PULSE_MS = 300
const RITE_VELOCITY = 0.9

// ── Shared row label style — dim uppercase, used across all control rows ──────
const ROW_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--text-dimmest)', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}

// ── Footer labels — Show as, Inversion, Accent Root (Octave's own matches) ──
const FOOTER_LABEL: React.CSSProperties = { ...ROW_LABEL, fontSize: 10 }

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
  const progressionVoicing = useStore(s => s.progressionVoicing)
  const setProgressionVoicing = useStore(s => s.setProgressionVoicing)
  const setAccidentals = useStore(s => s.setAccidentals)
  const explorerOctave = useStore(s => s.explorerOctave)
  const colorRootNoteEnabled = useStore(s => s.colorRootNoteEnabled)
  const setColorRootNoteEnabled = useStore(s => s.setColorRootNoteEnabled)
  // ── Root whose pitch class is accented on the lit keys right now — kept so
  // flipping "Accent root note" recolors what's already on the keyboard. ──
  const accentRootRef = useRef<number | null>(null)
  // ── Shape the inversion ↺ returns to (null until an arrow is pressed) ──
  const struckShapeRef = useRef<StruckShape | null>(null)
  const [inverted, setInverted] = useState(false)
  const lowRootRef = useRef(explorerLowRoot(explorerOctave))
  lowRootRef.current = explorerLowRoot(explorerOctave)
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
  useClampPositionOnZoom(pos, setPos, panelRef)
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
  const [progSpeed, setProgSpeed] = useState<ProgSpeed>('med')
  const [progGenre, setProgGenre] = useState<Genre>('classic')
  // ── Easter egg card open + the timers of its pounding pulse ──────────────
  const [riteOpen, setRiteOpen] = useState(false)
  const riteTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const explorerChordDisplay = useStore(s => s.explorerChordDisplay)
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

  // ── Light keys with the shared colour rule (same as the Scales Explorer):
  // amber, the chord's own root pink when "Accent root note" is on. ───────
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
    if (!chordExplorerOpen) return
    const lit = Array.from(useStore.getState().explorerKeys)
    if (lit.length > 0) lightKeys(lit, accentRootRef.current, true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorRootNoteEnabled])

  const stopProgression = useCallback(() => {
    progRunningRef.current = false
    if (progTimerRef.current) { clearTimeout(progTimerRef.current); progTimerRef.current = null }
    setProgPlaying(false)
    setProgStep(0)
    riteTimersRef.current.forEach(clearTimeout)
    riteTimersRef.current = []
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
      setSelectedPowerRoot(null)
      setRiteOpen(false)
    } else {
      stopProgression()
    }
  }, [chordExplorerOpen, stopProgression])

  // Pause playback when modal opens (unless switched off: Settings › Playback)
  useEffect(() => {
    if (!chordExplorerOpen) return
    const { playbackState, explorerPausesPlayback } = useStore.getState()
    if (playbackState === 'playing' && explorerPausesPlayback) {
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
        if (riteOpen) { setRiteOpen(false); return }
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [chordExplorerOpen, close, progDropdownOpen, riteOpen])

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
  // prevMidi: the voicing played at the previous step — the voice-leading
  // engine (utils/voiceLeading.ts) picks this step's voicing from it, under
  // the shared `progressionVoicing` mode (read live so a mode switch mid-run
  // takes on the next chord). Null for the first step.
  const playProgStepAt = useCallback((
    step: number,
    progIndex: number,
    root: number,
    speed: ProgSpeed,
    genre: Genre,
    prevMidi: number[] | null,
  ) => {
    if (!progRunningRef.current) return
    const prog = ALL_PROGRESSIONS[progIndex]
    if (!prog) return
    // ── Same step → chord rule as the Scales Explorer (explorerShared.ts):
    // the numeral as written, re-voiced for the selected style. ────────────
    const resolved = resolveProgressionStep(prog, step, root, genre)
    if (!resolved) return
    const { rootPc: actualRoot, info } = resolved
    const durationMs = SPEED_MS[speed]
    const semis = intervalsToSemis(info.intervals)

    const midiNotes = nextVoicing(
      prevMidi, actualRoot, semis,
      useStore.getState().progressionVoicing, EXPLORER_RANGE, lowRootRef.current,
    )

    if (midiNotes.length > 0) {
      lightKeys(midiNotes, actualRoot)
      // ── Update chord name display above keyboard for this step ───────────
      const rootLbl = rootLabels.find(r => r.pitchClass === actualRoot)?.label ?? ''
      const chordSuffix = formatChordSuffix(info.suffix, chordNamingStyle)
      setExplorerChordDisplay({ name: `${rootLbl}${chordSuffix}`, invCount: inversionOf(actualRoot, semis, midiNotes), noteCount: midiNotes.length })
      strikeStep(midiNotes, Math.round(durationMs * 1.12), () => progRunningRef.current)
    }
    setProgStep(step)

    const nextStep = (step + 1) % prog.offsets.length
    progTimerRef.current = setTimeout(() => {
      playProgStepAt(nextStep, progIndex, root, speed, genre, midiNotes)
    }, durationMs)
  }, [lightKeys, setExplorerChordDisplay, rootLabels, chordNamingStyle])

  const startProgression = useCallback(() => {
    if (selectedProg === null) return
    stopProgression()
    progRunningRef.current = true
    setProgPlaying(true)
    setProgStep(0)
    playProgStepAt(0, selectedProg, selectedRoot, progSpeed, progGenre, null)
  }, [selectedProg, selectedRoot, progSpeed, progGenre, stopProgression, playProgStepAt])

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
    // ── Root position, root in the octave the Octave control picks (C3–B3
    // by default) — the same starting register the Scales Explorer uses.
    // In Smooth, a tile clicked while another chord is lit takes the nearest
    // voicing to it instead, the same way a Smooth progression moves. ──────
    const semis = intervalsToSemis(info.intervals)
    const lit = Array.from(useStore.getState().explorerKeys).sort((a, b) => a - b)
    const smooth = useStore.getState().progressionVoicing === 'smooth' && lit.length > 0
    const midiNotes = smooth
      ? nextVoicing(lit, rootPitchClass, semis, 'smooth', EXPLORER_RANGE, lowRootRef.current)
      : rootPositionFrom(rootPitchClass, semis, EXPLORER_RANGE, lowRootRef.current)
    if (midiNotes.length === 0) return
    lightKeys(midiNotes, rootPitchClass)
    setSelectedKey(chordKey)
    // ── Store chord identity in Zustand so Keyboard.tsx can display it ────
    const chordName = `${rootLabels.find(r => r.pitchClass === rootPitchClass)?.label ?? ''}${formatChordSuffix(info.suffix, chordNamingStyle)}`
    setExplorerChordDisplay({ name: chordName, invCount: inversionOf(rootPitchClass, semis, midiNotes), noteCount: midiNotes.length })
    ringChord(midiNotes)
  }, [stopProgression, lightKeys, rootLabels, chordNamingStyle])

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

    // ── When the seed carries a real voicing (from the paused MIDI playhead),
    // restore that exact inversion + register instead of playChordAt's
    // canonical root-position octave-4 rebuild — octave-folded into the
    // Explorer keyboard's 61-key range so every note stays visible. ─────────
    if (seed.voicing && seed.voicing.length >= 2) {
      stopProgression()
      const { min, max } = EXPLORER_RANGE
      const fold = (m: number) => { while (m < min) m += 12; while (m > max) m -= 12; return m }
      const voiced = Array.from(new Set(seed.voicing.map(fold))).sort((a, b) => a - b)
      setSelectedKey(match.key)
      lightKeys(voiced, seed.rootPitchClass)
      const rootLbl = rootLabels.find(r => r.pitchClass === seed.rootPitchClass)?.label ?? ''
      setExplorerChordDisplay({
        name: `${rootLbl}${formatChordSuffix(match.suffix, chordNamingStyle)}`,
        invCount: seed.inversionCount ?? 0,
        noteCount: new Set(voiced.map(m => m % 12)).size,
      })
      ringChord(voiced)
    } else {
      playChordAt(match.key, seed.rootPitchClass)
    }
  }, [chordExplorerOpen, playChordAt, stopProgression, rootLabels, chordNamingStyle, lightKeys, setExplorerChordDisplay])

  // ── Play a power chord (root + P5) for the given pitch class ─────────────
  const playPowerChord = useCallback((pitchClass: number) => {
    stopProgression()
    setSelectedPowerRoot(pitchClass)
    const midiNotes = rootPositionFrom(pitchClass, [0, 7], EXPLORER_RANGE, lowRootRef.current)
    lightKeys(midiNotes, pitchClass)
    const rootLbl = rootLabels.find(r => r.pitchClass === pitchClass)?.label ?? ''
    setExplorerChordDisplay({ name: `${rootLbl}5`, invCount: 0, noteCount: midiNotes.length })
    ringChord(midiNotes)
  }, [stopProgression, lightKeys, rootLabels, setExplorerChordDisplay])

  // ── Easter egg — light and pound the Rite of Spring chord ─────────────────
  const playRiteChord = useCallback(() => {
    stopProgression()
    setSelectedKey(null)
    setSelectedPowerRoot(null)
    const notes = [...RITE_LOW, ...RITE_HIGH]
    lightKeys(notes, RITE_LOW[0] % 12)
    setExplorerChordDisplay({ name: t`E♭7 over F♭`, invCount: 0, noteCount: notes.length })
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    for (let i = 0; i < RITE_PULSES; i++) {
      const last = i === RITE_PULSES - 1
      riteTimersRef.current.push(setTimeout(() => {
        notes.forEach(m => playNote(m, RITE_VELOCITY, last ? 2600 : RITE_PULSE_MS - 40, undefined, false))
      }, i * RITE_PULSE_MS))
    }
  }, [stopProgression, lightKeys, setExplorerChordDisplay])

  const clearSelection = () => {
    stopProgression()
    clearExplorerKeys(); clearDisplayedChord(); clearLockedKeys(); clearExplorerChordDisplay()
    setSelectedKey(null); setSelectedPowerRoot(null)
    struckShapeRef.current = null; setInverted(false)
  }

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
    const cd = state.explorerChordDisplay
    struckShapeRef.current = captureStruckShape(struckShapeRef.current, current, cd?.invCount ?? 0, state.explorerOctave)
    setInverted(true)
    const newNotes = dir === 'next' ? nextInversionSet(current) : prevInversionSet(current)
    lightKeys(Array.from(newNotes), accentRootRef.current, true)
    // ── Update inversion count in store so Keyboard.tsx label updates ─────
    if (cd) state.setExplorerChordDisplay({ ...cd, invCount: cd.invCount + (dir === 'next' ? 1 : -1) })
    ringChord(Array.from(newNotes).sort((a, b) => a - b))
  }, [selectedKey, lightKeys])

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

  // ── What's lit right now, low to high, and its name with inversion marks —
  // the display row under the progressions. ─────────────────────────────────
  const litNotes = useMemo(() => Array.from(explorerKeys).sort((a, b) => a - b), [explorerKeys])
  const nowPlaying = useMemo(() => {
    if (!explorerChordDisplay || litNotes.length === 0) return null
    return formatInversionDisplay(
      explorerChordDisplay.name, explorerChordDisplay.invCount, explorerChordDisplay.noteCount,
      litNotes[0], displayNaming, accidentals, true,
    )
  }, [explorerChordDisplay, litNotes, displayNaming, accidentals])

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
  const canClear = selectedKey !== null || selectedPowerRoot !== null || explorerKeys.size > 0 || progPlaying
  const activeProg = selectedProg !== null ? ALL_PROGRESSIONS[selectedProg] : null

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Chords Explorer" className="orfeo-modal-glow app-no-drag" style={{
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
          {/* Easter egg — the logo is a hidden link to the Rite of Spring chord.
              Out of the Tab order: the focus trap would otherwise land on it
              when the window opens (outline + Space/Enter opening the card). */}
          <Tooltip title={t`A chord that shook the world`} description={t`Click to discover`}>
            <button
              tabIndex={-1}
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setRiteOpen(true); playRiteChord() }}
              aria-label={t`Easter egg`}
              style={{ background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
            ><OrfeoMark height={22} /></button>
          </Tooltip>
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
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                maxWidth: 150, display: 'block',
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
            <span style={ROW_LABEL}>Voicing</span>
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
                  ><Icon size={14} /></button>
                </Tooltip>
              )
            })}
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
              // ── Only shown once a pattern's picked — space stays reserved so
              // the speed chevrons never jump. ──────────────────────────────
              return (
                <span aria-hidden={selectedProg === null && !progPlaying} style={{ display: 'flex', visibility: selectedProg === null && !progPlaying ? 'hidden' : 'visible' }}>
                  {playButton}
                </span>
              )
            })()}
            {/* Speed selector — chevrons, matching Scales Explorer's sizing */}
            <SpeedControl value={progSpeed} onChange={setProgSpeed} size={11} />
          </div>
        </div>

        {/* ── Sub-row 2: SEQUENCE + numerals | chord now playing | NOTES + names ─ */}
        {/* Three equal grid tracks, so the chord name is truly centred. Each
            label sits at a fixed spot ahead of its content (left edge / start
            of a fixed-width notes slot), so neither moves as content changes. */}
        <div style={{
          minHeight: 'var(--row-height)', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', alignItems: 'center',
          borderTop: '1px solid var(--border)',
          padding: '5px 12px',
        }}>
          {/* Left: SEQUENCE + roman-numeral progression, active step amber ────── */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 6, justifySelf: 'start', minWidth: 0,
            opacity: selectedProg === null ? 0.35 : 1, transition: 'opacity 0.15s',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 4, alignSelf: 'center' }}>
              <span style={ROW_LABEL}>{t`Sequence`}</span>
              <ChevronRight size={12} color="var(--text-amber)" />
            </span>
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

          {/* Centre: the chord sounding now — same name and inversion marks as
              the keyboard's chord display; the selected root when nothing is lit. */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifySelf: 'center', gap: 5, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.05em', userSelect: 'none' }}>
              {nowPlaying ? nowPlaying.chordLabel : rootLabel(selectedRoot)}
            </span>
            {nowPlaying?.ordinal && (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-default)', userSelect: 'none' }}>
                {nowPlaying.ordinal}
                <span style={{ fontSize: 8, verticalAlign: 'super' }}>{ordinalSuffix(Number(nowPlaying.ordinal))}</span>
                {' inv'}
              </span>
            )}
          </div>

          {/* Right: the lit notes, low to high, then ‹ NOTES at the right edge —
              mirrors SEQUENCE › on the left, so both labels stay fixed. ───── */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifySelf: 'end', gap: 10, minWidth: 0 }}>
            <span style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
              color: 'var(--text-amber)', userSelect: 'none', whiteSpace: 'nowrap',
            }}>
              {litNotes.map(m => getNoteName(m, displayNaming, accidentals)).join(' ')}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'center', flexShrink: 0 }}>
              <ChevronLeft size={12} color="var(--text-amber)" />
              <span style={ROW_LABEL}>{t`Notes`}</span>
            </span>
          </div>
        </div>

      </div>

      {/* Results grid — power chord tiles when tier === 'power', chord grid otherwise */}
      <div className="amber-scroll" style={{
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
                onMouseDown={() => playPowerChord(pc)}
                style={{
                  background: isSel ? 'var(--accent-amber-medium)' : 'var(--bg-tile)',
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
                  onMouseDown={() => playChordAt(chord.key, selectedRoot)}
                  style={{
                    position: 'relative',
                    background: isSel ? 'var(--accent-amber-medium)' : 'var(--bg-tile)',
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

      {/* ── Footer — six controls, evenly spaced edge to edge:
          Show as | Octave | Inversion | Accent Root | Clear | Scales Explorer ── */}
      <div style={{
        ...ROW,
        minHeight: 'var(--row-height)',
        borderTop: '1px solid var(--border)',
        borderBottom: 'none',
        background: 'var(--bg-modal-header)',
        padding: '0 var(--space-3)',
      }}>
        {/* Show as ♭ ♯ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={FOOTER_LABEL}>Show as</span>
          {(['flat', 'sharp'] as const).map(a => (
            <button key={a} onClick={() => setAccidentals(a)} style={{
              background: 'none', border: 'none', padding: '0 4px',
              cursor: 'pointer',
              color: accidentals === a ? 'var(--text-amber)' : 'var(--text-inactive)',
              fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 600,
              lineHeight: 1,
            }}>
              {a === 'flat' ? '♭' : '♯'}
            </button>
          ))}
        </div>

        <ExplorerOctaveControl />

        {/* Inversion ◁ ▷ ↺ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          opacity: isPowerMode ? 0.35 : 1, pointerEvents: isPowerMode ? 'none' : 'auto', transition: 'opacity 0.15s',
        }}>
          <Tooltip oneLine title="Previous inversion">
          <button
            onMouseDown={() => handleInversion('prev')}
            disabled={!selectedKey}
            style={{ background: 'none', border: 'none', cursor: selectedKey ? 'pointer' : 'default', color: selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)' }}
          ><ChevronPlayIcon size={14} mirrored /></button>
          </Tooltip>
          <span style={FOOTER_LABEL}>{t`Inversion`}</span>
          <Tooltip oneLine title="Next inversion">
          <button
            onMouseDown={() => handleInversion('next')}
            disabled={!selectedKey}
            style={{ background: 'none', border: 'none', cursor: selectedKey ? 'pointer' : 'default', color: selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)', padding: '0 2px', display: 'flex', alignItems: 'center' }}
            onMouseEnter={e => { if (selectedKey) e.currentTarget.style.color = 'var(--accent-amber-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = selectedKey ? 'var(--text-amber)' : 'var(--state-disabled)' }}
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

        {/* Accent Root (same setting as the Scales Explorer's) */}
        <Tooltip title="Accent Root Note" description="Highlights the chord's true root pitch class in pink, in any octave, instead of blending it.">
          <button
            onClick={() => setColorRootNoteEnabled(!colorRootNoteEnabled)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
          >
            <span style={{ ...FOOTER_LABEL, whiteSpace: 'nowrap' }}>Accent Root</span>
            <span style={{ display: 'flex', color: colorRootNoteEnabled ? 'var(--text-amber)' : 'var(--text-inactive)' }}>
              {colorRootNoteEnabled ? <ToggleRight size={16} strokeWidth={1.5} /> : <ToggleLeft size={16} strokeWidth={1.5} />}
            </span>
          </button>
        </Tooltip>

        {/* Clear — stops a progression, turns the lit chord off, deselects its tile */}
        <Tooltip oneLine title={t`Clear selection`}>
          <button
            onClick={clearSelection}
            disabled={!canClear}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0,
              fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase',
              cursor: canClear ? 'pointer' : 'default',
              color: canClear ? 'var(--text-inactive)' : 'var(--state-hover-bg)',
            }}
            onMouseEnter={e => { if (canClear) e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { e.currentTarget.style.color = canClear ? 'var(--text-inactive)' : 'var(--state-hover-bg)' }}
          >{t`Clear`}<RotateCcw size={12} /></button>
        </Tooltip>

        <Tooltip oneLine title="Switch to Scales Explorer">
        <button
          onClick={() => { setChordExplorerOpen(false); setScaleExplorerOpen(true) }}
          style={EXPLORER_SWITCH_STYLE}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)' }}
        >Scales Explorer <ArrowUpRight size={11} /></button>
        </Tooltip>
      </div>

      {/* Easter egg card — over the tiles, opened from the header logo */}
      {riteOpen && (
        <div role="note" style={{
          position: 'absolute', left: '50%', top: 236, transform: 'translateX(-50%)', width: 440,
          background: 'var(--bg-modal)', border: '1px solid var(--text-amber)', borderRadius: 8,
          boxShadow: '0 8px 30px rgba(0,0,0,0.7)', padding: '14px 18px 12px', zIndex: 2,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, color: 'var(--text-amber)' }}>{t`The Rite of Spring chord`}</span>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)' }}>{t`Igor Stravinsky, 1913`}</span>
            </div>
            <button
              onClick={() => setRiteOpen(false)}
              aria-label={t`Close`}
              style={{ ...modalCloseButtonStyle, fontSize: 'var(--text-lg)', lineHeight: 1, fontFamily: 'var(--font-ui)' }}
              onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
              onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
            >×</button>
          </div>
          <p style={{ margin: 0, fontFamily: 'var(--font-ui)', fontSize: 12, lineHeight: 1.5, color: 'var(--text-dim)', textWrap: 'pretty' } as CSSProperties}>
            {t`He wrote an E♭ dominant 7 chord directly on top of an F♭ major triad. Played by a full orchestral string section, it makes a legendary, heavy, jarring crunch that changed modern music forever. Here's how it sounds on piano.`}
          </p>
          <button
            onClick={playRiteChord}
            style={{
              alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: '1.5px solid var(--text-amber)', borderRadius: 4, padding: '3px 10px',
              color: 'var(--text-amber)', cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            }}
          ><ChevronPlayIcon size={12} />{t`PLAY AGAIN`}</button>
        </div>
      )}

      {/* Progression dropdown — portalled to body to escape overflow:hidden */}
      {progDropdownOpen && dropdownRect && createPortal(
        <div
          ref={progDropRef}
          className="amber-scroll"
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
          className="amber-scroll"
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
