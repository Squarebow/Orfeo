import { useStore } from '../store'
import { t } from './i18n'
import { fitTaps, MIN_TAPS } from './tapTempoFit'
import { applyTempoCorrection, buildSegment, upsertSegment, shiftDownbeat, lastIndexAtOrBefore, type TempoSegment } from './tempoCorrection'
import type { TapSession, PlaybackState } from '../types'

// ── Tap Tempo session — arm → tap → preview → keep/cancel. Non-React so the
// pad, App's Space handler and the hardware-MIDI input can all drive it.
// Taps are stamped in HEARD song time: the playhead minus the output
// device's delay (same compensation the keyboard key lights use), so a grid
// built from taps lines up with what the user actually heard. The delay is
// supplied by the pad (setTapLatencyProvider) so this module never imports
// the audio engines itself. ──────────────────────────────────────────────

let latencyProvider: () => number = () => 0
export function setTapLatencyProvider(fn: () => number) { latencyProvider = fn }

const JUMP_FORWARD_SEC = 1.0
// generous: the GM engine's clock handover after a rebuild can step the
// playhead back a little on a large file
const JUMP_BACK_SEC = 0.15
// The playhead only advances once per animation frame; a tap between frames
// is extrapolated from the last tick, capped so a stalled clock can't run away
const MAX_EXTRAPOLATE_SEC = 0.05
let lastClockTick = 0
export function noteClockTick(at: number = performance.now()) { lastClockTick = at }

function heardTime(): number {
  const s = useStore.getState()
  const ratio = s.originalBpm > 0 ? s.bpm / s.originalBpm : 1
  const sinceTick = s.playbackState === 'playing' && lastClockTick > 0
    ? Math.min(MAX_EXTRAPOLATE_SEC, Math.max(0, (performance.now() - lastClockTick) / 1000)) * ratio
    : 0
  return Math.max(0, s.currentTime + sinceTick - latencyProvider() * ratio)
}

function baseCorrection() {
  const s = useStore.getState()
  return s.songKey ? s.tempoCorrections[s.songKey] ?? null : null
}

function update(patch: Partial<TapSession>) {
  const ses = useStore.getState().tapSession
  if (ses) useStore.getState().setTapSession({ ...ses, ...patch })
}

function end() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses) return
  s.setMetronomeEnabled(ses.prevMetronome)
  s.setTapSession(null)
}

export function isTapCapturing(): boolean {
  const ses = useStore.getState().tapSession
  return !!ses && ses.phase !== 'preview'
}

// A seek, loop wrap or stop while tapping means taps from two different
// places in the song — never fit those together.
export function tappingInterrupted(
  prev: { currentTime: number; playbackState: PlaybackState | string },
  next: { currentTime: number; playbackState: PlaybackState | string },
): boolean {
  if (next.playbackState !== 'playing' && prev.playbackState === 'playing') return true
  return next.currentTime < prev.currentTime - JUMP_BACK_SEC || next.currentTime > prev.currentTime + JUMP_FORWARD_SEC
}

export function armTapSession() {
  const s = useStore.getState()
  if (!s.midi || !s.songKey || s.noteEditorActive || s.tapSession) return
  const start = s.currentTime
  if (s.playbackState !== 'playing') {
    // ~2-bar run-in so the pulse is audible before the first tap
    const bars = ((s.midi as any)._barTimes as number[] | undefined) ?? []
    const i = lastIndexAtOrBefore(bars, start)
    const runIn = i >= 0 ? bars[Math.max(0, i - 2)] : Math.max(0, start - 4)
    useStore.setState({ currentTime: runIn })
    useStore.setState({ playbackState: 'playing' })
  }
  s.setTapSession({ phase: 'armed', start, taps: [], segment: null, prevMetronome: s.metronomeEnabled, message: null, lastTapAt: 0 })
}

export function registerTap() {
  const ses = useStore.getState().tapSession
  if (!ses || ses.phase === 'preview') return
  update({ phase: 'tapping', taps: [...ses.taps, heardTime()], message: null, lastTapAt: performance.now() })
}

function preview(seg: TempoSegment) {
  const s = useStore.getState()
  if (!s.midi) return
  s.setBeatGrid(applyTempoCorrection(s.midi, upsertSegment(baseCorrection(), seg)))
  s.setMetronomeEnabled(true)
  update({ phase: 'preview', segment: seg, message: null })
}

export function finishTapping() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses || ses.phase === 'preview' || !s.midi) return
  const fit = fitTaps(ses.taps)
  if (!fit) {
    if (ses.taps.length < MIN_TAPS) update({ phase: 'armed', message: t`Need at least 4 taps`, lastTapAt: 0 })
    else update({ phase: 'armed', taps: [], message: t`Couldn't find a steady beat — try again`, lastTapAt: 0 })
    return
  }
  preview(buildSegment(s.midi, ses.start, fit))
}

// A seek / loop wrap / stop mid-tapping: preview what was tapped before it if
// that fits, otherwise end the session (spec §3.2) — never leave it armed
// with a stale start point.
export function interruptTapping() {
  const ses = useStore.getState().tapSession
  if (!ses || ses.phase === 'preview') return
  if (ses.taps.length >= MIN_TAPS) finishTapping()
  if (useStore.getState().tapSession?.phase !== 'preview') cancelTap()
}

export function shiftPreviewDownbeat(dir: 1 | -1) {
  const ses = useStore.getState().tapSession
  if (ses?.phase === 'preview' && ses.segment) preview(shiftDownbeat(ses.segment, dir))
}

export function keepTap() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (ses?.phase !== 'preview' || !ses.segment || !s.songKey) return
  s.setSongCorrection(s.songKey, upsertSegment(baseCorrection(), ses.segment))
  end()
}

export function tapAgain() {
  const ses = useStore.getState().tapSession
  useStore.getState().reapplyCorrection()
  // the old grid's clicks would fight the music while re-tapping
  if (ses) useStore.getState().setMetronomeEnabled(ses.prevMetronome)
  update({ phase: 'armed', taps: [], segment: null, message: null, lastTapAt: 0 })
}

export function cancelTap() {
  if (!useStore.getState().tapSession) return
  useStore.getState().reapplyCorrection()
  end()
}

export function resetSongTempo() {
  const s = useStore.getState()
  if (s.songKey) s.setSongCorrection(s.songKey, null)
}
