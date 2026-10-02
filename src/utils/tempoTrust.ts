// ── Tempo trust — does a file's beat grid sit on its music's steady beat?
// Per 20 s window: `g` = share of the grid's beats that have a strong note
// on them; `b` = the same share for the best steady beat the notes
// themselves suggest. A window is "off" only when the file's grid clearly
// misses AND some steady beat clearly fits — that's what separates "wrong
// tempo info" (fixable with Tap Tempo) from music with no steady beat at
// all (rubato, free time, sparse), which is never flagged. Pure. ─────────

export const TRUST_VERSION = 1

const WINDOW = 20          // s
const MIN_BEATS = 8        // grid beats needed to judge a window
const MIN_ONSETS = 12      // strong notes needed to judge a window
const STRONG = 0.3         // onset weight that counts as a strong note
const HIT = 0.03           // s — a beat is "played" when a strong note is this close
const G_OFF = 0.4          // file grid misses...
const G_OK = 0.6           // ...or fits
const B_STEADY = 0.7       // some steady beat fits this well
const GAP = 0.3            // and fits this much better than the file's grid
const MIN_OFF_WINDOWS = 3
const MIN_OFF_SHARE = 0.25 // of ALL judged windows — mostly-free songs are never flagged
const TIE = 0.05           // steady fits this close count as equal; the faster beat wins
const HINT_AGREE = 0.03    // suggested tempos within ±3% count as the same speed
const HINT_MAJORITY = 0.6  // that speed must come from at least 60% of the off stretches
const P_MIN = 0.25, P_MAX = 1.5   // 40–240 bpm

export interface TrustResult {
  flagged: boolean
  from: number | null       // song seconds where it starts going off
  throughout: boolean
  hintBpm: number | null     // the steady beat the notes suggest, when the evidence agrees
  shifted: boolean           // the speed looks right (same / double / half), the beat is just offset
  fileBpm: number
  okWindows: number
  offWindows: number
  unclearWindows: number
}

function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m }
  return lo
}

function hasNear(on: number[], t: number): boolean {
  const i = lowerBound(on, t - HIT)
  return i < on.length && on[i] <= t + HIT
}

function shareOf(on: number[], beats: number[]): number {
  if (!beats.length) return 0
  let h = 0
  for (const b of beats) if (hasNear(on, b)) h++
  return h / beats.length
}

function regularShare(on: number[], from: number, to: number, period: number, phase: number): number {
  let h = 0, n = 0
  for (let t = from + (((phase - from) % period) + period) % period; t < to; t += period) { n++; if (hasNear(on, t)) h++ }
  return n ? h / n : 0
}

// Candidate beat lengths from the spacing between strong notes
function candidatePeriods(on: { t: number; w: number }[]): number[] {
  const BIN = 0.005
  const hist = new Map<number, number>()
  for (let i = 0; i < on.length; i++) {
    for (let j = i + 1; j < on.length; j++) {
      const d = on[j].t - on[i].t
      if (d > 2) break
      if (d < P_MIN * 0.5) continue
      const k = Math.round(d / BIN)
      hist.set(k, (hist.get(k) ?? 0) + on[i].w * on[j].w)
    }
  }
  // smooth ±1 bin, then local maxima in range
  const smooth = (k: number) => (hist.get(k - 1) ?? 0) + (hist.get(k) ?? 0) + (hist.get(k + 1) ?? 0)
  const peaks: { p: number; v: number }[] = []
  for (const k of hist.keys()) {
    const p = k * BIN
    if (p < P_MIN || p > P_MAX) continue
    const v = smooth(k)
    if (v > 0 && v >= smooth(k - 1) && v >= smooth(k + 1)) peaks.push({ p, v })
  }
  peaks.sort((a, b) => b.v - a.v)
  const out: number[] = []
  for (const { p } of peaks.slice(0, 3)) for (const c of [p, p * 2, p / 2]) {
    if (c >= P_MIN && c <= P_MAX && !out.some(x => Math.abs(x / c - 1) < 0.01)) out.push(c)
  }
  return out
}

function bestSteady(on: number[], onW: { t: number; w: number }[], from: number, to: number): { share: number; period: number } {
  let best = { share: 0, period: 0 }
  for (const p0 of candidatePeriods(onW)) {
    let cand = { share: 0, period: p0, phase: from }
    for (let ph = from; ph < from + p0; ph += 0.002) {
      const s = regularShare(on, from, to, p0, ph)
      if (s > cand.share) cand = { share: s, period: p0, phase: ph }
    }
    // small tempo refine around the best phase
    for (let f = -0.02; f <= 0.02 + 1e-9; f += 0.001) {
      const p = p0 * (1 + f)
      for (let dp = -0.01; dp <= 0.01 + 1e-9; dp += 0.002) {
        const s = regularShare(on, from, to, p, cand.phase + dp)
        if (s > cand.share) cand = { share: s, period: p, phase: cand.phase + dp }
      }
    }
    // A beat at half speed also lands on every played note, so equal fits
    // are common — the faster one is the beat that matches every played note
    if (cand.share > best.share + TIE || (cand.share >= best.share - TIE && cand.period < best.period)) {
      best = { share: Math.max(cand.share, best.share), period: cand.period }
    }
  }
  return best
}

export interface TrustWindow { from: number; verdict: 'ok' | 'off' | 'unclear'; grid: number; steady: number; steadyBpm: number | null }

// Per-window verdicts — exported for the library audit / debugging
export function judgeWindows(beats: number[], onsets: { t: number; w: number }[], duration: number): TrustWindow[] {
  const strongAll = onsets.filter(o => o.w >= STRONG).sort((a, b) => a.t - b.t)
  const strongT = strongAll.map(o => o.t)
  const out: TrustWindow[] = []
  for (let w0 = 0; w0 + WINDOW <= duration + 1e-9; w0 += WINDOW) {
    const w1 = w0 + WINDOW
    const wb = beats.slice(lowerBound(beats, w0), lowerBound(beats, w1))
    const wo = strongAll.slice(lowerBound(strongT, w0), lowerBound(strongT, w1))
    if (wb.length < MIN_BEATS || wo.length < MIN_ONSETS) continue
    const g = shareOf(strongT, wb)
    if (g >= G_OK) { out.push({ from: w0, verdict: 'ok', grid: g, steady: 0, steadyBpm: null }); continue }
    const b = g <= G_OFF ? bestSteady(strongT, wo, w0, w1) : { share: 0, period: 0 }
    const isOff = g <= G_OFF && b.share >= B_STEADY && b.share - g >= GAP
    out.push({ from: w0, verdict: isOff ? 'off' : 'unclear', grid: g, steady: b.share, steadyBpm: b.period ? 60 / b.period : null })
  }
  return out
}

// The speed most "off" stretches agree on. A stretch or two locking onto
// half/double speed is normal (a half-speed beat also lands on every played
// note), so this is a majority, not unanimity. If that speed is the file's
// own, or exactly double/half of it, the file's tempo is right and only the
// beat is offset (octave errors are the classic trap) — no tempo hint then.
export function hintFromWindows(offW: TrustWindow[], fileBpm: number): { hintBpm: number | null; shifted: boolean } {
  const bpms = offW.map(w => w.steadyBpm).filter((b): b is number => !!b)
  if (!bpms.length) return { hintBpm: null, shifted: false }
  let best: number[] = []
  for (const c of bpms) {
    const group = bpms.filter(b => Math.abs(b / c - 1) <= HINT_AGREE)
    if (group.length > best.length) best = group
  }
  if (best.length < bpms.length * HINT_MAJORITY) return { hintBpm: null, shifted: false }
  const sorted = [...best].sort((x, y) => x - y)
  const speed = sorted[Math.floor(sorted.length / 2)]
  if (fileBpm > 0 && [1, 2, 0.5].some(r => Math.abs(speed / (fileBpm * r) - 1) <= HINT_AGREE)) return { hintBpm: null, shifted: true }
  return { hintBpm: Math.round(speed), shifted: false }
}

export function judgeTempo(beats: number[], onsets: { t: number; w: number }[], duration: number, fileBpm: number): TrustResult {
  const wins = judgeWindows(beats, onsets, duration)
  const ok = wins.filter(w => w.verdict === 'ok').length
  const offW = wins.filter(w => w.verdict === 'off')
  const off = offW.length
  const unclear = wins.length - ok - off
  const from = offW.length ? offW[0].from : null
  const hints = offW.map(w => w.steadyBpm!).filter(Boolean)
  const decided = ok + off
  const flagged = off >= MIN_OFF_WINDOWS && off >= decided * 0.5 && off >= wins.length * MIN_OFF_SHARE
  const { hintBpm, shifted } = flagged ? hintFromWindows(offW, fileBpm) : { hintBpm: null, shifted: false }
  return {
    flagged, from: flagged ? from : null, throughout: flagged && from !== null && from < WINDOW,
    hintBpm, shifted, fileBpm, okWindows: ok, offWindows: off, unclearWindows: unclear,
  }
}
