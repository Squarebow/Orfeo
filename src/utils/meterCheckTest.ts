import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { meterFromDrums } from './meterCheck'

// A song of 32 bars: a piano, and drums with a rock backbeat (kick on 1 and 3,
// snare on 2 and 4) whose beat is `beat` written beats long
function song(num: number, bpm: number, beat: number): ArrayBuffer {
  const m = new Midi()
  m.header.setTempo(bpm)
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [num, 4] })
  const ppq = m.header.ppq
  const piano = m.addTrack(); piano.channel = 0; piano.instrument.number = 0
  const drums = m.addTrack(); drums.channel = 9
  for (let bar = 0; bar < 32; bar++) {
    const t0 = bar * num * ppq
    piano.addNote({ midi: 60, ticks: t0, durationTicks: ppq })
    for (let k = 0; k * beat < num - 1e-9; k++) {
      const ticks = Math.round(t0 + k * beat * ppq)
      drums.addNote({ midi: k % 2 === 0 ? 36 : 38, ticks, durationTicks: ppq / 4 })
    }
  }
  const a = m.toArray()
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}

export function runMeterCheckTest(): number {
  console.group('[meterCheck] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a 4/4 rock song written as 6/4 at 160: each real bar one 6/4 bar
  const wrong = meterFromDrums(parseMidiBuffer(song(6, 160, 1.5), 'a.mid', '', { rhMaxFingers: 5, lhMaxFingers: 5 }))
  check(!!wrong && wrong.bpm === 107 && wrong.beatsPerBar === 4 && Math.abs(wrong.period - 0.5625) < 1e-6, `6/4 at 160 with a 4/4 backbeat: 4 beats at 107 (${JSON.stringify(wrong)})`)
  // written as played
  check(meterFromDrums(parseMidiBuffer(song(4, 107, 1), 'b.mid', '', { rhMaxFingers: 5, lhMaxFingers: 5 })) === null, 'a 4/4 song written in 4/4: nothing to fix')
  check(meterFromDrums(parseMidiBuffer(song(6, 120, 1), 'c.mid', '', { rhMaxFingers: 5, lhMaxFingers: 5 })) === null, 'a real 6/4 with the backbeat on its own beats: nothing to fix')

  console.log(`  meterCheck: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
