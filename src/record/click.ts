// ── The click for recording (Blank mode, With click) ─────────────────────────
// Heard, never recorded: Orfeo only records what comes from your keyboard.
// Same sound and volume as the metronome. A count-in of whole bars first; the
// take starts exactly on the first beat after it, so the bars come out exact.

export interface Meter { beats: number; unit: number }   // 3/4 → { beats: 3, unit: 4 }

/** Seconds per beat, the beat being the time signature's own note (6/8: an eighth) */
export const beatSec = (bpm: number) => 60 / bpm
/** The tempo in quarter notes a minute, as a MIDI file keeps it */
export const quarterBpm = (bpm: number, m: Meter) => bpm * 4 / m.unit
/** Seconds per bar */
export const barSec = (bpm: number, m: Meter) => m.beats * beatSec(bpm)

/** Beat i from the start of the count-in: when (seconds after it starts),
 *  whether it's a bar's first beat, and whether it's still the count-in */
export function beatAt(i: number, bpm: number, m: Meter, countInBars: number): { t: number; accent: boolean; countIn: boolean } {
  return { t: i * beatSec(bpm), accent: i % m.beats === 0, countIn: i < countInBars * m.beats }
}

export interface ClickRun {
  /** performance.now() of the first beat after the count-in (where the take starts) */
  startMs: number
  stop: () => void
}

/** Start the click. `onBeat` gets each beat as it sounds (count-in beats are negative bars) */
export async function startClick(bpm: number, m: Meter, countInBars: number,
  onBeat?: (b: { bar: number; beat: number; countIn: boolean }) => void): Promise<ClickRun> {
  const { metronomeContext, scheduleMetronomeClick } = await import('../hooks/useMetronome')
  const ctx = metronomeContext()
  const audio0 = ctx.currentTime + 0.15                      // a moment to get going
  const perf0 = performance.now() + (audio0 - ctx.currentTime) * 1000
  let next = 0
  const oscs: OscillatorNode[] = []
  const timers: ReturnType<typeof setTimeout>[] = []
  const tick = () => {
    while (audio0 + beatAt(next, bpm, m, countInBars).t < ctx.currentTime + 0.12) {
      const b = beatAt(next, bpm, m, countInBars)
      oscs.push(scheduleMetronomeClick(audio0 + b.t, b.accent))
      const i = next - countInBars * m.beats
      const info = { bar: Math.floor(i / m.beats) + (i >= 0 ? 1 : 0), beat: ((i % m.beats) + m.beats) % m.beats + 1, countIn: b.countIn }
      timers.push(setTimeout(() => onBeat?.(info), Math.max(0, (audio0 + b.t - ctx.currentTime) * 1000)))
      next++
    }
    if (oscs.length > 64) oscs.splice(0, oscs.length - 16)
    if (timers.length > 64) timers.splice(0, timers.length - 16)
  }
  tick()
  const id = setInterval(tick, 25)
  return {
    startMs: perf0 + beatAt(countInBars * m.beats, bpm, m, countInBars).t * 1000,
    stop: () => { clearInterval(id); for (const t of timers) clearTimeout(t); for (const o of oscs) { try { o.stop() } catch { /* already stopped */ } } },
  }
}
