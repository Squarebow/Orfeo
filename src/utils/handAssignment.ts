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
}

// ── Fast-path thresholds ──────────────────────────────────────────────────────
const FAST_PATH_MAX_COLLISION_RATE = 0.02  // ≥2% exact-pitch unisons at same tick → not a clean split
const FAST_PATH_MIN_AVG_GAP = 3            // semitones between the two groups' average pitch

// ── DP cost weights ───────────────────────────────────────────────────────────
const SPAN_WEIGHT = 2          // quadratic penalty per semitone over max span
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
const CONFIDENCE_SCALE = 6     // cost-margin scale used to normalize confidence into 0..1

export function assignHands<T extends HandInput>(
  notes: T[],
  options: HandAssignOptions = {},
): AssignHandsResult<T> {
  if (notes.length === 0) return { assignments: [], usedFastPath: false }
  const opts = { ...DEFAULTS, ...options }

  const fastPath = tryFastPath(notes)
  if (fastPath) return { assignments: fastPath, usedFastPath: true }

  return { assignments: runDpAssignment(notes, opts), usedFastPath: false }
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
}

interface Partition<T extends HandInput> {
  left: T[]
  right: T[]
  crossing: boolean       // true if L/R pitches interleave (only possible in faithful mode)
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
  const fallbackCenter = average(notes.map(n => n.midi))

  // dp[k][i] = min total cost of reaching partition i of cluster k.
  // centers[k][i] = each hand's last *actually played* pitch center along the
  // optimal path into this cell — carried forward through clusters where a
  // hand sits idle, so a hand doesn't get a free zero-cost reactivation after
  // sitting out. Without this, movement cost only ever compares "idle" to
  // "idle" (null-vs-null skips), and a wandering middle-register melody
  // flip-flops hand every note because reactivating either hand looks free.
  const dp: number[][] = []
  const back: number[][] = []
  const centers: { left: number | null; right: number | null }[][] = []

  for (let k = 0; k < clusters.length; k++) {
    const options = partitionsPerCluster[k]
    dp.push(new Array(options.length))
    back.push(new Array(options.length))
    centers.push(new Array(options.length))

    for (let i = 0; i < options.length; i++) {
      const emission = emissionCost(options[i], opts)
      const ownLeft = center(options[i].left)
      const ownRight = center(options[i].right)

      if (k === 0) {
        dp[k][i] = emission
        back[k][i] = -1
        centers[k][i] = { left: ownLeft, right: ownRight }
        continue
      }
      let best = Infinity
      let bestPrev = 0
      const prevOptions = partitionsPerCluster[k - 1]
      for (let p = 0; p < prevOptions.length; p++) {
        const prevCenters = centers[k - 1][p]
        const move = movementCostFromCarried(prevCenters, ownLeft, ownRight, fallbackCenter)
          + handSwitchCost(prevOptions[p], options[i])
        const cost = dp[k - 1][p] + move
        if (cost < best) { best = cost; bestPrev = p }
      }
      dp[k][i] = best + emission
      back[k][i] = bestPrev
      const prevBestCenters = centers[k - 1][bestPrev]
      centers[k][i] = {
        left: ownLeft ?? prevBestCenters.left,
        right: ownRight ?? prevBestCenters.right,
      }
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
  return results
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
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
      clusters.push({ notes: [...current].sort((a, b) => a.midi - b.midi) })
      current = [note]
      anchorTime = note.time
    }
  }
  if (current.length > 0) clusters.push({ notes: [...current].sort((a, b) => a.midi - b.midi) })
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

function center(notes: HandInput[]): number | null {
  if (notes.length === 0) return null
  return average(notes.map(n => n.midi))
}

// Span violation is a heavy quadratic penalty, never a hard reject — a
// physically-impossible 4-octave single chord still needs *some* partition
// chosen (doc's stress-test case), so infeasibility isn't an option here.
function emissionCost(p: Partition<any>, opts: Required<HandAssignOptions>): number {
  const overL = Math.max(0, span(p.left) - opts.maxSpanSemitones)
  const overR = Math.max(0, span(p.right) - opts.maxSpanSemitones)
  const spanPenalty = SPAN_WEIGHT * (overL * overL + overR * overR)
  const crossPenalty = p.crossing ? CROSS_PENALTY : 0

  // ── Don't split a cluster that already fits in one hand ──────────────────
  const isSplit = p.left.length > 0 && p.right.length > 0
  const wholeClusterSpan = span([...p.left, ...p.right])
  const unnecessarySplitPenalty = (isSplit && wholeClusterSpan <= opts.maxSpanSemitones) ? UNNECESSARY_SPLIT_PENALTY : 0

  return spanPenalty + crossPenalty + unnecessarySplitPenalty
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

function handSwitchCost(prev: Partition<any>, next: Partition<any>): number {
  const prevHand = soleHand(prev)
  const nextHand = soleHand(next)
  return (prevHand && nextHand && prevHand !== nextHand) ? HAND_SWITCH_PENALTY : 0
}

function movementCostFromCarried(
  prev: { left: number | null; right: number | null },
  nextLeft: number | null,
  nextRight: number | null,
  fallbackCenter: number,
): number {
  let cost = 0
  if (nextLeft !== null) cost += MOVE_WEIGHT * Math.abs(nextLeft - (prev.left ?? fallbackCenter))
  if (nextRight !== null) cost += MOVE_WEIGHT * Math.abs(nextRight - (prev.right ?? fallbackCenter))
  return cost
}
