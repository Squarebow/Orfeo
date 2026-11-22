import { Midi } from '@tonejs/midi'
import { SongTake, songTakeToMidi } from './songTake'
import { trimSmfLead } from '../utils/smfLead'

export function runSongTakeTest(): number {
  console.group('[songTake] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps

  // a song: 120 BPM, two bars of silence, then a piano (LH, RH) and a bass
  const song = () => {
    const m = new Midi()
    m.header.setTempo(120)
    const lh = m.addTrack(); lh.name = 'Piano LH'; lh.channel = 0
    const rh = m.addTrack(); rh.name = 'Piano RH'; rh.channel = 0
    const bass = m.addTrack(); bass.name = 'Bass'; bass.channel = 1; bass.instrument.number = 33
    for (let i = 0; i < 8; i++) {
      lh.addNote({ midi: 48, time: 4 + i * 0.5, duration: 0.4 })
      rh.addNote({ midi: 72, time: 4 + i * 0.5, duration: 0.4 })
      bass.addNote({ midi: 36, time: 4 + i, duration: 0.9 })
    }
    return m.toArray().buffer as ArrayBuffer
  }

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

  // ── Right hand over the song, the song as it is ──
  {
    const tk = new SongTake(4)
    tk.key(74, 100, true, 4.0); tk.key(74, 0, false, 4.4)
    tk.key(76, 100, true, 5.02); tk.key(76, 0, false, 5.5)
    const { bytes, added } = songTakeToMidi(tk.stop(6), { origRaw: song(), hand: 'R', mute: [1] })
    const m = new Midi(bytes)
    const take = m.tracks.find(t => t.name === 'My take RH')
    check(!!take && take.notes.length === 2, 'one track for the right hand, named so Orfeo reads the hand')
    check(!!take && near(take.notes[0].time, 4) && near(take.notes[1].time, 5.02) && near(take.notes[0].duration, 0.4), 'notes where they were played in the song')
    check(!!take && take.channel !== 0 && take.channel !== 1 && take.channel !== 9, 'a channel of its own')
    check(added.length === 1 && added[0] === 3, 'the new track comes after the song\'s three')
    const meta: string[] = ((m.header as any).meta ?? []).map((x: any) => x.text)
    check(meta.includes('ORFEO_TRACK_MUTED:1:1') && !meta.some(x => x.startsWith('ORFEO_TRACK_MUTED:0')), 'the song\'s own right hand kept, muted; the left hand untouched')
    check(m.tracks[1].notes.length === 8 && m.tracks[2].notes.length === 8, 'the song\'s notes all kept')
  }

  // ── Both hands, split key, a transposed song, empty bars skipped ──
  {
    const raw = song()
    const file = new Midi(raw)
    const cut = Math.round(file.header.secondsToTicks(4))   // the two silent bars
    const played = trimSmfLead(raw, cut)
    const tk = new SongTake(0)
    // the song played 2 semitones up, starting where the music starts (0 s = 4 s in the file)
    tk.key(50, 90, true, 0); tk.key(50, 0, false, 0.4)      // D3 heard → C3 in the file, left hand
    tk.key(74, 90, true, 0.5); tk.key(74, 0, false, 0.9)    // D5 → C5, right hand
    const { bytes, added } = songTakeToMidi(tk.stop(1), { origRaw: raw, playedRaw: played, leadTick: cut, transpose: 2, hand: 'B', splitKey: 60, mute: [0, 1] })
    const m = new Midi(bytes)
    const lh = m.tracks.find(t => t.name === 'My take LH'), rh = m.tracks.find(t => t.name === 'My take RH')
    check(!!lh && !!rh && lh.notes.length === 1 && rh.notes.length === 1, 'two tracks, by the split key')
    check(!!lh && lh.notes[0].midi === 48 && !!rh && rh.notes[0].midi === 72, 'back in the file\'s key')
    check(!!lh && near(lh.notes[0].time, 4) && !!rh && near(rh.notes[0].time, 4.5), 'the skipped bars put back: notes where the music is in the file')
    check(added.join() === '3,4', 'both new tracks counted')
    check(m.tracks[0].notes.length === 8, 'the file keeps its own start')
  }

  // ── Both hands, one hand silent: no empty track ──
  {
    const tk = new SongTake(4)
    tk.key(72, 90, true, 4); tk.key(72, 0, false, 4.2)
    const { bytes, added } = songTakeToMidi(tk.stop(5), { origRaw: song(), hand: 'B', splitKey: 60 })
    const m = new Midi(bytes)
    check(!m.tracks.some(t => t.name === 'My take LH') && m.tracks.some(t => t.name === 'My take RH'), 'only the hand that played')
    check(added.length === 1, 'one new track')
  }

  // ── Both hands as one track ──
  {
    const tk = new SongTake(4)
    tk.key(48, 90, true, 4); tk.key(72, 90, true, 4.01)
    const { bytes } = songTakeToMidi(tk.stop(5), { origRaw: song(), hand: 'B', splitKey: null })
    const t = new Midi(bytes).tracks.find(x => x.name === 'My take')
    check(!!t && t.notes.length === 2 && t.notes.every(n => near(n.duration, 1, 0.02)), 'one track, keys held to the end')
  }

  console.log(`  songTake: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
