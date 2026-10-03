// ── Metronome resume after a beat-grid swap (Tap Tempo preview/Keep/Cancel/
// Reset swap _beatTimes mid-playback). The scheduler's "last scheduled"
// marker is an index into the OLD array, meaningless in the new one — this
// maps it back by TIME: the last new-grid beat at or just after the last
// click already sounded. Beats within MIN_GAP after it count as clicked too,
// so a near-coincident new beat never double-clicks. ──────────────────────
const MIN_GAP = 0.1

export function resumeIndexAfterGridSwap(beats: number[], lastScheduledTime: number): number {
  if (!Number.isFinite(lastScheduledTime)) return -1
  let lo = 0, hi = beats.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (beats[mid] < lastScheduledTime + MIN_GAP) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

// ── When to click a beat whose time has (just) come. Starting playback
// exactly on a beat means that beat is already a few ms in the past by the
// time the scheduler's first pass runs; the first beat of a run is clicked
// right away instead of dropped. Later beats in the past are skipped (they
// were scheduled on an earlier pass). Returns the click time, or null. ───
const LEAD = 0.005
const START_GRACE = 0.06
export function firstClickTime(beatAudioTime: number, now: number, firstOfRun: boolean): number | null {
  if (beatAudioTime >= now + LEAD) return beatAudioTime
  if (firstOfRun && beatAudioTime >= now - START_GRACE) return now + LEAD
  return null
}
