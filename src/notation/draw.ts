import { Renderer, Stave, StaveNote, GhostNote, Voice, Formatter, Accidental, StaveConnector, Beam, StaveTie, Dot, Tuplet, PedalMarking, Stem, type Note } from 'vexflow/bravura'
import type { ScoreBar, ScoreEvent } from './score'
import { keySpecOf, spell } from './score'

// ── Drawing one line of the score (practice stage 8) ─────────────────────────
// A system: the right hand on a treble staff, the left on a bass staff, braced,
// a few bars wide. Clef and key signature at the start of every line, the time
// signature on the first line and wherever it changes; triplets bracketed, a
// second voice (held notes under moving ones) with its stems down, the pedal
// under the bass staff. A lead sheet is one staff: the melody with the chord
// names above. Notes are drawn by VexFlow (MIT); what to draw comes from
// score.ts. Each note's place on the page is handed back, so the score can
// follow the song.

export interface Placed { time: number; x: number; hand: 'L' | 'R'; el: SVGElement | null }
export interface SystemLayout { height: number; bars: { n: number; x: number; w: number }[]; notes: Placed[] }

// 48ths of a whole note → [VexFlow duration, dots]; in a triplet the written value
const DUR: Record<number, [string, number]> = { 48: ['w', 0], 36: ['h', 1], 24: ['h', 0], 18: ['q', 1], 12: ['q', 0], 9: ['8', 1], 6: ['8', 0], 3: ['16', 0] }
const TRIPLET_DUR: Record<number, string> = { 8: 'q', 4: '8' }
export const STAFF_GAP = 82        // from the top of the treble staff to the top of the bass staff
export const SYSTEM_HEIGHT = 236   // a grand staff with room for low notes and the pedal
export const LEAD_HEIGHT = 120     // one staff with chord names

/** The clef that suits a hand's notes in these bars */
function clefFor(bars: ScoreBar[], hand: 'L' | 'R'): 'treble' | 'bass' {
  const keys = bars.flatMap(b => [...b[hand], ...(b[hand === 'R' ? 'R2' : 'L2'] ?? [])].flatMap(e => e.keys ?? []))
  if (!keys.length) return hand === 'R' ? 'treble' : 'bass'
  const sorted = [...keys].sort((a, b) => a - b), mid = sorted[sorted.length >> 1]
  if (hand === 'R') return mid < 55 ? 'bass' : 'treble'
  return mid > 64 ? 'treble' : 'bass'
}

interface Made { hand: 'L' | 'R'; voice: 1 | 2; ev: ScoreEvent; note: Note }

export function drawSystem(el: HTMLDivElement, bars: ScoreBar[], opts: {
  width: number; fifths: number; showTime: (bar: ScoreBar, i: number) => boolean
  tieIn: { R: boolean; L: boolean }; pedalIn: boolean; lead: boolean; ink: string; dim: string
}): SystemLayout {
  el.innerHTML = ''
  const height = opts.lead ? LEAD_HEIGHT : SYSTEM_HEIGHT
  const renderer = new Renderer(el, Renderer.Backends.SVG)
  renderer.resize(opts.width, height)
  const ctx = renderer.getContext()
  ctx.setFillStyle(opts.ink); ctx.setStrokeStyle(opts.ink)
  const keySpec = keySpecOf(opts.fifths)
  const clefs = { R: opts.lead ? 'treble' as const : clefFor(bars, 'R'), L: clefFor(bars, 'L') }
  const top = opts.lead ? 6 : 22, left = 8, right = 4
  const usable = opts.width - left - right
  const hands = opts.lead ? (['R'] as const) : (['R', 'L'] as const)

  // the first bar carries the clef and key: allow for it, then share out the rest
  const startExtra = 58 + Math.abs(opts.fifths) * 10
  const timeExtra = (i: number) => (opts.showTime(bars[i], i) ? 26 : 0)
  const weights = bars.map(b => Math.max(1, b.R.length, b.L.length, b.R2?.length ?? 0, b.L2?.length ?? 0) ** 0.6 + 1.2)
  const fixed = startExtra + bars.reduce((a, _, i) => a + timeExtra(i), 0)
  const per = (usable - fixed) / weights.reduce((a, b) => a + b, 0)
  const layout: SystemLayout = { height, bars: [], notes: [] }
  const last: Record<'R' | 'L', { note: Note; ev: ScoreEvent } | null> = { R: null, L: null }
  const allLow: { ev: ScoreEvent; note: Note }[] = []   // the left hand's first voice, for the pedal
  let chordEnd = -Infinity                              // where the last chord name ends (lead sheet)

  let x = left
  bars.forEach((bar, i) => {
    const w = weights[i] * per + (i === 0 ? startExtra : 0) + timeExtra(i)
    const staves = { R: new Stave(x, top, w), L: new Stave(x, top + STAFF_GAP, w) }
    for (const h of hands) {
      if (i === 0) staves[h].addClef(clefs[h]).addKeySignature(keySpec)
      if (opts.showTime(bar, i)) staves[h].addTimeSignature(`${bar.num}/${bar.den}`)
    }
    const startX = Math.max(...hands.map(h => staves[h].getNoteStartX()))
    for (const h of hands) { staves[h].setNoteStartX(startX); staves[h].setContext(ctx).draw() }
    if (!opts.lead) {
      if (i === 0) {
        new StaveConnector(staves.R, staves.L).setType('brace').setContext(ctx).draw()
        new StaveConnector(staves.R, staves.L).setType('singleLeft').setContext(ctx).draw()
      }
      new StaveConnector(staves.R, staves.L).setType('singleRight').setContext(ctx).draw()
    }

    const voices: Voice[] = [], beams: Beam[] = [], ties: StaveTie[] = [], tuplets: Tuplet[] = []
    const made: Made[] = []
    const byStave: Record<'R' | 'L', Voice[]> = { R: [], L: [] }
    for (const hand of hands) {
      const clef = clefs[hand]
      const second = bar[hand === 'R' ? 'R2' : 'L2']
      const layers: [ScoreEvent[], 1 | 2][] = second ? [[bar[hand], 1], [second, 2]] : [[bar[hand], 1]]
      for (const [events, v] of layers) {
        const stem = second ? (v === 1 ? Stem.UP : Stem.DOWN) : undefined
        const notes: Note[] = events.map(ev => {
          const [d, dots] = ev.triplet !== undefined ? [TRIPLET_DUR[ev.len] ?? '8', 0] : DUR[ev.len] ?? ['16', 0]
          let note: Note
          if (ev.ghost) note = new GhostNote({ duration: d, dots })
          else if (ev.keys) note = new StaveNote({ keys: ev.keys.map(k => spell(k, opts.fifths)), duration: d, dots, clef, ...(stem !== undefined ? { stemDirection: stem } : { autoStem: true }) })
          else note = new StaveNote({ keys: [clef === 'treble' ? (v === 2 ? 'e/4' : 'b/4') : (v === 2 ? 'f/2' : 'd/3')], duration: d + 'r', dots, clef, alignCenter: ev.len === bar.units && bar.units !== 48 })
          if (dots && !ev.ghost) Dot.buildAndAttach([note as StaveNote], { all: true })
          made.push({ hand, voice: v, ev, note })
          return note
        })
        // triplet brackets: the events sharing a number
        const groups = new Map<number, Note[]>()
        events.forEach((ev, k) => { if (ev.triplet !== undefined) groups.set(ev.triplet, [...(groups.get(ev.triplet) ?? []), notes[k]]) })
        for (const g of groups.values()) tuplets.push(new Tuplet(g, { numNotes: 3, notesOccupied: 2, bracketed: true }))
        const voice = new Voice({ numBeats: bar.num, beatValue: bar.den }).setMode(Voice.Mode.SOFT).addTickables(notes)
        voices.push(voice); byStave[hand].push(voice)
        const real = notes.filter((n, k) => events[k].keys) as StaveNote[]
        beams.push(...Beam.generateBeams(real, { groups: Beam.getDefaultBeamGroups(`${bar.num}/${bar.den}`), ...(stem !== undefined ? { stemDirection: stem, maintainStemDirections: true } : {}) }))
        if (v === 1 && hand === 'L') events.forEach((ev, k) => { if (!ev.ghost) allLow.push({ ev, note: notes[k] }) })

        // ties, from the last bar (or line) and inside this one; the second voice keeps its own
        const mine = made.filter(m => m.hand === hand && m.voice === v)
        mine.forEach((m, k) => {
          const idx = (m.ev.keys ?? []).map((_, j) => j)
          if (k === 0 && m.ev.keys && v === 1) {
            if (last[hand]?.ev.tie) ties.push(new StaveTie({ firstNote: last[hand]!.note, lastNote: m.note, firstIndexes: idx, lastIndexes: idx }))
            else if (i === 0 && opts.tieIn[hand]) ties.push(new StaveTie({ lastNote: m.note, lastIndexes: idx }))
          }
          const next = mine[k + 1]
          if (m.ev.tie && next?.ev.keys) ties.push(new StaveTie({ firstNote: m.note, lastNote: next.note, firstIndexes: idx, lastIndexes: idx }))
        })
        if (v === 1) {
          const lastEv = mine[mine.length - 1]
          last[hand] = lastEv?.ev.keys ? { note: lastEv.note, ev: lastEv.ev } : null
          if (i === bars.length - 1 && lastEv?.ev.tie && lastEv.ev.keys) ties.push(new StaveTie({ firstNote: lastEv.note, firstIndexes: lastEv.ev.keys.map((_, j) => j) }))
        }
      }
      Accidental.applyAccidentals(byStave[hand], keySpec)
    }
    const f = new Formatter()
    for (const h of hands) f.joinVoices(byStave[h])
    f.format(voices, Math.max(20, x + w - startX - 12))
    for (const h of hands) for (const v of byStave[h]) v.draw(ctx, staves[h])
    for (const b of beams) b.setContext(ctx).draw()
    for (const t of tuplets) t.setContext(ctx).draw()
    for (const t of ties) t.setContext(ctx).draw()
    // chord names on one line above the staff, at the note (or rest) where
    // each one starts; names that would touch move along
    if (opts.lead) {
      // just above the staff, or above the highest note if it climbs higher
      const highest = Math.min(...made.filter(m => m.ev.keys && m.note instanceof StaveNote).map(m => Math.min(...(m.note as StaveNote).getYs())))
      const chordY = Math.min(staves.R.getYForLine(0) - 12, highest - 16)
      ctx.save()
      ctx.setFont('Familjen Grotesk, Inter, sans-serif', 13, 'bold')
      for (const c of bar.chords ?? []) {
        const at = [...made].reverse().find(m => m.ev.pos <= c.pos) ?? made[0]
        if (!at) continue
        const cx = Math.max(at.note.getAbsoluteX(), chordEnd + 8)
        ctx.fillText(c.name, cx, chordY)
        chordEnd = cx + ctx.measureText(c.name).width
      }
      ctx.restore()
    }
    for (const m of made) if (m.ev.keys && !m.ev.ghost) layout.notes.push({ time: m.ev.time, x: m.note.getAbsoluteX() + 6, hand: m.hand, el: m.note.getSVGElement() ?? null })
    layout.bars.push({ n: bar.n, x, w })
    x += w
  })

  // the sustain pedal, carried on from the line before and over to the next
  if (!opts.lead && allLow.length) {
    const marks: StaveNote[] = []
    const at = (t: number, after: boolean) => {
      const list = allLow.filter(a => a.note instanceof StaveNote)
      const pick = after ? list.find(a => a.ev.time >= t - 0.05) ?? list[list.length - 1] : [...list].reverse().find(a => a.ev.time <= t + 0.05) ?? list[0]
      return pick.note as StaveNote
    }
    let down = opts.pedalIn ? allLow[0].note as StaveNote : null
    for (const p of bars.flatMap(b => b.pedal ?? []).sort((a, b) => a.time - b.time)) {
      if (p.down && !down) down = at(p.time, true)
      else if (!p.down && down) { const up = at(p.time, false); if (up !== down) marks.push(down, up); down = null }
    }
    if (down) { const end = allLow[allLow.length - 1].note as StaveNote; if (end !== down) marks.push(down, end) }
    if (marks.length) {
      // below the lowest note of the line, in the notes' colour
      const low = Math.min(43, ...allLow.flatMap(a => a.ev.keys ?? []))
      // "Ped." where it starts, then a line with a notch at each change, the way
      // pianists read frequent pedalling
      const svgEl = el.querySelector('svg'), before = svgEl?.childElementCount ?? 0
      PedalMarking.createSustain(marks).setType('mixed').setLine(Math.max(0, Math.ceil((43 - low) / 4)))
        .setStyle({ fillStyle: opts.ink, strokeStyle: opts.ink }).setContext(ctx).draw()
      // its lines in the notes' colour too
      if (svgEl) for (const n of [...svgEl.children].slice(before)) {
        if (n.tagName === 'path') (n as SVGElement).style.stroke = opts.ink
        n.querySelectorAll('path').forEach(p => { p.style.stroke = opts.ink })
      }
    }
  }

  // staff lines and bar lines a step quieter than the notes
  const svg = el.querySelector('svg')
  if (svg) { svg.style.overflow = 'visible'; svg.querySelectorAll('.vf-stave path, .vf-stave rect, .vf-stavebarline path, .vf-stavebarline rect').forEach(p => { (p as SVGElement).style.stroke = opts.dim; (p as SVGElement).style.fill = opts.dim }) }
  return layout
}
