// ── Debug helper — builds copy-pastable text for chord-detection bug
// reports: a single timestamp/range string ("at 1:23.456, bar 42, you show
// Cmaj9"), or a tab-separated table of every detected chord in the song for
// pasting into Excel and marking up bar-by-bar. Wired into the scrub bar's
// right-click menu in TopBar.tsx. Ships in packaged builds too (the user
// tests remotely, over a laggy connection, so a `npm run dev`-only tool
// isn't enough) — deliberately undocumented (not in HOW_TO_USE.md).
//
// Kept pure (no store import) so scripts/dev-debug/check-debug-timestamp.mts
// can import it directly under `node --experimental-strip-types`.

import type { ChordEvent } from '../types'

const SEP = '   ·   ' // "   ·   "

/** `MM:SS.mmm`, DAW-style. Negative clamps to zero; ms rounding carries. */
export function formatTimeMs(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalS = (totalMs - ms) / 1000
  const s = totalS % 60
  const m = (totalS - s) / 60
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

/**
 * 1-based bar number for `time` given `barStarts` (same precomputed array the
 * TopBar bar counter uses). `null` when there is no bar grid. A time before the
 * first bar start still reads as bar 1.
 */
export function barOf(time: number, barStarts: number[]): number | null {
  if (barStarts.length === 0) return null
  let lo = 0
  let hi = barStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (barStarts[mid] <= time) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/**
 * Names of the chord events whose display window intersects `[start, end]`, in
 * order. Each event owns `[displayTime, nextDisplayTime)`. For a point query
 * (`start === end`) on an exact boundary, the chord that starts there wins —
 * matching when the on-screen display actually switches.
 */
export function chordsInSpan(start: number, end: number, seq: ChordEvent[]): string[] {
  const names: string[] = []
  for (let i = 0; i < seq.length; i++) {
    const from = seq[i].displayTime
    const to = i + 1 < seq.length ? seq[i + 1].displayTime : Infinity
    if (from <= end && to > start) names.push(seq[i].name)
  }
  return names
}

export interface DebugTimestampInput {
  currentTime: number
  loopStart: number | null
  loopEnd: number | null
  barStarts: number[]
  chordSequence: ChordEvent[]
}

/**
 * The clipboard string. With a real loop region set it describes the whole
 * `loopStart–loopEnd` span; otherwise the single playhead point. Bar and chord
 * segments are dropped when unavailable (no grid / playhead before the
 * sequence starts).
 */
export function buildDebugTimestamp(input: DebugTimestampInput): string {
  const { currentTime, loopStart, loopEnd, barStarts, chordSequence } = input
  const hasRange = loopStart !== null && loopEnd !== null && loopEnd > loopStart

  if (hasRange) {
    const a = loopStart as number
    const b = loopEnd as number
    const barA = barOf(a, barStarts)
    const barB = barOf(b, barStarts)
    const chords = chordsInSpan(a, b, chordSequence)
    const parts = [
      `${formatTimeMs(a)}–${formatTimeMs(b)}`,
      `(${a.toFixed(3)}s–${b.toFixed(3)}s)`,
    ]
    if (barA !== null && barB !== null) parts.push(`bars ${barA}–${Math.max(barA, barB)}`)
    if (chords.length) parts.push(chords.join(' → '))
    return parts.join(SEP)
  }

  const bar = barOf(currentTime, barStarts)
  const chords = chordsInSpan(currentTime, currentTime, chordSequence)
  const parts = [formatTimeMs(currentTime), `(${currentTime.toFixed(3)}s)`]
  if (bar !== null) parts.push(`bar ${bar}`)
  if (chords.length) parts.push(chords[0])
  return parts.join(SEP)
}

export interface FullSongTableInput {
  duration: number
  barStarts: number[]
  chordSequence: ChordEvent[]
}

// A hair before a segment's end when resolving its end bar — so a segment
// that stops exactly on the next bar line reads as ending in the bar it
// actually played through, not the one it merely touches the start of.
const BAR_EPS = 1e-6

/**
 * Tab-separated chord table for the whole song, one row per detected chord:
 * `Bar \t Time \t Chord \t Notes`. Pastes into Excel/Sheets as real columns
 * — the blank trailing Notes column is there to mark up while listening
 * (wrong chord, phantom chord, wrong timing…) before sending the edited
 * table back for review. Empty sequence still returns the header row alone.
 */
export function buildFullSongTable(input: FullSongTableInput): string {
  const { duration, barStarts, chordSequence } = input
  const header = ['Bar', 'Time', 'Chord', 'Notes'].join('\t')
  if (chordSequence.length === 0) return header

  const rows = chordSequence.map((event, i) => {
    const start = event.displayTime
    const end = i + 1 < chordSequence.length ? chordSequence[i + 1].displayTime : duration
    const barStart = barOf(start, barStarts)
    const barEnd = barOf(Math.max(start, end - BAR_EPS), barStarts)
    const bar = barStart !== null && barEnd !== null
      ? (barEnd > barStart ? `${barStart}–${barEnd}` : `${barStart}`)
      : ''
    const time = `${formatTimeMs(start)}–${formatTimeMs(end)}`
    return [bar, time, event.name, ''].join('\t')
  })

  return [header, ...rows].join('\n')
}
