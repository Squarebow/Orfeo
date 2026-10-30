import { Midi } from '@tonejs/midi'
import { readdirSync, readFileSync } from 'node:fs'
import { trimSmfLead, restoreLeadForSave } from './smfLead'
import { midiToEditableCopy } from './noteEditorCommands'

// A song with three bars of 3/4 lead-in (a drum click, the instrument and
// volume set up, a volume move), then 4/4 at a new tempo where the music starts
const PPQ = 480
const CUT = 3 * 3 * PPQ
function fixture(): ArrayBuffer {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 100 }, { ticks: CUT, bpm: 140 })
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] }, { ticks: CUT, timeSignature: [4, 4] })
  m.header.update()
  const piano = m.addTrack()
  piano.channel = 0
  piano.instrument.number = 5
  piano.addCC({ number: 7, value: 0.5, ticks: 0 })
  piano.addCC({ number: 7, value: 0.8, ticks: 2 * PPQ })
  piano.addNote({ midi: 60, ticks: CUT, durationTicks: PPQ, velocity: 0.7 })
  piano.addNote({ midi: 64, ticks: CUT + PPQ, durationTicks: PPQ, velocity: 0.7 })
  const drums = m.addTrack()
  drums.channel = 9
  drums.addNote({ midi: 42, ticks: PPQ, durationTicks: 60, velocity: 0.6 })
  drums.addNote({ midi: 36, ticks: CUT + 2 * PPQ, durationTicks: 60, velocity: 0.9 })
  const a = m.toArray()
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}
const lastCC7At = (m: Midi, t: number, tick: number) =>
  (m.tracks[t].controlChanges[7] ?? []).filter(c => c.ticks <= tick).at(-1)?.value

export function runSmfLeadTest(): number {
  console.group('[smfLead] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const bytes = fixture()
  const src = new Midi(bytes)
  const pianoAt = src.tracks.findIndex(t => t.channel === 0 && t.notes.length > 0)
  const drumAt = src.tracks.findIndex(t => t.channel === 9)
  const out = new Midi(trimSmfLead(bytes, CUT))

  check(out.header.tempos[0]?.ticks === 0 && Math.round(out.header.tempos.at(-1)!.bpm) === 140, 'tempo at the cut')
  check(out.header.timeSignatures.at(-1)?.timeSignature[0] === 4, 'metre at the cut')
  check(out.tracks[pianoAt].notes[0]?.ticks === 0 && out.tracks[pianoAt].notes[1]?.ticks === PPQ, 'notes move back by the cut')
  check(out.tracks.length === src.tracks.length, 'every track kept, same order')
  check(out.tracks[drumAt].notes.length === 1 && out.tracks[drumAt].notes[0].midi === 36, 'lead notes dropped')
  check(Math.abs((lastCC7At(out, pianoAt, 0) ?? -1) - 0.8) < 0.01, 'state before the cut in force at tick 0')
  check(out.tracks[pianoAt].instrument.number === 5, 'instrument kept')

  const smpte = fixture()
  new Uint8Array(smpte).set([0xe7, 0x28], 12)
  check(trimSmfLead(smpte, 960) === smpte, 'SMPTE untouched')
  check(trimSmfLead(bytes, 0) === bytes, 'nothing to cut: untouched')

  // Saving edits made on the shortened song puts the lead-in back
  const ed = midiToEditableCopy(trimSmfLead(bytes, CUT))
  ed.tracks[pianoAt].notes[0].velocity = 0.3
  const back = restoreLeadForSave(ed, bytes, CUT)
  const leadNotes = (m: Midi) => m.tracks.map(t => t.notes.filter(n => n.ticks < CUT).map(n => [n.midi, n.ticks, n.durationTicks].join()).join(';')).join('|')
  const cc7 = (m: Midi) => m.tracks.map(t => (t.controlChanges[7] ?? []).map(c => c.ticks + ':' + c.value.toFixed(3)).join(',')).join('|')
  check(leadNotes(back) === leadNotes(src) && cc7(back) === cc7(src), 'save keeps the lead-in')
  check(back.tracks[pianoAt].notes[0]?.ticks === CUT && Math.abs(back.tracks[pianoAt].notes[0].velocity - 0.3) < 0.01, 'edits land back in place')
  check(JSON.stringify(back.header.tempos.map(t => [t.ticks, Math.round(t.bpm)])) === JSON.stringify(src.header.tempos.map(t => [t.ticks, Math.round(t.bpm)])), 'tempo map is the original')
  check(back.tracks[drumAt].notes.length === 2, 'drum click in the lead and the beat after both there')

  // The tempo, metre and key in force where the music starts are the song's —
  // not the lead-in's first ones (review: the key read C for a song in G)
  {
    const m = new Midi()
    m.header.tempos.push({ ticks: 0, bpm: 100 }, { ticks: CUT, bpm: 140 })
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] }, { ticks: CUT, timeSignature: [4, 4] })
    ;(m.header as any).keySignatures.push({ ticks: 0, key: 'C', scale: 'major' }, { ticks: CUT, key: 'G', scale: 'major' })
    m.header.update()
    m.addTrack().addNote({ midi: 67, ticks: CUT, durationTicks: PPQ, velocity: 0.7 })
    const a = m.toArray()
    // @tonejs/midi writes key signatures wrongly: set C (0 sharps) and G (1 sharp) by hand
    const sharps = [0, 1]
    for (let i = 0; i + 4 < a.length; i++) if (a[i] === 0xff && a[i + 1] === 0x59 && a[i + 2] === 0x02) { a[i + 3] = sharps.shift() ?? 0; a[i + 4] = 0 }
    const short = new Midi(trimSmfLead(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, CUT))
    check(short.header.tempos.length === 1 && Math.round(short.header.tempos[0].bpm) === 140, `one tempo, the music's: ${short.header.tempos.map(t => Math.round(t.bpm))}`)
    check(short.header.timeSignatures.length === 1 && short.header.timeSignatures[0].timeSignature[0] === 4, 'one metre, the music\'s')
    check((short.header as any).keySignatures.length === 1 && (short.header as any).keySignatures[0].key === 'G', 'one key, the music\'s')
  }

  // Markers and lyrics in the skipped bars go; the ones from the music on stay
  // in place — and a save puts every one back where it was
  {
    const m = new Midi()
    m.header.tempos.push({ ticks: 0, bpm: 120 })
    ;(m.header as any).meta.push({ type: 'marker', text: 'Intro', ticks: 960 }, { type: 'marker', text: 'Verse', ticks: CUT }, { type: 'marker', text: 'Chorus', ticks: CUT + 1920 })
    m.header.update()
    m.addTrack().addNote({ midi: 60, ticks: CUT, durationTicks: PPQ, velocity: 0.7 })
    const a = m.toArray()
    const raw = a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
    const marks = (x: Midi) => ((x.header as any).meta as any[]).filter(e => e.type === 'marker').map(e => e.text + '@' + e.ticks).join(',')
    const short = new Midi(trimSmfLead(raw, CUT))
    check(marks(short) === 'Verse@0,Chorus@1920', `markers after the cut: ${marks(short)}`)
    const back = restoreLeadForSave(midiToEditableCopy(trimSmfLead(raw, CUT)), raw, CUT)
    check(marks(back) === marks(new Midi(raw)), `markers back in place on save: ${marks(back)}`)
  }

  // A real file (running status, several tracks): cut at bar 3, nothing lost after it
  for (const f of readdirSync('public/Demo').filter(n => /\.mid$/i.test(n))) {
    const r = readFileSync('public/Demo/' + f)
    const raw = r.buffer.slice(r.byteOffset, r.byteOffset + r.byteLength) as ArrayBuffer
    const orig = new Midi(raw)
    const cut = orig.header.ppq * 8
    const short = new Midi(trimSmfLead(raw, cut))
    const after = (m: Midi, d: number) => m.tracks.map(t => t.notes.filter(n => n.ticks >= d).map(n => [n.midi, n.ticks - d, n.durationTicks].join()).join(';')).join('|')
    check(after(short, 0) === after(orig, cut), f + ': every note after the cut, moved back')
  }

  console.log(`smfLead: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
