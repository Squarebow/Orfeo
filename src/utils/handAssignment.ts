// ── assignHands() — unified hand-assignment engine ───────────────────────────
//
// Single entry point meant to back split / hand-color / merge alike (Stage 3
// wires it in). Not wired to any UI yet — pure, deterministic, no ML.
//
// Two paths:
//   1. Fast path — input already looks like a clean 2-track/2-channel hand
//      split (notation-software export convention). Cheap label by avg pitch,
//      skip the DP entirely.
//   2. Real path — single ambiguous stream. Cluster by onset, then a Viterbi
//      DP over per-cluster L/R partitions, minimizing span-violation +
//      hand-movement + crossing cost.

import type { Hand } from '../types'
import { Chord, Note } from 'tonal'
export type { Hand }
export type CrossingMode = 'strict' | 'faithful'

export interface HandInput {
  midi: number
  time: number
  trackIndex?: number
  channel?: number
}

export interface HandAssignOptions {
  /** 'strict' = hands never cross (default, best for learning-mode splits). */
  /** 'faithful' = DP may pick a crossing when cost genuinely favors it. */
  crossingMode?: CrossingMode
  /** Max comfortable one-hand stretch, in semitones. ~16 = a 10th. Tunable per user hand size later. */
  maxSpanSemitones?: number
  /** Onset tolerance (seconds) for treating near-simultaneous notes as one cluster/chord. */
  clusterToleranceSec?: number
  /** Max notes of a wide chord the right hand can take (from the top). 4 (default) or 5 fingers. */
  rhMaxFingers?: number
  /** Max notes of a wide chord the left hand can take (from the bottom). 4 (default) or 5 fingers. */
  lhMaxFingers?: number
}

export interface HandAssignedNote<T extends HandInput> {
  note: T
  hand: Hand
  /** 0..1 — how forced the decision was. 1 = clean gap or fast-path label, low = DP broke a near-tie. */
  confidence: number
}

export interface AssignHandsResult<T extends HandInput> {
  assignments: HandAssignedNote<T>[]
  usedFastPath: boolean
}

const DEFAULTS: Required<HandAssignOptions> = {
  crossingMode: 'strict',
  maxSpanSemitones: 16,
  clusterToleranceSec: 0.02,
  rhMaxFingers: 4,
  lhMaxFingers: 4,
}

// ── Fast-path thresholds ──────────────────────────────────────────────────────
const FAST_PATH_MAX_COLLISION_RATE = 0.02  // ≥2% exact-pitch unisons at same tick → not a clean split
const FAST_PATH_MIN_AVG_GAP = 3            // semitones between the two groups' average pitch

// ── DP cost weights ───────────────────────────────────────────────────────────
const SPAN_WEIGHT = 2          // quadratic penalty per semitone over max span
// Quadratic penalty per note over a hand's max-fingers cap (rhMaxFingers/
// lhMaxFingers, user-configurable 4 or 5 each). Same quadratic-over-limit
// shape as SPAN_WEIGHT, which is what makes "prefer the most even split"
// fall out for free once a cluster exceeds combined capacity — minimizing
// overL^2 + overR^2 subject to left+right=N is minimized by the most equal
// split, no separate even-split-fallback branch needed.
const FINGER_WEIGHT = 3
const MOVE_WEIGHT = 1          // cost per semitone of hand-center movement between clusters
const CROSS_PENALTY = 12       // flat cost added when a candidate partition interleaves L/R pitches
// Flat cost for splitting a cluster across both hands when the WHOLE cluster
// already fits inside one hand's reach (span <= maxSpanSemitones). Without
// this, a comfortably-reachable chord (e.g. a 3-note Csus2 spanning a 7th)
// has zero span cost whether played whole or split, so the DP would split it
// for a fraction-of-a-semitone movement saving — a real player never splits a
// reachable chord just because a nearby prior note happened to lean a bit
// left. Only applies when the split wasn't forced by span in the first place.
const UNNECESSARY_SPLIT_PENALTY = 20
// Flat cost for switching which hand plays a monophonic (single-hand)
// cluster compared to the previous one. Without this, a purely monophonic
// line (one note at a time, no chords) can cheaply "ping-pong" between
// hands whenever the melody happens to dip back near wherever the idle
// hand's last position was — e.g. an RH arpeggio revisiting a low note near
// where the never-used LH's anchor sits gets reassigned to L for that note,
// even though there's no polyphony at all requiring two hands. Only applies
// between two single-hand clusters; a real chord split (both hands active)
// isn't a "switch" and isn't penalized here — that's UNNECESSARY_SPLIT_PENALTY's job.
const HAND_SWITCH_PENALTY = 4
// Seconds of continuous silence after which a hand's carried pitch center
// stops being trusted as "nearby" and decays toward the register-split
// fallback instead. Without this, a hand's last position from several bars
// ago stays a full-strength attractor forever — a new same-register passage
// starting well after that hand went silent gets pulled toward it purely by
// stale pitch proximity, even when the OTHER hand just finished playing
// directly adjacent to it (see docs/LR Hand rework — bar ~112 of the
// Hornsby file: a new LH comping figure got assigned to R because R had
// just ended a phrase nearby, while L's real anchor was 6+ seconds stale).
const ANCHOR_DECAY_WINDOW_SEC = 5
// Linear penalty, per semitone, for L's carried center ending up ABOVE R's —
// i.e. the two hands' established registers have inverted. Zero-cost inside
// any real split cluster (strict mode's prefix split already guarantees
// left <= right there), so this only ever bites during idle/monophonic
// stretches where one hand's stale carried center could otherwise drift past
// the other's with nothing to stop it. Gentle relative to CROSS_PENALTY/
// UNNECESSARY_SPLIT_PENALTY since it's a soft tiebreak, not a hard rule.
const IDENTITY_INVERSION_WEIGHT = 0.5
// Harmonic prior (tonal.js) — a soft, LOCAL bias, not a rule. When a short
// run of clusters within HARMONIC_WINDOW_SEC collectively spells a
// recognizable chord (a broken chord/arpeggio spread across several onsets,
// not one simultaneous cluster — that case is already handled by
// UNNECESSARY_SPLIT_PENALTY), switching hands between two of those clusters
// costs more, scoped ONLY to that window. This is deliberately narrower
// than the phrase-continuity idea tried earlier this session (which scaled
// switch cost by run length globally and caused a real regression on a
// legitimately-alternating ostinato) — a recognized chord shape is a much
// more specific signal than "this hand has been busy for a while."
const HARMONIC_WINDOW_SEC = 0.6
const HARMONIC_SWITCH_MULTIPLIER = 2.5
const CONFIDENCE_SCALE = 6     // cost-margin scale used to normalize confidence into 0..1
// Post-DP cleanup gate: an isolated single-cluster flip (one cluster's hand
// disagreeing with both neighbors, which agree with each other) only gets
// smoothed to match its neighbors when the DP's own confidence at that
// cluster was already low. This is the difference between fixing a genuine
// near-tie and silently erasing a real, correct pattern — verified on real
// data: a sparse single-note bass ostinato surrounded by continuous treble
// activity produces exactly this "isolated" shape but scores confidently
// (0.6-0.8+); the genuine mis-assignments this targets score low (<0.5,
// often near 0.1-0.4). Gating on confidence, not on "isolated" alone, is
// what makes this safe to run unconditionally rather than another
// global heuristic that quietly breaks a different passage.
const CLEANUP_CONFIDENCE_THRESHOLD = 0.5

export function assignHands<T extends HandInput>(
  notes: T[],
  options: HandAssignOptions = {},
): AssignHandsResult<T> {
  if (notes.length === 0) return { assignments: [], usedFastPath: false }
  // Merge manually, not via spread — a caller passing an options object with
  // an explicit `undefined` value (e.g. an IPC payload field that wasn't
  // set) would otherwise overwrite the default with `undefined` (spread
  // doesn't skip undefined values), silently breaking the default.
  const opts = { ...DEFAULTS }
  for (const k of Object.keys(options) as (keyof HandAssignOptions)[]) {
    if (options[k] !== undefined) (opts as any)[k] = options[k]
  }

  const fastPath = tryFastPath(notes)
  if (fastPath) {
    // Re-validate before trusting — a file split by an OLDER, buggier
    // engine version still looks like a clean 2-track split by these
    // track-level stats (avg pitch gap, low collision rate), but its actual
    // note-by-note content may not match what the CURRENT engine would
    // produce. Compare against a real full run rather than trusting
    // blindly — the DP is fast enough on realistic note counts that this
    // costs nothing worth avoiding, and it sidesteps the correctness edge
    // cases a partial-sample comparison would have (a sample starting
    // mid-piece has no real history, unlike the actual piece at that point).
    const full = runDpAssignment(notes, opts)
    if (agreementRate(fastPath, full) >= FAST_PATH_TRUST_THRESHOLD) {
      return { assignments: fastPath, usedFastPath: true }
    }
    return { assignments: full, usedFastPath: false }
  }

  return { assignments: runDpAssignment(notes, opts), usedFastPath: false }
}

// A genuinely well-split file does NOT hit high agreement with a fresh full
// DP run on its merged notes — measured 78.7% on a real file this session's
// own engine split correctly. That's expected, not a red flag: a split
// track's membership was decided by the DP's real per-cluster, full-context
// reasoning at split time; this fast-path re-derivation is a much cruder
// "whichever track has the lower average pitch is L" heuristic applied
// after the fact, on a stream where track membership no longer carries any
// context. The two are different sources of truth by design, not the same
// computation run twice — an 85% bar would reject good files constantly.
// This threshold only needs to catch a file whose actual per-note content
// doesn't match the CURRENT engine at all (e.g. split by a much older,
// buggier version) — set with real margin below the one legitimate
// data point measured, since a single sample doesn't justify a tight bar
// (see docs/LR Hand rework — Phase 6 validation for the measurement).
const FAST_PATH_TRUST_THRESHOLD = 0.5

function agreementRate<T extends HandInput>(a: HandAssignedNote<T>[], b: HandAssignedNote<T>[]): number {
  if (a.length === 0) return 1
  const bHandByNote = new Map<T, Hand>()
  for (const x of b) bHandByNote.set(x.note, x.hand)
  let agree = 0
  for (const x of a) if (bHandByNote.get(x.note) === x.hand) agree++
  return agree / a.length
}

// ── Fast path: already-split 2-track / 2-channel input ────────────────────────
function tryFastPath<T extends HandInput>(notes: T[]): HandAssignedNote<T>[] | null {
  const byTrack = groupByKey(notes, n => n.trackIndex)
  let groups = byTrack.size === 2 ? [...byTrack.values()] : null

  // Track index unreliable/absent (e.g. both tracks share channel 0, or a
  // caller passed a flat merged stream with no trackIndex) → try channel.
  if (!groups) {
    const byChannel = groupByKey(notes, n => n.channel)
    groups = byChannel.size === 2 ? [...byChannel.values()] : null
  }
  if (!groups) return null

  const [a, b] = groups
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

// Bucket by rounded onset so unison-collision detection is O(n) not O(n*m).
function collisionRate<T extends HandInput>(a: T[], b: T[], toleranceSec = 0.02): number {
  const bucketOf = (t: number) => Math.round(t / toleranceSec)
  const bBuckets = new Map<string, Set<number>>()
  for (const n of b) {
    const key = String(bucketOf(n.time))
    const set = bBuckets.get(key) ?? new Set<number>()
    set.add(n.midi)
    bBuckets.set(key, set)
  }
  let collisions = 0
  for (const n of a) {
    const key = String(bucketOf(n.time))
    if (bBuckets.get(key)?.has(n.midi)) collisions++
  }
  return collisions / (a.length + b.length)
}

// ── Real path: cluster + Viterbi DP over per-cluster L/R partitions ─────────────

interface Cluster<T extends HandInput> {
  notes: T[]              // sorted ascending by midi
  time: number            // representative onset time — first note's time
}

interface Partition<T extends HandInput> {
  left: T[]
  right: T[]
  crossing: boolean       // true if L/R pitches interleave (only possible in faithful mode)
}

interface CarriedState {
  // Each hand's recent REACH — the [lo,hi] pitch range it was last actually
  // playing — not a single point. See rangeGap()/decayedRange() below for
  // why: a single anchor point (even "nearest note to last position")
  // distorts the very next cost calculation, because pinning to one edge of
  // a chord makes the chord's OTHER edge look artificially far away a
  // moment later, when physically the hand already covers the whole span.
  leftLo: number | null
  leftHi: number | null
  rightLo: number | null
  rightHi: number | null
  leftActiveAt: number    // time this hand last actually played a note; -Infinity if never
  rightActiveAt: number
}

function runDpAssignment<T extends HandInput>(
  notes: T[],
  opts: Required<HandAssignOptions>,
): HandAssignedNote<T>[] {
  // Map by reference, not by mutating the caller's note objects, to recover
  // original array order after time-sorting for clustering.
  const origIdx = new Map<T, number>()
  notes.forEach((note, i) => origIdx.set(note, i))

  const sortedNotes = [...notes].sort((a, b) => a.time - b.time)
  const clusters = clusterByOnset(sortedNotes, opts.clusterToleranceSec)
  const partitionsPerCluster = clusters.map(c => candidatePartitions(c, opts))
  const harmonicLinks = detectHarmonicLinks(clusters, opts)

  // ── Never-played fallback anchors — split by register, not one shared mean.
  // A single symmetric fallbackCenter for BOTH hands means the very first
  // note's L/R label is an arbitrary tie-break (both partitions cost the
  // same when neither hand has played yet), and nothing afterward ties that
  // choice to which hand is musically "the low one" — the whole piece can
  // end up with low notes labeled R and high notes labeled L throughout,
  // not just drifting late. Seeding L's never-played anchor low and R's
  // high breaks that symmetry from note one. ────────────────────────────────
  const pitches = notes.map(n => n.midi).sort((a, b) => a - b)
  const mid = Math.floor(pitches.length / 2)
  const fallbackLeft  = average(pitches.slice(0, Math.max(1, mid)))
  const fallbackRight = average(pitches.slice(mid === 0 ? 0 : mid))

  // dp[k][i] = min total cost of reaching partition i of cluster k.
  // centers[k][i] = carried state along the optimal path into this cell:
  // each hand's last *actually played* pitch center (carried forward through
  // idle clusters, so reactivating a hand isn't free), and the time it was
  // last actually active (for anchor decay — see ANCHOR_DECAY_WINDOW_SEC). ──
  const dp: number[][] = []
  const back: number[][] = []
  const centers: CarriedState[][] = []

  for (let k = 0; k < clusters.length; k++) {
    const options = partitionsPerCluster[k]
    const clusterTime = clusters[k].time
    dp.push(new Array(options.length))
    back.push(new Array(options.length))
    centers.push(new Array(options.length))

    for (let i = 0; i < options.length; i++) {
      const emission = emissionCost(options[i], opts)
      const ownLeftRange = noteRange(options[i].left)
      const ownRightRange = noteRange(options[i].right)

      if (k === 0) {
        // No real history yet, but still anchored against the register-split
        // fallbacks below — not a free tie, otherwise the very first
        // cluster's L/R label is an arbitrary coin flip with nothing tying
        // it to which hand is musically the low one.
        const noHistory: CarriedState = { leftLo: null, leftHi: null, rightLo: null, rightHi: null, leftActiveAt: -Infinity, rightActiveAt: -Infinity }
        const move = movementCostFromCarried(noHistory, ownLeftRange, ownRightRange, fallbackLeft, fallbackRight, clusterTime)
        centers[k][i] = {
          leftLo: ownLeftRange?.[0] ?? null, leftHi: ownLeftRange?.[1] ?? null,
          rightLo: ownRightRange?.[0] ?? null, rightHi: ownRightRange?.[1] ?? null,
          leftActiveAt: ownLeftRange ? clusterTime : -Infinity,
          rightActiveAt: ownRightRange ? clusterTime : -Infinity,
        }
        dp[k][i] = emission + move + identityInversionCost(centers[k][i], clusterTime, fallbackLeft, fallbackRight)
        back[k][i] = -1
        continue
      }
      let best = Infinity
      let bestPrev = 0
      const prevOptions = partitionsPerCluster[k - 1]
      for (let p = 0; p < prevOptions.length; p++) {
        const prevCenters = centers[k - 1][p]
        const move = movementCostFromCarried(prevCenters, ownLeftRange, ownRightRange, fallbackLeft, fallbackRight, clusterTime)
          + handSwitchCost(prevOptions[p], options[i], harmonicLinks[k])
        const cost = dp[k - 1][p] + move
        if (cost < best) { best = cost; bestPrev = p }
      }
      back[k][i] = bestPrev
      const prevBestCenters = centers[k - 1][bestPrev]
      centers[k][i] = {
        leftLo: ownLeftRange?.[0] ?? prevBestCenters.leftLo,
        leftHi: ownLeftRange?.[1] ?? prevBestCenters.leftHi,
        rightLo: ownRightRange?.[0] ?? prevBestCenters.rightLo,
        rightHi: ownRightRange?.[1] ?? prevBestCenters.rightHi,
        leftActiveAt: ownLeftRange ? clusterTime : prevBestCenters.leftActiveAt,
        rightActiveAt: ownRightRange ? clusterTime : prevBestCenters.rightActiveAt,
      }
      dp[k][i] = best + emission + identityInversionCost(centers[k][i], clusterTime, fallbackLeft, fallbackRight)
    }
  }

  // Backtrack from the cheapest final state.
  const chosen: number[] = new Array(clusters.length)
  if (clusters.length > 0) {
    const lastRow = dp[clusters.length - 1]
    let bestIdx = 0
    for (let i = 1; i < lastRow.length; i++) if (lastRow[i] < lastRow[bestIdx]) bestIdx = i
    chosen[clusters.length - 1] = bestIdx
    for (let k = clusters.length - 1; k > 0; k--) {
      chosen[k - 1] = back[k][chosen[k]]
    }
  }

  // Confidence — how much better the chosen option was than the runner-up at
  // that same step (a clean pitch gap wins by a mile; a near-tie DP call wins
  // by almost nothing).
  const confidences = dp.map(row => {
    const sorted = [...row].sort((a, b) => a - b)
    const margin = (sorted[1] ?? sorted[0] + CONFIDENCE_SCALE) - sorted[0]
    return clamp01(margin / (margin + CONFIDENCE_SCALE))
  })

  const results: HandAssignedNote<T>[] = new Array(notes.length)
  for (let k = 0; k < clusters.length; k++) {
    const partition = partitionsPerCluster[k][chosen[k]]
    const confidence = confidences[k]
    for (const note of partition.left) {
      results[origIdx.get(note)!] = { note, hand: 'L', confidence }
    }
    for (const note of partition.right) {
      results[origIdx.get(note)!] = { note, hand: 'R', confidence }
    }
  }
  cleanupIsolatedFlips(results, opts.clusterToleranceSec)
  return results
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

// Post-DP cleanup — fixes a genuinely isolated, low-confidence single-hand
// cluster sandwiched between two clusters that agree with each other on the
// OTHER hand. Operates on the final output, not the cost function — see
// CLEANUP_CONFIDENCE_THRESHOLD above for why confidence-gating is what
// makes this safe. Re-derives onset clusters from the final results rather
// than touching runDpAssignment's internal cluster/partition state, keeping
// this a genuinely separate, independently-reasoned-about pass.
function cleanupIsolatedFlips<T extends HandInput>(results: HandAssignedNote<T>[], toleranceSec: number): void {
  const order = results.map((_, i) => i).sort((a, b) => results[a].note.time - results[b].note.time)
  const groups: number[][] = []
  let anchorTime = -Infinity
  for (const idx of order) {
    const t = results[idx].note.time
    if (groups.length === 0 || t - anchorTime > toleranceSec) { groups.push([idx]); anchorTime = t }
    else groups[groups.length - 1].push(idx)
  }

  for (let i = 1; i < groups.length - 1; i++) {
    const cur = groups[i], prev = groups[i - 1], next = groups[i + 1]
    const curHands = new Set(cur.map(idx => results[idx].hand))
    const prevHands = new Set(prev.map(idx => results[idx].hand))
    const nextHands = new Set(next.map(idx => results[idx].hand))
    if (curHands.size !== 1 || prevHands.size !== 1 || nextHands.size !== 1) continue
    const [curHand] = curHands, [prevHand] = prevHands, [nextHand] = nextHands
    if (prevHand !== nextHand || curHand === prevHand) continue
    if (!cur.every(idx => results[idx].confidence < CLEANUP_CONFIDENCE_THRESHOLD)) continue
    for (const idx of cur) results[idx] = { ...results[idx], hand: prevHand }
  }
}

function clusterByOnset<T extends HandInput>(sorted: T[], toleranceSec: number): Cluster<T>[] {
  const clusters: Cluster<T>[] = []
  let current: T[] = []
  let anchorTime = -Infinity

  for (const note of sorted) {
    if (current.length === 0 || note.time - anchorTime <= toleranceSec) {
      if (current.length === 0) anchorTime = note.time
      current.push(note)
    } else {
      clusters.push({ notes: [...current].sort((a, b) => a.midi - b.midi), time: anchorTime })
      current = [note]
      anchorTime = note.time
    }
  }
  if (current.length > 0) clusters.push({ notes: [...current].sort((a, b) => a.midi - b.midi), time: anchorTime })
  return clusters
}

// Cap combinatorial (faithful-mode) enumeration — beyond this, fall back to
// prefix-only splits even in faithful mode. Real chords rarely exceed this;
// wide multi-track merges might, and 2^13 partitions per cluster is where
// this stops being "instant".
const FAITHFUL_ENUMERATION_CAP = 12

function candidatePartitions<T extends HandInput>(
  cluster: Cluster<T>,
  opts: Required<HandAssignOptions>,
): Partition<T>[] {
  const n = cluster.notes.length
  const useSubsets = opts.crossingMode === 'faithful' && n <= FAITHFUL_ENUMERATION_CAP

  if (!useSubsets) {
    // Strict mode (or oversized cluster): every partition is a pitch-sorted
    // prefix split — this is what "hands never cross" means structurally,
    // not a rule bolted on after the fact.
    const partitions: Partition<T>[] = []
    for (let i = 0; i <= n; i++) {
      partitions.push({ left: cluster.notes.slice(0, i), right: cluster.notes.slice(i), crossing: false })
    }
    return partitions
  }

  // Faithful mode on a small cluster — enumerate every bipartition. A
  // partition is "crossing" when it isn't a clean prefix split.
  const partitions: Partition<T>[] = []
  for (let mask = 0; mask < 1 << n; mask++) {
    const left: T[] = []
    const right: T[] = []
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) right.push(cluster.notes[i])
      else left.push(cluster.notes[i])
    }
    const isPrefix = left.every(l => right.every(r => l.midi <= r.midi))
    partitions.push({ left, right, crossing: !isPrefix })
  }
  return partitions
}

function span(notes: HandInput[]): number {
  if (notes.length === 0) return 0
  const pitches = notes.map(n => n.midi)
  return Math.max(...pitches) - Math.min(...pitches)
}

// A hand's actual reach for movement-cost/carry-forward purposes — NOT the
// mean pitch of everything it's playing right now. For a single note (the
// overwhelmingly common case: monophonic lines, arpeggios) [lo,hi] collapses
// to that one note either way. It only diverges for a real multi-note
// cluster (a rolled or simultaneous chord): the mean of a wide chord's notes
// can sit nowhere any finger actually is (a hand spanning C2-G3-C4 has a
// mean around G3, not where the hand "is"), which overstates the movement
// cost to/from a genuinely nearby follow-up note near either end of that
// chord. Tracking the hand's actual span and charging a note only for
// falling *outside* that span (rangeGap below) models "the hand already
// covers this" correctly, without the failure mode a single anchor POINT
// has: pinning to one edge of a chord makes the chord's other edge look
// artificially far a moment later, when the hand demonstrably already
// reached it.
function noteRange(notes: HandInput[]): [number, number] | null {
  if (notes.length === 0) return null
  const pitches = notes.map(n => n.midi)
  return [Math.min(...pitches), Math.max(...pitches)]
}

// Span violation is a heavy quadratic penalty, never a hard reject — a
// physically-impossible 4-octave single chord still needs *some* partition
// chosen (doc's stress-test case), so infeasibility isn't an option here.
function emissionCost(p: Partition<any>, opts: Required<HandAssignOptions>): number {
  const overL = Math.max(0, span(p.left) - opts.maxSpanSemitones)
  const overR = Math.max(0, span(p.right) - opts.maxSpanSemitones)
  const spanPenalty = SPAN_WEIGHT * (overL * overL + overR * overR)
  const overFingersL = Math.max(0, p.left.length - opts.lhMaxFingers)
  const overFingersR = Math.max(0, p.right.length - opts.rhMaxFingers)
  const fingerPenalty = FINGER_WEIGHT * (overFingersL * overFingersL + overFingersR * overFingersR)
  const crossPenalty = p.crossing ? CROSS_PENALTY : 0

  // ── Don't split a cluster that already fits in one hand ──────────────────
  const isSplit = p.left.length > 0 && p.right.length > 0
  const wholeClusterSpan = span([...p.left, ...p.right])
  const unnecessarySplitPenalty = (isSplit && wholeClusterSpan <= opts.maxSpanSemitones) ? UNNECESSARY_SPLIT_PENALTY : 0

  return spanPenalty + fingerPenalty + crossPenalty + unnecessarySplitPenalty
}

// fallbackCenter: the piece-wide mean pitch, used in place of a hand's center
// when that hand has never played a single note yet (not merely idle for a
// stretch — genuinely never assigned anything, so its "true" carried center
// per the idle-carry-forward logic is still null). Without this, moving a
// note into a hand that's never been used is completely free (0 cost)
// regardless of how implausible that is — e.g. a monophonic right-hand
// arpeggio would happily "discover" the left hand for one passing note,
// since parking it there costs nothing while keeping it in the
// already-established hand costs its real (if small) movement distance.
// Charging from the piece-wide mean instead means using a never-touched hand
// still costs something proportional to how far that note actually is from
// the middle of the whole texture, not literally zero.
// Which single hand plays this cluster — null when the cluster is silent for
// this option, or when it's a genuine chord split (both hands active), since
// neither of those is "the same hand" or "a different hand," they're not a
// switch in the sense this cost cares about.
function soleHand(p: Partition<any>): Hand | null {
  const l = p.left.length > 0, r = p.right.length > 0
  if (l && !r) return 'L'
  if (r && !l) return 'R'
  return null
}

function handSwitchCost(prev: Partition<any>, next: Partition<any>, harmonicLink: boolean): number {
  const prevHand = soleHand(prev)
  const nextHand = soleHand(next)
  if (!prevHand || !nextHand || prevHand === nextHand) return 0
  return HAND_SWITCH_PENALTY * (harmonicLink ? HARMONIC_SWITCH_MULTIPLIER : 1)
}

// Marks transitions that fall inside a detected chord/arpeggio "gesture" —
// a short run of clusters within HARMONIC_WINDOW_SEC whose combined notes
// tonal recognizes as a chord. linked[k] = true means the k-1 -> k
// transition sits inside such a gesture. Deliberately only ever discourages
// a switch there (handSwitchCost above) — never forces one hand, never
// touches emissionCost's span/finger feasibility checks, so a genuinely
// too-wide voicing still splits across both hands exactly as before.
function detectHarmonicLinks<T extends HandInput>(clusters: Cluster<T>[], opts: Required<HandAssignOptions>): boolean[] {
  const linked: boolean[] = new Array(clusters.length).fill(false)
  for (let i = 0; i < clusters.length; i++) {
    let j = i
    const collected: T[] = []
    while (j < clusters.length && clusters[j].time - clusters[i].time <= HARMONIC_WINDOW_SEC) {
      collected.push(...clusters[j].notes)
      j++
    }
    if (collected.length < 3 || j - i < 2) continue
    const lo = Math.min(...collected.map(n => n.midi))
    const hi = Math.max(...collected.map(n => n.midi))
    if (hi - lo > opts.maxSpanSemitones) continue // too wide for one hand — not a single-hand gesture
    const names = collected.map(n => Note.fromMidi(n.midi))
    if (Chord.detect(names).length === 0) continue
    for (let k = i + 1; k < j; k++) linked[k] = true
  }
  return linked
}

// Must decay both sides exactly like movementCostFromCarried does before
// comparing them — otherwise a hand that's been silent for many seconds
// keeps its stale raw position at full strength here even though every
// other cost term has already stopped trusting it. That mismatch was a real
// bug: the other hand landing correctly, nearby, and fresh could get
// penalized as a false "inversion" against a long-silent hand's leftover
// position, tipping the DP toward the wrong hand for an entire passage.
function identityInversionCost(c: CarriedState, currentTime: number, fallbackLeft: number, fallbackRight: number): number {
  if (c.leftLo === null || c.rightLo === null) return 0
  const [lLo, lHi] = decayedRange(c.leftLo, c.leftHi, c.leftActiveAt, currentTime, fallbackLeft)
  const [rLo, rHi] = decayedRange(c.rightLo, c.rightHi, c.rightActiveAt, currentTime, fallbackRight)
  const leftMid = (lLo + lHi) / 2
  const rightMid = (rLo + rHi) / 2
  return IDENTITY_INVERSION_WEIGHT * Math.max(0, leftMid - rightMid)
}

// A carried range decays toward the register fallback (collapsing to a
// point) the longer its hand has been silent — a reach from one cluster ago
// is fully trusted, one from ANCHOR_DECAY_WINDOW_SEC+ seconds ago is treated
// as if that hand had never played nearby at all.
function decayedRange(prevLo: number | null, prevHi: number | null, lastActiveAt: number, currentTime: number, fallback: number): [number, number] {
  if (prevLo === null || prevHi === null) return [fallback, fallback]
  const idleSec = currentTime - lastActiveAt
  if (idleSec <= 0) return [prevLo, prevHi]
  const decayFrac = Math.min(1, idleSec / ANCHOR_DECAY_WINDOW_SEC)
  return [prevLo + (fallback - prevLo) * decayFrac, prevHi + (fallback - prevHi) * decayFrac]
}

// Distance between two ranges — 0 whenever they overlap or touch. This is
// what makes "the hand already reaches here" free: a follow-up note or
// chord landing anywhere inside the hand's recent span costs nothing, only
// a genuine reach beyond it does.
function rangeGap(lo1: number, hi1: number, lo2: number, hi2: number): number {
  if (hi1 < lo2) return lo2 - hi1
  if (hi2 < lo1) return lo1 - hi2
  return 0
}

function movementCostFromCarried(
  prev: CarriedState,
  nextLeftRange: [number, number] | null,
  nextRightRange: [number, number] | null,
  fallbackLeft: number,
  fallbackRight: number,
  currentTime: number,
): number {
  let cost = 0
  if (nextLeftRange) {
    const [lo, hi] = decayedRange(prev.leftLo, prev.leftHi, prev.leftActiveAt, currentTime, fallbackLeft)
    cost += MOVE_WEIGHT * rangeGap(nextLeftRange[0], nextLeftRange[1], lo, hi)
  }
  if (nextRightRange) {
    const [lo, hi] = decayedRange(prev.rightLo, prev.rightHi, prev.rightActiveAt, currentTime, fallbackRight)
    cost += MOVE_WEIGHT * rangeGap(nextRightRange[0], nextRightRange[1], lo, hi)
  }
  return cost
}
