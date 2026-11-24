// ── Is this file good enough to become a lesson? ─────────────────────────────
// Rules a musician would use looking at a MIDI file, no guessing involved:
//   - a track that only copies another one (same keys, same moments)
//   - a piano that only doubles another instrument's tune
//   - the same key struck twice at once, or re-struck faster than a hand can
//   - keys outside the 88
//   - hands asked to do what hands can't: more than five keys at once, a
//     stretch wider than a tenth, a leap too far for the time it has
// From these, suggestions in the Playback Editor's own terms: leave a track
// out, merge tracks into one piano part. Every limit here was measured over
// the whole library and the two-staff test scores (scripts/hand-audit), never
// set for one song.

import type { MeterFix } from '../utils/meterCheck'

export interface CheckNote { midi: number; time: number; duration: number; hand?: 'L' | 'R' }
export interface CheckTrack { index: number; name: string; group: string; isDrum: boolean; notes: CheckNote[]; program?: number }

/** notes starting within this of each other are one moment (a chord) */
export const TOGETHER = 0.03
/** the same key struck again within this is a stacked copy, not a repeat */
export const STACKED = 0.015
/** the same key re-struck faster than this: no hand repeats a key that fast */
export const TOO_FAST = 0.06
/** a track counts as a copy when this share of its notes sits on another track's */
export const COPY_SHARE = 0.9
/** one hand: at most this many keys struck at once */
export const MAX_KEYS = 5
/** one hand: the widest stretch struck at once, in semitones (a major tenth) */
export const MAX_STRETCH = 16
/** one hand: a jump at least this far (semitones) ... */
export const LEAP = 19
/** ... in less time than this (seconds) is too fast for a hand */
export const LEAP_TIME = 0.08

// harpsichord and clavinet aren't piano lessons (practiceReadiness.ts › NOT_A_PIANO_LESSON)
const isPiano = (t: CheckTrack) => t.group === 'piano' && !t.isDrum && t.program !== 6 && t.program !== 7

/** Notes of `b` that have a note of `a` on the same key (or, with `octaves`,
 *  any octave of it) starting at the same moment, as a share of b's notes */
export function sharedShare(a: CheckNote[], b: CheckNote[], octaves = false): number {
  if (!b.length || !a.length) return 0
  const as = [...a].sort((x, y) => x.time - y.time)
  let hit = 0, j = 0
  for (const n of [...b].sort((x, y) => x.time - y.time)) {
    while (j < as.length && as[j].time < n.time - TOGETHER) j++
    for (let k = j; k < as.length && as[k].time <= n.time + TOGETHER; k++) {
      if (octaves ? (as[k].midi - n.midi) % 12 === 0 : as[k].midi === n.midi) { hit++; break }
    }
  }
  return hit / b.length
}

export interface FileFaults { stacked: number; tooFast: number; outOfRange: number; notes: number }

/** Faults in the notes themselves, counted over the given notes */
export function fileFaults(notes: CheckNote[]): FileFaults {
  const byKey = new Map<number, number[]>()
  let outOfRange = 0
  for (const n of notes) {
    if (n.midi < 21 || n.midi > 108) outOfRange++
    const l = byKey.get(n.midi) ?? []; l.push(n.time); byKey.set(n.midi, l)
  }
  let stacked = 0, tooFast = 0
  for (const times of byKey.values()) {
    times.sort((a, b) => a - b)
    for (let i = 1; i < times.length; i++) {
      const dt = times[i] - times[i - 1]
      if (dt < STACKED) stacked++
      else if (dt < TOO_FAST) tooFast++
    }
  }
  return { stacked, tooFast, outOfRange, notes: notes.length }
}

/** Faults counted within each track (two tracks on the same key at once are
 *  a unison or a copy, not a doubled note), added up */
export function tracksFaults(tracks: { notes: CheckNote[] }[]): FileFaults {
  const out: FileFaults = { stacked: 0, tooFast: 0, outOfRange: 0, notes: 0 }
  for (const t of tracks) { const f = fileFaults(t.notes); out.stacked += f.stacked; out.tooFast += f.tooFast; out.outOfRange += f.outOfRange; out.notes += f.notes }
  return out
}

export interface HandsPlay { moments: number; tooMany: number; tooWide: number; tooFar: number; bad: number }

/** Can each hand play its notes as written? Moments where one hand strikes
 *  more than MAX_KEYS keys, stretches wider than MAX_STRETCH, or leaps LEAP
 *  or more in under LEAP_TIME. `bad` counts moments with any of them. */
export function handsPlayable(notes: CheckNote[]): HandsPlay {
  const out: HandsPlay = { moments: 0, tooMany: 0, tooWide: 0, tooFar: 0, bad: 0 }
  for (const h of ['L', 'R'] as const) {
    const ns = notes.filter(n => n.hand === h).sort((a, b) => a.time - b.time)
    let prev: { lo: number; hi: number; time: number } | null = null
    for (let i = 0; i < ns.length;) {
      let j = i, lo = Infinity, hi = -Infinity
      const keys = new Set<number>()
      while (j < ns.length && ns[j].time - ns[i].time <= TOGETHER) { keys.add(ns[j].midi); lo = Math.min(lo, ns[j].midi); hi = Math.max(hi, ns[j].midi); j++ }
      out.moments++
      const many = keys.size > MAX_KEYS
      const wide = hi - lo > MAX_STRETCH
      // the nearest the hand could have been: its last moment's edge to this one's
      const far = !!prev && ns[i].time - prev.time < LEAP_TIME
        && Math.max(lo - prev.hi, prev.lo - hi) >= LEAP
      if (many) out.tooMany++
      if (wide) out.tooWide++
      if (far) out.tooFar++
      if (many || wide || far) out.bad++
      prev = { lo, hi, time: ns[i].time }
      i = j
    }
  }
  return out
}

export type Suggestion =
  | { kind: 'leave-out'; track: number; why: 'copy'; of: number }
  | { kind: 'leave-out'; track: number; why: 'tune'; of: number }
  | { kind: 'leave-out'; track: number; why: 'too-much' }
  | { kind: 'leave-out'; track: number; why: 'extra'; of: [number, number] }
  | { kind: 'merge'; tracks: number[] }
  | { kind: 'instrument'; track: number; program: number; word: string; keys?: 'harpsichord' | 'clavinet' }

/** A piano part shorter than this, with other instruments playing, is a touch
 *  of colour in the band, not a part to practise (21. 11.) */
export const MIN_PRACTICE_NOTES = 50

// A track with a piano sound whose name says it's another instrument: files
// without instrument changes play every track on the piano (a "bass", a
// "guitar", the singer's line). The name is the better witness then. Words a
// musician writes on a part, longest first; never a piano's own staff names.
const NAMED: [RegExp, number, string][] = [
  [/\b(alto|tenor|soprano|baritone)\s*sax/i, 65, 'sax'],
  [/\bsax(ophone)?\b/i, 65, 'sax'],
  [/\b(choir|chorale|chorus|coro)\b/i, 52, 'choir'],
  [/\b(voice|vocals?|vox|singer|soprano|alto|tenor|baritone|voce|stimme|melody|melodie|melodia)\b/i, 53, 'voice'],
  [/\b(el(ec)?\.?\s*(gtr|guitar)|e\.?\s*gtr|dist(ortion)?\s*gtr)\b/i, 27, 'guitar'],
  [/\b(guitars?|gtrs?|guit|gitarre|guitarra|chitarra)\b/i, 25, 'guitar'],
  [/\b(bass|basso|bajo|e\.?\s*bass)\b/i, 33, 'bass'],
  [/\b(organ|orgel|organo|hammond)\b/i, 16, 'organ'],
  [/\b(strings?|violins?|viola|cellos?|violoncello|contrabass|archi)\b/i, 48, 'strings'],
  [/\b(trumpets?|tpts?|tromba)\b/i, 56, 'trumpet'],
  [/\b(trombones?|tbns?)\b/i, 57, 'trombone'],
  [/\b(french\s*)?horns?\b/i, 60, 'horn'],
  [/\bbrass\b/i, 61, 'brass'],
  [/\b(flutes?|flauto|flöte)\b/i, 73, 'flute'],
  [/\bclarinets?\b/i, 71, 'clarinet'],
  [/\boboe\b/i, 68, 'oboe'],
  [/\bpads?\b/i, 89, 'pad'],
  [/\bsynth/i, 81, 'synth'],
]
/** The instrument a track's name names (not a piano), or null */
export function namedInstrument(name: string): { program: number; word: string } | null {
  if (/piano|keys|keyboard|klavier|pianoforte|rhodes|wurli|clav|harpsi|cembalo|\b(rh|lh)\b|right|left|treble|staff|stave/i.test(name)) return null
  for (const [re, program, word] of NAMED) if (re.test(name)) return { program, word }
  return null
}
/** A bass or a voice plays one note at a time (a bass in octaves at most): a
 *  track of chords named "Bass" is a piano's lower staff, not a bass */
const SINGLE_LINE_WORDS = new Set(['bass', 'voice'])
/** Share of moments with at most `n` notes */
export function fewNotes(notes: CheckNote[], n: number): number {
  const ns = [...notes].sort((a, b) => a.time - b.time)
  let moments = 0, few = 0
  for (let i = 0; i < ns.length;) {
    let j = i; while (j < ns.length && ns[j].time - ns[i].time <= TOGETHER) j++
    moments++; if (j - i <= n) few++
    i = j
  }
  return moments ? few / moments : 0
}

/** Piano tracks that only copy another track (same keys, same moments): the
 *  copy is the one with fewer notes (or the later one). Only while another
 *  piano part is left to play: a piano doubling the strings is still the piano. */
export function findCopies(tracks: CheckTrack[]): Suggestion[] {
  const out: Suggestion[] = []
  const gone = new Set<number>()
  const live = tracks.filter(t => !t.isDrum && t.notes.length >= 8)
  let pianosLeft = tracks.filter(t => isPiano(t) && t.notes.length).length
  for (const b of live) for (const a of live) {
    if (a === b || gone.has(a.index) || gone.has(b.index)) continue
    if (!isPiano(b) || pianosLeft <= 1) continue
    // b is the copy: no more notes than a (ties: the later track)
    if (b.notes.length > a.notes.length || (b.notes.length === a.notes.length && b.index < a.index)) continue
    if (sharedShare(a.notes, b.notes) >= COPY_SHARE) { out.push({ kind: 'leave-out', track: b.index, why: 'copy', of: a.index }); gone.add(b.index); pianosLeft-- }
  }
  return out
}

/** A piano that only doubles another instrument's tune (one note at a time,
 *  on its notes or their octaves) — when another piano part is left to play */
export function findTunes(tracks: CheckTrack[], leftOut: Set<number>): Suggestion[] {
  const out: Suggestion[] = []
  const pianos = tracks.filter(t => isPiano(t) && t.notes.length && !leftOut.has(t.index))
  for (const p of pianos) {
    if (pianos.length - out.length <= 1) break
    if (singleLine(p.notes) < 0.9) continue
    for (const o of tracks) {
      if (o === p || isPiano(o) || o.isDrum || !o.notes.length) continue
      if (sharedShare(o.notes, p.notes, true) >= 0.8) { out.push({ kind: 'leave-out', track: p.index, why: 'tune', of: o.index }); break }
    }
  }
  return out
}

// ── Limits, measured 22. 11. 2026 (scripts/hand-audit/checks.mjs, merge.mjs) ──
/** Hands that can't play more than this share of their moments as written
 *  aren't hands: real hands in the 74 two-staff scores never pass 1.5 %; the
 *  library's broken splits sit at 8–50 %. */
export const UNPLAYABLE_MAX = 0.03
/** The same key struck twice at once on more than this share of the notes is
 *  a doubled file (scores: at most 4.5 %, hands in unison; broken files ~50 %) */
export const STACKED_MAX = 0.1
/** Keys re-struck faster than a hand can on more than this share (scores: at
 *  most 0.5 %; broken files 34–49 %) */
export const TOO_FAST_MAX = 0.03

export type Problem =
  | { kind: 'stacked'; share: number }
  | { kind: 'too-fast'; share: number }
  | { kind: 'out-of-range'; notes: number }
  | { kind: 'unplayable'; share: number; tracks: number[] }
  /** converted from Guitar Pro: the piano part was written out on a guitar's
   *  strings (at most six notes at a time, the bass kept in a guitar's range),
   *  playable but not a piano arrangement: a weaker lesson than a piano score */
  | { kind: 'guitar-pro' }
  /** the drums play a beat 1½ written beats long: the written meter is wrong,
   *  so the metronome and the bars run off (utils/meterCheck.ts) */
  | { kind: 'meter'; fix: MeterFix }

export interface SongCheck {
  /** what Orfeo suggests, in the Playback Editor's own terms (leave out, merge) */
  suggestions: Suggestion[]
  /** what's wrong with the notes themselves, after the suggestions */
  problems: Problem[]
  /** the piano tracks that remain for the lesson after the suggestions */
  pianos: number[]
}

export type Reader = (notes: CheckNote[]) => CheckNote[]

const unplayableShare = (notes: CheckNote[]) => { const p = handsPlayable(notes); return p.moments ? p.bad / p.moments : 0 }

/** The whole check. `hands` gives each piano track's hand when the file has the
 *  hands apart (two staves, Left/Right tracks); `read` is Orfeo's reading of
 *  hands for notes played as one piano (assignHands). */
export function checkSong(all: CheckTrack[], o: { hands?: Map<number, 'L' | 'R'>; own?: { left: number; right: number } | null; read: Reader; source?: string; meter?: MeterFix | null }): SongCheck {
  const suggestions: Suggestion[] = []
  const problems: Problem[] = []
  // where the file came from (midiParser.ts › _source): a warning, nothing changes
  if (o.source === 'guitarpro') problems.push({ kind: 'guitar-pro' })
  if (o.meter) problems.push({ kind: 'meter', fix: o.meter })
  // the file's own two hands, playing like hands, and no other piano part: the
  // lesson as it is (other piano parts: below, they're suggested to leave out)
  const countsAsPiano = (t: CheckTrack, withOthers: boolean) => isPiano(t) && t.notes.length > 0 && (!withOthers || t.notes.length >= MIN_PRACTICE_NOTES)
  const withOthers = all.some(t => !isPiano(t) && !t.isDrum && t.notes.length)
  if (o.own && all.filter(t => countsAsPiano(t, withOthers)).length <= 2) {
    const pair = all.filter(t => t.index === o.own!.left || t.index === o.own!.right)
    const ff = tracksFaults(pair)
    if (ff.outOfRange) problems.push({ kind: 'out-of-range', notes: ff.outOfRange })
    return { suggestions, problems, pianos: [o.own.left, o.own.right] }
  }
  // a piano sound on a track named for another instrument: give it that one
  // (the name wins over a two-staff layout: a guitar's staff and tab pair up too)
  const others = all.some(t => !isPiano(t) && !t.isDrum && t.notes.length)
  const tracks = all.map(t => {
    if (!isPiano(t) || !t.notes.length) return t
    const named = namedInstrument(t.name)
    if (named && (!SINGLE_LINE_WORDS.has(named.word) || fewNotes(t.notes, 2) >= 0.9)) { suggestions.push({ kind: 'instrument', track: t.index, ...named }); return { ...t, group: named.word } }
    // a few notes of colour in the band: not a part to practise
    if (others && t.notes.length < MIN_PRACTICE_NOTES) return { ...t, group: 'band' }
    return t
  })
  const renamed = new Set(suggestions.map(x => (x as { track: number }).track))
  if (o.hands && renamed.size) o = { ...o, hands: new Map([...o.hands].filter(([i]) => !renamed.has(i))) }
  // a harpsichord or clavinet: a keyboard, but not a piano lesson as it is. When it
  // only doubles the piano (same keys or octaves, for the harmony) it's colour in
  // the band; when it's a part of its own (no piano, or other notes than the
  // piano's), give it a piano sound: then it can be the lesson, merged with the
  // piano if there is one (24. 11., the user)
  const lessonPianos = tracks.filter(t => isPiano(t) && t.notes.length)
  for (const t of tracks) {
    if (t.group !== 'piano' || t.isDrum || !t.notes.length || (t.program !== 6 && t.program !== 7)) continue
    if (others && t.notes.length < MIN_PRACTICE_NOTES) continue
    const doubles = lessonPianos.some(p => sharedShare(p.notes, t.notes, true) >= 0.8)
    if (!doubles) suggestions.push({ kind: 'instrument', track: t.index, program: 0, word: 'piano', keys: t.program === 6 ? 'harpsichord' : 'clavinet' })
  }
  suggestions.push(...findCopies(tracks))
  const out = new Set(suggestions.flatMap(s => (s.kind === 'leave-out' ? [s.track] : [])))
  for (const s of findTunes(tracks, out)) { suggestions.push(s); if (s.kind === 'leave-out') out.add(s.track) }
  let pianos = tracks.filter(t => isPiano(t) && t.notes.length && !out.has(t.index))
  if (!pianos.length) return { suggestions, problems, pianos: [] }
  // the file's own two hands beside other piano parts: a lesson is exactly the
  // two hands, so every other piano part is suggested to leave out
  const own = o.own
  if (own && pianos.some(t => t.index === own.left) && pianos.some(t => t.index === own.right)) {
    for (const t of pianos) if (t.index !== own.left && t.index !== own.right) suggestions.push({ kind: 'leave-out', track: t.index, why: 'extra', of: [own.left, own.right] })
    pianos = pianos.filter(t => t.index === own.left || t.index === own.right)
  }

  // the hands as the file has them, or as Orfeo reads the pianos played as one
  const handsOf = (ps: CheckTrack[]) => {
    if (o.hands && ps.length === 2 && ps.every(t => o.hands!.has(t.index))) return ps.flatMap(t => t.notes.map(n => ({ ...n, hand: o.hands!.get(t.index) })))
    return o.read(ps.flatMap(t => t.notes))
  }
  // more piano parts than two hands can play together: leave out, one at a
  // time, the part whose going helps most (on a tie the smaller), until two
  // hands can play the rest. Never one of the file's own two hands.
  const ownHands = !!o.hands && pianos.length === 2 && pianos.every(t => o.hands!.has(t.index))
  if (pianos.length >= 2 && !ownHands) {
    let share = unplayableShare(handsOf(pianos))
    while (share > UNPLAYABLE_MAX && pianos.length > 1) {
      let best: { t: CheckTrack; share: number } | null = null
      for (const t of pianos) {
        const next = unplayableShare(handsOf(pianos.filter(x => x !== t)))
        if (!best || next < best.share - 1e-9 || (Math.abs(next - best.share) < 1e-9 && t.notes.length < best.t.notes.length)) best = { t, share: next }
      }
      if (!best || best.share >= share) break
      const gone = best.t
      suggestions.push({ kind: 'leave-out', track: gone.index, why: 'too-much' })
      pianos = pianos.filter(x => x !== gone); share = best.share
    }
    // one piano part spread over three tracks or more: one track, then the hands
    if (pianos.length >= 3) suggestions.push({ kind: 'merge', tracks: pianos.map(t => t.index) })
  }

  const ff = tracksFaults(pianos)
  if (ff.stacked / ff.notes > STACKED_MAX) problems.push({ kind: 'stacked', share: ff.stacked / ff.notes })
  if (ff.tooFast / ff.notes > TOO_FAST_MAX) problems.push({ kind: 'too-fast', share: ff.tooFast / ff.notes })
  if (ff.outOfRange) problems.push({ kind: 'out-of-range', notes: ff.outOfRange })
  // the file's own hands (two staves, Left/Right) that no hand could play
  if (ownHands) {
    const share = unplayableShare(handsOf(pianos))
    if (share > UNPLAYABLE_MAX) problems.push({ kind: 'unplayable', share, tracks: pianos.map(t => t.index) })
  }
  return { suggestions, problems, pianos: pianos.map(t => t.index) }
}

/** Share of moments with a single note */
export function singleLine(notes: CheckNote[]): number {
  const ns = [...notes].sort((a, b) => a.time - b.time)
  let moments = 0, single = 0
  for (let i = 0; i < ns.length;) {
    let j = i; while (j < ns.length && ns[j].time - ns[i].time <= TOGETHER) j++
    moments++; if (j - i === 1) single++
    i = j
  }
  return moments ? single / moments : 0
}
