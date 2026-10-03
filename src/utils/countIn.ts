// ── Count-in plan — N bars of clicks before the music enters, on the song's
// own (effective) beat grid extended backwards. Pure.
//
//   • Playhead at/before the first note (song start or an empty lead-in) →
//     the music starts at the FIRST NOTE: empty bars are skipped.
//   • Playhead mid-song → the music starts at the beginning of that bar, so
//     a restart always comes in on a "1".
//   • The count-in is N whole bars ending at the next bar line D. When the
//     music starts before D (a pickup / upbeat), clicks that would fall on
//     or after the first note are dropped — the pickup comes in on time.
//   • Times are song seconds divided by the speed ratio (wall-clock). ───────
export interface CountInClick { rel: number; accent: boolean; n: number }
export interface CountInPlan { startAt: number; clicks: CountInClick[]; total: number; bpb: number }

const EPS = 1e-6
const ON_BAR = 0.15   // a first note this close (in beats) after a bar line counts as on it

function lastAtOrBefore(a: number[], t: number): number {
  let lo = 0, hi = a.length - 1, ans = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= t + EPS) { ans = m; lo = m + 1 } else hi = m - 1 }
  return ans
}

function beatAt(beats: number[], t: number): number {
  let i = Math.max(0, lastAtOrBefore(beats, t))
  if (i >= beats.length - 1) i = beats.length - 2
  return beats[i + 1] - beats[i]
}

export function countInPlan(p: {
  beats: number[]; bars: number[]; firstNote: number; playhead: number; nBars: number; ratio: number
}): CountInPlan | null {
  const { beats, bars, firstNote, playhead, ratio } = p
  const nBars = Math.max(1, Math.min(4, Math.round(p.nBars)))
  if (beats.length < 2 || bars.length < 1 || !(ratio > 0)) return null

  const midSong = playhead > firstNote + EPS
  const target = midSong ? bars[Math.max(0, lastAtOrBefore(bars, playhead))] : firstNote
  const b0 = beatAt(beats, target)
  if (!(b0 > 0)) return null

  // the bar line the count-in counts into (a first note a hair late still counts as on it)
  let di = bars.findIndex(t => t >= target - ON_BAR * b0 - EPS)
  const D = di >= 0 ? bars[di] : target
  if (di < 0) di = bars.length - 1
  const b = beatAt(beats, D)
  if (!(b > 0)) return null
  const next = bars[di + 1], prev = bars[di - 1]
  let bpb = next !== undefined ? Math.round((next - D) / b) : prev !== undefined ? Math.round((D - prev) / b) : 4
  if (!(bpb >= 1 && bpb <= 16)) bpb = 4

  const startAt = target
  const count = nBars * bpb
  const t0 = D - count * b
  const clicks: CountInClick[] = []
  for (let k = count; k >= 1; k--) {
    const t = D - k * b
    if (t >= startAt - EPS) continue
    const n = ((count - k) % bpb) + 1
    clicks.push({ rel: (t - t0) / ratio, accent: n === 1, n })
  }
  return { startAt, clicks, total: (startAt - t0) / ratio, bpb }
}
