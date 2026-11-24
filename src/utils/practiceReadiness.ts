import type { ParsedNote } from '../types'
import { assignHands, type HandAssignOptions } from './handAssignment'
import { RESTORED_CONFIDENCE } from './handMetadata'
import { getLowConfidencePassages } from './handPreview'
import { simAvailable } from './midiSimulator'
import { handsPlayable, tracksFaults, UNPLAYABLE_MAX, STACKED_MAX, TOO_FAST_MAX } from '../practice/songCheck'

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
// A piano track with fewer notes than this is a touch of colour in the band,
// not a part to practise (21. 11.: a song with an 11-note piano was "ready").
// Only with other instruments playing: a piano piece on its own counts at any
// length (22. 11.)
export { MIN_PRACTICE_NOTES } from '../practice/songCheck'
import { MIN_PRACTICE_NOTES } from '../practice/songCheck'

export const HANDS_CROSSED_MAX = 0.05
const CROSS_BY = 4   // semitones: the left hand's top above the right hand's lowest by more than a major third
/** Of the moments both hands start notes (together within a chord's grace), the
 *  share where the left hand plays clearly above the right */
export function handsCrossedShare(left: { midi: number; time: number }[], right: { midi: number; time: number }[]): number {
  const all = [...left.map(n => ({ n, l: true })), ...right.map(n => ({ n, l: false }))].sort((a, b) => a.n.time - b.n.time)
  let both = 0, crossed = 0
  for (let i = 0; i < all.length;) {
    let j = i, lTop = -Infinity, rLow = Infinity
    while (j < all.length && all[j].n.time - all[i].n.time <= 0.03) {
      if (all[j].l) lTop = Math.max(lTop, all[j].n.midi); else rLow = Math.min(rLow, all[j].n.midi)
      j++
    }
    if (lTop > -Infinity && rLow < Infinity) { both++; if (lTop > rLow + CROSS_BY) crossed++ }
    i = j
  }
  return both ? crossed / both : 0
}

/** Piano tracks that count for practice: the piano family (acoustic and
 *  electric pianos), playing and not drums. Organs, pads and the rest are
 *  the band. */
export function countPracticePianos(rows: { group: string; isDrum?: boolean; included?: boolean }[]): number {
  return rows.filter(r => r.group === 'piano' && !r.isDrum && r.included !== false).length
}

/** A track practice mode treats as (part of) the piano you play */
// The piano family as MIDI files have it (GM 1–8) also holds the harpsichord
// and the clavinet: a continuo or a funk riff, never a piano lesson (24. 11.:
// a Vivaldi file's harpsichord was "ready to practise")
export const NOT_A_PIANO_LESSON = new Set([6, 7])
/** Raised with every change to what counts as ready: the background reading's
 *  kept answers (practice/handPrescan.ts) are then worked out again */
export const READY_RULES = 2
export const isPracticePiano = (t: { group?: string; isDrum?: boolean; program?: number }): boolean =>
  t.group === 'piano' && !t.isDrum && !NOT_A_PIANO_LESSON.has(t.program ?? 0)

// ── The rule (20. 11.): a song is ready to practise when its piano is two
// tracks, Left Hand and Right Hand, each holding only its own hand. Then
// practice mode never asks which hand a note belongs to (the track says it),
// and hearing the other hand is just muting one track, in every sound engine.
// A single piano track that is one hand throughout goes through preparation
// too, unless a person set the hand of every note: a whole piano part read as
// one hand is far more often a mistake than a one-hand tune, and one colour
// throughout is confusing to practise (22. 11., the user).
// Two tracks, one per hand (or a piano's two staves), are ready only when they
// play like two hands: the left hand isn't above the right one at more than
// HANDS_CROSSED_MAX of the moments both play. Names, one colour per track and
// the staves' layout prove nothing on their own (22. 11.: two separate piano
// parts saved as " LH" / " RH", the whole main piano marked left hand, scanned
// as ready). Measured over the user's 450-song library: every real two-hand
// file stays at or under 1 %; the two broken ones were at 12 % and 18 %.
// (Orfeo disagreeing with a split is no test: on a split the user checked by
// hand it disagreed on 31 % of the notes, as on the broken one.)
//   one track, both hands, or two parts that aren't the hands
//                          → Prepare for practice: the Note Editor shows the
//                            piano as one, you check the hands, and saving
//                            makes the two hand tracks
//   none, or three or more → can't be practised (decide in the Playback Editor)
export type SongPractice =
  | { state: 'ready'; left: number; right: number }
  | { state: 'one-hand'; track: number; hand: 'L' | 'R' }
  | { state: 'prepare'; tracks: number[]; passages: number }
  | { state: 'cant'; reason: 'no-piano' | 'too-many' | 'messy'; pianos: number }

const HAND_NAME: Record<'L' | 'R', RegExp> = { L: /(^Left Hand$|\sLH\s*$)/i, R: /(^Right Hand$|\sRH\s*$)/i }

/** The hand a track is named for ("Left Hand", "Piano LH"), or null */
export function nameHand(t: { name?: string; trackName?: string }): 'L' | 'R' | null {
  for (const h of ['L', 'R'] as const) if (HAND_NAME[h].test(t.name ?? '') || HAND_NAME[h].test(t.trackName ?? '')) return h
  return null
}

/** Which hand a whole track is: every note tagged that hand, or named for it
 *  (Orfeo's split writes "Piano LH" / "Piano RH") */
export function trackHand(t: { name?: string; trackName?: string; notes: { hand?: 'L' | 'R' }[] }): 'L' | 'R' | null {
  for (const h of ['L', 'R'] as const) if (HAND_NAME[h].test(t.name ?? '') || HAND_NAME[h].test(t.trackName ?? '')) return h
  const first = t.notes[0]?.hand
  if (first && t.notes.every(n => n.hand === first)) return first
  return null
}

/** Two hands, each able to play its own part as written: not crossed, and no
 *  more than five keys, no stretch past a tenth, no leap too far for its time,
 *  in all but a few moments (practice/songCheck.ts) */
export function playLikeHands(left: { midi: number; time: number; duration: number }[], right: { midi: number; time: number; duration: number }[]): boolean {
  if (handsCrossedShare(left, right) > HANDS_CROSSED_MAX) return false
  const p = handsPlayable([...left.map(n => ({ ...n, hand: 'L' as const })), ...right.map(n => ({ ...n, hand: 'R' as const }))])
  return !p.moments || p.bad / p.moments <= UNPLAYABLE_MAX
}

/** The file's own hands among the piano tracks: a piano's two staves (upper =
 *  right) or a Left and a Right track, playing like hands, notes not doubled */
export function ownHandPair<T extends { index: number; name?: string; trackName?: string; notes: ParsedNote[] }>(pianos: T[], stavePairs: [number, number][]): { left: number; right: number } | null {
  const byIndex = new Map(pianos.map(t => [t.index, t]))
  const ok = (l: T, r: T) => {
    const ff = tracksFaults([l, r])
    return ff.stacked / ff.notes <= STACKED_MAX && ff.tooFast / ff.notes <= TOO_FAST_MAX && playLikeHands(l.notes, r.notes)
  }
  for (const [up, low] of stavePairs) {
    const r = byIndex.get(up), l = byIndex.get(low)
    if (r && l && ok(l, r)) return { left: l.index, right: r.index }
  }
  // beside other keyboard parts, only a name says a track is a hand (one colour
  // throughout is just as often a whole part Orfeo read as one hand)
  const handOf = (t: T) => (pianos.length > 2 ? nameHand(t) : trackHand(t))
  const lefts = pianos.filter(t => handOf(t) === 'L'), rights = pianos.filter(t => handOf(t) === 'R')
  for (const l of lefts) for (const r of rights) if (ok(l, r)) return { left: l.index, right: r.index }
  return null
}

export function songPracticeState(
  tracks: { index: number; group?: string; isDrum?: boolean; name?: string; trackName?: string; notes: ParsedNote[]; program?: number }[],
  { stavePairs = [], options = {} }: { stavePairs?: [number, number][]; options?: HandAssignOptions } = {},
): SongPractice {
  const others = tracks.some(t => !isPracticePiano(t) && t.notes.length > 0)
  const pianos = tracks.filter(t => isPracticePiano(t) && t.notes.length > 0 && (!others || t.notes.length >= MIN_PRACTICE_NOTES))
  if (pianos.length === 0) return { state: 'cant', reason: 'no-piano', pianos: 0 }
  // the file's own two hands (a piano's two staves, or a Left and a Right
  // track) that play like hands: that's the lesson, and any other keyboard
  // part plays in the band (22. 11.)
  // a lesson is always exactly the piano's two hands: more piano parts than two
  // are never ready, even when two of them are the file's own staves or hand
  // tracks; the Lesson check says what to leave out or merge (24. 11., the user:
  // "always exactly two piano tracks, never more")
  if (pianos.length > MAX_PRACTICE_PIANOS) return { state: 'cant', reason: 'too-many', pianos: pianos.length }
  const own = ownHandPair(pianos, stavePairs)
  if (own) return { state: 'ready', left: own.left, right: own.right }
  // notes no lesson can be made of: the same key struck twice at once, or
  // re-struck faster than a hand can, all through (practice/songCheck.ts)
  const ff = tracksFaults(pianos)
  if (ff.stacked / ff.notes > STACKED_MAX || ff.tooFast / ff.notes > TOO_FAST_MAX) return { state: 'cant', reason: 'messy', pianos: pianos.length }
  if (pianos.length === 1) {
    const t = pianos[0]
    const h = trackHand({ notes: t.notes })
    if (h && t.notes.every(n => n.handSource === 'manual')) return { state: 'one-hand', track: t.index, hand: h }
    return { state: 'prepare', tracks: [t.index], passages: trackPracticeState(t.notes, { options }).passages }
  }
  const [a, b] = pianos
  const both = [...a.notes, ...b.notes].sort((x, y) => x.time - y.time)
  const check = trackPracticeState(both, { options })
  // two parts that aren't the hands, or hands that don't hold up: checked as one piano in the Note Editor
  return { state: 'prepare', tracks: [a.index, b.index], passages: check.passages }
}

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
