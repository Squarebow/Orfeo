// ── Skip empty bars at the start: where the music starts ─────────────────────
// Finds the first bar to keep on the song's grid (`_barTimes`, the corrected
// one when a Tap Tempo correction is applied). The music starts in the first
// bar with notes that isn't a "click bar": plain drum clicks on the beat
// (sticks, side stick, hi-hat, metronome, cowbell, claves, wood block — one
// or two of them, one hit per beat). Click bars directly before the music are
// a count-in: with keepCountIn the last one or two stay, otherwise they go.
// Whole bars only, so beat 1 stays beat 1. Null when not one whole bar would go.
import type { ParsedMidi } from '../types'

/** GM drum sounds that count as count-in clicks */
export const CLICK_NOTES: ReadonlySet<number> = new Set([31, 33, 34, 37, 42, 44, 56, 75, 76, 77])
const EARLY = 0.005        // a note a hair before a bar line belongs to that bar
const TOGETHER = 0.03      // hits this close are one hit
const ON_BEAT = 0.15       // of a beat: how far off the beat a click may land

export function findLeadCut(midi: ParsedMidi, keepCountIn: boolean): { bar: number; sec: number } | null {
  const bars = midi._barTimes ?? []
  const beats = midi._beatTimes ?? []
  if (bars.length < 2) return null
  const barOf = (t: number) => {
    let lo = 0, hi = bars.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (bars[mid] <= t + EARLY) lo = mid; else hi = mid - 1 }
    return lo
  }
  // the notes of each bar
  const inBar = new Map<number, { midi: number; time: number; drum: boolean }[]>()
  for (const tr of midi.tracks) for (const n of tr.notes) {
    const b = barOf(n.time)
    let list = inBar.get(b)
    if (!list) inBar.set(b, list = [])
    list.push({ midi: n.midi, time: n.time, drum: tr.isDrum })
  }
  const isClickBar = (b: number) => {
    const notes = inBar.get(b)
    if (!notes?.length) return false
    if (notes.some(n => !n.drum || !CLICK_NOTES.has(n.midi))) return false
    if (new Set(notes.map(n => n.midi)).size > 2) return false
    const times = notes.map(n => n.time).sort((x, y) => x - y)
    const hits: number[] = []
    for (const t of times) if (!hits.length || t - hits[hits.length - 1] > TOGETHER) hits.push(t)
    const used = new Set<number>()
    for (const h of hits) {
      let k = 0
      for (let i = 1; i < beats.length; i++) if (Math.abs(beats[i] - h) < Math.abs(beats[k] - h)) k = i
      const len = (beats[k + 1] ?? beats[k] + 0.5) - beats[k]
      if (!beats.length || Math.abs(beats[k] - h) > ON_BEAT * len || used.has(k)) return false
      used.add(k)
    }
    return true
  }
  const withNotes = [...inBar.keys()].sort((x, y) => x - y)
  const music = withNotes.find(b => !isClickBar(b))
  if (music === undefined) return null
  let run = 0
  while (music - run - 1 >= 0 && isClickBar(music - run - 1)) run++
  const cut = keepCountIn && run > 0 ? music - Math.min(2, run) : music
  if (cut < 1) return null
  return { bar: cut, sec: bars[cut] }
}
