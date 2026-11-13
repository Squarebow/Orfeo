// ── Hand assignment — which hand plays each note ─────────────────────────────
//
// Two entry points:
//
//   assignHandsByTrack(tracks) — what the parser and the Playback Editor's save
//     use. Finds the two staves of each keyboard instrument (a notation export
//     writes them as two tracks) and takes the hands straight from them: upper
//     staff = right hand, lower = left, never second-guessed. Every other
//     keyboard track is one instrument of its own and gets its own hands from
//     assignHands(). Tracks are never pooled across instruments: an organ or a
//     chord-symbol track never takes the piano's left hand.
//
//   assignHands(notes) — one stream of notes (a one-track piano, a merge).
//     1. Fast path: the stream is visibly two tracks/channels of one instrument
//        → label by average pitch.
//     2. A single melodic line (hardly ever two notes sounding together) stays
//        in one hand, chosen by register.
//     3. Otherwise a moving dividing line between the hands: notes at or above
//        it are right hand. At each moment the line is pulled toward the gap
//        between the low and high group of the notes around it (1.5 s before
//        and after — the whole song is known); when only one hand plays,
//        register decides which. A Viterbi pass picks the line path that best
//        balances that pull, how far the line moves, and what a hand can reach
//        (span and finger count).
//
// Measured on 40 two-staff piano scores (staves joined, staves = answer):
// 90–93 % of notes on the right hand, against 83–84 % for the previous
// engine — scripts/hand-audit/. Change nothing here without running it.

import type { Hand } from '../types'
export type { Hand }

export interface HandInput {
  midi: number
  time: number
  /** seconds; lets assignHands() tell a single melodic line from two hands */
  duration?: number
  trackIndex?: number
  channel?: number
  // GM instrument group (e.g. 'piano', 'organ') — only used by the fast path,
  // so a piano track and an unrelated organ track are never read as two hands.
  group?: string
}

export interface HandAssignOptions {
  /** Max comfortable one-hand stretch, in semitones (15 = a 10th). */
  maxSpanSemitones?: number
  /** Onset tolerance (seconds) for treating near-simultaneous notes as one chord. */
  clusterToleranceSec?: number
  /** Max notes of a chord the right hand can take. 4 (default) or 5 fingers. */
  rhMaxFingers?: number
  /** Max notes of a chord the left hand can take. 4 (default) or 5 fingers. */
  lhMaxFingers?: number
}

export interface HandAssignedNote<T extends HandInput> {
  note: T
  hand: Hand
  /** 0..1 — how clearly this note's hand won. 1 = staves, fast path or single line. */
  confidence: number
}

export interface AssignHandsResult<T extends HandInput> {
  assignments: HandAssignedNote<T>[]
  usedFastPath: boolean
}

const DEFAULTS: Required<HandAssignOptions> = {
  maxSpanSemitones: 15,
  clusterToleranceSec: 0.02,
  rhMaxFingers: 4,
  lhMaxFingers: 4,
}

// ── Fast-path thresholds ──────────────────────────────────────────────────────
const FAST_PATH_MAX_COLLISION_RATE = 0.02  // ≥2% exact-pitch unisons at same moment → not a clean split
const FAST_PATH_MIN_AVG_GAP = 3            // semitones between the two groups' average pitch

// ── Single melodic line ───────────────────────────────────────────────────────
// Share of sounding time with two or more notes overlapping (by more than
// LINE_OVERLAP_SEC). Measured: real two-hand piano parts 43 %+ (40 scores),
// a sung melody 6 %, a bass staff 3 %.
const SINGLE_LINE_MAX_POLY_SHARE = 0.15
const LINE_OVERLAP_SEC = 0.05
// A line wider than this (5th–95th percentile, semitones) is not one hand's.
const SINGLE_LINE_MAX_RANGE = 24

// ── Dividing line ─────────────────────────────────────────────────────────────
// Tuned on 17 library files, then checked on 23 different MuseScore scores
// without retuning (92.8 %). Moving any of these within sensible values
// changes the result by about a point: the method carries it, not the numbers.
const WINDOW_SEC = 1.5            // notes before and after a moment that set its target line
const MIN_GROUP_SEPARATION = 9    // semitones between the low and high group's averages to count as two hands
const REGISTER_SPLIT = 59         // one group alone: average at or above B3 → right hand
const STRIDE_MAX_SHARED = 0.2     // share of chord moments that may also strike a bass note (0.1–0.35 measure the same)
const STRIDE_CHORD_MAX = 59       // the middle group's average must sit below this (B3) to be the left hand's chord; 56–58 only trade one piece for another
const THREE_GROUP_MIN_GAP = 12    // semitones between bass, chord and melody groups' averages (at 6 it fires on ordinary textures and costs more than it fixes; 9 lowers the weakest piece)
const TARGET_WEIGHT = 1           // per semitone the line sits away from its target
const MOVE_WEIGHT = 0.6           // per semitone the line moves from one moment to the next
const SPAN_WEIGHT = 2             // quadratic, per semitone a hand stretches past maxSpanSemitones
const FINGER_WEIGHT = 3           // quadratic, per note a hand holds past its finger count
// How often two neighbouring notes of one chord belong to different hands, by
// the interval between them (index = semitones, last = 13 or more). Counted
// on the 40 two-staff scores: a 5th or less apart they share a hand about
// 9 times in 10, more than an octave apart they're in different hands 98
// times in 100. Splitting a chord between two close notes costs; leaving a
// wide gap inside one hand costs too. Its weight:
const GAP_SPLIT_CHANCE = [0.38, 0.10, 0.08, 0.07, 0.08, 0.09, 0.23, 0.25, 0.36, 0.44, 0.58, 0.77, 0.24, 0.98]
const GAP_WEIGHT = 2
// Tried and left out (no gain on the 40 scores): counting notes still held
// toward a hand's stretch; a weaker or stronger pull toward the target line.
// Oom-pah / stride left hand: see targetLines(). Measured: the intermediate
// La vie en rose 88.5 % → 94.5 %, all 40 scores 92.0 % → 92.1 %. Still open:
// with the melody only a 5th above the chord, its top note can go right.
//
// Cost margin at which confidence reaches 0.5 (handPreview's low-confidence
// line). At 5, 13 % of notes are marked and they hold 36 % of the wrong ones:
// a marked note is wrong about 1 time in 4, an unmarked one 1 in 18.
const CONFIDENCE_SCALE = 5

export function assignHands<T extends HandInput>(
  notes: T[],
  options: HandAssignOptions = {},
): AssignHandsResult<T> {
  if (notes.length === 0) return { assignments: [], usedFastPath: false }
  const opts = withDefaults(options)

  const fastPath = tryFastPath(notes)
  if (fastPath) return { assignments: fastPath, usedFastPath: true }

  const line = singleLineHand(notes)
  if (line) return { assignments: notes.map(note => ({ note, hand: line, confidence: 1 })), usedFastPath: false }

  return { assignments: runDividingLine(notes, opts), usedFastPath: false }
}

// Merge manually, not via spread — an options object with an explicit
// `undefined` (an unset IPC payload field) must not overwrite a default.
function withDefaults(options: HandAssignOptions): Required<HandAssignOptions> {
  const opts = { ...DEFAULTS }
  for (const k of Object.keys(options) as (keyof HandAssignOptions)[]) {
    if (options[k] !== undefined) (opts as any)[k] = options[k]
  }
  return opts
}

// ── Keyboard tracks → instruments → hands ────────────────────────────────────

export interface HandTrack<T extends HandInput> {
  /** the track name as written in the file (not a display fallback) */
  name: string
  channel: number
  group: string
  notes: T[]
}

const RIGHT_WORDS = /\b(right|rh|r\.h\.?|treble|upper)\b/i
const LEFT_WORDS = /\b(left|lh|l\.h\.?|bass|lower)\b/i
const HAND_WORDS = /\b(right|left|rh|lh|r\.h\.?|l\.h\.?|treble|bass|upper|lower|hand)\b/gi

/** Two tracks that are the upper and lower staff of one instrument, by index into the input. */
export interface StavePair { upper: number; lower: number }

// A notation program writes a two-staff instrument as two tracks. They count
// as one instrument's staves when (all on the same instrument family):
//   1. they are named for the hands ("Piano RH" / "Piano LH", treble/bass …)
//      and the rest of the names match, or
//   2. they are the only two keyboard tracks on one MIDI channel (one channel
//      = one sound; MuseScore, Sibelius and Finale write both staves there), or
//   3. they are the only two tracks with one non-empty name.
// Anything else — two tracks on different channels with different names — is
// two instruments (piano + organ, Organ 1 + Organ 2), each with its own hands.
// Only an exact pair counts: three tracks sharing a channel or a name are not
// guessed into staves.
// Rules 2 and 3 also need the two parts to look like two hands: clearly apart
// on average and hardly ever striking the same note together. Checked on the
// whole library (scripts/hand-audit/pairs.mjs): one-channel staves sit 11–27
// semitones apart; the one-channel pairs that were really two parts in one
// register (two pianos, two choir lines) sat 0–6 apart.
const CHANNEL_PAIR_MIN_GAP = 7    // semitones between averages, rule 2 with different names
const NAME_PAIR_MIN_GAP = 3       // rule 3, and rule 2 with the same name
const PAIR_MAX_UNISONS = 0.02     // share of notes struck at once on the same key in both
export function findStavePairs(tracks: HandTrack<HandInput>[]): StavePair[] {
  const pairs: StavePair[] = []
  const used = new Set<number>()
  const live = tracks.map((t, i) => i).filter(i => tracks[i].notes.length > 0)
  // some files pad names with NUL or other control characters ("Piano\0")
  const nameOf = (i: number) => tracks[i].name.replace(/[\u0000-\u001f]/g, '').trim()
  const avg = (i: number) => average(tracks[i].notes.map(n => n.midi))
  const add = (a: number, b: number, upper?: number) => {
    const up = upper ?? (avg(a) >= avg(b) ? a : b)
    pairs.push({ upper: up, lower: up === a ? b : a })
    used.add(a); used.add(b)
  }

  // 1. hand names
  const stem = (name: string) => name.replace(HAND_WORDS, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase()
  const rights = live.filter(i => RIGHT_WORDS.test(nameOf(i)) && !LEFT_WORDS.test(nameOf(i)))
  const lefts = live.filter(i => LEFT_WORDS.test(nameOf(i)) && !RIGHT_WORDS.test(nameOf(i)))
  for (const r of rights) {
    const match = lefts.filter(l => !used.has(l) && tracks[l].group === tracks[r].group && stem(nameOf(l)) === stem(nameOf(r)))
    const rivals = rights.filter(o => o !== r && tracks[o].group === tracks[r].group && stem(nameOf(o)) === stem(nameOf(r)))
    if (match.length === 1 && rivals.length === 0 && !used.has(r)) add(r, match[0], r)
  }

  // 2. one channel, exactly two keyboard tracks of one family
  // 3. one non-empty name, exactly two tracks of one family
  const looksLikeTwoHands = (a: number, b: number, minGap: number) =>
    Math.abs(avg(a) - avg(b)) >= minGap && collisionRate(tracks[a].notes, tracks[b].notes) <= PAIR_MAX_UNISONS
  const sameName = (a: number, b: number) => nameOf(a).toLowerCase() === nameOf(b).toLowerCase()
  const byKey = (key: (i: number) => string | null, minGap: (a: number, b: number) => number) => {
    const groups = new Map<string, number[]>()
    for (const i of live) {
      const k = key(i)
      if (k === null) continue
      groups.set(k, [...(groups.get(k) ?? []), i])
    }
    for (const [a, b, ...rest] of groups.values()) {
      if (b === undefined || rest.length || used.has(a) || used.has(b)) continue
      if (tracks[a].group !== tracks[b].group) continue
      if (!looksLikeTwoHands(a, b, minGap(a, b))) continue
      add(a, b)
    }
  }
  byKey(i => `ch${tracks[i].channel}`, (a, b) => sameName(a, b) ? NAME_PAIR_MIN_GAP : CHANNEL_PAIR_MIN_GAP)
  byKey(i => nameOf(i) ? `name:${nameOf(i).toLowerCase()}` : null, () => NAME_PAIR_MIN_GAP)

  return pairs
}

// Hands for every keyboard track of a song, instrument by instrument (see
// findStavePairs). `keep(note)` marks notes whose hand is already settled (a
// manual correction, a restored hint): they are left out of the result, and
// out of the guessing for their track.
export function assignHandsByTrack<T extends HandInput>(
  tracks: HandTrack<T>[],
  options: HandAssignOptions = {},
  keep: (note: T) => boolean = () => false,
): HandAssignedNote<T>[] {
  const out: HandAssignedNote<T>[] = []
  const paired = new Set<number>()
  for (const { upper, lower } of findStavePairs(tracks)) {
    paired.add(upper); paired.add(lower)
    for (const note of tracks[upper].notes) if (!keep(note)) out.push({ note, hand: 'R', confidence: 1 })
    for (const note of tracks[lower].notes) if (!keep(note)) out.push({ note, hand: 'L', confidence: 1 })
  }
  tracks.forEach((t, i) => {
    if (paired.has(i)) return
    // stripped of track/channel so one track is always one stream, never a fast-path pair
    const open = t.notes.filter(n => !keep(n))
    const stream = open.map(n => ({ midi: n.midi, time: n.time, duration: n.duration, src: n }))
    for (const a of assignHands(stream, options).assignments) out.push({ note: a.note.src, hand: a.hand, confidence: a.confidence })
  })
  return out
}

// ── Fast path: a stream that is visibly two tracks / channels of one instrument ──
function tryFastPath<T extends HandInput>(notes: T[]): HandAssignedNote<T>[] | null {
  const byTrack = groupByKey(notes, n => n.trackIndex)
  let groups = byTrack.size === 2 ? [...byTrack.values()] : null
  if (!groups) {
    const byChannel = groupByKey(notes, n => n.channel)
    groups = byChannel.size === 2 ? [...byChannel.values()] : null
  }
  if (!groups) return null
  // every note must belong to one of the two groups
  if (groups[0].length + groups[1].length !== notes.length) return null

  const [a, b] = groups
  const groupA = a[0]?.group
  const groupB = b[0]?.group
  if (groupA !== undefined && groupB !== undefined && groupA !== groupB) return null

  const avgA = average(a.map(n => n.midi))
  const avgB = average(b.map(n => n.midi))
  if (Math.abs(avgA - avgB) < FAST_PATH_MIN_AVG_GAP) return null
  if (collisionRate(a, b) > FAST_PATH_MAX_COLLISION_RATE) return null

  const [lhGroup, rhGroup] = avgA < avgB ? [a, b] : [b, a]
  const assignments: HandAssignedNote<T>[] = []
  for (const note of lhGroup) assignments.push({ note, hand: 'L', confidence: 1 })
  for (const note of rhGroup) assignments.push({ note, hand: 'R', confidence: 1 })
  return assignments
}

function groupByKey<T>(notes: T[], keyFn: (n: T) => number | undefined): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const n of notes) {
    const k = keyFn(n)
    if (k === undefined) continue
    const arr = map.get(k)
    if (arr) arr.push(n)
    else map.set(k, [n])
  }
  return map
}

function average(nums: number[]): number {
  return nums.reduce((s, v) => s + v, 0) / nums.length
}

function collisionRate<T extends HandInput>(a: T[], b: T[], toleranceSec = 0.02): number {
  const bucketOf = (t: number) => Math.round(t / toleranceSec)
  const bBuckets = new Map<number, Set<number>>()
  for (const n of b) {
    const key = bucketOf(n.time)
    const set = bBuckets.get(key) ?? new Set<number>()
    set.add(n.midi)
    bBuckets.set(key, set)
  }
  let collisions = 0
  for (const n of a) if (bBuckets.get(bucketOf(n.time))?.has(n.midi)) collisions++
  return collisions / (a.length + b.length)
}

// ── Single melodic line → one hand ───────────────────────────────────────────
// A sung melody written on a staff, a bass line: one hand plays it, so it is
// never split. Needs note lengths; without them (or with too few notes) this
// says nothing and the dividing line decides.
function singleLineHand(notes: HandInput[]): Hand | null {
  if (notes.length < 8) return null
  const events: [number, number][] = []
  for (const n of notes) {
    const end = n.time + (n.duration ?? 0) - LINE_OVERLAP_SEC
    if (end > n.time) events.push([n.time, 1], [end, -1])
  }
  if (events.length < notes.length) return null // most notes carry no length
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let count = 0, last = 0, sounding = 0, poly = 0
  for (const [t, d] of events) {
    if (count >= 1) sounding += t - last
    if (count >= 2) poly += t - last
    count += d
    last = t
  }
  if (sounding <= 0 || poly / sounding >= SINGLE_LINE_MAX_POLY_SHARE) return null
  const sorted = notes.map(n => n.midi).sort((a, b) => a - b)
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  if (p(0.95) - p(0.05) > SINGLE_LINE_MAX_RANGE) return null
  return average(sorted) >= REGISTER_SPLIT ? 'R' : 'L'
}

// ── Moving dividing line ─────────────────────────────────────────────────────

interface Cluster<T> { notes: T[]; pitches: number[]; time: number }

function clusterByOnset<T extends HandInput>(sorted: T[], toleranceSec: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = []
  for (const note of sorted) {
    const cur = clusters[clusters.length - 1]
    if (cur && note.time - cur.time <= toleranceSec) cur.notes.push(note)
    else clusters.push({ notes: [note], pitches: [], time: note.time })
  }
  for (const c of clusters) c.pitches = c.notes.map(n => n.midi).sort((a, b) => a - b)
  return clusters
}

// Best split of sorted pitches into a low and a high group (least spread
// within the groups). Returns the line between them and the groups' averages.
function twoGroups(ps: number[]): { line: number; low: number; high: number } | null {
  const n = ps.length
  if (n < 2) return null
  const pre = [0], pre2 = [0]
  for (const p of ps) { pre.push(pre[pre.length - 1] + p); pre2.push(pre2[pre2.length - 1] + p * p) }
  let best: { v: number; line: number; low: number; high: number } | null = null
  for (let k = 1; k < n; k++) {
    if (ps[k] === ps[k - 1]) continue
    const s1 = pre[k], s2 = pre[n] - pre[k], q1 = pre2[k], q2 = pre2[n] - pre2[k]
    const v = (q1 - s1 * s1 / k) + (q2 - s2 * s2 / (n - k))
    if (!best || v < best.v) best = { v, line: (ps[k - 1] + ps[k]) / 2 + 0.5, low: s1 / k, high: s2 / (n - k) }
  }
  return best
}

// Best split of sorted pitches into a low, a middle and a high group, over
// the distinct pitches (at most 88) so a long window stays cheap. Returns the
// two lines between the groups and the groups' averages.
function threeGroups(ps: number[]): { line1: number; line2: number; low: number; mid: number; high: number } | null {
  const u: number[] = [], c: number[] = []
  for (const p of ps) { if (u.length && u[u.length - 1] === p) c[c.length - 1]++; else { u.push(p); c.push(1) } }
  const m = u.length
  if (m < 3) return null
  const N = [0], S = [0], Q = [0]
  for (let i = 0; i < m; i++) { N.push(N[i] + c[i]); S.push(S[i] + c[i] * u[i]); Q.push(Q[i] + c[i] * u[i] * u[i]) }
  const spread = (i: number, j: number) => { const n = N[j] - N[i], s = S[j] - S[i]; return (Q[j] - Q[i]) - s * s / n }
  const mean = (i: number, j: number) => (S[j] - S[i]) / (N[j] - N[i])
  let best: { v: number; i: number; j: number } | null = null
  for (let i = 1; i < m - 1; i++) {
    const lowSpread = spread(0, i)
    for (let j = i + 1; j < m; j++) {
      const v = lowSpread + spread(i, j) + spread(j, m)
      if (!best || v < best.v) best = { v, i, j }
    }
  }
  if (!best) return null
  const { i, j } = best
  return { line1: (u[i - 1] + u[i]) / 2 + 0.5, line2: (u[j - 1] + u[j]) / 2 + 0.5, low: mean(0, i), mid: mean(i, j), high: mean(j, m) }
}

// Where the line wants to be at each moment, from the notes around it.
//
// Two groups (left hand low, right hand high) is the usual picture, and the
// line goes in the widest gap. An oom-pah or stride left hand — a bass note,
// then a chord around middle C, the melody above — fools that: the widest gap
// is bass to chord, and a line there hands the chord to the right hand. What
// marks a stride is that the bass and the chord take turns, never struck
// together, so one hand can play both. So when the notes form three clear
// groups, the middle group sits in the left hand's register, and it is almost
// never struck together with the low group, the line goes above it.
function targetLines<T extends HandInput>(clusters: Cluster<T>[], sortedPitchTimes: { t: number; p: number }[]): number[] {
  const target: number[] = []
  let a = 0, b = 0, ca = 0, cb = 0
  for (const c of clusters) {
    while (a < sortedPitchTimes.length && sortedPitchTimes[a].t < c.time - WINDOW_SEC) a++
    while (b < sortedPitchTimes.length && sortedPitchTimes[b].t <= c.time + WINDOW_SEC) b++
    while (ca < clusters.length && clusters[ca].time < c.time - WINDOW_SEC) ca++
    while (cb < clusters.length && clusters[cb].time <= c.time + WINDOW_SEC) cb++
    const ps: number[] = []
    for (let i = a; i < b; i++) ps.push(sortedPitchTimes[i].p)
    ps.sort((x, y) => x - y)
    const g = twoGroups(ps)
    if (g && g.high - g.low >= MIN_GROUP_SEPARATION) {
      const three = THREE_GROUP_MIN_GAP > 0 ? threeGroups(ps) : null
      let line = g.line
      if (three && three.mid < STRIDE_CHORD_MAX && three.mid - three.low >= THREE_GROUP_MIN_GAP && three.high - three.mid >= THREE_GROUP_MIN_GAP) {
        // of the moments that strike a middle note, how many also strike a bass note
        let withMid = 0, withBoth = 0
        for (let k = ca; k < cb; k++) {
          const cp = clusters[k].pitches
          const hasMid = cp.some(p => p >= three.line1 && p < three.line2)
          if (!hasMid) continue
          withMid++
          if (cp.some(p => p < three.line1)) withBoth++
        }
        if (withMid > 0 && withBoth / withMid <= STRIDE_MAX_SHARED) line = three.line2
      }
      target.push(line)
    } else {
      // one hand only: register decides which, the line stays clear of it
      const m = average(ps)
      target.push(m >= REGISTER_SPLIT ? Math.min(ps[0] - 1, REGISTER_SPLIT) : Math.max(ps[ps.length - 1] + 1, REGISTER_SPLIT))
    }
  }
  return target
}

// In-place: f[s] = min over t of (f[t] + w·|s − t|), with the arg-min in idx.
function distanceTransform(f: Float64Array, idx: Int16Array, w: number): void {
  const S = f.length
  for (let s = 0; s < S; s++) idx[s] = s
  for (let s = 1; s < S; s++) if (f[s - 1] + w < f[s]) { f[s] = f[s - 1] + w; idx[s] = idx[s - 1] }
  for (let s = S - 2; s >= 0; s--) if (f[s + 1] + w < f[s]) { f[s] = f[s + 1] + w; idx[s] = idx[s + 1] }
}

function runDividingLine<T extends HandInput>(notes: T[], opts: Required<HandAssignOptions>): HandAssignedNote<T>[] {
  const sorted = [...notes].sort((a, b) => a.time - b.time)
  const clusters = clusterByOnset(sorted, opts.clusterToleranceSec)
  const target = targetLines(clusters, sorted.map(n => ({ t: n.time, p: n.midi })))

  // Line positions: notes at or above LO + s are right hand. One below the
  // lowest note to one above the highest, so "all left" and "all right" exist.
  let minP = Infinity, maxP = -Infinity
  for (const n of notes) { if (n.midi < minP) minP = n.midi; if (n.midi > maxP) maxP = n.midi }
  const LO = minP, S = maxP - minP + 2
  const K = clusters.length

  const emission = (k: number, out: Float64Array) => {
    const ps = clusters[k].pitches
    // chord-gap cost: every neighbouring pair kept in one hand, plus the
    // change for the one pair the line falls between
    const together: number[] = [], apart: number[] = []
    let allTogether = 0
    for (let q = 1; q < ps.length; q++) {
      const chance = GAP_SPLIT_CHANCE[Math.min(ps[q] - ps[q - 1], GAP_SPLIT_CHANCE.length - 1)]
      together.push(-Math.log(1 - chance)); apart.push(-Math.log(chance))
      allTogether += together[q - 1]
    }
    let split = 0
    for (let s = 0; s < S; s++) {
      const line = LO + s
      while (split < ps.length && ps[split] < line) split++
      const nL = split, nR = ps.length - split
      const spanL = nL ? ps[nL - 1] - ps[0] : 0
      const spanR = nR ? ps[ps.length - 1] - ps[split] : 0
      const overL = Math.max(0, spanL - opts.maxSpanSemitones), overR = Math.max(0, spanR - opts.maxSpanSemitones)
      const fL = Math.max(0, nL - opts.lhMaxFingers), fR = Math.max(0, nR - opts.rhMaxFingers)
      const gap = split > 0 && split < ps.length ? allTogether - together[split - 1] + apart[split - 1] : allTogether
      out[s] = TARGET_WEIGHT * Math.abs(line - target[k])
        + SPAN_WEIGHT * (overL * overL + overR * overR)
        + FINGER_WEIGHT * (fL * fL + fR * fR)
        + GAP_WEIGHT * gap
    }
  }

  // Forward pass (Viterbi), keeping each moment's emission for the backward pass.
  const em: Float64Array[] = []
  const fwd: Float64Array[] = []
  const back: Int16Array[] = []
  for (let k = 0; k < K; k++) {
    const e = new Float64Array(S)
    emission(k, e)
    em.push(e)
    const cur = new Float64Array(S)
    const bk = new Int16Array(S)
    if (k === 0) cur.set(e)
    else {
      const f = Float64Array.from(fwd[k - 1])
      distanceTransform(f, bk, MOVE_WEIGHT)
      for (let s = 0; s < S; s++) cur[s] = f[s] + e[s]
    }
    fwd.push(cur)
    back.push(bk)
  }

  // Best path.
  const path = new Int16Array(K)
  let s = 0
  for (let i = 1; i < S; i++) if (fwd[K - 1][i] < fwd[K - 1][s]) s = i
  for (let k = K - 1; k >= 0; k--) { path[k] = s; if (k > 0) s = back[k][s] }

  // Backward pass for confidence: the cheapest whole path through each line
  // position (forward + backward cost). A moment's confidence is how much more
  // the cheapest path that splits its notes differently would cost.
  const results: HandAssignedNote<T>[] = []
  let bwd = new Float64Array(S)
  const tmpIdx = new Int16Array(S)
  for (let k = K - 1; k >= 0; k--) {
    const total = (pos: number) => fwd[k][pos] + bwd[pos]
    const ps = clusters[k].pitches
    const splitAt = (pos: number) => { let c = 0; while (c < ps.length && ps[c] < LO + pos) c++; return c }
    const chosen = path[k]
    const chosenSplit = splitAt(chosen)
    const best = total(chosen)
    let alt = Infinity
    for (let pos = 0; pos < S; pos++) if (splitAt(pos) !== chosenSplit) alt = Math.min(alt, total(pos))
    const margin = Math.max(0, alt - best)
    const confidence = Number.isFinite(margin) ? margin / (margin + CONFIDENCE_SCALE) : 1
    const line = LO + chosen
    for (const note of clusters[k].notes) results.push({ note, hand: note.midi >= line ? 'R' : 'L', confidence })

    if (k > 0) {
      const next = new Float64Array(S)
      for (let p = 0; p < S; p++) next[p] = em[k][p] + bwd[p]
      distanceTransform(next, tmpIdx, MOVE_WEIGHT)
      bwd = next
    }
  }

  // back to the caller's order
  const order = new Map<T, number>()
  notes.forEach((n, i) => order.set(n, i))
  results.sort((a, b) => order.get(a.note)! - order.get(b.note)!)
  return results
}
