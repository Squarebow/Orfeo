// ── Fingering (practice stage 10) ────────────────────────────────────────────
// Finger numbers 1–5 on notes (1 the thumb), set by the player in the Note
// Editor. Orfeo can also suggest fingering (practice/suggestFingering.ts, an
// optional aid, off by default, clearly marked as a suggestion); the player's
// own numbers always win and only they are saved.
// Kept in the saved file like the hand marks, so they travel with the song:
// one `ORFEO_FINGERS:<track>:<runs>` text meta per track (harmless to other
// programs), the track's notes in order, 0 for a note without one.
// From the numbers, where each hand sits and where it moves (handPlaces:
// not shown for now; kept for an optional view later). Pure.

export type Finger = 1 | 2 | 3 | 4 | 5
/** Bumped whenever fingers change outside an edit (the piano roll redraws its hand places) */
export const FINGER_VERSION = { n: 0 }
const PREFIX = 'ORFEO_FINGERS:'

/** "12*0.3.2.1" style: runs as count*digit, single notes as the digit */
export function encodeFingers(fingers: (number | undefined)[]): string {
  const out: string[] = []
  let i = 0
  while (i < fingers.length) {
    const d = fingers[i] ?? 0
    let j = i
    while (j < fingers.length && (fingers[j] ?? 0) === d) j++
    out.push(j - i > 1 ? `${j - i}*${d}` : String(d))
    i = j
  }
  return out.join('.')
}
export function decodeFingers(s: string): (Finger | undefined)[] {
  const out: (Finger | undefined)[] = []
  for (const part of s.split('.')) {
    if (!part) continue
    const [n, d] = part.includes('*') ? part.split('*') : ['1', part]
    const f = Number(d)
    for (let k = 0; k < Number(n); k++) out.push(f >= 1 && f <= 5 ? (f as Finger) : undefined)
  }
  return out
}

/** The meta for one track's notes, or null when none of them has a finger */
export function fingerMeta(trackIndex: number, notes: { finger?: number }[]): { type: 'text'; text: string; ticks: number } | null {
  if (!notes.some(n => n.finger)) return null
  return { type: 'text', text: `${PREFIX}${trackIndex}:${encodeFingers(notes.map(n => n.finger))}`, ticks: 0 }
}
export const isFingerMeta = (text: unknown) => typeof text === 'string' && text.startsWith(PREFIX)

/** Fingers back onto the notes of the tracks they were saved with (a track
 *  whose notes no longer match in number is left alone) */
export function restoreFingers(tracks: { index: number; notes: { finger?: number }[] }[], headerMeta: { text?: string }[]): number {
  let n = 0
  for (const m of headerMeta) {
    if (!isFingerMeta(m.text)) continue
    const rest = m.text!.slice(PREFIX.length)
    const colon = rest.indexOf(':')
    const track = tracks.find(t => t.index === Number(rest.slice(0, colon)))
    const fingers = decodeFingers(rest.slice(colon + 1))
    if (!track || fingers.length !== track.notes.length) continue
    track.notes.forEach((note, i) => { if (fingers[i]) { note.finger = fingers[i]; n++ } })
  }
  return n
}

// ── Where the hand sits ──────────────────────────────────────────────────────
// White keys counted from C-1; a black key counts as the white key below it.
const WHITE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
export const whiteIndex = (midi: number) => Math.floor(midi / 12) * 7 + WHITE[midi % 12]
const WHITE_MIDI = [0, 2, 4, 5, 7, 9, 11]
export const midiOfWhite = (w: number) => Math.floor(w / 7) * 12 + WHITE_MIDI[((w % 7) + 7) % 7]

export interface HandPlace { time: number; hand: 'L' | 'R'; low: number; high: number; moved: boolean }

// How far from the thumb (in white keys, towards the little finger) each
// finger reaches with the hand where it is: a little stretch allowed, the
// little finger to an octave
const REACH: Record<number, [number, number]> = { 1: [-1, 1], 2: [0, 3], 3: [1, 4], 4: [2, 5], 5: [3, 7] }

/** For each hand, where it sits wherever a fingered note puts it somewhere
 *  new: the right thumb at the low end, the left thumb at the high end, five
 *  keys from it. A note its finger reaches from where the hand is (a stretch,
 *  an octave with 1 and 5) isn't a move; notes starting together are one
 *  moment. `moved` is false for each hand's first place. */
export function handPlaces(notes: { midi: number; time: number; finger?: number; hand?: 'L' | 'R' }[]): HandPlace[] {
  const out: HandPlace[] = []
  for (const hand of ['R', 'L'] as const) {
    const mine = notes.filter(x => x.finger && x.hand === hand).sort((a, b) => a.time - b.time || (a.finger! - b.finger!))
    let thumb: number | null = null
    const reaches = (n: { midi: number; finger?: number }) => {
      const d = hand === 'R' ? whiteIndex(n.midi) - thumb! : thumb! - whiteIndex(n.midi)
      return d >= REACH[n.finger!][0] && d <= REACH[n.finger!][1]
    }
    for (let i = 0; i < mine.length;) {
      // one moment: the notes starting together
      let j = i
      while (j < mine.length && mine[j].time - mine[i].time < 0.03) j++
      const moment = mine.slice(i, j)
      i = j
      if (thumb !== null && moment.every(reaches)) continue
      // the hand goes where this moment puts its thumb (the lowest finger number tells best)
      const n = moment[0], w = whiteIndex(n.midi)
      const t = hand === 'R' ? w - (n.finger! - 1) : w + (n.finger! - 1)
      const low = hand === 'R' ? t : t - 4, high = hand === 'R' ? t + 4 : t
      out.push({ time: n.time, hand, low: midiOfWhite(low), high: midiOfWhite(high), moved: thumb !== null })
      thumb = t
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

/** Dev Tools only: some fingering to look at (never offered to a player: Orfeo
 *  doesn't suggest fingering). Each hand walks its notes moment by moment (a
 *  chord is one moment), and starts a new position, thumb on the chord's
 *  outer note, wherever something falls outside its five keys. */
export function madeUpFingering(notes: { midi: number; time: number; hand?: 'L' | 'R'; finger?: number }[]): void {
  for (const hand of ['R', 'L'] as const) {
    const mine = notes.filter(x => x.hand === hand).sort((a, b) => a.time - b.time || a.midi - b.midi)
    let thumb: number | null = null
    const fingerOf = (w: number) => (thumb === null ? 0 : hand === 'R' ? w - thumb + 1 : thumb - w + 1)
    for (let i = 0; i < mine.length;) {
      let j = i
      while (j < mine.length && mine[j].time - mine[i].time < 0.03) j++
      const chord = mine.slice(i, j)
      if (chord.some(n => { const f = fingerOf(whiteIndex(n.midi)); return f < 1 || f > 5 })) {
        thumb = hand === 'R' ? whiteIndex(chord[0].midi) : whiteIndex(chord[chord.length - 1].midi)
      }
      for (const n of chord) n.finger = Math.max(1, Math.min(5, fingerOf(whiteIndex(n.midi))))
      i = j
    }
  }
}
