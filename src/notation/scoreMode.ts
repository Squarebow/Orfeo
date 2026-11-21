import { create } from 'zustand'

// ── How the practice score is written (practice stage 8) ─────────────────────
// On its own so the listening can follow a lead sheet without importing the
// score's screen. 'auto' lets Orfeo choose between as written and simplified.
export type ScoreMode = 'auto' | 'full' | 'simple' | 'lead'
export const useScoreUi = create<{ mode: ScoreMode }>(() => ({ mode: 'auto' }))
