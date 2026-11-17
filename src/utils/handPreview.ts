import type { ParsedNote } from '../types'
import { RESTORED_CONFIDENCE } from './handMetadata'

// ── Preview stats for the hand-split review UI (Stage 4) ─────────────────────
// Pure, presentation-agnostic — the preview component reads these numbers and
// the passage list to decide what to draw; no rendering concerns live here.

export const LOW_CONFIDENCE_THRESHOLD = 0.5

// A restored note's confidence is a sentinel, not a real score — it must
// never register as "low confidence" (that would be fabricating a flag) or
// silently count as "confident" (that's the bug this was built to fix: a
// reopened file showing zero flags looks identical to "the engine was sure
// everywhere," when really the question was never asked this session).
export function hasKnownConfidence(note: Pick<ParsedNote, 'handConfidence'>): boolean {
  return note.handConfidence !== undefined && note.handConfidence !== RESTORED_CONFIDENCE
}

export function isLowConfidence(note: Pick<ParsedNote, 'handConfidence'>): boolean {
  return hasKnownConfidence(note) && note.handConfidence! < LOW_CONFIDENCE_THRESHOLD
}

export interface HandPreviewStats {
  totalNotes: number
  taggedNotes: number
  leftCount: number
  rightCount: number
  lowConfidenceCount: number
  lowConfidenceRatio: number // fraction of taggedNotes, 0 when nothing is tagged
  /** true if every tagged note's confidence is the restored sentinel — this
   *  session's preview has no real confidence data to show at all, distinct
   *  from "computed and found nothing low-confidence." */
  confidenceUnknown: boolean
}

export function getHandPreviewStats(notes: ParsedNote[]): HandPreviewStats {
  const tagged = notes.filter(n => n.hand !== undefined)
  const leftCount = tagged.filter(n => n.hand === 'L').length
  const rightCount = tagged.filter(n => n.hand === 'R').length
  const lowConfidenceCount = tagged.filter(isLowConfidence).length
  const knownConfidenceCount = tagged.filter(hasKnownConfidence).length
  return {
    totalNotes: notes.length,
    taggedNotes: tagged.length,
    leftCount,
    rightCount,
    lowConfidenceCount,
    lowConfidenceRatio: tagged.length > 0 ? lowConfidenceCount / tagged.length : 0,
    confidenceUnknown: tagged.length > 0 && knownConfidenceCount === 0,
  }
}

// ── About how many notes are likely in the right hand ──────────────────────
// A guess about the guess, shown as "about 90 %". Fitted on 74 two-staff
// piano scores (staves joined, scripts/hand-audit): a song's share of right
// notes from the share of its notes in four confidence bands. Checked on each
// piece without it: off by 2.7 points on average, within 4 points three times
// in four, up to 9 points over where a whole passage is confidently wrong —
// so it's rounded to the nearest 5 and always worded "about … likely".
// Weights: [base, <0.5, 0.5–0.7, 0.7–0.9, ≥0.9].
const ESTIMATE_WEIGHTS = [0.7159, 0.0831, 0.0736, 0.2888, 0.2703]
export function estimateHandAccuracy(notes: Pick<ParsedNote, 'hand' | 'handConfidence'>[]): number | null {
  const known = notes.filter(n => n.hand !== undefined && hasKnownConfidence(n))
  if (known.length === 0) return null
  const share = (lo: number, hi: number) => known.filter(n => n.handConfidence! >= lo && n.handConfidence! < hi).length / known.length
  const [w0, w1, w2, w3, w4] = ESTIMATE_WEIGHTS
  const v = w0 + w1 * share(0, 0.5) + w2 * share(0.5, 0.7) + w3 * share(0.7, 0.9) + w4 * share(0.9, 2)
  // nearest 5, never "100 %" for a guess, never below 75
  return Math.min(95, Math.max(75, Math.round(v * 20) * 5))
}

// ── Passages already looked at, this session ────────────────────────────────
// Jumping to a passage from the Note Editor counts as looking at it; the
// Playback Editor's timeline then draws it dimmed. Keyed by song + track.
const seen = new Map<string, Set<number>>()
export const passageKey = (filePath: string | undefined, trackIndex: number) => `${filePath ?? ''}#${trackIndex}`
export function markPassageSeen(key: string, start: number): void {
  const s = seen.get(key) ?? new Set<number>()
  s.add(Math.round(start * 1000))
  seen.set(key, s)
}
export function isPassageSeen(key: string, start: number): boolean {
  return seen.get(key)?.has(Math.round(start * 1000)) ?? false
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
