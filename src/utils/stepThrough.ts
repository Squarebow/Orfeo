// ── Step through a song one played event at a time (→ / ←) ────────────────────
// → jumps to the next moment any note on the roll starts — a single note or a
// whole chord — sounds it, lights it and moves the playhead there; ← goes
// back one. No tempo, no loop: the player's own pace. Shift + arrow jumps a
// bar. Built for learning fast solos and transcribing, including MIDI made
// from audio, whose "chords" start a few ms apart: notes starting within
// GROUP_SEC of the first note of a step count as that one step.

import { useStore } from '../store'
import { NES } from './noteEditorState'
import { amberHex } from './hitEffectQueue'
import { isShown } from './trackShown'

const GROUP_SEC = 0.03
const EPS = 1e-4
const MIN_MS = 120
const MAX_MS = 2500

interface StepNote { midi: number; velocity: number; duration: number; channel: number; color: string }
interface Step { time: number; notes: StepNote[] }

function activeMidi(): any {
  return (NES.dirty && NES.editMidi) ? NES.editMidi : useStore.getState().midi
}

// ── Steps for the current song + mute/solo/eye state, rebuilt only when either
// changes. Steps follow what's on the roll (trackShown.ts): a hidden, muted or
// soloed-out track — the bass and drums under Focus, a melody you play along
// to — never lands a step. Drums are left out anyway: they'd turn every
// hi-hat into a step. ─────────────────────────────────────────────────────
let _cache: { midi: unknown; sig: string; steps: Step[] } | null = null

function audibleSignature(): string {
  return useStore.getState().tracks.map(t => (t.muted ? 'm' : t.solo ? 's' : '.') + (t.visible ? 'v' : 'h')).join('')
}

export function buildSteps(midi: any, tracks: ReturnType<typeof useStore.getState>['tracks']): Step[] {
  const hasSolo = tracks.some(t => t.solo)
  const all: (StepNote & { time: number })[] = []
  for (const track of midi?.tracks ?? []) {
    if (track.isDrum) continue
    const ts = tracks.find(t => t.index === track.index)
    if (!ts || !isShown(ts, hasSolo)) continue
    for (const n of track.notes) {
      all.push({ time: n.time, midi: n.midi, velocity: n.velocity, duration: n.duration, channel: track.channel, color: ts.color ?? amberHex() })
    }
  }
  all.sort((a, b) => a.time - b.time)
  const steps: Step[] = []
  for (const n of all) {
    const last = steps[steps.length - 1]
    if (last && n.time - last.time <= GROUP_SEC) last.notes.push(n)
    else steps.push({ time: n.time, notes: [n] })
  }
  return steps
}

function steps(): Step[] {
  const midi = activeMidi()
  const sig = audibleSignature()
  if (!_cache || _cache.midi !== midi || _cache.sig !== sig) {
    _cache = { midi, sig, steps: buildSteps(midi, useStore.getState().tracks) }
  }
  return _cache.steps
}

// First step at or after `t` (binary search; steps are time-ordered)
function indexAtOrAfter(list: Step[], t: number): number {
  let lo = 0, hi = list.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].time < t) lo = mid + 1; else hi = mid }
  return lo
}

// ── Which step an arrow press lands on, from the playhead at `now` ──────────
export function targetStep(list: Step[], barStarts: number[], now: number, dir: 1 | -1, byBar: boolean): Step | null {
  if (!list.length) return null
  if (byBar && barStarts.length) {
    // Next bar: the first event of the next bar that has one. Previous bar:
    // the first event of the bar before the one the playhead is in.
    const barIdx = (() => { let i = 0; while (i + 1 < barStarts.length && barStarts[i + 1] <= now + EPS) i++; return i })()
    if (dir === 1) {
      for (let b = barIdx + 1; b < barStarts.length; b++) {
        const s = list[indexAtOrAfter(list, barStarts[b] - EPS)]
        if (s) return s
      }
      return null
    }
    const firstInBar = list[indexAtOrAfter(list, barStarts[barIdx] - EPS)]
    const startOfBar = firstInBar && firstInBar.time < now - EPS ? barIdx : barIdx - 1
    if (startOfBar < 0) return list[0].time < now - EPS ? list[0] : null
    return list[indexAtOrAfter(list, barStarts[startOfBar] - EPS)] ?? null
  }
  if (dir === 1) return list[indexAtOrAfter(list, now + EPS)] ?? null
  const i = indexAtOrAfter(list, now - EPS) - 1
  return i >= 0 ? list[i] : null
}

// ── Prepare General MIDI's track instruments once per song (Samples sets
// each channel's instrument itself on the first note) ─────────────────────
let _warmedFor: unknown = null

export function stepEvents(dir: 1 | -1, byBar = false): boolean {
  const s = useStore.getState()
  if (!s.midi) return false
  const list = steps()
  const step = targetStep(list, s.barStarts, s.currentTime, dir, byBar)
  if (!step) return false

  if (s.audioEngine === 'gm' && _warmedFor !== s.midi) {
    _warmedFor = s.midi
    ;(window as any).__orfeoWarmupEditChannels?.()
  }

  // Playing: stop there (the song continues from this step on Play)
  useStore.setState(s.playbackState === 'playing'
    ? { currentTime: step.time, playbackState: 'paused' }
    : { currentTime: step.time })

  const ratio = s.bpm / s.originalBpm || 1
  const transpose = s.detectedKey?.transpose ?? 0
  const play = (window as any).__orfeoPlayNote as ((m: number, v: number, d: number, ch?: number, visual?: boolean, color?: string) => void) | undefined
  for (const n of step.notes) {
    const durMs = Math.max(MIN_MS, Math.min(MAX_MS, (n.duration / ratio) * 1000))
    play?.(n.midi + transpose, n.velocity, durMs, n.channel, true, n.color)
  }
  return true
}
