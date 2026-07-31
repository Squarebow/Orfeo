import { useStore } from '../store'

// ── Shared hit-effect trigger queue (Phase 2: Note-Hit Visual Effects) ───────
// lightKey() (useAudioEngine.ts / useSamplesEngine.ts) is the single existing
// trigger point for "a note just sounded" — same moment used for the key
// glow. Reusing it here means the hit effect can never drift out of sync
// with audio: there's no second clock, just one more subscriber to the same
// event. PianoRoll drains this once per frame and spawns the configured
// effect at the corresponding key's X position and the current hit line's Y.
//
// Module-level plain array, not Zustand state — this can fire many times per
// frame on a dense chord, and doesn't need to trigger a React re-render on
// every push (matches the existing _lightSchedule/_keyTimers convention).

export interface HitEffectEvent {
  midi: number
  color: string
}

let _queue: HitEffectEvent[] = []

// Called from lightKey() itself, so every lighting call site (scheduled
// playback notes and manual click-preview) is covered automatically. No-ops
// entirely when the setting is off — "skip all effect instantiation, not
// just hide it" — so there's a single gate here rather than one at every
// call site.
export function pushHitEffect(midi: number, color: string): void {
  if (!useStore.getState().hitEffectsEnabled) return
  _queue.push({ midi, color })
}

// Drained once per PianoRoll frame — returns and clears all pending events.
export function drainHitEffects(): HitEffectEvent[] {
  if (_queue.length === 0) return _queue
  const drained = _queue
  _queue = []
  return drained
}
