// ── BPM ▲/▼ step — moves the DISPLAYED tempo (file tempo at the playhead,
// incl. any Tap Tempo correction, × speed) by one. `bpm`/`originalBpm` stay
// in the file's own terms, so the step is originalBpm / currentFileBpm. A
// result within float noise of originalBpm snaps onto it exactly, so ▲ then
// ▼ never leaves a phantom "tempo changed" state behind. ──────────────────
export function stepDisplayedBpm(bpm: number, originalBpm: number, currentFileBpm: number, dir: 1 | -1): number {
  const step = currentFileBpm > 0 ? originalBpm / currentFileBpm : 1
  let next = Math.min(300, Math.max(20, bpm + dir * step))
  if (Math.abs(next - originalBpm) <= originalBpm * 1e-9) next = originalBpm
  return next
}

// ── A typed tempo — the same DISPLAYED tempo the arrows move, so the readout
// shows what was typed. Returns the new `bpm`, or null if the text isn't a
// tempo. Typing the song's own tempo at the playhead restores it exactly: no
// phantom "tempo changed" state from a file tempo with decimals. ────────────
export function typedBpm(text: string, originalBpm: number, currentFileBpm: number): number | null {
  const typed = Number(text.trim().replace(',', '.'))
  if (!text.trim() || !Number.isFinite(typed) || typed <= 0) return null
  if (currentFileBpm <= 0) return Math.min(300, Math.max(20, typed))
  if (typed === Math.round(currentFileBpm)) return originalBpm
  return Math.min(300, Math.max(20, typed * originalBpm / currentFileBpm))
}
