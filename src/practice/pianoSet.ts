import type { Midi } from '@tonejs/midi'
import type { ParsedNote } from '../types'
import { assignHands, type HandAssignOptions } from '../utils/handAssignment'
import { stripHandSuffix, withHandSuffix } from '../utils/handMetadata'
import { isPracticePiano, trackHand, MAX_PRACTICE_PIANOS, PRACTICE_PREP_VISIBLE } from '../utils/practiceReadiness'
import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { copyHandTagsOntoEditBuffer } from '../utils/noteEditorCommands'

// ── The piano, as one instrument, in the Note Editor ─────────────────────────
// A song's piano may come as one track (both hands) or two (the two hands, or
// two parts that aren't the hands yet). For hands, the Note Editor treats all
// of them as one piano: it shows and edits them together, the hand check reads
// them together, and saving reshapes them into a Left Hand track and a Right
// Hand track (the rule for practice mode, utils/practiceReadiness.ts). While
// you edit, assigning a note to a hand only changes its hand; it moves to that
// hand's track when you save.

type TrackLike = { index: number; group?: string; isDrum?: boolean }

/** The tracks the Note Editor edits together with `index`: the song's piano
 *  tracks when `index` is one of one or two of them, otherwise just itself */
export function pianoSet(tracks: TrackLike[], index: number): number[] {
  if (!PRACTICE_PREP_VISIBLE) return [index]
  const pianos = tracks.filter(isPracticePiano).map(t => t.index)
  if (!pianos.includes(index) || pianos.length > MAX_PRACTICE_PIANOS) return [index]
  return pianos
}

/** Two piano tracks that aren't the two hands yet (a pop song's two piano
 *  parts): Orfeo's guess across both, as if they were one piano. Hands you
 *  set yourself are kept and left out of the guessing. */
export function guessHandsAcross(trackNotes: ParsedNote[][], options: HandAssignOptions = {}): boolean {
  if (trackNotes.length !== 2) return false
  const [a, b] = trackNotes
  const ha = trackHand({ notes: a }), hb = trackHand({ notes: b })
  if (ha && hb && ha !== hb) return false   // already the two hands
  const open = [...a, ...b].filter(n => n.handSource !== 'manual').sort((x, y) => x.time - y.time)
  const stream = open.map(n => ({ midi: n.midi, time: n.time, duration: n.duration, src: n }))
  for (const g of assignHands(stream, options).assignments) {
    g.note.src.hand = g.hand
    g.note.src.handConfidence = g.confidence
  }
  return true
}

/** The same, on the open song: shown at once, and the Note Editor's copy
 *  follows, so saving keeps it */
export function guessAcrossPiano(set: number[]): void {
  if (set.length !== 2) return
  const s = useStore.getState()
  const notes = set.map(i => s.midi?.tracks.find(t => t.index === i)?.notes ?? [])
  if (!guessHandsAcross(notes, { rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers })) return
  if (NES.editMidi && s.midi) copyHandTagsOntoEditBuffer(s.midi, NES.editMidi)
  useStore.setState(st => ({ handCheckRev: st.handCheckRev + 1 }))
}

/** Saving: the piano tracks of the Note Editor's copy become one Left Hand
 *  and one Right Hand track, every note on the track of its hand. Returns
 *  true when the song's tracks change shape (one track split into two, or
 *  two parts made into the two hands): that saves as a new version. Moving
 *  a few notes between two hand tracks that already exist is a hand fix. */
export function reshapePianoToHands(editMidi: Midi, pianoIndexes: number[]): boolean {
  const tracks = editMidi.tracks.filter(t => pianoIndexes.includes((t as any).index))
  if (tracks.length === 0 || tracks.length > 2) return false
  const handOf = (n: any): 'L' | 'R' => n.hand === 'L' || n.hand === 'R' ? n.hand : (n.midi < 60 ? 'L' : 'R')
  const wasPair = tracks.length === 2 && (() => {
    const [x, y] = tracks.map(t => trackHand({ name: t.name, notes: t.notes as any }))
    return !!x && !!y && x !== y
  })()
  const all = tracks.flatMap(t => t.notes as any[])
  const left = all.filter(n => handOf(n) === 'L')
  const right = all.filter(n => handOf(n) === 'R')
  if (tracks.length === 1 && (left.length === 0 || right.length === 0)) return false   // one hand only

  // which existing track becomes which hand (a pair keeps its own)
  let lh = tracks[0], rh = tracks[1]
  if (wasPair && trackHand({ name: lh.name, notes: lh.notes as any }) === 'R') [lh, rh] = [rh, lh]
  if (!rh) {
    // the right hand's own track, a twin of the piano: same channel, sound and
    // pedal / volume / expression, so it plays exactly as before
    rh = editMidi.addTrack()
    rh.channel = lh.channel
    rh.instrument.number = lh.instrument.number
    const cc = lh.controlChanges as Record<number, any[]>
    for (const k of Object.keys(cc)) (rh.controlChanges as any)[k] = cc[+k].map(c => ({ ...c }))
  } else if (!wasPair && lh.instrument.number !== rh.instrument.number) {
    // two different piano sounds become the two hands: both the grand piano
    lh.instrument.number = 0
    rh.instrument.number = 0
  }
  const byTime = (x: any, y: any) => x.ticks - y.ticks
  lh.notes.splice(0, lh.notes.length, ...left.sort(byTime).map(n => { n.hand = 'L'; return n }))
  rh.notes.splice(0, rh.notes.length, ...right.sort(byTime).map(n => { n.hand = 'R'; return n }))
  const base = stripHandSuffix(lh.name || '').replace(/^(Left|Right) Hand$/i, '').trim() || 'Piano'
  lh.name = withHandSuffix(base, 'L')
  rh.name = withHandSuffix(base, 'R')
  return !wasPair
}
