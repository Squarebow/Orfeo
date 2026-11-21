import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, StaveConnector, Beam, StaveTie, Dot } from 'vexflow/bravura'
import type { ScoreBar, ScoreEvent } from './score'
import { keySpecOf, spell } from './score'

// ── Drawing one line of the score (practice stage 8) ─────────────────────────
// A system: the right hand on a treble staff, the left on a bass staff, braced,
// a few bars wide. Clef and key signature at the start of every line, the time
// signature on the first line and wherever it changes. Notes are drawn by
// VexFlow (MIT); what to draw comes from score.ts. Each note's place on the
// page is handed back, so the score can follow the song.

export interface Placed { time: number; x: number; hand: 'L' | 'R'; el: SVGElement | null }
export interface SystemLayout { height: number; bars: { n: number; x: number; w: number }[]; notes: Placed[] }

const DUR: Record<number, [string, number]> = { 16: ['w', 0], 12: ['h', 1], 8: ['h', 0], 6: ['q', 1], 4: ['q', 0], 3: ['8', 1], 2: ['8', 0], 1: ['16', 0] }
export const STAFF_GAP = 82        // from the top of the treble staff to the top of the bass staff
export const SYSTEM_HEIGHT = 196

/** The clef that suits a hand's notes in these bars */
function clefFor(bars: ScoreBar[], hand: 'L' | 'R'): 'treble' | 'bass' {
  const keys = bars.flatMap(b => b[hand].flatMap(e => e.keys ?? []))
  if (!keys.length) return hand === 'R' ? 'treble' : 'bass'
  const sorted = [...keys].sort((a, b) => a - b), mid = sorted[sorted.length >> 1]
  if (hand === 'R') return mid < 55 ? 'bass' : 'treble'
  return mid > 64 ? 'treble' : 'bass'
}

export function drawSystem(el: HTMLDivElement, bars: ScoreBar[], opts: {
  width: number; fifths: number; showTime: (bar: ScoreBar, i: number) => boolean
  tieIn: { R: boolean; L: boolean }; ink: string; dim: string
}): SystemLayout {
  el.innerHTML = ''
  const renderer = new Renderer(el, Renderer.Backends.SVG)
  renderer.resize(opts.width, SYSTEM_HEIGHT)
  const ctx = renderer.getContext()
  ctx.setFillStyle(opts.ink); ctx.setStrokeStyle(opts.ink)
  const keySpec = keySpecOf(opts.fifths)
  const clefs = { R: clefFor(bars, 'R'), L: clefFor(bars, 'L') }
  const top = 22, left = 8, right = 4
  const usable = opts.width - left - right

  // the first bar carries the clef and key: measure it, then share out the rest
  const startExtra = 58 + Math.abs(opts.fifths) * 10
  const timeExtra = (i: number) => (opts.showTime(bars[i], i) ? 26 : 0)
  const weights = bars.map(b => Math.max(1, Math.max(b.R.length, b.L.length)) ** 0.6 + 1.2)
  const fixed = startExtra + bars.reduce((a, _, i) => a + timeExtra(i), 0)
  const per = (usable - fixed) / weights.reduce((a, b) => a + b, 0)
  const layout: SystemLayout = { height: SYSTEM_HEIGHT, bars: [], notes: [] }
  const last = { R: null as StaveNote | null, L: null as StaveNote | null }
  const tieOpen = { R: false, L: false }

  let x = left
  bars.forEach((bar, i) => {
    const w = weights[i] * per + (i === 0 ? startExtra : 0) + timeExtra(i)
    const up = new Stave(x, top, w), down = new Stave(x, top + STAFF_GAP, w)
    if (i === 0) {
      up.addClef(clefs.R).addKeySignature(keySpec)
      down.addClef(clefs.L).addKeySignature(keySpec)
    }
    if (opts.showTime(bar, i)) { up.addTimeSignature(`${bar.num}/${bar.den}`); down.addTimeSignature(`${bar.num}/${bar.den}`) }
    const startX = Math.max(up.getNoteStartX(), down.getNoteStartX())
    up.setNoteStartX(startX); down.setNoteStartX(startX)
    up.setContext(ctx).draw(); down.setContext(ctx).draw()
    if (i === 0) {
      new StaveConnector(up, down).setType('brace').setContext(ctx).draw()
      new StaveConnector(up, down).setType('singleLeft').setContext(ctx).draw()
    }
    new StaveConnector(up, down).setType(i === bars.length - 1 ? 'singleRight' : 'singleRight').setContext(ctx).draw()

    const voices: Voice[] = [], beams: Beam[] = [], ties: StaveTie[] = []
    const made: { hand: 'L' | 'R'; ev: ScoreEvent; note: StaveNote }[] = []
    for (const hand of ['R', 'L'] as const) {
      const clef = clefs[hand]
      const notes = bar[hand].map(ev => {
        const [d, dots] = DUR[ev.len] ?? ['16', 0]
        const note = ev.keys
          ? new StaveNote({ keys: ev.keys.map(k => spell(k, opts.fifths)), duration: d, dots, clef, autoStem: true })
          : new StaveNote({ keys: [clef === 'treble' ? 'b/4' : 'd/3'], duration: d + 'r', dots, clef, alignCenter: ev.len === bar.units && bar.units !== 16 })
        if (dots) Dot.buildAndAttach([note], { all: true })
        made.push({ hand, ev, note })
        return note
      })
      const voice = new Voice({ numBeats: bar.num, beatValue: bar.den }).setMode(Voice.Mode.SOFT).addTickables(notes)
      Accidental.applyAccidentals([voice], keySpec)
      voices.push(voice)
      beams.push(...Beam.generateBeams(notes.filter(n => !n.isRest()), { groups: Beam.getDefaultBeamGroups(`${bar.num}/${bar.den}`) }))
      // ties: from the last bar (or line), and inside this one
      const handEvents = made.filter(m => m.hand === hand)
      handEvents.forEach((m, k) => {
        const idx = (m.ev.keys ?? []).map((_, j) => j)
        if (k === 0 && m.ev.keys) {
          if (last[hand] && tieOpen[hand]) ties.push(new StaveTie({ firstNote: last[hand], lastNote: m.note, firstIndexes: idx, lastIndexes: idx }))
          else if (i === 0 && opts.tieIn[hand]) ties.push(new StaveTie({ lastNote: m.note, lastIndexes: idx }))
        }
        const next = handEvents[k + 1]
        if (m.ev.tie && next?.ev.keys) ties.push(new StaveTie({ firstNote: m.note, lastNote: next.note, firstIndexes: idx, lastIndexes: idx }))
      })
      const lastEv = handEvents[handEvents.length - 1]
      last[hand] = lastEv?.ev.keys ? lastEv.note : null
      tieOpen[hand] = !!lastEv?.ev.tie
      if (i === bars.length - 1 && tieOpen[hand] && last[hand]) {
        const idx = (lastEv.ev.keys ?? []).map((_, j) => j)
        ties.push(new StaveTie({ firstNote: last[hand], firstIndexes: idx }))
      }
    }
    new Formatter().joinVoices([voices[0]]).joinVoices([voices[1]]).format(voices, Math.max(20, x + w - startX - 12))
    voices[0].draw(ctx, up); voices[1].draw(ctx, down)
    for (const b of beams) b.setContext(ctx).draw()
    for (const t of ties) t.setContext(ctx).draw()
    for (const m of made) if (m.ev.keys) layout.notes.push({ time: m.ev.time, x: m.note.getAbsoluteX() + 6, hand: m.hand, el: m.note.getSVGElement() ?? null })
    layout.bars.push({ n: bar.n, x, w })
    x += w
  })
  // staff lines and bar lines a step quieter than the notes
  const svg = el.querySelector('svg')
  if (svg) { svg.style.overflow = 'visible'; svg.querySelectorAll('.vf-stave path, .vf-stave rect, .vf-stavebarline path, .vf-stavebarline rect').forEach(p => { (p as SVGElement).style.stroke = opts.dim; (p as SVGElement).style.fill = opts.dim }) }
  return layout
}
