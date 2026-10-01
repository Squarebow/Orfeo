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
