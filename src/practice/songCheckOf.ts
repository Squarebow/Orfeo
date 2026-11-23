// ── The lesson check of one song, from its tracks ───────────────────────────
// practiceMode.ts › currentSongCheck() runs it on the open song (with the
// player's own track settings); the background reader (handPrescan.worker.ts)
// runs it on each song as read from the file, so the hands it needs are read
// before the Playback Editor ever opens.
import { assignHands, type HandAssignOptions } from '../utils/handAssignment'
import { nameHand, ownHandPair, isPracticePiano } from '../utils/practiceReadiness'
import { checkSong, type SongCheck, type CheckNote, type CheckTrack } from './songCheck'
import type { ParsedNote } from '../types'

export function songCheckOf(tracks: (CheckTrack & { notes: ParsedNote[] })[], stavePairs: [number, number][], options: HandAssignOptions): SongCheck {
  // the hands as the file has them: a piano's two staves (upper = right), or
  // tracks named / tagged for one hand
  const hands = new Map<number, 'L' | 'R'>()
  for (const [r, l] of stavePairs) { hands.set(r, 'R'); hands.set(l, 'L') }
  if (!hands.size) for (const t of tracks) { const h = nameHand({ name: t.name }); if (h) hands.set(t.index, h) }
  const read = (notes: CheckNote[]) => assignHands(notes.map(n => ({ midi: n.midi, time: n.time, duration: n.duration })), options).assignments.map(a => ({ ...a.note, hand: a.hand }))
  const pianoTracks = tracks.filter(t => isPracticePiano(t) && t.notes.length)
  const own = ownHandPair(pianoTracks, stavePairs)
  return checkSong(tracks, { hands: hands.size ? hands : undefined, own, read })
}
