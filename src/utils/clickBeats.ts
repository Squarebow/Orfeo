// ── The beats the metronome and count-in click ───────────────────────────────
// In 6/8, 9/8 and 12/8 the eighths are subdivisions: what you tap your foot to is
// every third one, so 12/8 is four beats a bar. `_beatTimes` keeps every eighth,
// because chord reading and Tap Tempo work on it. 3/8 counts as written, and so
// does 6/4. The result is kept per grid so its array stays the same one, which the
// metronome uses to notice a Tap Tempo grid swap.
type Sig = { num: number; den: number; time: number }
type Grid = { _beatTimes?: number[]; _barTimes?: number[]; _timeSigMap?: Sig[] } | null | undefined

const isCompound = (num: number, den: number) => den >= 8 && num >= 6 && num % 3 === 0
const EPS = 1e-6
const cache = new WeakMap<number[], number[]>()

export function clickBeats(midi: Grid): number[] {
  const beats = midi?._beatTimes ?? []
  const sigs = midi?._timeSigMap ?? []
  if (!sigs.some(s => isCompound(s.num, s.den))) return beats
  const kept = cache.get(beats)
  if (kept) return kept

  const bars = midi?._barTimes ?? []
  const out: number[] = []
  let bar = -1, sig = 0, inBar = 0
  for (const beat of beats) {
    if (bar + 1 < bars.length && beat >= bars[bar + 1] - EPS) { bar++; inBar = 0 }
    while (sig + 1 < sigs.length && sigs[sig + 1].time <= beat + EPS) sig++
    const s = sigs[sig]
    if (!s || !isCompound(s.num, s.den) || inBar % 3 === 0) out.push(beat)
    inBar++
  }
  cache.set(beats, out)
  return out
}
