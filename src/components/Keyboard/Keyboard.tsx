import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel, getNoteName } from '../../utils/noteNames'
import { detectChord, detectChordWithInversion, inversionForKnownChord, formatInversionDisplay, localizeChord, ordinalSuffix, buildCompactVoicing } from '../../utils/chordDetection'
import { buildKeyLayoutRatios, PIANO_RANGES as RANGES } from '../../utils/keyLayout'
import { notesSoundingAt } from '../../utils/midiParser'
import type { SoundingNote } from '../../utils/midiParser'
import { buildPitchHandIndex, lookupNoteHandAtTime, detectPerformanceBoundary } from '../../utils/handBoundaries'
import type { Hand } from '../../types'
import Tooltip, { useTooltip } from '../Tooltip'
import { ContextMenu, ContextMenuItem } from '../ContextMenu'
import { getOutputLatencySec as getSamplesOutputLatencySec } from '../../hooks/useSamplesEngine'
import { getOutputLatencySec as getGmOutputLatencySec } from '../../hooks/useAudioEngine'

const HAND_LH = 'var(--hand-lh)'
const HAND_RH = 'var(--hand-rh)'
const GLISSANDO_COLOR = 'var(--text-amber)'

const CHORD_MIN_NOTES = 3
const CHORD_DEBOUNCE_MS = 320
const CHORD_HOLD_MS = 1600

// Stable empty-array reference for the "reflect piano roll" selector below —
// returning this (not a fresh []) when the feature isn't active is what lets
// Zustand's reference-equality check skip re-rendering this whole component
// on every playback tick while it's off or playing (see the currentTime
// comment further down for why that matters here).
const EMPTY_SOUNDING: SoundingNote[] = []

// ── Resolve current chord index: last event whose time <= currentTime ─────────
function resolveCurrentIndex(seq: { displayTime: number }[], currentTime: number): number {
  if (seq.length === 0) return -1
  let lo = 0, hi = seq.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (seq[mid].displayTime <= currentTime) { idx = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return idx
}

export default function Keyboard() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const activeKeys = useStore((s) => s.activeKeys)
  const activeKeyColors = useStore((s) => s.activeKeyColors)
  const noteNaming              = useStore((s) => s.noteNaming)
  const accidentals             = useStore((s) => s.accidentals)
  const chordNamingStyle        = useStore((s) => s.chordNamingStyle)
  const showOctaveLabels        = useStore((s) => s.showOctaveLabels)
  const showNoteNamesOnKeyboard = useStore((s) => s.showNoteNamesOnKeyboard)
  const playbackState = useStore((s) => s.playbackState)
  const explorerKeys = useStore((s) => s.explorerKeys)
  const explorerKeyColors = useStore((s) => s.explorerKeyColors)
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const setChordExplorerOpen = useStore((s) => s.setChordExplorerOpen)
  const scaleExplorerOpen = useStore((s) => s.scaleExplorerOpen)
  const setScaleExplorerOpen = useStore((s) => s.setScaleExplorerOpen)
  const displayedChord = useStore((s) => s.displayedChord)
  const lockedKeys = useStore((s) => s.lockedKeys)
  const lockedColors = useStore((s) => s.lockedColors)
  const setLockedKeysStore = useStore((s) => s.setLockedKeys)
  const clearLockedKeys = useStore((s) => s.clearLockedKeys)
  // ── Explorer chord display — computed name + count from ChordExplorer/ScaleExplorer
  const explorerChordDisplay    = useStore((s) => s.explorerChordDisplay)
  // ── Chord sequence + prompter state ──────────────────────────────────────────
  const midi = useStore((s) => s.midi)
  const chordSequence = useStore((s) => s.chordSequence)
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const chordPrompterOpen = useStore((s) => s.chordPrompterOpen)
  const setChordPrompterOpen = useStore((s) => s.setChordPrompterOpen)
  // ── currentTime itself is NOT subscribed here — it ticks ~60x/sec during
  // playback, and subscribing to it directly would re-render this entire
  // 900-line component every tick. The only two things that actually need
  // it are (a) the current chord index below, subscribed as an already-
  // derived value so Zustand only re-renders when the RESOLVED index
  // changes (a handful of times per song, not every tick), and (b)
  // getHardwareHand()'s per-key hand lookup, which only matters at the
  // moments activeKeys itself changes (note on/off) — so it reads
  // currentTime non-reactively via getState() at that point instead. ───────
  // ── Chord-name timing follows the same output-latency correction as the
  // keyboard's own key lights (see getOutputLatencySec() in the engine
  // hooks) — only while actually playing, since a scrub/pause isn't tied to
  // any real audio clock at all, there's nothing to lag behind. ───────────
  const currentChordIndex = useStore((s) => {
    const latency = s.playbackState === 'playing'
      ? (s.audioEngine === 'samples' ? getSamplesOutputLatencySec() : getGmOutputLatencySec())
      : 0
    return resolveCurrentIndex(s.chordSequence, s.currentTime - latency)
  })
  // ── Reflect piano roll on keyboard (Settings › Keyboard › Testing) — a THIRD
  // exception to the "don't subscribe to raw currentTime" rule above, same
  // justification as (a): the selector returns the SAME `EMPTY_SOUNDING`
  // reference (not a fresh one) whenever the feature is off or playback is
  // actually running, so Zustand's reference check skips re-rendering on
  // every 60fps tick exactly as before — this only pays a per-render cost
  // while paused AND enabled, which is the point (live while scrubbing).
  //
  // Zustand re-invokes every selector on EVERY store change, not just ones
  // touching what it reads — so without a guard, this would re-scan every
  // note in every "lit" track on every unrelated update too (chord sequence
  // recomputing, track panel state, etc.), not just when the playhead
  // actually moves. That's cheap in isolation, but a file load fires many
  // such updates in a tight burst — right when the app is already busy
  // parsing the file — so it added up to real, avoidable work at exactly
  // the moment a file opens. Cached by a cheap signature (file + rounded
  // time + which tracks + transpose) so the actual note scan only reruns
  // when one of those genuinely changes. ─────────────────────────────────
  const reflectCacheRef = useRef<{ key: string; result: SoundingNote[] } | null>(null)
  const reflectSounding = useStore((s) => {
    if (!s.reflectPianoRollOnKeyboard || s.playbackState === 'playing' || !s.midi) return EMPTY_SOUNDING
    // ── Follows track VISIBILITY (the eye toggle — same field PianoRoll.tsx
    // itself checks to decide whether to draw a track's notes), not "Lit on
    // keyboard" (track.showOnKeyboard). Those are different concepts:
    // showOnKeyboard defaults to piano/organ/chromatic-keys tracks only and
    // controls which tracks REAL playback lights on the keyboard; this
    // feature is about what you're currently looking at in the piano roll —
    // isolate a steel-guitar track by hiding the others and this should
    // reflect it too, with no separate toggle to remember. Mute state is
    // deliberately ignored (the user's own call: mute/solo are for audio,
    // this is for notes visibility only). ─────────────────────────────────
    const litIndices = new Set(s.tracks.filter(t => t.visible).map(t => t.index))
    if (litIndices.size === 0) return EMPTY_SOUNDING
    const key = `${s.midi.fileName}|${s.currentTime.toFixed(4)}|${[...litIndices].join(',')}|${s.detectedKey?.transpose ?? 0}`
    const cached = reflectCacheRef.current
    if (cached && cached.key === key) return cached.result
    const litTracks = s.midi.tracks.filter(t => litIndices.has(t.index))
    const result = notesSoundingAt(litTracks, s.currentTime, s.detectedKey?.transpose ?? 0)
    reflectCacheRef.current = { key, result }
    return result
  })
  const reflectKeys = useMemo(() => new Set(reflectSounding.map(s => s.midi)), [reflectSounding])
  const showHandLabels = useStore((s) => s.showHandLabels)
  const showHandLetters = useStore((s) => s.showHandLetters)
  const handLabelMode = useStore((s) => s.handLabelMode)
  const performanceSplitSensitivity = useStore((s) => s.performanceSplitSensitivity)
  const presentationMode = useStore((s) => s.presentationMode)
  const playbarVisible = useStore((s) => s.playbarVisible)
  const shiftHeldRef = useRef(false)
  // ── Tracks whether the primary mouse button is held, enabling glissando drag ──
  const isMouseDown = useRef(false)
  // ── Glissando keyboard light — instant swap, no fade timer. A timer-based
  // ring (even a short one) still overlaps neighboring keys during a fast
  // sweep since keys cross faster than any ring duration; only the currently-
  // entered key should ever be lit, extinguished the instant the next one is. ──
  const glissandoKeyRef = useRef<number | null>(null)
  const lightGlissandoKey = useCallback((midi: number) => {
    const prev = glissandoKeyRef.current
    const { activeKeys, activeKeyColors } = useStore.getState()
    const nk = new Set(activeKeys)
    const nc = new Map(activeKeyColors)
    if (prev !== null && prev !== midi) { nk.delete(prev); nc.delete(prev) }
    nk.add(midi)
    nc.set(midi, GLISSANDO_COLOR)
    useStore.setState({ activeKeys: nk, activeKeyColors: nc })
    glissandoKeyRef.current = midi
  }, [])
  const clearGlissandoKey = useCallback(() => {
    const prev = glissandoKeyRef.current
    if (prev === null) return
    const { activeKeys, activeKeyColors } = useStore.getState()
    const nk = new Set(activeKeys); nk.delete(prev)
    const nc = new Map(activeKeyColors); nc.delete(prev)
    useStore.setState({ activeKeys: nk, activeKeyColors: nc })
    glissandoKeyRef.current = null
  }, [])
  // ── Compute structured inversion display for explorer chord ───────────────
  const explorerDisplay = useMemo(() => {
    if (!explorerChordDisplay || explorerKeys.size === 0) return null
    const bassNoteMidi = Math.min(...explorerKeys)
    return formatInversionDisplay(
      explorerChordDisplay.name, explorerChordDisplay.invCount, explorerChordDisplay.noteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [explorerChordDisplay, explorerKeys, noteNaming, accidentals])

  // ── Current chord from pre-computed sequence — always tracks currentTime,
  // including while paused, so scrubbing/shift-scrolling the playhead while
  // paused updates the display instead of it sticking on whatever was last
  // shown when playback stopped. currentChordIndex is itself the selected
  // (already-resolved) store value — see the subscription above. ──────────
  const currentIndex = currentChordIndex
  const sequenceChord = currentIndex >= 0 ? chordSequence[currentIndex] : null

  // ── Chord-display legibility fix (two independent root causes, both real):
  // 1. sequenceChord flips the instant currentTime crosses into a new chord
  //    event, with no floor — a fast passage with closely-spaced distinct
  //    chords flickers faster than a human can read.
  // 2. Nothing ever signalled "this just changed" — a slow passage's chord
  //    can silently swap (e.g. Am → Am7) with zero visual cue, reading as
  //    stuck even though it genuinely updated.
  // heldChordEvent enforces a minimum real (wall-clock, not track-time —
  // legibility is about human perception, not playback speed) display
  // duration; justChanged pulses briefly on every actual value change.
  const MIN_CHORD_DISPLAY_MS = 300
  const CHORD_FLASH_MS = 350
  const [heldChordEvent, setHeldChordEvent] = useState<typeof sequenceChord>(null)
  const [chordJustChanged, setChordJustChanged] = useState(false)
  const lastChordChangeAtRef = useRef(0)
  const chordHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chordFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!sequenceChord) {
      if (chordHoldTimeoutRef.current) clearTimeout(chordHoldTimeoutRef.current)
      setHeldChordEvent(null)
      return
    }
    if (heldChordEvent && heldChordEvent.time === sequenceChord.time && heldChordEvent.name === sequenceChord.name) return

    const apply = () => {
      setHeldChordEvent(sequenceChord)
      lastChordChangeAtRef.current = performance.now()
      setChordJustChanged(true)
      if (chordFlashTimeoutRef.current) clearTimeout(chordFlashTimeoutRef.current)
      chordFlashTimeoutRef.current = setTimeout(() => setChordJustChanged(false), CHORD_FLASH_MS)
    }

    // ── Paused (scrubbing): apply instantly, no hold delay or flash — the
    // 300ms minimum-display exists to stop real-time playback from
    // flickering faster than a human can read; a scrub gesture is already
    // paced by the user's own mouse, so holding it back just reads as lag. ──
    if (playbackState !== 'playing') {
      if (chordHoldTimeoutRef.current) clearTimeout(chordHoldTimeoutRef.current)
      setHeldChordEvent(sequenceChord)
      return
    }

    const elapsed = performance.now() - lastChordChangeAtRef.current
    if (elapsed >= MIN_CHORD_DISPLAY_MS) {
      apply()
    } else {
      if (chordHoldTimeoutRef.current) clearTimeout(chordHoldTimeoutRef.current)
      chordHoldTimeoutRef.current = setTimeout(apply, MIN_CHORD_DISPLAY_MS - elapsed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequenceChord, playbackState])

  useEffect(() => () => {
    if (chordHoldTimeoutRef.current) clearTimeout(chordHoldTimeoutRef.current)
    if (chordFlashTimeoutRef.current) clearTimeout(chordFlashTimeoutRef.current)
  }, [])

  // ── Right-click menu on the playback chord display, paused only — "Show on
  // keyboard" (auto-lock) and "Open in Chord Explorer". Both act on the exact
  // voicing sounding under the paused playhead (notesSoundingAt), so the
  // register AND the inversion match the file — not heldChordEvent.realMidi,
  // which is only the thin snapshot taken when the chord name last changed
  // (a passing/anticipation bass note there was showing as a lone key). ─────
  const [chordCtxMenu, setChordCtxMenu] = useState<{
    x: number; y: number
    structured: { rootPitchClass: number; intervals: string[]; rawRootName: string }
    realMidi: number[]      // real voicing from the file — "Show on keyboard"
    explorerMidi: number[]  // clean compact voicing — "Open in Chord Explorer"
    displayName: string
    inversionCount: number
  } | null>(null)
  const chordCtxMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chordCtxMenu) return
    const onMouseDown = (e: MouseEvent) => {
      if (chordCtxMenuRef.current && !chordCtxMenuRef.current.contains(e.target as Node)) setChordCtxMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setChordCtxMenu(null) }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [chordCtxMenu])

  const handleChordContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (playbackState === 'playing' || !heldChordEvent?.structured) return

    // ── Real voicing under the paused playhead — every note, from VISIBLE
    // tracks (same field PianoRoll.tsx checks, and the same one the "Reflect
    // piano roll on keyboard" toggle now uses — not "Lit on keyboard", which
    // defaults to piano/organ only and is a real-playback concept), whose
    // sustain window spans currentTime, transpose-matched to detection.
    // Falls back to the held event's snapshot only if the playhead sits in
    // a genuine gap (< 2 notes ringing). Scoping to visible tracks (not
    // every non-drum track in the file) means this always agrees with what
    // the reflect toggle is already showing — right-clicking to lock a
    // chord no longer adds a second, differently-voiced copy on top of it,
    // and hiding every track but the one you're studying (e.g. an isolated
    // guitar part) is enough on its own, no separate toggle to remember. ───
    const st = useStore.getState()
    const loadedMidi = st.midi
    const transpose = st.detectedKey?.transpose ?? 0
    const litIndices = new Set(st.tracks.filter(t => t.visible).map(t => t.index))
    const litTracks = loadedMidi ? loadedMidi.tracks.filter(t => litIndices.has(t.index)) : []
    const sounding = notesSoundingAt(litTracks, st.currentTime, transpose)
    const useLive = sounding.length >= 2
    const rawMidi = useLive ? sounding.map(s => s.midi) : heldChordEvent.realMidi

    // ── Chord IDENTITY always matches what's already on screen (heldChordEvent)
    // — right-clicking a chord must never show a different chord than the one
    // you right-clicked. `notesSoundingAt` pools every note across the file
    // with no melody/harmony filtering, unlike the live detector's carefully-
    // scoped read, so re-detecting the chord from it (the previous behaviour)
    // could — and did — name something else entirely the moment another
    // track had so much as one extra note sounding at that instant.
    // Only the VOICING (register, bass note, inversion) below is re-read from
    // the real notes ringing at the exact playhead — never the identity. ────
    const structured = heldChordEvent.structured
    const bassPc = rawMidi.length ? Math.min(...rawMidi) % 12 : structured.rootPitchClass
    const invInfo = inversionForKnownChord(structured.rootPitchClass, structured.intervals, bassPc)
    const inversionCount = invInfo.ordinal ? Number(invInfo.ordinal) : 0
    const displayName = localizeChord(structured.rawRootName, noteNaming, accidentals, chordNamingStyle) ?? structured.rawRootName

    // ── A clean, compact single-octave voicing of the NAMED chord — kept for
    // "Open in Chord Explorer" (which wants a canonical shape, not the raw
    // register the file happens to use) and as a fallback for "Show on
    // keyboard" on the rare beat where nothing is actually ringing from any
    // lit track. Keeps the real bass note so slash chords still read right
    // (Baug/G → G lowest). ─────────────────────────────────────────────────
    const compact = buildCompactVoicing(structured.rootPitchClass, structured.intervals, bassPc, keyboardSize)
    // "Show on keyboard" gets the REAL voicing — exact register, exact
    // inversion, exact doublings, matching the piano roll — not a rebuilt
    // one. Falls back to the compact shape only if nothing real is available.
    const realMidi = rawMidi.length > 0 ? rawMidi : compact
    const explorerMidi = compact.length > 0 ? compact : rawMidi

    // ── Offset from the exact click point — the menu's top-left corner
    // anchors right where you click (ContextMenu.tsx), which sat the menu
    // directly over the chord name it was triggered from. Nudged right and
    // up so the name stays visible underneath instead of getting covered. ──
    setChordCtxMenu({ x: e.clientX + 24, y: e.clientY - 78, structured, realMidi, explorerMidi, displayName, inversionCount })
  }, [playbackState, heldChordEvent, noteNaming, accidentals, chordNamingStyle, keyboardSize])

  const handleShowChordOnKeyboard = useCallback(() => {
    if (!chordCtxMenu) return
    const { realMidi, displayName, inversionCount } = chordCtxMenu
    // ── The real voicing from the file (built in handleChordContextMenu).
    // Clamp to the current keyboard's playable range as a safety net. ──────
    const { min, max } = RANGES[keyboardSize] ?? RANGES[73]
    const midiNotes = realMidi.filter(m => m >= min && m <= max)
    if (midiNotes.length > 0) {
      // ── Lock-a-chord is a single detached chord being studied while
      // paused, not song playback — always pink (--lock-chord-color, a
      // separate token from the LH/RH hand colors it's borrowed from — see
      // that token's own comment), never the source-track / LH-RH colors
      // (which only make sense when multiple tracks light up together
      // during playback), and never plain amber either — amber is also what
      // "Reflect piano roll on keyboard" uses, and the two need to read as
      // different things when a locked chord's notes are also currently
      // sounding under that setting (see allActiveColors below). ──────────
      const colors = new Map(midiNotes.map(m => [m, 'var(--lock-chord-color)'] as [number, string]))
      // ── Setting lockedKeys is enough — LockedChordModal auto-opens itself
      // via its own effect watching lockedKeys.size, same as Shift+Click. ────
      setLockedKeysStore(new Set(midiNotes), colors)
      useStore.getState().setOriginalLockedChordName(displayName)
      // Real inversion + distinct-note count so the modal labels it "D7/A 2ⁿᵈ
      // inv" exactly as the playback display did, not a bare root-position "D7".
      useStore.getState().setLockedInversionCount(inversionCount)
      useStore.getState().setLockedChordNoteCount(new Set(midiNotes.map(m => m % 12)).size)
    }
    setChordCtxMenu(null)
  }, [chordCtxMenu, keyboardSize, setLockedKeysStore])

  const handleOpenChordInExplorer = useCallback(() => {
    if (!chordCtxMenu) return
    const { structured, explorerMidi, inversionCount } = chordCtxMenu
    useStore.getState().setPendingChordExplorerSeed({
      rootPitchClass: structured.rootPitchClass,
      intervals: structured.intervals,
      voicing: explorerMidi,
      inversionCount,
    })
    setChordExplorerOpen(true)
    setChordCtxMenu(null)
  }, [chordCtxMenu, setChordExplorerOpen])

  // ── One-line hint on the playback chord display — text depends on whether
  // the context menu would actually do anything right now. Only attached to
  // the element when there's a real chord to hint about (see chordTooltip.box
  // usage below), not on the empty "— — —" placeholder. ─────────────────────
  const showChordTooltip = playbackState === 'playing' ? !!heldChordEvent : !!heldChordEvent?.structured
  const chordTooltip = useTooltip<HTMLDivElement>(
    { title: playbackState === 'playing' ? 'Pause to study the chord' : 'Right-click to see the chord' },
    { oneLine: true },
  )

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Clear chord when playback stops
  useEffect(() => {
    if (playbackState === 'stopped') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) clearTimeout(holdRef.current)
      useStore.getState().setDisplayedChord(null)
    }
  }, [playbackState])

  // Clear displayed chord when either explorer closes
  useEffect(() => {
    if (!chordExplorerOpen) {
      useStore.getState().setDisplayedChord(null)
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
    }
  }, [chordExplorerOpen])

  useEffect(() => {
    if (!scaleExplorerOpen) {
      useStore.getState().setDisplayedChord(null)
    }
  }, [scaleExplorerOpen])

  // ── Tracks Shift key state for chord-lock mode ────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Clears drag state when mouse is released anywhere on the page ─────────
  useEffect(() => {
    const up = () => { isMouseDown.current = false; clearGlissandoKey() }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const { min, max } = RANGES[keyboardSize]
  const keys = useMemo(() => {
    const list: { midi: number; isBlack: boolean }[] = []
    for (let m = min; m <= max; m++) list.push({ midi: m, isBlack: isBlackKey(m) })
    return list
  }, [min, max])
  const whiteKeys = keys.filter(k => !k.isBlack)

  // ── Key layout ratios — same formula as PianoRoll and NoteEditorCanvas ────────
  // buildKeyLayoutRatios is the single canonical source; multiplying by 100 gives
  // the CSS percentages that position black keys absolutely over the white key flex row.
  const keyRatios = useMemo(() => buildKeyLayoutRatios(min, max), [min, max])

  const allActiveKeys = useMemo(() => {
    const merged = new Set(activeKeys)
    lockedKeys.forEach(k => merged.add(k))
    explorerKeys.forEach(k => merged.add(k))
    reflectKeys.forEach(k => merged.add(k))
    return merged
  }, [activeKeys, lockedKeys, explorerKeys, reflectKeys])

  const allActiveColors = useMemo(() => {
    const merged = new Map(activeKeyColors)
    explorerKeyColors.forEach((c, k) => merged.set(k, c))
    // "Reflect piano roll on keyboard" — flat amber, a live always-on version
    // of the same paused-study case lock-a-chord covers, so it gets the same
    // kind of flat, non-per-track color. Applied BEFORE lockedColors below —
    // when a locked chord's notes are also currently sounding under this
    // setting, the lock's pink needs to stay the visible one (they're two
    // different things to be studying at once), not get overwritten back to
    // amber.
    reflectKeys.forEach(k => merged.set(k, 'var(--text-amber)'))
    lockedColors.forEach((c, k) => merged.set(k, c))
    return merged
  }, [activeKeyColors, lockedColors, explorerKeyColors, reflectKeys])

  const getColor = (midi: number): string | null => {
    if (!allActiveKeys.has(midi)) return null
    return allActiveColors.get(midi) ?? 'var(--text-amber)'
  }

  // ── Non-color hand signal — a key lit in HAND_LH/HAND_RH is a tagged file
  // note whose hand was, until now, shown by color alone (see comment above
  // getHardwareHand: the hardware-boundary strip deliberately skips these).
  // Recover the L/R from the resolved color itself so a colorblind user gets
  // the same glyph backup the hardware-guess strip already had. ───────────
  const getColorHand = (colorValue: string | null): Hand | null =>
    colorValue === HAND_LH ? 'L' : colorValue === HAND_RH ? 'R' : null

  // ── Keyboard activation for the CHORDS/SCALES/prompter triggers below —
  // they were span/div onClick with no keyboard path at all (a keyboard-only
  // user couldn't open either explorer). Enter/Space matches the piano
  // keys' own activation pattern elsewhere in this file. ───────────────────
  const activateOnKey = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
  }

  // ── Performance mode: per-note hand strip — hardware MIDI keys only. A file
  // note's hand tag is already shown via the key's own glow color (see
  // useAudioEngine.ts/useSamplesEngine.ts resolveHandAwareColor), so this strip
  // would be redundant there — it exists solely for hardware-played notes,
  // which have no backing file note (lookupNoteHandAtTime returns null) and so
  // have no other way to show the live gap-inference hand guess.
  const pitchHandIndex = useMemo(() => (midi ? buildPitchHandIndex(midi) : null), [midi])
  const hardwareBoundary = useMemo(() => {
    if (handLabelMode !== 'performance') return null
    return detectPerformanceBoundary([...activeKeys].sort((a, b) => a - b), performanceSplitSensitivity)
  }, [activeKeys, handLabelMode, performanceSplitSensitivity])

  const getHardwareHand = (noteMidi: number): Hand | null => {
    if (!showHandLabels || handLabelMode !== 'performance' || !allActiveKeys.has(noteMidi)) return null
    // Non-reactive read — this only matters at the moments activeKeys itself
    // changes (note on/off), which already re-renders this component; no need
    // to also subscribe to currentTime's ~60x/sec ticks for it.
    const tagged = pitchHandIndex ? lookupNoteHandAtTime(pitchHandIndex, noteMidi, useStore.getState().currentTime) : null
    if (tagged) return null // already shown via the key's glow color — no strip needed
    if (hardwareBoundary === null) return null
    return noteMidi < hardwareBoundary ? 'L' : 'R'
  }

  // ── Manual chord detection — playback display is now sourced from chordSequence ─
  useEffect(() => {
    if (lockedKeys.size > 0) return
    // ── Explorer manages its own chord display — skip detection while open ──
    if (chordExplorerOpen || scaleExplorerOpen) return
    // ── Skip during playback — sequenceChord handles display ─────────────────
    if (playbackState === 'playing') {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
      return
    }
    if (activeKeys.size >= CHORD_MIN_NOTES) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
      debounceRef.current = setTimeout(() => {
        const raw = detectChord(activeKeys)
        const localized = localizeChord(raw, noteNaming, accidentals, chordNamingStyle)
        if (localized) {
          useStore.getState().setDisplayedChord(localized)
          holdRef.current = setTimeout(() => useStore.getState().setDisplayedChord(null), CHORD_HOLD_MS)
        }
      }, CHORD_DEBOUNCE_MS)
    } else {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    }
  }, [activeKeys, lockedKeys.size, chordExplorerOpen, scaleExplorerOpen, noteNaming, accidentals, chordNamingStyle, playbackState])


  // isGlissando: true when triggered by a drag-continuation (mouse held down,
  // entering a new key) rather than the initial mousedown. The visual light
  // for these is driven directly here (lightGlissandoKey — instant swap, no
  // fade timer) instead of the normal timed ring, since any timer duration
  // still overlaps neighboring keys during a fast sweep.
  const handleKeyClick = useCallback((midi: number, isGlissando = false) => {
    if (shiftHeldRef.current) {
      const next = new Set(lockedKeys)
      const nextColors = new Map(lockedColors)
      if (next.has(midi)) {
        next.delete(midi)
        nextColors.delete(midi)
      } else {
        next.add(midi)
        nextColors.set(midi, 'var(--lock-chord-color)')
        const playNote = (window as any).__orfeoPlayNote
        if (playNote) playNote(midi, 0.7, 600, undefined, false)
      }
      setLockedKeysStore(next, nextColors)
      // ── Detect chord once on the new note set; seed inversion count from detection ─
      // Must start at the detected inversion number, not 0 — locking C-F-A on an F
      // chord is 2nd inversion; starting at 0 would miscount all subsequent cycling.
      const info = next.size >= 2 ? detectChordWithInversion(next) : null
      const localized = info ? localizeChord(info.name, noteNaming, accidentals, chordNamingStyle) : null
      useStore.getState().setOriginalLockedChordName(localized)
      useStore.getState().setLockedInversionCount(info?.ordinal ? Number(info.ordinal) : 0)
      useStore.getState().setLockedChordNoteCount(next.size)
    } else {
      if (lockedKeys.size > 0) clearLockedKeys()
      const playNote = (window as any).__orfeoPlayNote
      if (isGlissando) {
        lightGlissandoKey(midi)
        if (playNote) playNote(midi, 0.7, 60, undefined, false)
      } else {
        if (playNote) playNote(midi, 0.7, 500)
      }
    }
  }, [lockedKeys, lockedColors, noteNaming, accidentals, chordNamingStyle, setLockedKeysStore, clearLockedKeys, lightGlissandoKey])

  const keyContainerRef = useRef<HTMLDivElement>(null)
  const [keyHeight, setKeyHeight] = useState(130)

  useEffect(() => {
    const el = keyContainerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (!w) return
      // Proportional to key width — ratio 4.0 gives natural-looking keys on screen
      // (real piano is 1:6.4 but that's too tall for a UI element)
      // Hard cap: min 80px, max 140px
      const whiteW = w / whiteKeys.length
      const h = Math.round(Math.max(80, Math.min(140, whiteW * 4.0)))
      setKeyHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [whiteKeys.length])

  // ── Live keyboard top-edge tracking (Phase 1: hidable playbar) ─────────────
  // Only runs while the playbar is actually hidden — zero overhead (no rAF
  // loop at all) when playbarVisible is true, which is the default. A plain
  // rAF poll covers both docked layout changes and floating-panel drag in one
  // code path, since dragging FloatingKeyboard only moves this same element
  // via CSS position — no separate drag-event wiring needed here.
  useEffect(() => {
    if (!playbarVisible) return
    useStore.getState().setKeyboardTopY(null)
  }, [playbarVisible])

  useEffect(() => {
    if (playbarVisible) return
    let rafId: number
    let lastY: number | null = null
    const tick = () => {
      const el = keyContainerRef.current
      if (el) {
        const top = Math.round(el.getBoundingClientRect().top)
        if (top !== lastY) {
          lastY = top
          useStore.getState().setKeyboardTopY(top)
        }
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [playbarVisible])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Chord bar — hidden in Presentation Mode; fixed 36px so toggling the
          prompter never shifts the row above it ── */}
      {!presentationMode && <div data-keyboard-header style={{
        height: 36,
        background: 'var(--bg-modal-header)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'height 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* ── SIMPLE MODE: single chord name centred ──────────────────────────── */}
        {!chordPrompterOpen && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: '0 var(--space-3)', position: 'relative' }}>
            {/* ── Left: CHORDS trigger + prompter toggle ────────────────────────── */}
            <div style={{ position: 'absolute', left: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Tooltip title="Chords Explorer" description="Opens a dedicated view for browsing and detecting chords across the full keyboard.">
                <span
                  onClick={() => setChordExplorerOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => setChordExplorerOpen(true))}
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                >
                  Chords
                </span>
              </Tooltip>
              {/* ── Prompter toggle — amber when open, dim when closed, faded when no file ─ */}
              {chordPrompterEnabled && (
                <Tooltip title="Chord Prompter" description="Shows a scrolling past → current → next chord sequence alongside the chord name, synced to playback.">
                  <div
                    onClick={() => midi && setChordPrompterOpen(!chordPrompterOpen)}
                    role="button"
                    tabIndex={midi ? 0 : -1}
                    aria-pressed={chordPrompterOpen}
                    onKeyDown={activateOnKey(() => midi && setChordPrompterOpen(!chordPrompterOpen))}
                    style={{ cursor: midi ? 'pointer' : 'default', color: chordPrompterOpen ? 'var(--text-amber)' : 'var(--text-default)', opacity: midi ? 1 : 0.35, display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
                  </div>
                </Tooltip>
              )}
            </div>

            {/* Centre: chord name — priority: explorer > sequence > manual > empty */}
            <div
              onContextMenu={handleChordContextMenu}
              ref={showChordTooltip && !explorerDisplay ? chordTooltip.ref : undefined}
              onMouseEnter={showChordTooltip && !explorerDisplay ? chordTooltip.onMouseEnter : undefined}
              onMouseLeave={showChordTooltip && !explorerDisplay ? chordTooltip.onMouseLeave : undefined}
              style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 80, justifyContent: 'center' }}
            >
              {showChordTooltip && !explorerDisplay && chordTooltip.box}
              {explorerDisplay ? (
                // ── Explorer chord: chord/bass amber + ordinal grey ────────────
                <>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.05em', userSelect: 'none' }}>
                    {explorerDisplay.chordLabel}
                  </span>
                  {explorerDisplay.ordinal && (
                    <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-default)', userSelect: 'none' }}>
                      {explorerDisplay.ordinal}
                      <span style={{ fontSize: 7, verticalAlign: 'super' }}>{ordinalSuffix(Number(explorerDisplay.ordinal))}</span>
                      {' inv'}
                    </span>
                  )}
                </>
              ) : (heldChordEvent || displayedChord) ? (
                // ── Sequence (playback) or manual chord: slash-split rendered ──
                // Brief glow on genuine change — heldChordEvent already enforces
                // the minimum legible display duration (see effect above).
                (() => {
                  const name = heldChordEvent?.name ?? displayedChord ?? ''
                  const flash = chordJustChanged && !!heldChordEvent
                  const slashIdx = name.indexOf('/')
                  const mainStyle: React.CSSProperties = {
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.05em', userSelect: 'none',
                    textShadow: flash ? '0 0 8px var(--text-amber)' : 'none',
                    transition: 'text-shadow 0.35s ease-out',
                  }
                  if (slashIdx < 0) {
                    return <span style={mainStyle}>{name}</span>
                  }
                  return (
                    <>
                      <span style={mainStyle}>{name.slice(0, slashIdx)}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-active)', letterSpacing: '0.04em', userSelect: 'none' }}>
                        {name.slice(slashIdx)}
                      </span>
                    </>
                  )
                })()
              ) : (
                // ── Empty state ────────────────────────────────────────────────
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 400, color: 'var(--text-chord-placeholder)', letterSpacing: '0.03em', transition: 'color 0.2s' }}>
                  {'— — —'}
                </span>
              )}
            </div>

            {/* ── Right: SCALES trigger ─────────────────────────────────────────── */}
            <div style={{ position: 'absolute', right: 10, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Tooltip title="Scales Explorer" description="Opens a dedicated view for exploring scales and highlighting their notes on the keyboard.">
                <span
                  onClick={() => setScaleExplorerOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => setScaleExplorerOpen(true))}
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                >
                  Scales
                </span>
              </Tooltip>
            </div>
          </div>
        )}

        {/* ── EXTENDED MODE: single-row layout — CHORDS + icon | sequence | SCALES ─ */}
        {chordPrompterOpen && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, minWidth: 0, overflow: 'hidden' }}>

            {/* ── Left: CHORDS trigger + prompter toggle ────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <Tooltip title="Chords" description="Opens a dedicated view for browsing and detecting chords across the full keyboard.">
                <span
                  onClick={() => setChordExplorerOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => setChordExplorerOpen(true))}
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                >
                  Chords
                </span>
              </Tooltip>
              {/* ── Prompter toggle (amber — always active while open) ────────── */}
              <Tooltip title="Chord Prompter" description="Shows a scrolling past → current → next chord sequence alongside the chord name, synced to playback.">
                <div
                  onClick={() => setChordPrompterOpen(!chordPrompterOpen)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={chordPrompterOpen}
                  onKeyDown={activateOnKey(() => setChordPrompterOpen(!chordPrompterOpen))}
                  style={{ cursor: 'pointer', color: 'var(--text-amber)', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
                </div>
              </Tooltip>
            </div>

            {/* ── Centre: chord sequence (past | ‹ | current | › | next) ────────── */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              {(() => {
                const noFile = !midi
                const noChords = !!midi && chordSequence.length === 0
                const notStarted = !!midi && chordSequence.length > 0 && currentChordIndex < 0

                if (noFile || noChords || notStarted) {
                  return (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                        {noFile ? 'Open a MIDI file' : noChords ? 'No chords detected' : 'Press play'}
                      </span>
                    </div>
                  )
                }

                // ── Priority: explorer > sequence ─────────────────────────────
                // heldChordEvent (not raw sequenceChord) enforces the minimum
                // legible display duration — see the effect above.
                const centreChord = explorerDisplay?.chordLabel ?? heldChordEvent?.name ?? '—'
                const centreFlash = chordJustChanged && !explorerDisplay && !!heldChordEvent
                const pastChords = currentIndex > 0 ? chordSequence.slice(Math.max(0, currentIndex - 4), currentIndex) : []
                const nextChords = currentIndex >= 0 ? chordSequence.slice(currentIndex + 1, currentIndex + 3) : []

                // ── Group consecutive short (< 1 bar) chords so a quick
                // ii-V-I reads as one tight cluster, not three full slots. ──
                const groupShort = (evs: typeof chordSequence): (typeof chordSequence)[] => {
                  const out: (typeof chordSequence)[] = []
                  for (const ev of evs) {
                    const last = out[out.length - 1]
                    if (ev.short && last && last[last.length - 1].short) last.push(ev)
                    else out.push([ev])
                  }
                  return out
                }

                return (
                  <>
                    {/* Past 4 chords, right-aligned */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                      {groupShort(pastChords).map((grp, gi) => (
                        <React.Fragment key={`${grp[0].time}-${grp[0].name}`}>
                          {gi > 0 && <span style={{ color: 'var(--state-disabled)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>}
                          <span style={{ display: 'flex', alignItems: 'center', gap: grp.length > 1 ? 2 : 0 }}>
                            {grp.map((ev, i) => (
                              <span
                                key={`${ev.time}-${ev.name}-${i}`}
                                style={{
                                  fontSize: grp.length > 1 ? 'calc(var(--text-xs) - 1px)' : 'var(--text-xs)',
                                  opacity: grp.length > 1 ? 0.8 : 1,
                                  fontFamily: 'var(--font-ui)', color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90,
                                }}
                              >
                                {ev.name}
                              </span>
                            ))}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>

                    {/* ‹ separator */}
                    <span style={{ color: 'var(--state-disabled)', fontSize: 'var(--text-md)', flexShrink: 0, lineHeight: 1, padding: '0 3px' }}>‹</span>

                    {/* Current chord name only, no note names — width is intrinsic
                        to content (min 100 so short names stay centered/stable),
                        never clipped: a fixed 100px box with an ellipsis'd inner
                        span was truncating anything past ~8-9 monospace chars
                        (e.g. "F#dim7/A", "Bbm7b5"). Neighboring past/next boxes
                        are flex:1 so they yield space to this when it grows. */}
                    <div
                      onContextMenu={handleChordContextMenu}
                      ref={showChordTooltip && !explorerDisplay ? chordTooltip.ref : undefined}
                      onMouseEnter={showChordTooltip && !explorerDisplay ? chordTooltip.onMouseEnter : undefined}
                      onMouseLeave={showChordTooltip && !explorerDisplay ? chordTooltip.onMouseLeave : undefined}
                      style={{ flexShrink: 0, minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}
                    >
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-amber)', lineHeight: 1, whiteSpace: 'nowrap',
                        textShadow: centreFlash ? '0 0 10px var(--text-amber)' : 'none',
                        transition: 'text-shadow 0.35s ease-out',
                      }}>
                        {centreChord}
                      </span>
                      {showChordTooltip && !explorerDisplay && chordTooltip.box}
                    </div>

                    {/* › separator */}
                    <span style={{ color: 'var(--state-disabled)', fontSize: 'var(--text-md)', flexShrink: 0, lineHeight: 1, padding: '0 3px' }}>›</span>

                    {/* Next 2 chords, left-aligned */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5, minWidth: 0 }}>
                      {groupShort(nextChords).map((grp, gi) => (
                        <React.Fragment key={`${grp[0].time}-${grp[0].name}`}>
                          {gi > 0 && <span style={{ color: 'var(--state-disabled)', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>}
                          <span style={{ display: 'flex', alignItems: 'center', gap: grp.length > 1 ? 2 : 0 }}>
                            {grp.map((ev, i) => (
                              <span
                                key={`${ev.time}-${ev.name}-${i}`}
                                style={{
                                  fontSize: grp.length > 1 ? 'calc(var(--text-xs) - 1px)' : 'var(--text-xs)',
                                  opacity: grp.length > 1 ? 0.8 : 1,
                                  fontFamily: 'var(--font-ui)', color: 'var(--text-muted)',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 90,
                                }}
                              >
                                {ev.name}
                              </span>
                            ))}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* ── Right: SCALES trigger ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
              <Tooltip title="Scales" description="Opens a dedicated view for exploring scales and highlighting their notes on the keyboard.">
                <span
                  onClick={() => setScaleExplorerOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={activateOnKey(() => setScaleExplorerOpen(true))}
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                >
                  Scales
                </span>
              </Tooltip>
            </div>
          </div>
        )}
      </div>}

      {/* Piano keys */}
      <div
        ref={keyContainerRef}
        style={{
          position: 'relative', width: '100%', userSelect: 'none',
          height: keyHeight, background: 'var(--bg-deep)', borderTop: '1px solid var(--state-hover-bg)', transition: 'height 0.15s',
        }}
      >
        {/* White keys */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          {whiteKeys.map((k, i) => {
            const color = getColor(k.midi)
            const hand = getHardwareHand(k.midi)
            const colorHand = showHandLetters ? getColorHand(color) : null
            const locked = lockedKeys.has(k.midi)
            const isC = k.midi % 12 === 0
            const label = color
              ? (showNoteNamesOnKeyboard ? (getNoteName(k.midi, noteNaming, accidentals) || null) : null)
              : (isC && showOctaveLabels ? getNoteLabel(k.midi, noteNaming, accidentals) : null)
            return (
              <div
                key={k.midi}
                // preventDefault suppresses the browser's implicit "focus this
                // element" default action for mouse clicks specifically —
                // keyboard Tab-navigation (and its focus-visible amber ring)
                // is untouched. Without this, clicking a key (e.g. the 3rd
                // Shift+click that completes a locked chord) leaves real DOM
                // focus sitting on that key; when Lock-a-Chord's focus trap
                // later restores focus on close, it reactivates that same
                // key, and the app-wide `[tabindex]:focus-visible` amber
                // outline rule (index.css) then renders as a border stuck on
                // that key indefinitely — see docs/superpowers/specs
                // (2026-08-20) for the real repro. ─────────────────────────
                onMouseDown={e => { e.preventDefault(); isMouseDown.current = true; handleKeyClick(k.midi) }}
                onMouseEnter={() => { if (isMouseDown.current) handleKeyClick(k.midi, true) }}
                title={getNoteLabel(k.midi, noteNaming, accidentals) || undefined}
                tabIndex={0}
                role="button"
                aria-label={`Play ${getNoteLabel(k.midi, noteNaming, accidentals) || 'note'}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleKeyClick(k.midi) }
                }}
                style={{
                  position: 'relative', flex: '1 1 0%', display: 'flex', flexDirection: 'column',
                  justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 4, cursor: 'pointer',
                  background: color ?? 'var(--key-white-bg)',
                  borderRight: !color ? '1px solid var(--key-white-border)' : allActiveKeys.has(whiteKeys[i + 1]?.midi) ? '1px solid var(--key-active-border)' : '1px solid transparent',
                  borderLeft: color && allActiveKeys.has(whiteKeys[i - 1]?.midi) ? '1px solid var(--key-active-border)' : 'none',
                  boxShadow: color
                    ? `0 0 ${locked ? 18 : 12}px ${locked ? 6 : 4}px color-mix(in srgb, ${color} ${locked ? 80 : 53}%, transparent)`
                    : 'inset 0 -3px 6px rgba(0,0,0,0.1)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  minWidth: 0,
                  }}
              >
                {hand && (
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: hand === 'L' ? HAND_LH : HAND_RH, pointerEvents: 'none',
                  }} />
                )}
                {/* ── Hand letter badge — dark square + white letter, sized as a
                    percentage of THIS key's own rendered width (not a fixed px),
                    so it scales correctly whether the keyboard shows 61, 73, or 88
                    keys — key width is inversely tied to key count, not the other
                    way around, so a fixed size risks being oversized on wide keys
                    or cramped on narrow ones. clamp() keeps it within sane bounds
                    either way. Vertically at top:68% (just past the black keys'
                    own height:'65%'), not a top-corner — a corner badge sat
                    directly under the overlapping black key and was half-hidden;
                    this band between the black keys' bottom edge and the note-name
                    label below is always fully exposed white key, on every key. ── */}
                {colorHand && (
                  <span style={{
                    position: 'absolute', top: '68%', left: '50%', transform: 'translateX(-50%)',
                    width: 'clamp(8px, 42%, 13px)', height: 'clamp(8px, 42%, 13px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 2, background: 'var(--text-near-black)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                    fontSize: 8, fontWeight: 700, lineHeight: 1,
                    fontFamily: 'var(--font-mono)', color: 'var(--text-white)',
                    userSelect: 'none', pointerEvents: 'none',
                  }}>
                    {colorHand}
                  </span>
                )}
                {label && (
                  <span
                    style={{ fontWeight: 600, pointerEvents: 'none', color: color ? 'var(--text-white)' : 'var(--key-label-dim)', fontFamily: 'var(--font-mono)', fontSize: (chordExplorerOpen || scaleExplorerOpen) ? 11 : 9 }}>
                    {label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Black keys */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
          {keys.filter(k => k.isBlack).map((k) => {
            // ── Positions come from the same buildKeyLayoutRatios as PianoRoll ──
            const ratio = keyRatios[k.midi - min]
            if (!ratio) return null
            const leftPct  = ratio.x * 100
            const widthPct = ratio.width * 100
            const color = getColor(k.midi)
            const hand = getHardwareHand(k.midi)
            const colorHand = showHandLetters ? getColorHand(color) : null
            const locked = lockedKeys.has(k.midi)
            return (
              <div
                key={k.midi}
                // preventDefault suppresses the browser's implicit "focus this
                // element" default action for mouse clicks specifically —
                // keyboard Tab-navigation (and its focus-visible amber ring)
                // is untouched. Without this, clicking a key (e.g. the 3rd
                // Shift+click that completes a locked chord) leaves real DOM
                // focus sitting on that key; when Lock-a-Chord's focus trap
                // later restores focus on close, it reactivates that same
                // key, and the app-wide `[tabindex]:focus-visible` amber
                // outline rule (index.css) then renders as a border stuck on
                // that key indefinitely — see docs/superpowers/specs
                // (2026-08-20) for the real repro. ─────────────────────────
                onMouseDown={e => { e.preventDefault(); isMouseDown.current = true; handleKeyClick(k.midi) }}
                onMouseEnter={() => { if (isMouseDown.current) handleKeyClick(k.midi, true) }}
                title={getNoteLabel(k.midi, noteNaming, accidentals) || undefined}
                tabIndex={0}
                role="button"
                aria-label={`Play ${getNoteLabel(k.midi, noteNaming, accidentals) || 'note'}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleKeyClick(k.midi) }
                }}
                style={{
                  position: 'absolute', top: 0, cursor: 'pointer', pointerEvents: 'auto',
                  left: `${leftPct}%`, width: `${widthPct}%`, height: '65%',
                  background: color ?? 'var(--border-row)',
                  borderRadius: '0 0 4px 4px',
                  // Longhand per side (not `border` shorthand + `borderTop`
                  // override) — mixing them made React warn "conflicting
                  // style property" on every re-render, and this element
                  // re-renders on every key-light color change during
                  // playback, so that warning (and its cost — DevTools
                  // formats a full stack trace per occurrence) fired
                  // continuously while a file played.
                  borderLeft:   color ? '1px solid var(--key-black-active-border)' : '1px solid var(--bg-modal-header)',
                  borderRight:  color ? '1px solid var(--key-black-active-border)' : '1px solid var(--bg-modal-header)',
                  borderBottom: color ? '1px solid var(--key-black-active-border)' : '1px solid var(--bg-modal-header)',
                  borderTop: 'none',
                  boxShadow: color
                    ? `0 0 ${locked ? 14 : 10}px ${locked ? 4 : 3}px color-mix(in srgb, ${color} ${locked ? 73 : 60}%, transparent)`
                    : '0 4px 8px rgba(0,0,0,0.7)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  zIndex: 2,
                }}
              >
                {hand && (
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                    background: hand === 'L' ? HAND_LH : HAND_RH, pointerEvents: 'none',
                    borderRadius: '2px 2px 0 0',
                  }} />
                )}
                {/* ── Hand letter badge — inverted from the white-key version (light
                    square + dark letter, black keys are already dark) so it reads
                    at a glance which key type it's on. Sized off this key's own
                    width (black keys are narrower still — 60% of a white key's
                    share — hence the larger relative percentage here). ── */}
                {colorHand && (
                  <span style={{
                    position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)',
                    width: 'clamp(7px, 70%, 11px)', height: 'clamp(7px, 70%, 11px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 2, background: 'var(--text-white)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
                    fontSize: 7, fontWeight: 700, lineHeight: 1,
                    fontFamily: 'var(--font-mono)', color: 'var(--text-near-black)',
                    userSelect: 'none', pointerEvents: 'none',
                  }}>
                    {colorHand}
                  </span>
                )}
                {color && showNoteNamesOnKeyboard && noteNaming !== 'hidden' && (
                  <span style={{
                    position: 'absolute', bottom: 3, left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: (chordExplorerOpen || scaleExplorerOpen) ? 8 : 7, fontFamily: 'var(--font-mono)', fontWeight: 700,
                    color: 'var(--key-note-name-color)', pointerEvents: 'none',
                    whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.95)',
                  }}>
                    {getNoteName(k.midi, noteNaming, accidentals)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {chordCtxMenu && (
        <ContextMenu ref={chordCtxMenuRef} x={chordCtxMenu.x} y={chordCtxMenu.y} minWidth={190} ariaLabel="Chord actions">
          <ContextMenuItem onClick={handleShowChordOnKeyboard}>
            Show on keyboard
          </ContextMenuItem>
          <ContextMenuItem onClick={handleOpenChordInExplorer}>
            Open in Chord Explorer
          </ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  )
}
