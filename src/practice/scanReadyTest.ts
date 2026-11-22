import { Midi } from '@tonejs/midi'
import { isPracticeReady } from './scanReady'

const bytes = (m: Midi): ArrayBuffer => { const a = m.toArray(); return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer }

// A small song: a piano part (as one or two tracks) plus a bass
function song(kind: 'hands' | 'mixed' | 'tune'): ArrayBuffer {
  const m = new Midi()
  const add = (name: string, ch: number, notes: [number, number][]) => {
    const t = m.addTrack(); t.name = name; t.channel = ch; t.instrument.number = 0
    for (const [midi, beat] of notes) t.addNote({ midi, ticks: beat * 480, durationTicks: 400 })
  }
  const beats = Array.from({ length: 60 }, (_, b) => b)   // long enough to be a part to practise
  const left: [number, number][] = beats.map(b => [36 + (b % 4), b])
  const right: [number, number][] = beats.map(b => [76 + (b % 5), b])
  if (kind === 'hands') { add('Piano LH', 0, left); add('Piano RH', 0, right) }
  if (kind === 'mixed') add('Piano', 0, [...left, ...right])
  if (kind === 'tune') add('Piano', 0, right.map(([n, b]) => [n - 10, b]))
  const bass = m.addTrack(); bass.name = 'Bass'; bass.channel = 1; bass.instrument.number = 33
  bass.addNote({ midi: 28, ticks: 0, durationTicks: 400 })
  return bytes(m)
}

export function runScanReadyTest(): number {
  console.group('[scanReady] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  check(isPracticeReady(song('hands'), 'a.mid', 'C:/a.mid'), 'a piano as Left Hand + Right Hand tracks: ready')
  check(!isPracticeReady(song('tune'), 'c.mid', 'C:/c.mid'), 'a piano all in one hand: not added, it needs preparing first')
  check(!isPracticeReady(song('mixed'), 'b.mid', 'C:/b.mid'), 'one piano track with both hands: not ready yet (Prepare for practice)')
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
