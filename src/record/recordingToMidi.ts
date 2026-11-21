import { Midi } from '@tonejs/midi'
import { withHandSuffix } from '../utils/handMetadata'
import type { Recording } from './recorder'

// ── A take as an ordinary MIDI file ──────────────────────────────────────────
// One piano track, or with a split key two (left hand below it, right hand
// from it up), named the way Orfeo reads hands back. The tempo and time
// signature of the take, so its bars line up when you played to a click.
// Pedals go with every piano track. Nothing is moved onto the beat: what you
// played is what's kept (tidying the timing is a later, separate step).

export interface ToMidiOptions {
  splitKey?: number          // MIDI note: below it the left hand, from it up the right
  name?: string              // the song's name in the file
  trimStart?: boolean        // start the file just before the first note (default: as played)
  barSec?: number            // with trimStart: cut whole bars only, so a take to a click keeps its bars
}

const LEAD_IN = 0.5          // seconds kept before the first note when trimming

export function recordingToMidi(rec: Recording, o: ToMidiOptions = {}): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(rec.bpm)
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [rec.timeSig[0], rec.timeSig[1]] })
  if (o.name) midi.header.name = o.name

  const firstOn = rec.events.find(e => e.type === 'on')?.t ?? 0
  const shift = !o.trimStart ? 0
    : o.barSec ? Math.floor((firstOn + 0.05) / o.barSec) * o.barSec   // a note a hair early still counts in its bar
    : Math.max(0, firstOn - LEAD_IN)

  const split = o.splitKey
  const one = split === undefined
  const left = midi.addTrack()
  const right = one ? left : midi.addTrack()
  left.name = one ? 'Piano' : withHandSuffix('Piano', 'L')
  if (!one) right.name = withHandSuffix('Piano', 'R')
  const all = one ? [left] : [left, right]
  for (const tr of all) { tr.channel = 0; tr.instrument.number = 0 }
  const trackFor = (note: number) => (one || note < split ? left : right)

  // pair each press with its release (first in, first out per key)
  const open = new Map<number, { t: number; vel: number }[]>()
  for (const e of rec.events) {
    const t = Math.max(0, e.t - shift)
    if (e.type === 'on') {
      const q = open.get(e.note) ?? []
      q.push({ t, vel: e.vel }); open.set(e.note, q)
    } else if (e.type === 'off') {
      const on = open.get(e.note)?.shift()
      if (!on) continue
      trackFor(e.note).addNote({ midi: e.note, time: on.t, duration: Math.max(0.01, t - on.t), velocity: on.vel / 127 })
    } else {
      for (const tr of all) tr.addCC({ number: e.cc, value: e.value / 127, time: t })
    }
  }
  // presses never released (a take always closes them; a hand-made one may not)
  const end = Math.max(0, rec.duration - shift)
  for (const [note, q] of open) for (const on of q) trackFor(note).addNote({ midi: note, time: on.t, duration: Math.max(0.01, end - on.t), velocity: on.vel / 127 })

  return midi.toArray()
}
