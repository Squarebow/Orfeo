// ── A drum hit sounds for a moment, however long the file says it's held ─────
// Some files hold one drum note far past the music, usually a release lost when
// the file was made or converted: a snare written as held for four and a half
// minutes kept a four-minute song "playing" in silence to almost nine minutes.
// So a drum-channel note counts for at most DRUM_HOLD_MAX_SEC, both for how
// long it's drawn and for where the song ends. That's generous on purpose: a
// last cymbal written long to ring out, or a long whistle, still fits easily.
export const DRUM_HOLD_MAX_SEC = 8

export const drumHoldLength = (duration: number) => Math.min(duration, DRUM_HOLD_MAX_SEC)

/** Where the song ends: the end of its last note (drum notes already shortened). */
export function songEnd(tracks: { notes: { time: number; duration: number }[] }[]): number {
  let end = 0
  for (const t of tracks) for (const n of t.notes) end = Math.max(end, n.time + n.duration)
  return end
}
