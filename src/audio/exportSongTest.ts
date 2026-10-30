import { buildExportSong, exportFileName, type ExportSong, type HeardState } from './exportSong'

// A small song: piano (ch0) notes at 0 s and 1 s, guitar (ch1) at 0.5 s, drums (ch9) at 0.25 s
function song(withPiano = true) {
  const tracks: any[] = []
  if (withPiano) tracks.push({ index: 0, name: 'Piano', gmName: 'Acoustic Grand Piano', program: 0, group: 'piano', isDrum: false, color: '#000000', channel: 0,
    notes: [{ midi: 60, time: 0, duration: 0.5, velocity: 0.8 }, { midi: 64, time: 1, duration: 0.5, velocity: 0.8 }], _cc7: 0.9, _cc10: 0.25, _cc91: 0.3, _cc93: 0.1 })
  tracks.push({ index: 1, name: 'Guitar', gmName: 'Clean Guitar', program: 27, group: 'guitar', isDrum: false, color: '#000000', channel: 1,
    notes: [{ midi: 55, time: 0.5, duration: 1, velocity: 0.7 }] })
  tracks.push({ index: 2, name: 'Drums', gmName: 'Standard Drum Kit', program: 0, group: 'drums', isDrum: true, color: '#000000', channel: 9,
    notes: [{ midi: 36, time: 0.25, duration: 0.1, velocity: 1 }] })
  return { fileName: 'x.mid', duration: 2, bpm: 120, timeSignatureNumerator: 4, timeSignatureDenominator: 4, noteCount: 4, tracks } as any
}
function states(midi: any, patch: Record<number, any> = {}) {
  return midi.tracks.map((t: any) => ({ index: t.index, name: t.name, gmName: t.gmName, trackName: t.gmName, program: t.program, group: t.group, isDrum: t.isDrum,
    color: t.color, colorSource: 'default', muted: false, solo: false, visible: true, showOnKeyboard: false, volume: 1, pan: 0, chorus: 0, reverb: 0, ...(patch[t.index] ?? {}) }))
}
const ons = (s: ExportSong) => s.events.filter(e => (e.status & 0xf0) === 0x90 && e.d2 > 0)
const MASTER = { gain: 0.5, toneDb: 3, comp: { enabled: true, preset: 2 } }
const heard = (h: Partial<HeardState> = {}): HeardState => ({ tempoRatio: 1, transpose: 0, master: MASTER, loop: null, ...h })

export function runExportSongTest(): number {
  console.group('[exportSong] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol

  // 1. Original: every note, the file's own mix, neutral master
  const m = song()
  const o = buildExportSong(m, states(m, { 0: { volume: 0.2, muted: true } }), 'original')
  check(ons(o).length === 4, `original keeps all 4 notes, got ${ons(o).length}`)
  check(near(o.channels[0]!.volume, 0.9) && near(o.channels[0]!.pan, -0.5) && near(o.channels[0]!.reverb, 0.3), `original uses the file's mix, got ${JSON.stringify(o.channels[0])}`)
  check(JSON.stringify(o.master) === JSON.stringify({ gain: 1, toneDb: 0, comp: { enabled: false, preset: 0 } }), `original master is neutral, got ${JSON.stringify(o.master)}`)
  check(near(o.duration, 1.5), `duration = last note-off (1.5 s), got ${o.duration}`)

  // 2. Focus: no guitar; keys and drums stay
  const f = buildExportSong(m, states(m), 'focus')
  check(!ons(f).some(e => e.track === 1), 'focus drops the guitar')
  check(ons(f).some(e => e.track === 0) && ons(f).some(e => e.track === 2), 'focus keeps piano and drums')
  check(f.hasKeys === true, 'focus with piano: hasKeys')
  const np = song(false)
  const f2 = buildExportSong(np, states(np), 'focus')
  check(f2.hasKeys === false && ons(f2).some(e => e.d1 === 36), 'focus without keys: hasKeys false, drums still there')

  // 3. As I hear it: muted guitar, double tempo, up 3 semitones (drums untouched)
  const h = buildExportSong(m, states(m, { 1: { muted: true } }), 'heard', heard({ tempoRatio: 2, transpose: 3 }))
  check(!ons(h).some(e => e.track === 1), 'heard drops the muted guitar')
  const pn = ons(h).filter(e => e.track === 0)
  check(pn.length === 2 && near(pn[1].time, 0.5) && pn[0].d1 === 63 && pn[1].d1 === 67, `heard: piano at half time, +3, got ${JSON.stringify(pn)}`)
  check(ons(h).find(e => e.track === 2)!.d1 === 36, 'heard: drums not transposed')
  check(JSON.stringify(h.master) === JSON.stringify(MASTER), 'heard copies the master settings')

  // 4. Loop 0.9–2 s: only what's inside, shifted to 0; a note crossing the end is cut there
  const l = buildExportSong(m, states(m), 'heard', heard({ loop: { start: 0.9, end: 1.3 } }))
  const ln = ons(l)
  check(ln.length === 1 && ln[0].d1 === 64 && near(ln[0].time, 0.1), `loop keeps the 1 s note, at 0.1 s, got ${JSON.stringify(ln)}`)
  const off = l.events.find(e => (e.status & 0xf0) === 0x80 && e.d1 === 64)
  check(!!off && near(off.time, 0.4), `note crossing the loop end is released at the end (0.4 s), got ${off?.time}`)

  // 5. Solo: only the soloed track
  const s = buildExportSong(m, states(m, { 2: { solo: true } }), 'heard', heard())
  check(ons(s).length === 1 && ons(s)[0].track === 2, 'heard with a solo plays only the soloed track')

  // 6. A note-off and a note-on at the same instant: off first
  const rep: any = song(); rep.tracks[0].notes = [{ midi: 60, time: 0, duration: 1, velocity: 0.8 }, { midi: 60, time: 1, duration: 0.5, velocity: 0.8 }]
  const r = buildExportSong(rep, states(rep), 'original')
  const at1 = r.events.filter(e => near(e.time, 1) && e.d1 === 60)
  check(at1.length === 2 && (at1[0].status & 0xf0) === 0x80, `off before on at the same time, got ${JSON.stringify(at1)}`)

  // 7. File names
  check(exportFileName('Song', 'focus', 'mp3') === 'Song (Focus).mp3', 'focus file name')
  check(exportFileName('Song', 'heard', 'wav') === 'Song (As I hear it).wav', 'heard file name')
  check(exportFileName('Song', 'original', 'mp3') === 'Song.mp3', 'original file name')

  console.log(`exportSong: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
