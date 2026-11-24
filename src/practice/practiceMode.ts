import { create } from 'zustand'
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import { songPracticeState, PRACTICE_PREP_VISIBLE, type SongPractice } from '../utils/practiceReadiness'
import type { KeyboardSize } from '../types'
import type { DetectedKey } from '../utils/keyDetection'
import { NES } from '../utils/noteEditorState'
import { focusRole } from '../utils/keyboardGroups'
import type { SongCheck } from './songCheck'
import { songCheckOf } from './songCheckOf'
import { meterFromDrums, type MeterFix } from '../utils/meterCheck'
import { rememberPracticePlace, openPrepare } from './editRoundTrip'

// ── Practice mode (Orfeo 2.0) ────────────────────────────────────────────────
// A stripped-down screen for practising the piano part of a song with a USB
// keyboard: the piano alone, as two tracks, one per hand (the hand you practise
// silent but shown, the other heard and drawn faded), the band muted and
// hidden until you bring it in, every control in one narrow top bar. Nothing
// is edited or saved here; leaving puts every track, size and panel back
// exactly as it was. Plan: docs/IDEA-practice-mode-build-plan.md (local).

export type PracticeWay = 'practise' | 'wait' | 'perform'
export type PracticeHand = 'L' | 'B' | 'R'
export type PracticeView = 'roll' | 'split' | 'score'
export const PRACTICE_SIZES: KeyboardSize[] = [61, 73, 88]

// Shown in dev mode and test builds until 2.0 ships
export const PRACTICE_VISIBLE = PRACTICE_PREP_VISIBLE

interface PracticeUi {
  active: boolean
  way: PracticeWay
  hand: PracticeHand        // Practise only; the other two ways are both hands
  waitOn: boolean           // Practise only: the song waits for your notes
  level: 1 | 2 | 3          // Performance only
  view: PracticeView
  hearMine: boolean         // hear your own part quietly as a guide (Practise)
  ramp: boolean             // Practise: speed up gradually
  onlyHand: 'L' | 'R' | null  // the song's piano is one hand throughout: always that hand
  songReady: boolean        // a song ready to practise is open (else: pick one from the playlist)
  notReady: GateReason | null // why the open song can't be practised (shown while picking)
}

export const usePractice = create<PracticeUi>(() => ({
  active: false, way: 'practise', hand: 'B', waitOn: false, level: 1, view: 'roll', hearMine: true, ramp: false, onlyHand: null,
  songReady: false, notReady: null,
}))

// ── Your choices, remembered ─────────────────────────────────────────────────
// The very first time practice mode opens: the whole band, your part heard too,
// Play along, both hands, no waiting. After that, what you choose (the way of
// playing, hands, waiting, your part heard or not, the level, the view, what
// you hear of the band) is kept: from song to song and from one day to the next.
interface Choices { way: PracticeWay; hand: PracticeHand; waitOn: boolean; hearMine: boolean; level: 1 | 2 | 3; view: PracticeView; band: BandPreset }
const FIRST_CHOICES: Choices = { way: 'practise', hand: 'B', waitOn: false, hearMine: true, level: 1, view: 'roll', band: 'band' }
let choices: Choices = { ...FIRST_CHOICES }
let choicesLoaded = false
void window.electronAPI?.getPrefs?.().then((p: any) => {
  const c = p?.practiceChoices
  if (c && typeof c === 'object') choices = { ...FIRST_CHOICES, ...c }
  choicesLoaded = true
}).catch(() => { choicesLoaded = true })
function rememberChoices(next: Partial<Choices>): void {
  const merged = { ...choices, ...next }
  if (JSON.stringify(merged) === JSON.stringify(choices)) return
  choices = merged
  if (choicesLoaded) window.electronAPI?.setPrefs?.({ practiceChoices: choices })?.catch?.(() => {})
}

/** A song loaded in practice mode: your choices (the first time, the defaults) */
function applySongDefaults(): void {
  const c = choices
  usePractice.setState({ way: c.way, hand: c.hand, waitOn: c.waitOn, hearMine: c.hearMine, level: c.level, view: c.view, ramp: false })
  setBandPreset(c.band)
}

// ── May practice mode open? ──────────────────────────────────────────────────
export type GateReason = 'off' | 'no-keyboard' | 'no-song' | 'editing' | 'no-piano' | 'too-many' | 'messy' | 'prepare'

export function keyboardConnected(): boolean {
  return useMidiSettings.getState().devices.some(d => d.connected && !d.virtual)
}

/** The open song against the rule: two piano tracks, one per hand */
export function currentSongPractice(): SongPractice | null {
  const s = useStore.getState()
  if (!s.midi) return null
  const tracks = s.midi.tracks.map(t => {
    const ts = s.tracks.find(x => x.index === t.index)
    return { ...t, group: ts?.group ?? t.group, isDrum: ts?.isDrum ?? t.isDrum, trackName: ts?.trackName }
  })
  return songPracticeState(tracks, { stavePairs: (s.midi as any)._stavePairs ?? [], options: { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers } })
}

/** The lesson check of the open song (practice/songCheck.ts): what to leave
 *  out or merge, and what's wrong with the notes themselves */
export function currentSongCheck(): SongCheck | null {
  const s = useStore.getState()
  if (!s.midi) return null
  const tracks = s.midi.tracks.map(t => {
    const ts = s.tracks.find(x => x.index === t.index)
    // the name the file gives the track (a name typed in Orfeo wins)
    const name = ts?.trackName && ts.trackName !== ts.gmName ? ts.trackName : (t.name || ts?.trackName || '')
    return { index: t.index, name, group: ts?.group ?? t.group ?? '', isDrum: ts?.isDrum ?? t.isDrum, notes: t.notes, program: ts?.program ?? t.program }
  })
  // the written meter against the drums' beat, unless the beat was already set (Tap Tempo, or the fix below)
  const corrected = !!(s.songKey && s.tempoCorrections[s.songKey]?.segments?.length)
  const meter = corrected ? null : meterFromDrums(s.midi)
  return songCheckOf(tracks, (s.midi as any)._stavePairs ?? [], { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers }, (s.midi as any)._source, meter)
}

/** The Lesson check's fix for a wrongly written meter: the song's beat set to
 *  the drums' beat, the way Tap Tempo sets it (kept per song, the file untouched) */
export function applyMeterFix(fix: MeterFix): void {
  const s = useStore.getState()
  if (!s.songKey) return
  const seg = { start: 0, anchor: fix.anchor, period: fix.period, beatsPerBar: fix.beatsPerBar, den: 4 }
  s.setTempoCorrections({ ...s.tempoCorrections, [s.songKey]: { segments: [seg] } })
}

// hands: each piano track the player practises, and its hand (one or two tracks)
export function practiceGate(): { ok: true; hands: Record<number, 'L' | 'R'>; onlyHand: 'L' | 'R' | null } | { ok: false; reason: GateReason; passages?: number; pianos?: number } {
  const s = useStore.getState()
  if (!PRACTICE_VISIBLE || !s.practiceModeEnabled) return { ok: false, reason: 'off' }
  if (!keyboardConnected()) return { ok: false, reason: 'no-keyboard' }
  if (!s.midi) return { ok: false, reason: 'no-song' }
  if (s.noteEditorActive) return { ok: false, reason: 'editing' }
  const st = currentSongPractice()!
  if (st.state === 'ready') return { ok: true, hands: { [st.left]: 'L', [st.right]: 'R' }, onlyHand: null }
  if (st.state === 'one-hand') return { ok: true, hands: { [st.track]: st.hand }, onlyHand: st.hand }
  if (st.state === 'prepare') return { ok: false, reason: 'prepare', passages: st.passages }
  return { ok: false, reason: st.reason, pianos: st.pianos }
}

// ── In and out ───────────────────────────────────────────────────────────────
// What practice mode changes outside the tracks, put back on leaving
// (tempo, key and metronome too: changed in a session, they're only for the session)
let before: {
  keyboardSize: KeyboardSize; keyboardOctave: number; keyboardMode: 'docked' | 'floating'; focus: boolean; presentation: boolean
  bpm: number; key: DetectedKey | null; metronome: boolean
} | null = null

/** Practice mode can open: it's on, a keyboard is plugged in, nothing is being
 *  edited, and there's a song to practise, the open one or one in the playlist
 *  (picked inside practice mode) */
export function canEnterPractice(): { ok: true } | { ok: false; reason: GateReason | 'no-queue' } {
  const s = useStore.getState()
  if (!PRACTICE_VISIBLE || !s.practiceModeEnabled) return { ok: false, reason: 'off' }
  if (!keyboardConnected()) return { ok: false, reason: 'no-keyboard' }
  if (s.noteEditorActive) return { ok: false, reason: 'editing' }
  if (practiceGate().ok || s.queue.paths.length > 0) return { ok: true }
  const g = practiceGate()
  return { ok: false, reason: !g.ok && g.reason !== 'no-song' ? g.reason : 'no-queue' }
}

export function enterPractice(): boolean {
  if (!canEnterPractice().ok) return false
  const gate = practiceGate()
  const s = useStore.getState()
  if (s.playbackState === 'playing') useStore.setState({ playbackState: 'paused' })
  songAtStart = s.midi
  before = {
    keyboardSize: s.keyboardSize, keyboardOctave: s.keyboardOctave, keyboardMode: s.keyboardMode, focus: s.focusActive, presentation: s.presentationMode,
    bpm: s.bpm, key: s.detectedKey, metronome: s.metronomeEnabled,
  }
  if (s.focusActive) s.setTrackMuteFilter(false)
  // the Explorers play and light keys of their own, which fights a session
  s.setChordExplorerOpen(false)
  s.setScaleExplorerOpen(false)
  s.setMixerOpen(false)
  s.setMidiEditorOpen(false)
  if (s.presentationMode) s.setPresentationMode(false)
  if (s.keyboardMode !== 'docked') s.setKeyboardMode('docked')
  // practice mode shows all 88 keys: the song's notes and your keyboard's land
  // where they belong, whatever its size
  useStore.setState({ keyboardSize: 88, keyboardOctave: 0 })
  if (gate.ok) {
    useStore.getState().setPracticeTracks(true, gate.hands)
    usePractice.setState({ active: true, onlyHand: gate.onlyHand, songReady: true, notReady: null })
    applySongDefaults()
  } else {
    // nothing to practise open yet: pick a song from the playlist
    usePractice.setState({ active: true, onlyHand: null, songReady: false, notReady: gate.reason === 'no-song' ? null : gate.reason })
  }
  applySound()
  applyWayRules()
  return true
}

// the song practice mode started on, so leaving only puts back its own tempo and key
let songAtStart: unknown = null

export function leavePractice(): void {
  if (!usePractice.getState().active) return
  const s = useStore.getState()
  if (s.playbackState === 'playing') useStore.setState({ playbackState: 'paused' })
  if (s.practiceActive) s.setPracticeTracks(false)
  usePractice.setState({ active: false, onlyHand: null, songReady: false, notReady: null })
  const b = before
  before = null
  if (!b) return
  // straight into the store: a portable size comes back even if portable keyboards are off now
  useStore.setState({ keyboardSize: b.keyboardSize, keyboardOctave: b.keyboardOctave, metronomeEnabled: b.metronome })
  // the same song: its tempo and key as they were (another song brought its own)
  if (useStore.getState().midi === songAtStart) useStore.setState({ bpm: b.bpm, detectedKey: b.key })
  if (b.keyboardMode !== useStore.getState().keyboardMode) useStore.getState().setKeyboardMode(b.keyboardMode)
  if (b.presentation) useStore.getState().setPresentationMode(true)
  if (b.focus && useStore.getState().midi) useStore.getState().setTrackMuteFilter(true)
}

/** Which hand you practise: silent (unless you hear it too). Wait for me
 *  and Performance are always both hands. */
export function practisedHand(): PracticeHand {
  const p = usePractice.getState()
  if (p.onlyHand) return p.onlyHand
  return p.way === 'practise' ? p.hand : 'B'
}
export function applySound(): void {
  const p = usePractice.getState()
  if (!p.active) return
  useStore.getState().setPracticeSound(practisedHand(), p.way === 'practise' && p.hearMine)
}

/** Fix hands: nothing is edited in practice mode, so leave it and open the
 *  Note Editor on the piano (both hand tracks), hands showing, at the bars
 *  you were playing */
export function fixHandsFromPractice(): void {
  const pianos = useStore.getState().tracks.filter(tr => tr.practicePart)
  const first = pianos.find(tr => tr.practiceHand === practisedHand()) ?? pianos.find(tr => tr.practiceHand === 'R') ?? pianos[0]
  // the Note Editor's buttons bring you back here, at this bar (editRoundTrip.ts)
  if (first) rememberPracticePlace('fix')
  leavePractice()
  if (!first) return
  const s = useStore.getState()
  s.soloTrackForEdit(first.index, { keepPlayhead: true, also: pianos.map(p => p.index) })
  NES.reassignHandsMode = true
  NES.onReassignHandsModeChange?.()
  s.setNoteEditorActive(true)
}

/** The open song needs preparing (Pick a song card): leave practice mode for
 *  Prepare for practice in the Note Editor; Split & Save brings you back */
export function prepareFromPractice(): boolean {
  const st = currentSongPractice()
  if (!st || st.state !== 'prepare' || !useStore.getState().noteEditorEnabled) return false
  rememberPracticePlace('prepare')
  leavePractice()
  openPrepare(st.tracks[0])
  return true
}

/** Hear your own part too (Practise): quietly, as a guide */
export function setHearMine(on: boolean): void {
  usePractice.setState({ hearMine: on })
}

/** The band: in (every other track heard) or out (the piano alone) */
export function setBand(on: boolean): void {
  const s = useStore.getState()
  useStore.setState({ tracks: s.tracks.map(t => (t.practicePart ? t : { ...t, muted: !on })) })
}

/** What you hear with your piano: the piano alone, Focus (the bass and drums
 *  too, as Focus mode outside practice mode), or the whole band */
export type BandPreset = 'piano' | 'focus' | 'band'
const focusHeard = (t: { isDrum: boolean; group?: string; program?: number }) => focusRole(t) !== 'off'
export function setBandPreset(p: BandPreset): void {
  if (usePractice.getState().songReady) rememberChoices({ band: p })
  const s = useStore.getState()
  useStore.setState({ tracks: s.tracks.map(t => (t.practicePart ? t : { ...t, muted: p === 'piano' ? true : p === 'band' ? false : !focusHeard(t) })) })
}
/** The preset the band's mutes match, or null when you've muted tracks your own way */
export function bandPreset(tracks: { practicePart?: boolean; muted: boolean; isDrum: boolean; group?: string; program?: number }[]): BandPreset | null {
  const band = tracks.filter(t => !t.practicePart)
  if (band.every(t => t.muted)) return 'piano'
  if (band.every(t => !t.muted)) return 'band'
  if (band.every(t => t.muted === !focusHeard(t))) return 'focus'
  return null
}

// ── Keeping the session sound ────────────────────────────────────────────────
// Another song while practising: a fresh session if it's ready (with the
// defaults); if it isn't, practice mode stays open, saying why, so you can pick
// another from the playlist. The keyboard unplugged: the song pauses.
useStore.subscribe((s, prev) => {
  if (s.midi === prev.midi || !usePractice.getState().active) return
  const gate = practiceGate()
  if (gate.ok) {
    useStore.getState().setPracticeTracks(true, gate.hands)
    usePractice.setState({ onlyHand: gate.onlyHand, songReady: true, notReady: null })
    useStore.setState({ keyboardSize: 88, keyboardOctave: 0 })
    applySongDefaults()
    applySound()
  } else {
    if (useStore.getState().practiceActive) useStore.getState().setPracticeTracks(false)
    usePractice.setState({ songReady: false, onlyHand: null, notReady: gate.reason === 'no-song' ? null : gate.reason })
  }
})
// always 88 keys in practice mode, whatever plugs in (Orfeo sizes the on-screen
// keyboard to a new USB keyboard outside practice mode)
useStore.subscribe((s, prev) => {
  if (usePractice.getState().active && (s.keyboardSize !== prev.keyboardSize || s.keyboardOctave !== prev.keyboardOctave)
    && (s.keyboardSize !== 88 || s.keyboardOctave !== 0)) useStore.setState({ keyboardSize: 88, keyboardOctave: 0 })
})
useMidiSettings.subscribe((m, prev) => {
  if (m.devices === prev.devices || !usePractice.getState().active) return
  if (!keyboardConnected() && useStore.getState().playbackState === 'playing') useStore.setState({ playbackState: 'paused' })
})

// ── Each way of playing's rules for tempo and the metronome ──────────────────
// Wait for me: the song's own tempo, no metronome (the song waits, so there is
// no beat to keep). Performance: level 1 anything; level 2 no metronome and at
// most 20 % slower; level 3 the song's own tempo, nothing else.
export function tempoLimits(): { min: number; max: number } {
  const p = usePractice.getState()
  if (p.way === 'wait') return { min: 100, max: 100 }
  if (p.way === 'perform' && p.level === 3) return { min: 100, max: 100 }
  if (p.way === 'perform' && p.level === 2) return { min: 80, max: 100 }
  return { min: 25, max: 200 }
}
export function metronomeAllowed(): boolean {
  const p = usePractice.getState()
  return p.way === 'practise' || (p.way === 'perform' && p.level === 1)
}
/** The song's speed in percent of its own tempo */
export function speedPercent(): number {
  const s = useStore.getState()
  return s.originalBpm > 0 ? Math.round((s.bpm / s.originalBpm) * 100) : 100
}
export function setSpeedPercent(pct: number): void {
  const s = useStore.getState()
  const { min, max } = tempoLimits()
  const p = Math.max(min, Math.min(max, Math.round(pct)))
  s.setBpm(s.originalBpm * p / 100)
}
export function applyWayRules(): void {
  if (!usePractice.getState().active) return
  const pct = speedPercent(), { min, max } = tempoLimits()
  if (pct < min || pct > max) setSpeedPercent(pct)
  if (!metronomeAllowed() && useStore.getState().metronomeEnabled) useStore.getState().setMetronomeEnabled(false)
}
// ── The playbar in practice mode: never in Split, where the notes fall straight
// onto the keyboard (more room for both halves); in the piano roll view its own
// switch (Settings › Practice, and the strip) ──────────────────────────────────
function applyPlaybar(): void {
  const p = usePractice.getState(), s = useStore.getState()
  const want = !p.active ? null : p.view === 'split' ? false : p.view === 'roll' ? s.practicePlaybar : null
  if (s.playbarOverride !== want) useStore.setState({ playbarOverride: want })
}
useStore.subscribe((s, prev) => { if (s.practicePlaybar !== prev.practicePlaybar) applyPlaybar() })

usePractice.subscribe((p, prev) => {
  // what you choose while practising is kept for next time
  if (p.active && p.songReady && prev.active && (p.way !== prev.way || p.hand !== prev.hand || p.waitOn !== prev.waitOn
    || p.hearMine !== prev.hearMine || p.level !== prev.level || p.view !== prev.view)) {
    rememberChoices({ way: p.way, hand: p.hand, waitOn: p.waitOn, hearMine: p.hearMine, level: p.level, view: p.view })
  }
  if (p.active !== prev.active || p.view !== prev.view) applyPlaybar()
  if (p.way !== prev.way || p.level !== prev.level) applyWayRules()
  if (p.way !== prev.way || p.hand !== prev.hand || p.hearMine !== prev.hearMine || (p.active && !prev.active)) applySound()
})
