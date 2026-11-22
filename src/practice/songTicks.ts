// ── Practice mode's scrub bar: where its ticks go (PracticeTopBar SongTicks) ──
const TICK_UNITS = [0.5, 1, 2, 5, 10, 15, 30]   // seconds a tick
const MIN_TICK_GAP = 2.5                        // px between ticks, at least

/** Pure: the ticks' path for a bar `w` px wide (y in 0..100: short ticks from
 *  55, tall ones from 0), and the seconds per tick chosen */
export function tickPath(dur: number, w: number): { d: string; unit: number } {
  if (!(dur > 0) || !(w > 0)) return { d: '', unit: 1 }
  const unit = TICK_UNITS.find(u => (u / dur) * w >= MIN_TICK_GAP) ?? TICK_UNITS[TICK_UNITS.length - 1]
  const parts: string[] = []
  const n = Math.floor(dur / unit + 1e-9)
  for (let i = 0; i <= n; i++) {
    const x = Math.min(w - 0.5, Math.round((i * unit / dur) * w) + 0.5)
    parts.push(`M${x} ${i % 10 === 0 ? 0 : 55}V100`)
  }
  return { d: parts.join(''), unit }
}
