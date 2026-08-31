import type { ParsedMidi } from '../types'

// ── buildBeatGrid ───────────────────────────────────────────────────────
// Decision-window boundaries for the live chord detector. `bars` are the
// downbeats; `halfBars` splits each bar in two. Both come from the parser's
// _barTimes (which is tempo- AND time-signature-aware — see midiParser.ts),
// so a song that alternates 3/4 and 4/4 (Golden Brown) still lands its
// windows on real beats. Falls back to a fixed 2-second grid when a file
// carries no usable tempo/meter data.
export function buildBeatGrid(midi: ParsedMidi): { bars: number[]; halfBars: number[] } {
  const bars = (midi._barTimes && midi._barTimes.length >= 2)
    ? [...midi._barTimes]
    : fallbackBars(midi.duration)

  const halfBars: number[] = []
  for (let i = 0; i < bars.length; i++) {
    halfBars.push(bars[i])
    const next = bars[i + 1]
    if (next !== undefined) halfBars.push((bars[i] + next) / 2)
  }
  return { bars, halfBars }
}

function fallbackBars(duration: number): number[] {
  const out: number[] = []
  for (let t = 0; t <= duration + 2; t += 2) out.push(t)
  return out
}
