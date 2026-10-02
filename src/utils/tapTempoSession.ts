import { useStore } from '../store'
import { t } from './i18n'
import { fitTaps, MIN_TAPS } from './tapTempoFit'
import { refineToNotes, matchFileBeat } from './tapRefine'
import { applyTempoCorrection, buildSegment, upsertSegment, shiftDownbeat, nudgeSegment, fileGridOf, sigAt, type TempoSegment } from './tempoCorrection'
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

// A new tap replaces everything from its start onward; adjusting a kept
// tempo replaces just that one and leaves the ones after it alone.
function withSegment(seg: TempoSegment, editIndex: number | null | undefined) {
  const base = baseCorrection()
  if (editIndex == null || !base?.segments[editIndex]) return upsertSegment(base, seg)
  const segments = base.segments.map((x, i) => (i === editIndex ? seg : x)).sort((a, b) => a.start - b.start)
  return { segments }
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
  // Plays from exactly where the playhead is — the user parks it where the
  // new tempo should start and joins in whenever they've locked in.
  if (s.playbackState !== 'playing') useStore.setState({ playbackState: 'playing' })
  s.setTapSession({ phase: 'armed', start, taps: [], segment: null, prevMetronome: s.metronomeEnabled, message: null, lastTapAt: 0, editIndex: null, listenMetronome: true })
  // the old grid's clicks would only fight the music while finding the beat
  s.setMetronomeEnabled(false)
}

export function registerTap() {
  const ses = useStore.getState().tapSession
  if (!ses || ses.phase === 'preview') return
  update({ phase: 'tapping', taps: [...ses.taps, heardTime()], message: null, lastTapAt: performance.now() })
}

function preview(seg: TempoSegment) {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!s.midi || !ses) return
  s.setBeatGrid(applyTempoCorrection(s.midi, withSegment(seg, ses.editIndex)))
  s.setMetronomeEnabled(ses.listenMetronome !== false)
  update({ phase: 'preview', segment: seg, message: null, ...(seg.snap ? {} : { freeSegment: seg }) })
}

// Panel switch: hear the new grid's clicks while listening back, or not
export function toggleListenMetronome() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses) return
  const on = ses.listenMetronome === false
  update({ listenMetronome: on })
  if (ses.phase === 'preview') s.setMetronomeEnabled(on)
}

// Re-open a kept tempo in the panel to listen and fine-tune it
export function editKeptTempo(index: number) {
  const s = useStore.getState()
  const seg = baseCorrection()?.segments[index]
  if (!s.midi || !seg || s.tapSession) return
  s.setTapSession({ phase: 'preview', start: seg.start, taps: [], segment: seg, prevMetronome: s.metronomeEnabled, message: null, lastTapAt: 0, editIndex: index, listenMetronome: true, snapped: false, fileMatch: seg.snap ? seg.snap.ratio : null, freeSegment: seg.snap ? { ...seg, snap: undefined } : seg })
  preview(seg)
}

export function finishTapping() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses || ses.phase === 'preview' || !s.midi) return
  // 'bar' mode: every tap is the 1 of a bar, so one tap gap = one bar
  const perBar = s.tapTempoMode === 'bar'
  const beatsPerBar = perBar ? Math.max(1, sigAt(fileGridOf(s.midi).timeSigMap, ses.start).num) : 1
  const fit = fitTaps(ses.taps, perBar ? { minBpm: 20 / beatsPerBar } : {})
  if (!fit) {
    if (ses.taps.length < MIN_TAPS) update({ phase: 'armed', message: t`Need at least 4 taps`, lastTapAt: 0 })
    else update({ phase: 'armed', taps: [], message: t`Couldn't find a steady beat — try again`, lastTapAt: 0 })
    return
  }
  // Snap onto the song's own notes over the next 30 s (or up to the next
  // kept tempo when adjusting one), then check whether the result sits
  // exactly on the file's own beats — if so its bar lines are right and
  // only its tempo number is off (offered as the default).
  const later = (baseCorrection()?.segments ?? []).filter(x => x.start > ses.start + 1e-6).map(x => x.start)
  const to = Math.min(ses.start + 30, s.midi.duration, ses.editIndex != null && later.length ? Math.min(...later) : Infinity)
  const ref = refineToNotes(s.midi, { period: fit.period / beatsPerBar, anchor: fit.anchor }, ses.start, to)
  const free = buildSegment(s.midi, ses.start, ref)
  const fileMatch = matchFileBeat(fileGridOf(s.midi).beats, ref.period, ref.anchor)
  update({ snapped: ref.snapped, fileMatch, freeSegment: free })
  preview(fileMatch != null ? fileSegment(free, fileMatch) : free)
}

function fileSegment(free: TempoSegment, ratio: number): TempoSegment {
  const s = useStore.getState()
  const sig = s.midi ? sigAt(fileGridOf(s.midi).timeSigMap, free.start) : { num: free.beatsPerBar, den: free.den }
  return { ...free, beatsPerBar: sig.num, den: sig.den, snap: { ratio, barShift: 0 } }
}

// Panel choice when the taps match the file's own beats: keep the file's bar
// lines (only the tempo number changes) or use the grid built from the taps
export function setUseFileGrid(on: boolean) {
  const ses = useStore.getState().tapSession
  if (ses?.phase !== 'preview' || !ses.freeSegment) return
  if (on && ses.fileMatch != null) preview(fileSegment(ses.freeSegment, ses.fileMatch))
  else preview(ses.freeSegment)
}

// Clicking the pad while tapping = "I'm done": show the result and pause, so
// the user can read the panel and then press Space to listen back.
export function finishFromPad() {
  const ses = useStore.getState().tapSession
  if (!ses || ses.phase === 'preview') return
  finishTapping()
  if (useStore.getState().tapSession?.phase === 'preview') useStore.setState({ playbackState: 'paused' })
}

export function nudgePreview(sec: number) {
  const ses = useStore.getState().tapSession
  if (ses?.phase === 'preview' && ses.segment) preview(nudgeSegment(ses.segment, sec))
}

export function fmtSongTime(sec: number): string {
  const m = Math.floor(sec / 60), s = sec - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

// Every saved change shows up in File Info → Orfeo History
function logTempoEvent(summary: string) {
  const path = (useStore.getState().midi as any)?._filePath as string | undefined
  if (path) window.electronAPI?.logFileEvent?.(path, 'tempo', summary)?.catch?.(() => {})
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
  s.setSongCorrection(s.songKey, withSegment(ses.segment, ses.editIndex))
  logTempoEvent((ses.editIndex != null ? t`Tap Tempo: adjusted to ` : t`Tap Tempo: `) + t`${(60 / ses.segment.period).toFixed(1)} bpm from ${fmtSongTime(ses.segment.start)}`)
  end()
}

export function tapAgain() {
  const ses = useStore.getState().tapSession
  useStore.getState().reapplyCorrection()
  // the old grid's clicks would fight the music while re-tapping
  if (ses) useStore.getState().setMetronomeEnabled(false)
  update({ phase: 'armed', taps: [], segment: null, message: null, lastTapAt: 0, snapped: false, fileMatch: null, freeSegment: null })
}

export function cancelTap() {
  if (!useStore.getState().tapSession) return
  useStore.getState().reapplyCorrection()
  end()
}

export function resetSongTempo() {
  const s = useStore.getState()
  if (!s.songKey || !s.tempoCorrections[s.songKey]) return
  s.setSongCorrection(s.songKey, null)
  logTempoEvent(t`Tap Tempo: reset to the file's own tempo`)
}

export function removeTappedTempo(index: number) {
  const s = useStore.getState()
  const c = baseCorrection()
  if (!s.songKey || !c || !c.segments[index]) return
  const seg = c.segments[index]
  s.setSongCorrection(s.songKey, { segments: c.segments.filter((_, j) => j !== index) })
  logTempoEvent(t`Tap Tempo: removed ${(60 / seg.period).toFixed(1)} bpm from ${fmtSongTime(seg.start)}`)
}
