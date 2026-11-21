import { create } from 'zustand'
import { useStore } from '../store'
import { useMidiSettings } from '../store/midiSettings'
import { songPracticeState, PRACTICE_PREP_VISIBLE, type SongPractice } from '../utils/practiceReadiness'
import type { KeyboardSize } from '../types'
import type { DetectedKey } from '../utils/keyDetection'
import { NES } from '../utils/noteEditorState'

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
}

export const usePractice = create<PracticeUi>(() => ({
  active: false, way: 'practise', hand: 'R', waitOn: true, level: 1, view: 'roll', hearMine: false, ramp: false, onlyHand: null,
}))

// ── May practice mode open? ──────────────────────────────────────────────────
export type GateReason = 'off' | 'no-keyboard' | 'no-song' | 'editing' | 'no-piano' | 'too-many' | 'prepare'

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

export function enterPractice(): boolean {
  const gate = practiceGate()
  if (!gate.ok) return false
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
  if (!PRACTICE_SIZES.includes(s.keyboardSize)) useStore.setState({ keyboardSize: 88, keyboardOctave: 0 })
  useStore.getState().setPracticeTracks(true, gate.hands)
  usePractice.setState({ active: true, onlyHand: gate.onlyHand })
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
  usePractice.setState({ active: false, onlyHand: null })
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
  leavePractice()
  if (!first) return
  const s = useStore.getState()
  s.soloTrackForEdit(first.index, { keepPlayhead: true, also: pianos.map(p => p.index) })
  NES.reassignHandsMode = true
  NES.onReassignHandsModeChange?.()
  s.setNoteEditorActive(true)
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

// ── Keeping the session sound ────────────────────────────────────────────────
// Another song while practising: it's a fresh session if the song is ready,
// otherwise practice mode ends. The keyboard unplugged: the song pauses.
useStore.subscribe((s, prev) => {
  if (s.midi === prev.midi || !usePractice.getState().active) return
  if (!s.midi) { leavePractice(); return }
  const gate = practiceGate()
  if (gate.ok) { useStore.getState().setPracticeTracks(true, gate.hands); usePractice.setState({ onlyHand: gate.onlyHand }); applySound() }
  else leavePractice()
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
  if (p.active !== prev.active || p.view !== prev.view) applyPlaybar()
  if (p.way !== prev.way || p.level !== prev.level) applyWayRules()
  if (p.way !== prev.way || p.hand !== prev.hand || p.hearMine !== prev.hearMine || (p.active && !prev.active)) applySound()
})
