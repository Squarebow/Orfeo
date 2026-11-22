import { Midi } from '@tonejs/midi'
import { SongTake, songTakeToMidi } from './songTake'
import { trimSmfLead } from '../utils/smfLead'
import { encodeHandMapMeta, parseHandMapMeta } from '../utils/handMetadata'
import { fingerMeta } from '../utils/fingering'

export function runSongTakeTest(): number {
  console.group('[songTake] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps

  // a song: 120 BPM, two bars of silence, then 8 s of piano (LH, RH) and a bass.
  // The right hand has fingers, a hand map, a saved mute and a pedal.
  const song = () => {
    const m = new Midi()
    m.header.setTempo(120)
    const lh = m.addTrack(); lh.name = 'Piano LH'; lh.channel = 0
    const rh = m.addTrack(); rh.name = 'Piano RH'; rh.channel = 0; rh.instrument.number = 1
    const bass = m.addTrack(); bass.name = 'Bass'; bass.channel = 1; bass.instrument.number = 33
    for (let i = 0; i < 16; i++) {
      lh.addNote({ midi: 48, time: 4 + i * 0.5, duration: 0.4 })
      rh.addNote({ midi: 72, time: 4 + i * 0.5, duration: 0.4 })
      bass.addNote({ midi: 36, time: 4 + i * 0.5, duration: 0.4 })
    }
    rh.addCC({ number: 64, value: 1, time: 4 }); rh.addCC({ number: 64, value: 0, time: 11 })
    rh.addCC({ number: 7, value: 0.8, time: 0 })
    const meta = ((m.header as any).meta ??= [])
    meta.push(encodeHandMapMeta(1, rh.notes.map(() => 'R')))
    meta.push(fingerMeta(1, rh.notes.map((_, i) => ({ finger: (i % 5) + 1 }))))
    meta.push({ type: 'text', ticks: 0, text: 'ORFEO_TRACK_MUTED:1:1' })
    meta.push(encodeHandMapMeta(0, lh.notes.map(() => 'L')))
    return m.toArray().buffer as ArrayBuffer
  }
  const metaOf = (m: Midi): string[] => ((m.header as any).meta ?? []).map((x: any) => x.text as string)

  // ── The take: keys at their place in the song ──
  {
    const tk = new SongTake(0)
    tk.key(60, 90, false, 0.9)            // a key let go that was pressed before
    tk.key(60, 90, true, 1)
    tk.pedal(64, 127, 1.1)
    tk.key(60, 0, false, 1.5)
    tk.key(64, 80, true, 2)               // never let go
    check(tk.noteCount === 2, 'two keys pressed')
    const ev = tk.stop(3)
    check(ev.filter(e => e.type === 'off').length === 2 && ev.some(e => e.type === 'off' && e.t === 3), 'a key still down is let go at the end')
    check(ev.filter(e => e.type === 'cc').length === 2, 'the pedal goes up at the end')
  }

  // ── Going on after a pause: from the start of the bar, played again ──
  {
    const tk = new SongTake(0)
    tk.key(60, 90, true, 1); tk.key(60, 0, false, 1.5)   // before the bar line: kept
    tk.key(62, 90, true, 2.5)                             // held over the bar line at 2 s
    tk.pedal(64, 127, 1.8)
    tk.key(64, 90, true, 2.2); tk.key(64, 0, false, 2.4)  // after it: played again
    tk.rewindTo(2)
    tk.key(62, 0, false, 2.6)                             // the old key's release: already let go
    tk.key(65, 90, true, 2.1); tk.key(65, 0, false, 2.3)
    const ev = tk.stop(3)
    const ons = ev.filter(e => e.type === 'on').map(e => (e as any).note)
    check(ons.join() === '60,65', `from the bar line only the new playing ${ons}`)
    check(ev.some(e => e.type === 'cc' && e.t === 2 && e.value === 0), 'the pedal let go at the bar line')
    check(ev.filter(e => e.type === 'off').length === 2, 'every key let go once')
  }

  // ── Right hand: your playing becomes the song's right hand, whole ──
  {
    const tk = new SongTake(0)
    tk.key(74, 100, true, 4.0); tk.key(74, 0, false, 4.4)
    tk.pedal(64, 127, 4.0); tk.pedal(64, 0, 5.0)
    tk.key(76, 100, true, 7.02); tk.key(76, 0, false, 7.5)
    const { bytes, replaced } = songTakeToMidi(tk.stop(8), { origRaw: song(), parts: { L: 0, R: 1 }, hand: 'R', splitKey: 60, end: 8 })
    const m = new Midi(bytes)
    const rh = m.tracks[1]
    check(replaced.join() === 'R' && m.tracks.length === 3, 'the right hand replaced, no track added')
    check(rh.name === 'Piano RH' && rh.channel === 0 && rh.instrument.number === 1, 'the song\'s track keeps its name and sound')
    check(rh.notes.map(n => n.midi).join() === '74,76' && near(rh.notes[1].time, 7.02) && near(rh.notes[0].duration, 0.4), 'only your notes, where you played them')
    check(JSON.stringify((rh.controlChanges[64] ?? []).map(c => [+c.time.toFixed(2), c.value])) === '[[4,1],[5,0]]', 'your pedal in place of the song\'s')
    check((rh.controlChanges[7] ?? []).length === 1, 'the track\'s volume kept')
    check(m.tracks[0].notes.length === 16 && m.tracks[2].notes.length === 16, 'the left hand and the bass untouched')
    const meta = metaOf(m)
    check(!meta.some(x => x.startsWith('ORFEO_TRACK_MUTED:1:')) && !meta.some(x => x.startsWith('ORFEO_FINGERS:1:')), 'the song\'s mute and fingering of that track gone')
    const hm = meta.filter(x => x.startsWith('ORFEO_HAND_MAP:')).map(x => parseHandMapMeta(x)!)
    const rhMap = hm.find(h => h.trackIndex === 1), lhMap = hm.find(h => h.trackIndex === 0)
    check(!!rhMap && rhMap.hands.length === 2 && rhMap.hands.every(h => h === 'R') && (rhMap.sources ?? []).every(x => x === 'manual'), 'your notes: right hand, as you set it')
    check(!!lhMap && lhMap.hands.length === 16, 'the left hand\'s own hand map kept')
  }

  // ── Both hands by the split key, a transposed song, empty bars skipped ──
  {
    const raw = song()
    const file = new Midi(raw)
    const cut = Math.round(file.header.secondsToTicks(4))   // the two silent bars
    const played = trimSmfLead(raw, cut)
    const tk = new SongTake(0)
    // the song played 2 semitones up, from where the music starts (0 s = 4 s in the file)
    tk.key(50, 90, true, 0); tk.key(50, 0, false, 0.4)      // D3 heard → C3 in the file, left hand
    tk.key(74, 90, true, 0.5); tk.key(74, 0, false, 0.9)    // D5 → C5, right hand
    const { bytes, replaced } = songTakeToMidi(tk.stop(1), { origRaw: raw, playedRaw: played, leadTick: cut, transpose: 2, hand: 'B', splitKey: 60, parts: { L: 0, R: 1 }, end: 1 })
    const m = new Midi(bytes)
    check(replaced.join() === 'L,R', 'both hands replaced')
    check(m.tracks[0].notes.map(n => [n.midi, +n.time.toFixed(2)]).join() === '48,4' && m.tracks[1].notes.map(n => [n.midi, +n.time.toFixed(2)]).join() === '72,4.5',
      'back in the file\'s key, and where the music is in the file (skipped bars put back)')
  }

  // ── Both hands, but only the right hand played: the left stays the song's ──
  {
    const tk = new SongTake(0)
    tk.key(72, 90, true, 4); tk.key(72, 0, false, 4.2)
    const { bytes, replaced } = songTakeToMidi(tk.stop(6), { origRaw: song(), hand: 'B', splitKey: 60, parts: { L: 0, R: 1 }, end: 6 })
    const m = new Midi(bytes)
    check(replaced.join() === 'R' && m.tracks[0].notes.length === 16 && m.tracks[1].notes.length === 1, 'a hand you didn\'t play keeps the song\'s notes')
  }

  console.log(`  songTake: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
