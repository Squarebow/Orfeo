import { Midi } from '@tonejs/midi'
import { encodeHandMapMeta } from '../utils/handMetadata'
type Hand = 'L' | 'R'
import { isFingerMeta } from '../utils/fingering'
import type { RecEvent } from './recorder'

// ── Recording over the song (practice mode, after 2.0) ───────────────────────
// What you play while the song plays, placed where the music you were hearing
// had got to (practice/listen.ts heardSongTime): in the song's own seconds, so
// a take played at half speed lands in the song at full speed. You record
// your own piano part over the arrangement: kept, it replaces the song's piano
// part for the hand(s) you played, whole, in a new _ORFEO_vN (the same tracks,
// their sound and place, so the version is still two hands to practise).
// Recording over a stretch only is Overdub, a mode of its own (later).
// Pure: tests feed it by hand.

/** One take over the song: keys and pedals at their place in the song (seconds) */
export class SongTake {
  private events: RecEvent[] = []
  private held = new Map<number, number>()
  private pedals = new Map<number, number>()
  private stopped: RecEvent[] | null = null
  readonly from: number

  constructor(from: number) { this.from = from }

  key(note: number, vel: number, on: boolean, t: number): void {
    if (this.stopped) return
    if (on && vel > 0) {
      this.held.set(note, (this.held.get(note) ?? 0) + 1)
      this.events.push({ t: Math.max(0, t), type: 'on', note, vel })
    } else {
      const n = this.held.get(note) ?? 0
      if (n === 0) return                       // let go of a key pressed before the take
      if (n === 1) this.held.delete(note); else this.held.set(note, n - 1)
      this.events.push({ t: Math.max(0, t), type: 'off', note })
    }
  }

  pedal(cc: number, value: number, t: number): void {
    if (this.stopped) return
    if (this.pedals.get(cc) === value) return
    this.pedals.set(cc, value)
    this.events.push({ t: Math.max(0, t), type: 'cc', cc, value })
  }

  get noteCount(): number { return this.events.filter(e => e.type === 'on').length }

  /** Going on after a pause: the count-in brings the song back to the start of
   *  the bar, so what you played from `t` on is played again and replaced.
   *  A key or pedal still down from before is let go at `t`. */
  rewindTo(t: number): void {
    if (this.stopped) return
    const kept = this.events.filter(e => e.t < t)
    const down = new Map<number, number>()
    for (const e of kept) if (e.type === 'on') down.set(e.note, (down.get(e.note) ?? 0) + 1)
      else if (e.type === 'off') down.set(e.note, Math.max(0, (down.get(e.note) ?? 0) - 1))
    for (const [note, n] of down) for (let i = 0; i < n; i++) kept.push({ t, type: 'off', note })
    const ped = new Map<number, number>()
    for (const e of kept) if (e.type === 'cc') ped.set(e.cc, e.value)
    for (const [cc, v] of ped) if (v >= 64) kept.push({ t, type: 'cc', cc, value: 0 })
    this.events = kept
    this.held.clear()
    this.pedals = new Map([...ped].map(([cc, v]) => [cc, v >= 64 ? 0 : v]))
  }

  /** End the take at `t` (song seconds): keys and pedals still down are let go there */
  stop(t: number): RecEvent[] {
    if (this.stopped) return this.stopped
    const end = Math.max(0, t)
    for (const [note, n] of this.held) for (let i = 0; i < n; i++) this.events.push({ t: end, type: 'off', note })
    this.held.clear()
    for (const [cc, v] of this.pedals) if (v >= 64) this.events.push({ t: end, type: 'cc', cc, value: 0 })
    // a key let go a hair before it was pressed (two clocks) still pairs in order
    this.stopped = this.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.t - b.e.t || a.i - b.i).map(x => x.e)
    return this.stopped
  }
}

export interface SongTakeOptions {
  /** the song file's own bytes */
  origRaw: ArrayBuffer
  /** the bytes the song played from, when Orfeo shortened it (empty bars skipped) */
  playedRaw?: ArrayBuffer | null
  /** where the shortened song was cut, in the file's ticks */
  leadTick?: number
  /** semitones the song was moved: your notes go back into the file's key */
  transpose?: number
  /** the song's piano part, by hand: the track (as Orfeo numbers them: tracks with notes) each hand's take replaces */
  parts: { L?: number; R?: number }
  /** the hand(s) you played */
  hand: 'L' | 'R' | 'B'
  /** both hands: below it the left hand, from it up the right */
  splitKey: number
  /** where the take ended (song seconds): keys still down are let go there */
  end: number
}

const PEDALS = [64, 66, 67]

/** The song with your take as its piano part. Returns the new file's bytes
 *  and the hands that were replaced (a hand you didn't play stays the song's). */
export function songTakeToMidi(events: RecEvent[], o: SongTakeOptions): { bytes: Uint8Array; replaced: Hand[] } {
  const out = new Midi(o.origRaw)
  const played = o.playedRaw ? new Midi(o.playedRaw) : out
  const lead = o.playedRaw ? (o.leadTick ?? 0) : 0
  const tickOf = (sec: number) => Math.max(0, Math.round(played.header.secondsToTicks(sec)) + lead)
  const shift = o.transpose ?? 0
  const noteOf = (n: number) => Math.max(0, Math.min(127, n - shift))
  const handOf = (note: number): Hand => (o.hand === 'B' ? (note < o.splitKey ? 'L' : 'R') : o.hand)

  // your notes and pedals, by hand
  type N = { midi: number; ticks: number; durationTicks: number; velocity: number }
  const take: Record<Hand, N[]> = { L: [], R: [] }
  const pedals: { cc: number; value: number; ticks: number }[] = []
  const open = new Map<number, { t: number; vel: number }[]>()
  const add = (note: number, a: number, b: number, vel: number) => {
    const ta = tickOf(a), tb = tickOf(b)
    take[handOf(note)].push({ midi: noteOf(note), ticks: ta, durationTicks: Math.max(1, tb - ta), velocity: vel / 127 })
  }
  for (const e of events) {
    if (e.type === 'on') { const q = open.get(e.note) ?? []; q.push({ t: e.t, vel: e.vel }); open.set(e.note, q) }
    else if (e.type === 'off') { const on = open.get(e.note)?.shift(); if (on) add(e.note, on.t, e.t, on.vel) }
    else pedals.push({ cc: e.cc, value: e.value / 127, ticks: tickOf(e.t) })
  }
  for (const [note, q] of open) for (const on of q) add(note, on.t, Math.max(o.end, on.t + 0.01), on.vel)

  // the song's tracks as Orfeo numbers them (tracks with notes)
  const numbered = out.tracks.filter(t => t.notes.length > 0)
  const replaced: Hand[] = []
  const swapped: { idx: number; hand: Hand }[] = []
  for (const h of ['L', 'R'] as Hand[]) {
    const idx = o.parts[h]
    if (idx === undefined || !take[h].length || (o.hand !== 'B' && o.hand !== h)) continue
    const track = numbered[idx]
    if (!track) continue
    replaced.push(h)
    swapped.push({ idx, hand: h })
    // your notes and your pedals in place of the song's; the track keeps its name, sound and place
    track.notes.length = 0
    for (const n of take[h]) track.addNote(n)
    for (const cc of PEDALS) delete track.controlChanges[cc]
    for (const p of pedals) track.addCC({ number: p.cc, value: p.value, ticks: p.ticks })
  }

  // the replaced tracks' hands, fingering and a saved mute were the song's: gone with its notes
  const meta: any[] = (out.header as any).meta ?? []
  ;(out.header as any).meta = meta.filter(m => !(typeof m.text === 'string' && swapped.some(({ idx: i }) =>
    (m.text.startsWith('ORFEO_HAND_MAP:') && m.text.split(':')[2] === String(i))
    || (isFingerMeta(m.text) && m.text.split(':')[1] === String(i))
    || m.text.startsWith(`ORFEO_TRACK_MUTED:${i}:`))))
  // every note of yours in your hand: you chose it (the hand, or the split key)
  for (const { idx, hand } of swapped) (out.header as any).meta.push(encodeHandMapMeta(idx, take[hand].map(() => hand), take[hand].map(() => 'manual')))
  return { bytes: out.toArray(), replaced }
}
