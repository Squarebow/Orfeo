import { Midi } from '@tonejs/midi'
import { withHandSuffix } from '../utils/handMetadata'
import type { RecEvent } from './recorder'

// ── Recording over the song (practice mode, after 2.0) ───────────────────────
// What you play while the song plays, placed where the music you were hearing
// had got to (practice/listen.ts heardSongTime): in the song's own seconds, so
// a take played at half speed lands in the song at full speed. On Stop it is
// added to the song as its own track (or one per hand) in a new _ORFEO_vN; the
// song's own piano part for that hand is kept, muted, so nothing is lost and
// the two can't be confused. Pure: tests feed it by hand.

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
  /** the hand you played: one track for it, or both (split, or one track) */
  hand: 'L' | 'R' | 'B'
  /** both hands: below it the left hand, from it up the right. None: one track */
  splitKey?: number | null
  baseName?: string
  program?: number
  /** the song's tracks (as Orfeo numbers them: tracks with notes) saved muted */
  mute?: number[]
  /** the channel of the song's piano part: your take shares it only when no channel is free */
  pianoChannel?: number
}

/** The song with your take added. Returns the new file's bytes and the new tracks' numbers */
export function songTakeToMidi(events: RecEvent[], o: SongTakeOptions): { bytes: Uint8Array; added: number[] } {
  const out = new Midi(o.origRaw)
  const played = o.playedRaw ? new Midi(o.playedRaw) : out
  const lead = o.playedRaw ? (o.leadTick ?? 0) : 0
  const tickOf = (sec: number) => Math.max(0, Math.round(played.header.secondsToTicks(sec)) + lead)
  const shift = o.transpose ?? 0
  const noteOf = (n: number) => Math.max(0, Math.min(127, n - shift))

  // a channel of its own, so muting the song's piano never silences your take
  const used = new Set(out.tracks.filter(t => t.notes.length || Object.keys(t.controlChanges).length).map(t => t.channel))
  const free = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15].find(c => !used.has(c))
  const channel = free ?? o.pianoChannel ?? 0
  const base = o.baseName ?? 'My take'
  const withNotesBefore = out.tracks.filter(t => t.notes.length > 0).length

  const make = (name: string) => {
    const t = out.addTrack()
    t.name = name
    t.channel = channel
    t.instrument.number = o.program ?? 0
    return t
  }
  const split = o.hand === 'B' && o.splitKey != null ? o.splitKey : null
  const tracks = o.hand === 'L' ? [make(withHandSuffix(base, 'L'))]
    : o.hand === 'R' ? [make(withHandSuffix(base, 'R'))]
    : split !== null ? [make(withHandSuffix(base, 'L')), make(withHandSuffix(base, 'R'))]
    : [make(base)]
  const trackFor = (note: number) => (split !== null && note >= split ? tracks[1] : tracks[0])

  const open = new Map<number, { t: number; vel: number }[]>()
  const add = (note: number, from: number, to: number, vel: number) => {
    const a = tickOf(from), b = tickOf(to)
    trackFor(note).addNote({ midi: noteOf(note), ticks: a, durationTicks: Math.max(1, b - a), velocity: vel / 127 })
  }
  let last = 0
  for (const e of events) {
    last = Math.max(last, e.t)
    if (e.type === 'on') { const q = open.get(e.note) ?? []; q.push({ t: e.t, vel: e.vel }); open.set(e.note, q) }
    else if (e.type === 'off') { const on = open.get(e.note)?.shift(); if (on) add(e.note, on.t, e.t, on.vel) }
    else for (const tr of tracks) tr.addCC({ number: e.cc, value: e.value / 127, ticks: tickOf(e.t) })
  }
  for (const [note, q] of open) for (const on of q) add(note, on.t, Math.max(last, on.t + 0.01), on.vel)

  // the song's own part for that hand: kept, muted (ORFEO_TRACK_MUTED, as the Mixer saves it)
  const mute = new Set(o.mute ?? [])
  const meta: any[] = ((out.header as any).meta ??= [])
  ;(out.header as any).meta = meta.filter(m => !(typeof m.text === 'string' && [...mute].some(i => m.text.startsWith(`ORFEO_TRACK_MUTED:${i}:`))))
  for (const i of mute) (out.header as any).meta.push({ type: 'text', ticks: 0, text: `ORFEO_TRACK_MUTED:${i}:1` })

  const added = tracks.filter(t => t.notes.length > 0).map((_, i) => withNotesBefore + i)
  // a hand that played nothing (both hands, split) leaves no empty track behind
  out.tracks = out.tracks.filter(t => !tracks.includes(t) || t.notes.length > 0)
  return { bytes: out.toArray(), added }
}
