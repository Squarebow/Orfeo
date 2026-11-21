import { Midi } from '@tonejs/midi'
import { Take } from './recorder'
import { recordingToMidi } from './recordingToMidi'

export function runRecorderTest(): number {
  console.group('[recorder] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) < eps

  // ── The take ──
  {
    const tk = new Take(1000, { bpm: 90, timeSig: [3, 4] }, 5)
    tk.key(60, 100, false, 900)            // a release for a key held before the take
    tk.key(60, 100, true, 1500)            // C at 0.5 s
    tk.pedal(64, 127, 1600)                // pedal down
    tk.pedal(64, 127, 1650)                // the same value again: kept once
    tk.key(64, 80, true, 2000)             // E at 1 s
    tk.key(60, 0, false, 2500)             // C up at 1.5 s
    tk.key(67, 70, true, 2600)             // G at 1.6 s, never released
    check(tk.noteCount === 3, 'three keys pressed')
    const rec = tk.stop(3000)              // stopped at 2 s: E, G and the pedal let go
    check(rec.duration === 2 && rec.bpm === 90 && rec.timeSig[0] === 3 && rec.startedAt === 5, 'length, tempo, time signature, when')
    check(rec.events.filter(e => e.type === 'cc').length === 2, 'pedal down once, and up at the end')
    const offs = rec.events.filter(e => e.type === 'off')
    check(offs.length === 3 && offs.filter(e => e.t === 2).length === 2, 'keys still down are let go at the end')
    check(rec.events.every((e, i, a) => i === 0 || a[i - 1].t <= e.t), 'in time order')
    tk.key(72, 100, true, 3100)
    check(tk.stop(3200) === rec, 'nothing more after it stops')
  }
  {
    // the same key from two keyboards: two presses, two releases
    const tk = new Take(0)
    tk.key(60, 90, true, 0); tk.key(60, 90, true, 100); tk.key(60, 0, false, 200); tk.key(60, 0, false, 300)
    const rec = tk.stop(400)
    check(rec.events.filter(e => e.type === 'off').length === 2, 'two presses of one key, two releases')
  }

  // ── As a MIDI file ──
  {
    const tk = new Take(0, { bpm: 100 })
    tk.key(48, 64, true, 1000); tk.key(48, 0, false, 2000)       // C3, left
    tk.key(72, 127, true, 1500); tk.key(72, 0, false, 1750)      // C5, right
    tk.pedal(64, 127, 1200); tk.pedal(64, 0, 1900)
    const rec = tk.stop(2500)
    const one = new Midi(recordingToMidi(rec, { name: 'Take 1' }))
    check(one.tracks.length === 1 && one.tracks[0].name === 'Piano' && one.tracks[0].notes.length === 2, 'one piano track, both notes')
    check(near(one.header.tempos[0]?.bpm ?? 0, 100, 0.01), 'the tempo of the take')
    const c3 = one.tracks[0].notes.find(n => n.midi === 48)!
    check(near(c3.time, 1) && near(c3.duration, 1) && near(c3.velocity, 64 / 127), 'when, how long and how hard, as played')
    check(one.tracks[0].controlChanges[64]?.length === 2, 'the pedal, down and up')
    const two = new Midi(recordingToMidi(rec, { splitKey: 60 }))
    check(two.tracks.length === 2 && two.tracks[0].notes[0]?.midi === 48 && two.tracks[1].notes[0]?.midi === 72, 'split: low notes left, high notes right')
    check(/LH/i.test(two.tracks[0].name) && /RH/i.test(two.tracks[1].name), 'the hands named the way Orfeo reads them')
    check(two.tracks[0].controlChanges[64]?.length === 2 && two.tracks[1].controlChanges[64]?.length === 2, 'the pedal on both hands')
    const trimmed = new Midi(recordingToMidi(rec, { trimStart: true }))
    check(near(trimmed.tracks[0].notes.find(n => n.midi === 48)!.time, 0.5), 'trimmed: half a second before the first note')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
