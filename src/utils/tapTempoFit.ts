// ── Tap Tempo fit — turns a run of user taps (song seconds) into one steady
// beat: period + the time of the first tap's beat (= beat 1). Pure. Each tap
// is placed on a whole-beat index by rounding its gap to the previous tap
// against the median gap, so a missed beat shows up as an index skip (kept)
// and a doubled tap as a zero step (dropped). One least-squares pass, one
// outlier-rejection pass, refit. ──────────────────────────────────────────
export interface TapFit { period: number; anchor: number; accepted: number }
export const MIN_TAPS = 4
const MIN_BEAT_SPAN = 3
const OUTLIER_FRAC = 0.25
const MIN_BPM = 20
const MAX_BPM = 400

interface Pt { k: number; t: number }

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const n = s.length
  return n === 0 ? 0 : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2
}

function lsq(pts: Pt[]): { a: number; p: number } {
  const n = pts.length
  let sk = 0, st = 0, skk = 0, skt = 0
  for (const { k, t } of pts) { sk += k; st += t; skk += k * k; skt += k * t }
  const den = n * skk - sk * sk
  const p = den !== 0 ? (n * skt - sk * st) / den : 0
  return { a: (st - p * sk) / n, p }
}

export function fitTaps(taps: number[]): TapFit | null {
  if (taps.length < MIN_TAPS) return null
  const t = [...taps].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < t.length; i++) gaps.push(t[i] - t[i - 1])
  // ignore near-zero gaps (double taps) when estimating the beat
  const m = median(gaps.filter(g => g > 0.1))
  if (!(m > 0)) return null

  let pts: Pt[] = [{ k: 0, t: t[0] }]
  for (let i = 1; i < t.length; i++) {
    const step = Math.round((t[i] - t[i - 1]) / m)
    if (step <= 0) continue // doubled tap
    pts.push({ k: pts[pts.length - 1].k + step, t: t[i] })
  }

  let fit = lsq(pts)
  if (!(fit.p > 0)) return null
  const kept = pts.filter(q => Math.abs(q.t - (fit.a + q.k * fit.p)) <= OUTLIER_FRAC * fit.p)
  if (kept.length !== pts.length) { pts = kept; if (pts.length >= 2) fit = lsq(pts) }

  if (pts.length < MIN_TAPS) return null
  if (pts[pts.length - 1].k - pts[0].k < MIN_BEAT_SPAN) return null
  const bpm = 60 / fit.p
  if (!(bpm >= MIN_BPM && bpm <= MAX_BPM)) return null
  return { period: fit.p, anchor: fit.a + pts[0].k * fit.p, accepted: pts.length }
}
