import { create } from 'zustand'
import type { TakeRecord } from './take'

// ── The practice review's state (practice stage 5), on its own so the
// listening, the waiting and the session can ask "is the review open?"
// without importing the review itself ──────────────────────────────────────

export type ReviewUnit = 'bar' | 'screen'
export type ReviewHear = 'mine' | 'written' | 'both'

export interface ReviewState {
  open: boolean
  takes: TakeRecord[]        // the takes that kept your notes, oldest first
  idx: number                // the take shown
  unit: ReviewUnit           // move a bar at a time, or a screenful
  from: number; to: number   // the passage, in bars
  hear: ReviewHear
  playing: boolean           // the passage going round
}

export const useReview = create<ReviewState>(() => ({
  open: false, takes: [], idx: 0, unit: 'screen', from: 1, to: 1, hear: 'mine', playing: false,
}))

export const reviewing = () => useReview.getState().open
