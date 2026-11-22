import { Midi } from '@tonejs/midi'
import { SongTake, songTakeToMidi } from './songTake'
import { trimSmfLead } from '../utils/smfLead'
import { encodeHandMapMeta, parseHandMapMeta } from '../utils/handMetadata'
import { fingerMeta, decodeFingers } from '../utils/fingering'

export function runSongTakeTest(): number {
  console.group('[songTake] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps

  // a song: 120 BPM, two bars of silence, then 8 s of piano (LH, RH) and a bass.
  // The right hand has fingers and a hand map; a pedal goes down at 4 s and up at 11 s.
  const song = () => {
    const m = new Midi()
    m.header.setTempo(120)
    const lh = m.addTrack(); lh.name = 'Piano LH'; lh.channel = 0
    const rh = m.addTrack(); rh.name = 'Piano RH'; rh.channel = 0
    const bass = m.addTrack(); bass.name = 'Bass'; bass.channel = 1; bass.instrument.number = 33
    for (let i = 0; i < 16; i++) {
      lh.addNote({ midi: 48, time: 4 + i * 0.5, duration: 0.4 })
      rh.addNote({ midi: 72, time: 4 + i * 0.5, duration: 0.4 })
      bass.addNote({ midi: 36, time: 4 + i * 0.5, duration: 0.4 })
    }
    rh.addCC({ number: 64, value: 1, time: 4 }); rh.addCC({ number: 64, value: 0, time: 11 })
    const meta = ((m.header as any).meta ??= [])
    meta.push(encodeHandMapMeta(1, rh.notes.map(() => 'R'), rh.notes.map((_, i) => (i === 15 ? 'manual' : 'computed'))))
    meta.push(fingerMeta(1, rh.notes.map((_, i) => ({ finger: (i % 5) + 1 }))))
    meta.push({ type: 'text', ticks: 0, text: 'ORFEO_TRACK_MUTED:1:1' })
    return m.toArray().buffer as ArrayBuffer
  }
  const metaOf = (m: Midi): string[] => ((m.header as any).meta ?? []).map((x: any) => x.text as string)

  // ── The take: keys at their place in the song ──
  {
    const tk = new SongTake(1)
    tk.key(60, 90, false, 0.9)            // a key let go that was pressed before
    tk.key(60, 90, true, 1)
    tk.pedal(64, 127, 1.1)
    tk.key(60, 0, false, 1.5)
    tk.key(64, 80, true, 2)               // never let go
    check(tk.noteCount === 2, 'two keys pressed')
    const ev = tk.stop(3)
    check(ev.filter(e => e.type === 'off').length === 2 && ev.some(e => e.type === 'off' && e.t === 3), 'a key still down is let go at the end')
    check(ev.filter(e => e.type === 'cc').length === 2, 'the pedal goes up at the end')
    check(tk.from === 1, 'where the take began')
  }

  // ── Right hand, from 6 s to 8 s: the song's right hand replaced there only ──
  {
    const tk = new SongTake(6)
    tk.key(74, 100, true, 6.0); tk.key(74, 0, false, 6.4)
    tk.key(76, 100, true, 7.02); tk.key(76, 0, false, 7.5)
    const { bytes, replaced } = songTakeToMidi(tk.stop(8), { origRaw: song(), parts: { L: 0, R: 1 }, hand: 'R', splitKey: 60, from: 6, to: 8 })
    const m = new Midi(bytes)
    const rh = m.tracks[1]
    check(replaced.join() === 'R' && m.tracks.length === 3, 'the right hand replaced, no track added')
    check(rh.name === 'Piano RH' && rh.channel === 0, 'the song\'s track keeps its name and sound')
    check(rh.notes.length === 14 && rh.notes.filter(n => n.time >= 6 && n.time < 8).map(n => n.midi).join() === '74,76', 'within the stretch only your notes, outside it the song\'s (12 of 16 kept + 2)')
    check(near(rh.notes.find(n => n.midi === 76)!.time, 7.02), 'your notes where you played them')
    check(m.tracks[0].notes.length === 16 && m.tracks[2].notes.length === 16, 'the left hand and the bass untouched')
    const meta = metaOf(m)
    check(!meta.some(x => x.startsWith('ORFEO_TRACK_MUTED:1:')), 'the replaced track isn\'t muted')
    const hm = meta.filter(x => x.startsWith('ORFEO_HAND_MAP:')).map(x => parseHandMapMeta(x)!)
    check(hm.length === 1 && hm[0].trackIndex === 1 && hm[0].hands.length === 14 && hm[0].hands.every(h => h === 'R'), 'one hand map for the track, every note right hand')
    const src = hm[0].sources ?? []
    const order = rh.notes.map(n => n.midi)
    check(src[order.indexOf(74)] === 'manual' && src[order.length - 1] === 'manual' && src[0] === 'computed', 'your notes and the song\'s own correction kept as set by you')
    const fm = meta.filter(x => x.startsWith('ORFEO_FINGERS:1:'))
    const fingers = fm.length ? decodeFingers(fm[0].split(':').slice(2).join(':')) : []
    check(fingers.length === 14 && fingers[0] === 1 && fingers[order.indexOf(74)] === undefined && fingers[13] === 1, 'fingers kept on the song\'s notes, none on yours')
    const ped = (rh.controlChanges[64] ?? []).map(c => [+c.time.toFixed(2), c.value])
    check(JSON.stringify(ped) === JSON.stringify([[4, 1], [6, 0], [8, 1], [11, 0]]), `the pedal: up while you played (you didn't use it), back down after ${JSON.stringify(ped)}`)
  }

  // ── Both hands by the split key, a transposed song, empty bars skipped ──
  {
    const raw = song()
    const file = new Midi(raw)
    const cut = Math.round(file.header.secondsToTicks(4))   // the two silent bars
    const played = trimSmfLead(raw, cut)
    const tk = new SongTake(0)
    // the song played 2 semitones up, starting where the music starts (0 s = 4 s in the file)
    tk.key(50, 90, true, 0); tk.key(50, 0, false, 0.4)      // D3 heard → C3 in the file, left hand
    tk.key(74, 90, true, 0.5); tk.key(74, 0, false, 0.9)    // D5 → C5, right hand
    const { bytes, replaced } = songTakeToMidi(tk.stop(1), { origRaw: raw, playedRaw: played, leadTick: cut, transpose: 2, hand: 'B', splitKey: 60, parts: { L: 0, R: 1 }, from: 0, to: 1 })
    const m = new Midi(bytes)
    check(replaced.join() === 'L,R', 'both hands replaced')
    const inStretch = (i: number) => m.tracks[i].notes.filter(n => n.time >= 4 && n.time < 5)
    check(inStretch(0).map(n => [n.midi, +n.time.toFixed(2)]).join() === '48,4' && inStretch(1).map(n => [n.midi, +n.time.toFixed(2)]).join() === '72,4.5',
      'back in the file\'s key, and where the music is in the file (skipped bars put back)')
    check(m.tracks[0].notes.length === 15 && m.tracks[1].notes.length === 15, 'the rest of both hands kept')
  }

  // ── Both hands, but only the right hand played: the left stays the song's ──
  {
    const tk = new SongTake(4)
    tk.key(72, 90, true, 4); tk.key(72, 0, false, 4.2)
    const { bytes, replaced } = songTakeToMidi(tk.stop(6), { origRaw: song(), hand: 'B', splitKey: 60, parts: { L: 0, R: 1 }, from: 4, to: 6 })
    const m = new Midi(bytes)
    check(replaced.join() === 'R' && m.tracks[0].notes.length === 16 && m.tracks[1].notes.length === 13, 'only the hand that played is replaced')
  }

  console.log(`  songTake: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
