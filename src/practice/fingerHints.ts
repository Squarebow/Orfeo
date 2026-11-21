import { create } from 'zustand'
import { useStore } from '../store'
import { FINGER_VERSION } from '../utils/fingering'
import { suggestFingering } from './suggestFingering'

// ── Suggested fingering on the song (Settings › Practice › Fingering) ───────
// Off by default. When on, each hand of the practice part gets a suggested
// finger for every note you haven't fingered yourself (practice/
// suggestFingering.ts), kept on the note as `fingerHint`, never saved into the
// file. Wherever fingering shows (the keyboard, the score, a lighted keyboard
// that lights per finger), your own number wins and a suggestion is drawn so
// you can tell it's one. Worked out again when the song, its hands, your own
// fingering or the hand size change.

type HNote = { midi: number; time: number; duration: number; finger?: number; fingerHint?: number }

/** Bumped when the suggestions change, so whatever shows them redraws */
export const useFingerHints = create<{ v: number }>(() => ({ v: 0 }))

/** The finger to show for a note: your own, else a suggestion when they're on */
export function shownFinger(n: { finger?: number; fingerHint?: number }, hintsOn = useStore.getState().fingerHints): { finger: number; suggested: boolean } | null {
  if (n.finger) return { finger: n.finger, suggested: false }
  if (hintsOn && n.fingerHint) return { finger: n.fingerHint, suggested: true }
  return null
}

let lastKey = ''
function update() {
  const s = useStore.getState()
  const parts = s.tracks.filter(t => t.practicePart && t.practiceHand)
  const tracks = parts.map(ts => ({ ts, notes: (s.midi?.tracks.find(t => t.index === ts.index)?.notes ?? []) as HNote[] }))
  // transposed, you play other keys (other black keys): fingered as you play it
  const shift = s.detectedKey?.transpose ?? 0
  const songKey = s.detectedKey ? { tonic: (((s.detectedKey.semitone + shift) % 12) + 12) % 12, minor: s.detectedKey.isMinor } : undefined   // for the scale tables
  const key = [s.fingerHints, s.handSize, FINGER_VERSION.n, songKey ? `${songKey.tonic}${songKey.minor}` : '', shift, s.midi ? (s.midi as any)._filePath ?? s.midi.fileName : '',
    ...tracks.map(x => `${x.ts.index}${x.ts.practiceHand}${x.notes.length}`)].join('|')
  if (key === lastKey) return
  lastKey = key
  for (const { ts, notes } of tracks) {
    if (!s.fingerHints) { for (const n of notes) delete n.fingerHint; continue }
    const hint = suggestFingering(notes.map(n => ({ midi: n.midi + shift, time: n.time, dur: n.duration, finger: n.finger })), ts.practiceHand!, s.handSize, songKey)
    notes.forEach((n, i) => { if (!n.finger && hint[i]) n.fingerHint = hint[i]; else delete n.fingerHint })
  }
  useFingerHints.setState(h => ({ v: h.v + 1 }))
}

useStore.subscribe((s, prev) => {
  if (s.fingerHints !== prev.fingerHints || s.handSize !== prev.handSize || s.midi !== prev.midi || s.tracks !== prev.tracks || s.detectedKey !== prev.detectedKey) update()
})
update()
