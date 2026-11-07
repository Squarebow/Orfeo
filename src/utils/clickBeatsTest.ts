import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { clickBeats } from './clickBeats'

function song(signatures: [number, number, number][], bars: number) {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 120 })
  m.header.timeSignatures.push(...signatures.map(([ticks, a, b]) => ({ ticks, timeSignature: [a, b] })))
  m.header.update()
  const end = signatures.at(-1)![0] + bars * m.header.ppq * 8
  m.addTrack().addNote({ midi: 60, ticks: end, durationTicks: 120, velocity: 0.7 })
  const a = m.toArray()
  return parseMidiBuffer(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, 'test.mid') as any
}

export function runClickBeatsTest(): number {
  console.group('[clickBeats] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const perBar = (m: any, bar: number) => clickBeats(m).filter((t: number) => t >= m._barTimes[bar] - 1e-6 && t < m._barTimes[bar + 1] - 1e-6).length

  for (const [num, den, want] of [[12, 8, 4], [9, 8, 3], [6, 8, 2], [12, 16, 4], [3, 8, 3], [5, 8, 5], [7, 8, 7], [4, 4, 4], [3, 4, 3], [6, 4, 6]]) {
    check(perBar(song([[0, num, den]], 4), 1) === want, `${num}/${den} clicks ${want} a bar, got ${perBar(song([[0, num, den]], 4), 1)}`)
  }

  const plain = song([[0, 4, 4]], 4)
  check(clickBeats(plain) === plain._beatTimes, 'a plain song keeps its own beats')

  const swung = song([[0, 12, 8]], 4)
  check(clickBeats(swung) === clickBeats(swung), 'the same array every time, for the metronome')
  check(swung._beatTimes.length > clickBeats(swung).length, 'the eighths stay in the grid')
  check(swung._barTimes.every((b: number) => clickBeats(swung).some((t: number) => Math.abs(t - b) < 1e-6)), 'every bar line is clicked, for the accent')

  // Changing metre: each bar goes by its own signature
  const ppq = plain._raw ? 480 : 480
  const mixed = song([[0, 4, 4], [ppq * 8, 12, 8]], 4)
  check(perBar(mixed, 0) === 4 && perBar(mixed, 2) === 4 && mixed._barTimes.length > 3, `4/4 then 12/8, got ${perBar(mixed, 0)} and ${perBar(mixed, 2)}`)
  const back = song([[0, 6, 8], [ppq * 6, 4, 4]], 4)
  check(perBar(back, 0) === 2 && perBar(back, 2) === 4, `6/8 then 4/4, got ${perBar(back, 0)} and ${perBar(back, 2)}`)

  check(clickBeats(null).length === 0, 'no song')

  console.log(`clickBeats: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
