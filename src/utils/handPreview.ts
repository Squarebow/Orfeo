import type { ParsedNote } from '../types'

// ── Preview stats for the hand-split review UI (Stage 4) ─────────────────────
// Pure, presentation-agnostic — the preview component reads these numbers and
// the passage list to decide what to draw; no rendering concerns live here.

export const LOW_CONFIDENCE_THRESHOLD = 0.5

export function isLowConfidence(note: Pick<ParsedNote, 'handConfidence'>): boolean {
  return note.handConfidence !== undefined && note.handConfidence < LOW_CONFIDENCE_THRESHOLD
}

export interface HandPreviewStats {
  totalNotes: number
  taggedNotes: number
  leftCount: number
  rightCount: number
  lowConfidenceCount: number
  lowConfidenceRatio: number // fraction of taggedNotes, 0 when nothing is tagged
}

export function getHandPreviewStats(notes: ParsedNote[]): HandPreviewStats {
  const tagged = notes.filter(n => n.hand !== undefined)
  const leftCount = tagged.filter(n => n.hand === 'L').length
  const rightCount = tagged.filter(n => n.hand === 'R').length
  const lowConfidenceCount = tagged.filter(isLowConfidence).length
  return {
    totalNotes: notes.length,
    taggedNotes: tagged.length,
    leftCount,
    rightCount,
    lowConfidenceCount,
    lowConfidenceRatio: tagged.length > 0 ? lowConfidenceCount / tagged.length : 0,
  }
}

export interface LowConfidencePassage {
  start: number
  end: number
  noteCount: number
}

// ── Group consecutive low-confidence notes (by onset) into passages ─────────
// so the UI says "3 passages flagged", not "47 individual notes flagged" —
// the point is to let a user review a handful of genuinely ambiguous spots,
// not treat the whole piece as equally suspect.
export function getLowConfidencePassages(notes: ParsedNote[], gapSeconds = 1.0): LowConfidencePassage[] {
  const low = notes.filter(isLowConfidence).sort((a, b) => a.time - b.time)
  const passages: LowConfidencePassage[] = []
  for (const n of low) {
    const end = n.time + n.duration
    const last = passages[passages.length - 1]
    if (last && n.time - last.end <= gapSeconds) {
      last.end = Math.max(last.end, end)
      last.noteCount++
    } else {
      passages.push({ start: n.time, end, noteCount: 1 })
    }
  }
  return passages
}
