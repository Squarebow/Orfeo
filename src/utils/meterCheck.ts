// ── Is the written beat the beat the drums play? ────────────────────────────
// Some files are written in a meter the song doesn't have: a 4/4 rock song
// written as 6/4 at 160 (each real bar as one 6/4 bar), a 12/8 ballad written
// as 3/4. The notes sit exactly on that grid, so the tempo check (tempoTrust.ts,
// notes off the grid) can't see it, but the metronome clicks a beat nobody
// plays. The drums tell: in a backbeat the kick falls on beats 1 and 3 and the
// snare on 2 and 4. When that pattern fits a beat 1½ written beats long and
// clearly doesn't fit the written beat, the song's real beat is that longer one.
// Measured 24. 11. 2026 on 1,238 songs with drums (scripts/hand-model/meterscan.mjs):
// 5 flagged, all real (two copies of a 6/4-for-4/4 file, a 12/8 ballad written
// in 3/4). Only for a song with one meter and one tempo (an ending may slow down). Pure.

import type { ParsedMidi } from '../types'

const LOOK = 1.5          // the real beat, in written beats
const FITS = 0.6          // the backbeat fits the longer beat this well…
const MISSES = 0.35       // …and the written beat no better than this
const NEAR = 0.12         // of a beat: how close a hit must be
const MIN_HITS = 16       // snare and kick hits each, to judge at all

export interface MeterFix {
  /** the beat as written and as the drums play it, beats per minute */
  fileBpm: number
  bpm: number
  /** the meter as written, and beats per bar as played */
  num: number
  den: number
  beatsPerBar: number
  /** the correction's numbers (tempoCorrection.ts › TempoSegment) */
  period: number
  anchor: number
}

export function meterFromDrums(midi: ParsedMidi): MeterFix | null {
  const m = midi as any
  const tempos: { bpm: number; time: number }[] = m._tempoMap ?? []
  const sigs: unknown[] = m._timeSigMap ?? []
  if (sigs.length > 1) return null
  // one tempo for (nearly) the whole song: an ending that slows down is fine
  const until = tempos[1]?.time ?? midi.duration
  if (until < 0.9 * midi.duration) return null
  const num = midi.timeSignatureNumerator, den = midi.timeSignatureDenominator
  const fileBpm = tempos[0]?.bpm ?? midi.bpm
  if (!num || !den || !fileBpm) return null
  const beatSec = (60 / fileBpm) * (4 / den)
  const barSec = beatSec * num
  const start = (m._barStarts as number[] | undefined)?.[0] ?? 0
  const drums = midi.tracks.filter(t => t.isDrum).flatMap(t => t.notes).filter(n => n.time < until)
  const posOf = (time: number) => (((time - start) % barSec) + barSec) % barSec / beatSec
  const snare = drums.filter(n => n.midi === 38 || n.midi === 40).map(n => posOf(n.time))
  const kick = drums.filter(n => n.midi === 35 || n.midi === 36).map(n => posOf(n.time))
  if (snare.length < MIN_HITS || kick.length < MIN_HITS) return null
  const on = (x: number, L: number, odd: boolean) => { const k = x / L, r = Math.round(k); return Math.abs(k - r) < NEAR && (r % 2 === 1) === odd }
  const fit = (L: number) => (snare.filter(x => on(x, L, true)).length / snare.length + kick.filter(x => on(x, L, false)).length / kick.length) / 2
  if (fit(LOOK) <= FITS || fit(1) >= MISSES) return null
  const beatsPerBar = num % 3 === 0 ? (num / 3) * 2 : 4
  return { fileBpm: Math.round(fileBpm), bpm: Math.round(fileBpm / LOOK), num, den, beatsPerBar, period: beatSec * LOOK, anchor: start }
}
