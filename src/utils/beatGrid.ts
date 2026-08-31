import type { ParsedMidi } from '../types'

export interface BeatGrid {
  bars: number[]      // downbeat times (s)
  halfBars: number[]  // each bar start + its midpoint
  beats: number[]     // every beat onset (s) — the chord detector's window edges
}

// ── buildBeatGrid ───────────────────────────────────────────────────────
// Window boundaries for the live chord detector. All three come from the
// parser's tempo- AND time-signature-aware grid (_beatTimes / _barTimes, see
// midiParser.ts), so a song that alternates 3/4 and 4/4 (Golden Brown) still
// lands its windows on real beats. Falls back to a fixed 2-second /
// 1-second grid when a file carries no usable tempo/meter data.
export function buildBeatGrid(midi: ParsedMidi): BeatGrid {
  const bars = (midi._barTimes && midi._barTimes.length >= 2)
    ? [...midi._barTimes]
    : fallbackGrid(midi.duration, 2)

  const halfBars: number[] = []
  for (let i = 0; i < bars.length; i++) {
    halfBars.push(bars[i])
    const next = bars[i + 1]
    if (next !== undefined) halfBars.push((bars[i] + next) / 2)
  }

  const beats = (midi._beatTimes && midi._beatTimes.length >= 2)
    ? [...midi._beatTimes]
    : fallbackGrid(midi.duration, 1)

  return { bars, halfBars, beats }
}

function fallbackGrid(duration: number, step: number): number[] {
  const out: number[] = []
  for (let t = 0; t <= duration + step; t += step) out.push(t)
  return out
}
