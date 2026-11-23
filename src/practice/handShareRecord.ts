// ── One song's hands, as anonymous numbers (Share my hands for research) ────
// What a player shares to improve Orfeo's hand reading: for each song whose
// piano part comes as two hands (the file's two staves, two tracks named for
// the hands, or a part prepared and saved in Orfeo), the piano notes as bare
// numbers (key, start, length) and the hand of each, plus which hands the
// player set or confirmed themselves. Nothing else: no file name, no track
// names, no words, no other instruments, no tempo marks. A fingerprint of the
// notes lets copies of the same song from different players be counted once.
import type { ParsedNote } from '../types'
import { RESTORED_CONFIDENCE } from '../utils/handMetadata'
import { songPracticeState } from '../utils/practiceReadiness'
import type { HandAssignOptions } from '../utils/handAssignment'

export interface SharedSong {
  /** a fingerprint of the notes (the same song from two players: one id) */
  id: string
  /** where the hands come from: the file's two staves, tracks named for the
   *  hands, or a piano part prepared and saved in Orfeo */
  kind: 'staves' | 'named' | 'orfeo'
  notes: number
  /** keys (MIDI note numbers, middle C = 60) */
  key: number[]
  /** start of each note, in ms after the previous note's start */
  on: number[]
  /** length of each note, ms */
  len: number[]
  /** 'L' or 'R' per note */
  hand: string
  /** '1' where the player set or confirmed the hand themselves (Orfeo's own saves only) */
  mine?: string
}

const MIN_NOTES = 50

export function sharedSong(midi: { tracks: { index: number; group?: string; isDrum?: boolean; name?: string; notes: ParsedNote[] }[]; _stavePairs?: [number, number][] }, options: HandAssignOptions): SharedSong | null {
  const pairs = midi._stavePairs ?? []
  const st = songPracticeState(midi.tracks, { stavePairs: pairs, options })
  if (st.state !== 'ready') return null
  const L = midi.tracks.find(t => t.index === st.left), R = midi.tracks.find(t => t.index === st.right)
  if (!L || !R) return null
  const both = [...L.notes.map(n => ({ n, h: 'L' })), ...R.notes.map(n => ({ n, h: 'R' }))]
    .sort((a, b) => a.n.time - b.n.time || a.n.midi - b.n.midi)
  if (both.length < MIN_NOTES) return null
  const fromOrfeo = both.some(x => x.n.handConfidence === RESTORED_CONFIDENCE || x.n.handSource === 'manual')
  const kind = pairs.some(([u, l]) => u === R.index && l === L.index) && !fromOrfeo ? 'staves' : fromOrfeo ? 'orfeo' : 'named'
  const key: number[] = [], on: number[] = [], len: number[] = []
  let hand = '', mine = '', prev = 0, h1 = 0x811c9dc5, h2 = 0x9e3779b9
  for (const { n, h } of both) {
    const t = Math.round(n.time * 1000)
    key.push(n.midi); on.push(t - prev); len.push(Math.max(1, Math.round(n.duration * 1000))); prev = t
    hand += h
    mine += n.handSource === 'manual' ? '1' : '0'
    for (const v of [n.midi, t]) { h1 = Math.imul(h1 ^ v, 0x01000193); h2 = Math.imul(h2 ^ v, 0x5bd1e995); h2 ^= h2 >>> 15 }
  }
  const id = (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
  return { id, kind, notes: both.length, key, on, len, hand, ...(mine.includes('1') ? { mine } : {}) }
}
