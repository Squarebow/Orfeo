// ── Which tracks show their notes in the hand colours ───────────────────────
// No switch (25. 11., the user: "Orfeo should colour the notes to the hands
// by itself"): the piano you'd play shows its hands, every other instrument
// its own colour, so an organ's chords never look like the piano's left hand.
// The piano you'd play is the one practice mode would take:
//   • the song's piano tracks, when there are one or two of them;
//   • with more than two, only a piano's own two staves;
//   • with no piano, the keyboard part (an organ, a harpsichord) the same way.
// A track that is one hand all through (Orfeo's own "Piano LH" / "Piano RH")
// shows its hand everywhere anyway (handColors.ts, isHomogeneousHandTrack).
import type { ParsedMidi } from '../types'
import { HAND_ASSIGN_GROUPS } from './keyboardGroups'
import { isPracticePiano } from './practiceReadiness'
// a piano part this small beside a band is part of the band
import { MIN_PRACTICE_NOTES as MIN_PART_NOTES } from '../practice/songCheck'

const EMPTY = new Set<number>()

interface TrackInfo { index: number; group?: string; isDrum?: boolean; program?: number }

export function handColouredTracksOf(midi: ParsedMidi | null | undefined, tracks: TrackInfo[]): Set<number> {
  if (!midi) return EMPTY
  const info = (i: number) => tracks.find(t => t.index === i)
  const sounding = midi.tracks.filter(t => t.notes.length > 0).map(t => {
    const ts = info(t.index)
    return { index: t.index, notes: t.notes.length, group: ts?.group ?? t.group, isDrum: ts?.isDrum ?? t.isDrum, program: ts?.program ?? (t as any).program }
  })
  const pick = (isPart: (t: typeof sounding[number]) => boolean): Set<number> | null => {
    const others = sounding.some(t => !isPart(t))
    const part = sounding.filter(t => isPart(t) && (!others || t.notes >= MIN_PART_NOTES))
    if (!part.length) return null
    if (part.length <= 2) return new Set(part.map(t => t.index))
    const inPart = new Set(part.map(t => t.index))
    const staves = ((midi as any)._stavePairs ?? []) as [number, number][]
    return new Set(staves.filter(([a, b]) => inPart.has(a) && inPart.has(b)).flat())
  }
  return pick(t => isPracticePiano(t))
    ?? pick(t => !t.isDrum && HAND_ASSIGN_GROUPS.has(t.group ?? ''))
    ?? EMPTY
}

// One answer per song and track list (the track list changes with every mute
// or colour, the song only when another opens)
let last: { midi: unknown; tracks: unknown; set: Set<number> } | null = null
export function handColouredTracks(midi: ParsedMidi | null | undefined, tracks: TrackInfo[]): Set<number> {
  if (last && last.midi === midi && last.tracks === tracks) return last.set
  const set = handColouredTracksOf(midi, tracks)
  last = { midi, tracks, set }
  return set
}
