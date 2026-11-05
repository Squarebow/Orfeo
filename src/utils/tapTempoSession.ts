import { useStore, currentCorrection } from '../store'
import { t } from './i18n'
import { fitTaps, MIN_TAPS } from './tapTempoFit'
import { refineToNotes, matchFileBeat } from './tapRefine'
import { applyTempoCorrection, buildSegment, upsertSegment, shiftDownbeat, nudgeSegment, fileGridOf, sigAt, nearestIndex, parseBarPattern, formatBarPattern, type TempoSegment } from './tempoCorrection'
import { copiedSegment, matchSongs, SAME_SONG } from './copyBars'
import { findRepeats, type RepeatHint } from './repeatHint'
import { parseMidiBuffer } from './midiParser'
import { songKey as fileKey } from './songIdentity'
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

// Only a real jump (scroll / seek / loop wrap) counts — the audio clock can
// settle back a few hundred ms right after playback starts, and wheel-scrub
// blips playback through 'paused' for a few ms; neither is an interruption.
const JUMP_SEC = 1.0
const NEAR_ORIGINAL = 0.03
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
  return currentCorrection(useStore.getState())
}

// A new tap replaces everything from its start onward; adjusting a kept
// tempo replaces just that one and leaves the ones after it alone.
function withSegment(seg: TempoSegment, editIndex: number | null | undefined) {
  const base = baseCorrection()
  if (useStore.getState().tapSession?.insert) {
    const others = (base?.segments ?? []).filter(x => Math.abs(x.start - seg.start) > 1e-6)
    return { segments: [...others, seg].sort((a, b) => a.start - b.start) }
  }
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
  return Math.abs(next.currentTime - prev.currentTime) > JUMP_SEC
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

// File Info's "Rebuild tempo": tap the whole song's tempo from the top. Kept
// tempos stay until Keep — a tap from the start replaces them all, and Cancel
// leaves them as they were. A playing song stops first, so the engines see the
// jump back to the start before they're started again.
const RESTART_MS = 60

export function rebuildSongTempo() {
  const s = useStore.getState()
  if (!s.midi || !s.songKey || s.noteEditorActive || s.tapSession) return
  if (!s.tapTempoPadEnabled) s.setTapTempoPadEnabled(true)
  if (s.playbackState === 'playing') {
    useStore.setState({ currentTime: 0, playbackState: 'paused' })
    setTimeout(armTapSession, RESTART_MS)
  } else {
    useStore.setState({ currentTime: 0 })
    armTapSession()
  }
}

// Panel: the bar lengths from this tempo's start on, as typed. False if the
// text isn't a pattern.
export function setBarPattern(text: string): boolean {
  const ses = useStore.getState().tapSession
  const pattern = parseBarPattern(text)
  if (ses?.phase !== 'preview' || !ses.segment || ses.segment.snap || ses.segment.map || !pattern) return false
  const { pattern: _old, ...seg } = ses.segment
  preview({ ...seg, beatsPerBar: pattern[0], ...(pattern.length > 1 ? { pattern } : {}) })
  return true
}

// Panel hint: does the music from this tempo's start on repeat over a length the
// bars on screen can't fit? Read on the tapped beat, even while the file's bar
// lines are chosen, up to the next kept tempo when that one stays.
export function repeatHintsNow(): RepeatHint[] {
  const s = useStore.getState()
  const ses = s.tapSession
  const seg = ses?.freeSegment ?? ses?.segment
  if (ses?.phase !== 'preview' || !s.midi || !seg || seg.map) return []
  const stays = ses.insert || ses.editIndex != null
  const later = stays ? (baseCorrection()?.segments ?? []).filter(x => x.start > seg.start + 1e-6).map(x => x.start) : []
  const limit = Math.min(s.midi.duration, ...later)
  const beats: number[] = []
  const first = Math.ceil((seg.start - seg.anchor) / seg.period - 1e-6)
  for (let k = first; seg.anchor + k * seg.period < limit; k++) beats.push(seg.anchor + k * seg.period)
  const cycle = (seg.pattern ?? [seg.beatsPerBar]).reduce((a, b) => a + b, 0)
  return findRepeats(s.midi, beats, seg.anchor, cycle)
}

// The hint's button: bars from the taps, in the suggested lengths
export function tryRepeatHint(hint: RepeatHint) {
  setUseFileGrid(false)
  setBarPattern(hint.pattern.join(' '))
}

// TAP menu: new bars from the beat under the playhead, same tempo, no tapping.
// What comes after keeps its own bars, so sections can be set in any order.
export function changeBarsFromHere() {
  const s = useStore.getState()
  const beats = ((s.midi as any)?._beatTimes ?? []) as number[]
  if (!s.midi || !s.songKey || s.noteEditorActive || s.tapSession || beats.length < 2) return
  const i = Math.min(nearestIndex(beats, s.currentTime), beats.length - 2)
  const start = beats[i]
  const sig = sigAt(((s.midi as any)._timeSigMap ?? []), start)
  if (!s.tapTempoPadEnabled) s.setTapTempoPadEnabled(true)
  useStore.setState({ currentTime: start, ...(s.playbackState === 'playing' ? { playbackState: 'paused' as const } : {}) })
  const seg: TempoSegment = { start, anchor: start, period: beats[i + 1] - start, beatsPerBar: sig.num, den: sig.den }
  s.setTapSession({ phase: 'preview', start, taps: [], segment: seg, prevMetronome: s.metronomeEnabled, message: null, lastTapAt: 0, editIndex: null, insert: true })
  preview(seg)
}

// File Info's "Copy bars": hear another version's bars on this song, then Keep
// or Cancel. Replaces every kept tempo, like Rebuild tempo.
export function copyBarsFrom(file: ArrayBuffer, name: string): boolean {
  const s = useStore.getState()
  if (!s.midi) return false
  // the source's own kept tempos count: a song fixed by hand can pass them on
  const parsed = parseMidiBuffer(file, name, '')
  const kept = s.tempoCorrections[fileKey(file)]
  const source = kept ? applyTempoCorrection(parsed, kept) : parsed
  const match = matchSongs(source, s.midi)
  const seg = match && match.share >= SAME_SONG ? copiedSegment(source, s.midi, match) : null
  if (!seg) return false
  previewCopiedBars(seg, name)
  return true
}

function previewCopiedBars(seg: TempoSegment, from: string) {
  const s = useStore.getState()
  if (!s.midi || !s.songKey || s.noteEditorActive || s.tapSession) return
  if (!s.tapTempoPadEnabled) s.setTapTempoPadEnabled(true)
  useStore.setState({ currentTime: 0, ...(s.playbackState === 'playing' ? { playbackState: 'paused' as const } : {}) })
  s.setTapSession({ phase: 'preview', start: 0, taps: [], segment: seg, prevMetronome: s.metronomeEnabled, message: null, lastTapAt: 0, editIndex: null, copiedFrom: from })
  preview(seg)
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
  // the file's own tempo where the tap starts — same tempo within ±3% means
  // the file was right all along ("Original is fine")
  const fileMap = fileGridOf(s.midi).tempoMap
  let fileBpm = fileMap[0]?.bpm ?? 0
  for (const e of fileMap) { if (e.time <= ses.start + 1e-6) fileBpm = e.bpm; else break }
  const nearOriginal = fileMatch === 1 || (fileBpm > 0 && Math.abs((60 / ref.period) / fileBpm - 1) <= NEAR_ORIGINAL)
  update({ snapped: ref.snapped, fileMatch, freeSegment: free, nearOriginal })
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

// A scroll / seek / loop wrap mid-tapping: taps from two places in the song
// are never fitted together. With enough taps before the jump, show that
// result; otherwise stay ready to tap and move the start point to where the
// playhead now is (scrolling to the right spot is part of getting ready —
// it must never close the panel).
export function interruptTapping() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses || ses.phase === 'preview') return
  if (ses.taps.length >= MIN_TAPS) finishTapping()
  if (useStore.getState().tapSession?.phase === 'preview') return
  update({ phase: 'armed', start: useStore.getState().currentTime, taps: [], message: null, lastTapAt: 0 })
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
  if (ses.copiedFrom) logTempoEvent(t`Bars copied from ${ses.copiedFrom}`)
  else if (ses.insert) logTempoEvent(t`Bars changed to ${formatBarPattern(ses.segment)} from ${fmtSongTime(ses.segment.start)}`)
  else logTempoEvent((ses.editIndex != null ? t`Tap Tempo: adjusted to ` : t`Tap Tempo: `) + t`${(60 / ses.segment.period).toFixed(1)} bpm from ${fmtSongTime(ses.segment.start)}`)
  end()
}

// "Original is fine": the file's own tempo is right — keep no correction (or
// drop the kept one being adjusted) and stop warning about this song.
export function keepOriginal() {
  const s = useStore.getState()
  const ses = s.tapSession
  if (!ses || !s.songKey) return
  const base = baseCorrection()
  if (ses.editIndex != null && base?.segments[ses.editIndex]) {
    s.setSongCorrection(s.songKey, { segments: base.segments.filter((_, i) => i !== ses.editIndex) })
  } else s.reapplyCorrection()
  s.dismissTempoWarning(s.songKey)
  logTempoEvent(t`Tap Tempo: kept the file's own tempo`)
  end()
}

export function tapAgain() {
  const ses = useStore.getState().tapSession
  useStore.getState().reapplyCorrection()
  // the old grid's clicks would fight the music while re-tapping
  if (ses) useStore.getState().setMetronomeEnabled(false)
  update({ phase: 'armed', taps: [], segment: null, message: null, lastTapAt: 0, snapped: false, fileMatch: null, freeSegment: null, nearOriginal: false })
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
