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

// ── Resolve --text-amber to a real hex string, once, cached ──────────────────
// Events pushed here end up in PianoRoll's parseInt(hit.color.replace('#',''), 16)
// for PixiJS's numeric fill color — a var() string can't be parsed as hex there,
// so the "no track color" fallback used by useAudioEngine.ts / useSamplesEngine.ts
// resolves the token to a literal hex once instead of hardcoding it a second time.
// Same rationale as PianoRoll.tsx's resolvePianoRollColorsFromCSS().
let _amberHex: string | null = null
export function amberHex(): string {
  if (!_amberHex) {
    _amberHex = getComputedStyle(document.documentElement).getPropertyValue('--text-amber').trim() || '#e8a027'
  }
  return _amberHex
}

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
