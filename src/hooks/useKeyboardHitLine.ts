import { useStore } from '../store'

// ── useKeyboardHitLine — viewport-space Y of the keyboard's top edge ────────
// Returns null when the playbar is visible (default — feature off, no
// measurement loop even runs, see Keyboard.tsx) or before the first
// measurement. PianoRoll's imperative PixiJS draw loop reads the same store
// fields directly (its existing `storeRef.current` pattern — hooks can't be
// called from inside a ticker callback); this hook exists for any ordinary
// React-component consumer.
export function useKeyboardHitLine(): number | null {
  return useStore((s) => (s.playbarVisible ? null : s.keyboardTopY))
}
