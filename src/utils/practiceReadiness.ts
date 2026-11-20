import type { ParsedNote } from '../types'
import { assignHands, type HandAssignOptions } from './handAssignment'
import { RESTORED_CONFIDENCE } from './handMetadata'
import { getLowConfidencePassages } from './handPreview'
import { simAvailable } from './midiSimulator'

// ── Ready for practice? ──────────────────────────────────────────────────────
// Practice mode (2.0) only opens a song whose hands are right: one or two
// piano tracks, every place Orfeo was unsure about looked at by a person.
// The Playback Editor shows each piano track as ready, or offers "Prepare for
// practice", which walks the unsure passages in the Note Editor.
//
// No automatic method gets every note right, so "ready" means: hands from a
// score's two staves, a track that is one hand throughout, or no passage left
// where Orfeo was unsure and nobody confirmed or fixed it.

// Shown in dev mode and test builds until practice mode itself ships: a
// "Ready to practise" mark for a mode that doesn't exist yet would confuse.
export const PRACTICE_PREP_VISIBLE = simAvailable

export const MAX_PRACTICE_PIANOS = 2

/** Piano tracks that count for practice: the piano family (acoustic and
 *  electric pianos), playing and not drums. Organs, pads and the rest are
 *  the band. */
export function countPracticePianos(rows: { group: string; isDrum?: boolean; included?: boolean }[]): number {
  return rows.filter(r => r.group === 'piano' && !r.isDrum && r.included !== false).length
}

/** A track practice mode treats as (part of) the piano you play */
export const isPracticePiano = (t: { group?: string; isDrum?: boolean }): boolean => t.group === 'piano' && !t.isDrum

// A saved song comes back with its hands but not with how sure Orfeo was
// (the file has no room for that), so a passage nobody checked would look
// settled after any save. Worked out again here, the way the song was first
// read: your own corrections and confirmations ("manual") are left out of
// the guessing and always count as sure. A saved hand that differs from
// what Orfeo reads now is worth a look too.
const DIFFERENT_HAND = 0.3
const fresh = new WeakMap<ParsedNote[], Map<ParsedNote, number>>()

export function freshConfidences(notes: ParsedNote[], options: HandAssignOptions = {}): Map<ParsedNote, number> {
  const cached = fresh.get(notes)
  if (cached) return cached
  const out = new Map<ParsedNote, number>()
  const restored = notes.some(n => n.handConfidence === RESTORED_CONFIDENCE && n.handSource !== 'manual' && n.hand !== undefined)
  if (restored) {
    const open = notes.filter(n => n.handSource !== 'manual')
    const stream = open.map(n => ({ midi: n.midi, time: n.time, duration: n.duration, src: n }))
    for (const a of assignHands(stream, options).assignments) {
      const n = a.note.src
      if (n.handConfidence !== RESTORED_CONFIDENCE || n.hand === undefined) continue
      out.set(n, a.hand === n.hand ? a.confidence : DIFFERENT_HAND)
    }
  }
  fresh.set(notes, out)
  return out
}

/** How sure the hand of one note is, for practice: yours = sure; saved =
 *  worked out again; untagged = not sure at all */
function confidenceOf(n: ParsedNote, again: Map<ParsedNote, number>): number {
  if (n.handSource === 'manual') return 1
  if (n.hand === undefined || n.handConfidence === undefined) return 0
  if (n.handConfidence === RESTORED_CONFIDENCE) return again.get(n) ?? 1
  return n.handConfidence
}

export interface TrackPractice { state: 'ready' | 'almost'; passages: number }

export function trackPracticeState(
  notes: ParsedNote[],
  { fromScore = false, oneHand = false, options = {} }: { fromScore?: boolean; oneHand?: boolean; options?: HandAssignOptions } = {},
): TrackPractice {
  if (fromScore || notes.length === 0) return { state: 'ready', passages: 0 }
  // one hand of a split piano (named so): its notes are that hand by design
  const first = notes[0].hand
  if (oneHand && first !== undefined && notes.every(n => n.hand === first)) return { state: 'ready', passages: 0 }
  const again = freshConfidences(notes, options)
  const shadow = notes.map(n => ({ time: n.time, duration: n.duration, hand: n.hand ?? 'R', handConfidence: confidenceOf(n, again) })) as ParsedNote[]
  const passages = getLowConfidencePassages(shadow).length
  return { state: passages > 0 ? 'almost' : 'ready', passages }
}

/** Before the check: give a saved song's notes back how sure Orfeo is, so
 *  the passage check can find the places worth a look. Hands never change. */
export function rescoreForCheck(notes: ParsedNote[], options: HandAssignOptions = {}): void {
  for (const n of notes) {
    if (n.handSource === 'manual' || n.handConfidence !== RESTORED_CONFIDENCE) continue
    const c = freshConfidences(notes, options).get(n)
    if (c !== undefined) n.handConfidence = c
  }
}
