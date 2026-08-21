import type { ParsedTrack } from '../types'

// ── analyzeVelocityFluctuation — how much does a file's note velocity dip
// in sustained passages relative to its own overall average? Used to drive
// "Auto-Level on load" (Settings → Audio): rather than requiring the user to
// notice a quiet passage and manually pick a Compressor preset (or flatten
// note velocities by hand in the Note Editor), a file that fluctuates a lot
// gets a stronger preset auto-selected the moment it loads.
//
// Buckets every note's velocity into fixed windows across the timeline,
// ignoring near-empty windows (a bucket with only 1-2 notes is more likely a
// rest/sparse passage than a real "quiet section", and would otherwise read
// as a false dip). Returns how far the quietest *sustained* window falls
// below the file's overall average, as a 0-1 ratio — 0 = no dip at all.
const WINDOW_SEC = 4
const MIN_NOTES_PER_WINDOW = 3
const MIN_WINDOWS_TO_JUDGE = 4

export function velocityDropRatio(tracks: Pick<ParsedTrack, 'notes'>[]): number {
  const buckets = new Map<number, number[]>()
  for (const t of tracks) {
    for (const n of t.notes) {
      const b = Math.floor(n.time / WINDOW_SEC)
      const arr = buckets.get(b)
      if (arr) arr.push(n.velocity)
      else buckets.set(b, [n.velocity])
    }
  }
  const windowAvgs = [...buckets.values()]
    .filter(vs => vs.length >= MIN_NOTES_PER_WINDOW)
    .map(vs => vs.reduce((s, v) => s + v, 0) / vs.length)
  if (windowAvgs.length < MIN_WINDOWS_TO_JUDGE) return 0 // too short/sparse a file to judge meaningfully

  const overall = windowAvgs.reduce((s, v) => s + v, 0) / windowAvgs.length
  if (overall <= 0) return 0
  const quietest = Math.min(...windowAvgs)
  return Math.max(0, (overall - quietest) / overall)
}

// ── suggestCompressorPreset — maps a drop ratio to one of the 5 master
// compressor presets (see COMPRESSOR_PRESETS in useSamplesEngine.ts), or
// null when the fluctuation is mild enough not to warrant auto-boosting.
// Thresholds tuned against a real case (a Vivaldi arrangement whose note
// velocities crash for a sustained passage, ~0.48 drop ratio, correctly
// landing on "Firm").
export function suggestCompressorPreset(dropRatio: number): number | null {
  if (dropRatio < 0.25) return null
  if (dropRatio < 0.35) return 1 // Gentle
  if (dropRatio < 0.45) return 2 // Medium
  if (dropRatio < 0.55) return 3 // Firm
  return 4 // Limiter
}
