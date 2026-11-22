import { Midi } from '@tonejs/midi'
import { encodeHandMapMeta, parseHandMapMeta } from '../utils/handMetadata'
type Hand = 'L' | 'R'
import { decodeFingers, fingerMeta, isFingerMeta } from '../utils/fingering'
import type { RecEvent } from './recorder'

// ── Recording over the song (practice mode, after 2.0) ───────────────────────
// What you play while the song plays, placed where the music you were hearing
// had got to (practice/listen.ts heardSongTime): in the song's own seconds, so
// a take played at half speed lands in the song at full speed. Kept, it
// replaces the song's own piano part for the hand(s) you played, from where
// you started to where you stopped, in a new _ORFEO_vN: outside that stretch
// the song's part stays as it was, so the version is still the whole song and
// still two hands to practise. Pure: tests feed it by hand.

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
  /** the stretch you played, in song seconds: the song's part is replaced within it */
  from: number
  to: number
}

const PEDALS = [64, 66, 67]

/** The song with your take in place of its piano part (for the stretch you
 *  played). Returns the new file's bytes and the hands that were replaced. */
export function songTakeToMidi(events: RecEvent[], o: SongTakeOptions): { bytes: Uint8Array; replaced: Hand[] } {
  const out = new Midi(o.origRaw)
  const played = o.playedRaw ? new Midi(o.playedRaw) : out
  const lead = o.playedRaw ? (o.leadTick ?? 0) : 0
  const tickOf = (sec: number) => Math.max(0, Math.round(played.header.secondsToTicks(sec)) + lead)
  const shift = o.transpose ?? 0
  const noteOf = (n: number) => Math.max(0, Math.min(127, n - shift))
  const handOf = (note: number): Hand => (o.hand === 'B' ? (note < o.splitKey ? 'L' : 'R') : o.hand)
  const fromTick = tickOf(o.from), toTick = Math.max(tickOf(o.to), fromTick + 1)

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
  for (const [note, q] of open) for (const on of q) add(note, on.t, Math.max(o.to, on.t + 0.01), on.vel)

  // the song's tracks as Orfeo numbers them (tracks with notes)
  const numbered = out.tracks.filter(t => t.notes.length > 0)
  const meta: any[] = (out.header as any).meta ?? []
  const metaFor = (prefix: string, i: number) => meta.find(m => typeof m.text === 'string' && m.text.startsWith(prefix) && m.text.slice(prefix.length).split(':')[prefix === 'ORFEO_HAND_MAP:' ? 1 : 0] === String(i))

  // what each kept note of a replaced track carries: its hand (and whether you
  // set it), its finger. Found again after writing by place and key.
  const keyOf = (ticks: number, midi: number) => `${ticks}|${midi}`
  const carry = new Map<number, { own: Hand; hand: Map<string, { hand: Hand; manual: boolean }>; finger: Map<string, number> }>()
  const replaced: Hand[] = []

  for (const h of ['L', 'R'] as Hand[]) {
    const idx = o.parts[h]
    if (idx === undefined || !take[h].length || (o.hand !== 'B' && o.hand !== h)) continue   // a hand you didn't play stays the song's
    const track = numbered[idx]
    if (!track) continue
    replaced.push(h)
    const hm = metaFor('ORFEO_HAND_MAP:', idx)
    const hands = hm ? parseHandMapMeta(hm.text) : null
    const fm = metaFor('ORFEO_FINGERS:', idx)
    const fingers = fm ? decodeFingers(fm.text.slice('ORFEO_FINGERS:'.length).split(':').slice(1).join(':')) : []
    const info = { own: h, hand: new Map<string, { hand: Hand; manual: boolean }>(), finger: new Map<string, number>() }
    const kept: N[] = []
    track.notes.forEach((n, i) => {
      if (n.ticks >= fromTick && n.ticks < toTick) return   // the stretch you played: yours now
      kept.push({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, velocity: n.velocity })
      const k = keyOf(n.ticks, n.midi)
      info.hand.set(k, hands && hands.hands.length === track.notes.length ? { hand: hands.hands[i], manual: hands.sources?.[i] === 'manual' } : { hand: h, manual: false })
      if (fingers.length === track.notes.length && fingers[i]) info.finger.set(k, fingers[i]!)
    })
    // your notes, in your hand: you chose it (the split key), so it's kept as set by you
    for (const n of take[h]) info.hand.set(keyOf(n.ticks, n.midi), { hand: h, manual: true })
    track.notes.length = 0
    for (const n of [...kept, ...take[h]]) track.addNote(n)

    // the pedals: the song's within the stretch give way to yours; going in,
    // the pedal starts up, and coming out it's back where the song had it
    for (const cc of PEDALS) {
      const list = (track.controlChanges[cc] ?? []) as { ticks: number; value: number }[]
      const before = [...list].filter(c => c.ticks < toTick).pop()
      const mine = pedals.filter(p => p.cc === cc)
      if (!list.length && !mine.length) continue
      track.controlChanges[cc] = list.filter(c => c.ticks < fromTick || c.ticks >= toTick) as any
      if (list.some(c => c.ticks < fromTick && c.value >= 0.5) || mine.length) track.addCC({ number: cc, value: 0, ticks: fromTick })
      for (const p of mine) track.addCC({ number: cc, value: p.value, ticks: p.ticks })
      if (before && !list.some(c => c.ticks === toTick)) track.addCC({ number: cc, value: before.value, ticks: toTick })
      ;(track.controlChanges[cc] as any[]).sort((a, b) => a.ticks - b.ticks)
    }
    carry.set(idx, info)
  }

  // hands, fingers and a saved mute of the replaced tracks are written again below
  ;(out.header as any).meta = meta.filter(m => !(typeof m.text === 'string' && [...carry.keys()].some(i =>
    (m.text.startsWith('ORFEO_HAND_MAP:') && m.text.split(':')[2] === String(i))
    || (isFingerMeta(m.text) && m.text.split(':')[1] === String(i))
    || m.text.startsWith(`ORFEO_TRACK_MUTED:${i}:`))))

  // read the written file back: the notes in the order Orfeo will read them
  const again = new Midi(out.toArray())
  const numberedAgain = again.tracks.filter(t => t.notes.length > 0)
  for (const [idx, info] of carry) {
    const notes = numberedAgain[idx]?.notes ?? []
    const hands = notes.map(n => info.hand.get(keyOf(n.ticks, n.midi)) ?? { hand: info.own, manual: false })
    ;(again.header as any).meta.push(encodeHandMapMeta(idx, hands.map(x => x.hand), hands.map(x => (x.manual ? 'manual' : 'computed'))))
    const fm = fingerMeta(idx, notes.map(n => ({ finger: info.finger.get(keyOf(n.ticks, n.midi)) })))
    if (fm) (again.header as any).meta.push(fm)
  }
  return { bytes: again.toArray(), replaced }
}
