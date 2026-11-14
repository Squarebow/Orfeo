import { Midi } from '@tonejs/midi'
import { convertForeignFileToMidiBuffer } from './foreignFormatImport'
import { assignHandsByTrack, type HandTrack, type HandInput } from './handAssignment'

// ── A minimal MusicXML fixture builder ───────────────────────────────────────
// `staffCount` staves under one piano/organ part, one whole note per staff a
// couple of octaves apart so avg-pitch-gap/collision-rate are never in doubt.
function gmProgramXml(program: number): string {
  // MusicXML <midi-program> is 1-based.
  return `<midi-program>${program + 1}</midi-program>`
}

function part(id: string, name: string, channel: number, program: number, staffCount: number, octaves: number[]): string {
  const clefs = Array.from({ length: staffCount }, (_, i) =>
    `<clef number="${i + 1}"><sign>${i === 0 ? 'G' : 'F'}</sign><line>${i === 0 ? 2 : 4}</line></clef>`).join('')
  const notes: string[] = []
  for (let i = 0; i < staffCount; i++) {
    if (i > 0) notes.push(`<backup><duration>4</duration></backup>`)
    notes.push(
      `<note><pitch><step>C</step><octave>${octaves[i]}</octave></pitch><duration>4</duration>` +
      `<voice>${i + 1}</voice><type>whole</type><staff>${i + 1}</staff></note>`
    )
  }
  return `<part id="${id}">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        ${staffCount > 1 ? `<staves>${staffCount}</staves>` : ''}
        ${clefs}
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      ${notes.join('\n')}
    </measure>
  </part>`
}

function scoreXml(parts: { id: string; name: string; channel: number; program: number }[], partBodies: string[]): Uint8Array {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    ${parts.map(p => `<score-part id="${p.id}">
      <part-name>${p.name}</part-name>
      <score-instrument id="${p.id}-I1"><instrument-name>${p.name}</instrument-name></score-instrument>
      <midi-instrument id="${p.id}-I1"><midi-channel>${p.channel}</midi-channel>${gmProgramXml(p.program)}</midi-instrument>
    </score-part>`).join('\n')}
  </part-list>
  ${partBodies.join('\n')}
</score-partwise>`
  return new TextEncoder().encode(xml)
}

function multiStaffFixture(staffCount: number, program: number, octaves: number[]): Uint8Array {
  const p = { id: 'P1', name: 'Keys', channel: 1, program }
  return scoreXml([p], [part(p.id, p.name, p.channel, p.program, staffCount, octaves)])
}

// Two separate grand-staff pianos, each on its own MIDI channel, as a duet
// score would notate them — not two staves of one part.
function twoPianosFixture(): Uint8Array {
  const p1 = { id: 'P1', name: 'Piano 1', channel: 1, program: 0 }
  const p2 = { id: 'P2', name: 'Piano 2', channel: 2, program: 0 }
  return scoreXml([p1, p2], [
    part(p1.id, p1.name, p1.channel, p1.program, 2, [5, 3]),
    part(p2.id, p2.name, p2.channel, p2.program, 2, [6, 2]),
  ])
}

// Build the HandTrack[] midiParser.ts would hand to assignHandsByTrack(): one
// entry per note-carrying MIDI track, grouped by nothing else.
function toHandTracks(midi: Midi): HandTrack<HandInput>[] {
  return midi.tracks.filter(t => t.notes.length > 0).map(t => ({
    name: t.name ?? '',
    channel: t.channel ?? -1,
    group: 'piano',
    notes: t.notes.map(n => ({ midi: n.midi, time: n.time, duration: n.duration })),
  }))
}

export async function runForeignFormatImportTest(): Promise<number> {
  console.group('[ForeignFormatImport] grand-staff hand-split self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // runAllTests.ts's headless harness stubs a minimal `window`/`document` for
  // modules that merely check `typeof window !== 'undefined'` (see
  // installTestEnvironment() there). alphaTab's own environment detection
  // goes further — seeing a `window` at all, it assumes a real browser DOM
  // (Element, canvas, …) is available and crashes on the stub. None of that
  // affects what's under test here (alphaTab is only ever used import-only,
  // rendering disabled), so the stub is removed for the duration of this
  // test and restored after — a test-local workaround, not a harness change.
  const g = globalThis as any
  const savedWindow = g.window
  const savedDocument = g.document
  delete g.window
  delete g.document

  try {

    // ── Case A: grand-staff piano (2 staves) — the reported bug's exact shape.
    // Before the fix, alphaTab merges both staves onto one track AND one
    // channel; after it, each staff is its own track sharing the original
    // channel — the same convention MuseScore's own MIDI export uses — so
    // findStavePairs() (handAssignment.ts) trusts it outright, upper staff
    // right hand, lower left, never second-guessed.
    {
      const buf = await convertForeignFileToMidiBuffer(multiStaffFixture(2, 0, [5, 3]), 'musicxml')
      const midi = new Midi(buf)
      const real = midi.tracks.filter(t => t.notes.length > 0)
      check(real.length === 2, `expected 2 note-carrying tracks for a grand-staff piano, got ${real.length}`)
      check(new Set(real.map(t => t.channel)).size === 1, 'expected both staves to share one channel')
      const treble = real.find(t => t.notes[0].midi > 60)
      const bass = real.find(t => t.notes[0].midi <= 60)
      check(!!treble && !!bass, 'expected one treble-range and one bass-range track')

      const assignments = assignHandsByTrack(toHandTracks(midi))
      check(assignments.every(a => a.confidence === 1), 'expected the staff pair to be trusted outright (confidence 1)')
      check(assignments.every(a => a.hand === (a.note.midi > 60 ? 'R' : 'L')),
        'findStavePairs() mislabeled a hand')
    }

    // ── Case B: 3-staff organ (2 manuals + pedal) — same channel-sharing
    // split, but findStavePairs() only ever pairs an exact two — a group of
    // three on one channel is left for the per-track fallback, same as a
    // native MIDI export of the same organ part would get. Checked here only
    // for the track/channel shape the split is responsible for, not the
    // fallback's hand choices (handAssignment.ts's own concern). ──────────
    {
      const buf = await convertForeignFileToMidiBuffer(multiStaffFixture(3, 20, [5, 4, 2]), 'musicxml')
      const midi = new Midi(buf)
      const real = midi.tracks.filter(t => t.notes.length > 0)
      check(real.length === 3, `expected 3 note-carrying tracks for a 3-staff organ, got ${real.length}`)
      check(new Set(real.map(t => t.channel)).size === 1, 'expected all three staves to share one channel')
      check(assignHandsByTrack(toHandTracks(midi)).length === 3, 'every staff note should still get a hand')
    }

    // ── Case C: regression — a single-staff keyboard part must NOT be split. ──
    {
      const buf = await convertForeignFileToMidiBuffer(multiStaffFixture(1, 0, [5]), 'musicxml')
      const midi = new Midi(buf)
      const real = midi.tracks.filter(t => t.notes.length > 0)
      check(real.length === 1, `single-staff part should stay as one track, got ${real.length}`)
    }

    // ── Case D: regression — a single-staff non-keyboard instrument (e.g. a
    // violin) must not be touched either. ─────────────────────────────────────
    {
      const buf = await convertForeignFileToMidiBuffer(multiStaffFixture(1, 40, [5]), 'musicxml')
      const midi = new Midi(buf)
      const real = midi.tracks.filter(t => t.notes.length > 0)
      check(real.length === 1, `single-staff non-keyboard part should stay as one track, got ${real.length}`)
    }

    // ── Case E: two separate grand-staff pianos (a duet) — each part's own
    // channel keeps its split independent of the other's; findStavePairs()
    // must pair each piano with itself, never pooling the two instruments
    // together. ────────────────────────────────────────────────────────────
    {
      const buf = await convertForeignFileToMidiBuffer(twoPianosFixture(), 'musicxml')
      const midi = new Midi(buf)
      const real = midi.tracks.filter(t => t.notes.length > 0)
      check(real.length === 4, `expected 4 note-carrying tracks for two duet pianos, got ${real.length}`)
      check(new Set(real.map(t => t.channel)).size === 2, 'expected each piano to keep its own channel')

      const assignments = assignHandsByTrack(toHandTracks(midi))
      check(assignments.every(a => a.confidence === 1), 'expected both pianos to be trusted outright (confidence 1)')
      check(assignments.every(a => a.hand === (a.note.midi > 60 ? 'R' : 'L')),
        'a note ended up on the wrong hand — the two pianos may have been pooled together')
    }

  } finally {
    g.window = savedWindow
    g.document = savedDocument
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
