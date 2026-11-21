import { Renderer, Stave, StaveNote, GhostNote, Voice, Formatter, Accidental, StaveConnector, Beam, StaveTie, Dot, Tuplet, PedalMarking, Stem, FretHandFinger, Modifier, type Note } from 'vexflow/bravura'
import type { Score, ScoreBar, ScoreEvent } from './score'
import { keySpecOf, spell } from './score'

// ── Drawing one line of the score (practice stage 8) ─────────────────────────
// A system: the right hand on a treble staff, the left on a bass staff, braced,
// a few bars wide. Clef and key signature (its sharps or flats) at the start of
// every line, the time signature on the first line and wherever it changes;
// triplets bracketed, a second voice (held notes under moving ones) with its
// stems down, the pedal under the bass staff, the chord names on one line
// above the treble staff (only the main harmony when they'd crowd). Every line
// of a page has the same room, measured from the highest and lowest notes of
// the whole song, so nothing collides and nothing moves when a line turns
// over. Notes are drawn by VexFlow (MIT); what to draw comes from score.ts.
// Each note's place is handed back, so the score can follow the song.

export interface Placed { time: number; x: number; hand: 'L' | 'R'; el: SVGElement | null }
export interface SystemLayout { height: number; bars: { n: number; x: number; w: number }[]; notes: Placed[] }
export interface PageLayout { upperTop: number; lowerTop: number; height: number; chordY: number; pedalLine: number }

// 48ths of a whole note → [VexFlow duration, dots]; in a triplet the written value
const DUR: Record<number, [string, number]> = { 48: ['w', 0], 36: ['h', 1], 24: ['h', 0], 18: ['q', 1], 12: ['q', 0], 9: ['8', 1], 6: ['8', 0], 3: ['16', 0] }
const TRIPLET_DUR: Record<number, string> = { 8: 'q', 4: '8' }
const STAFF = 40            // a staff's height: four spaces of 10
const STEP = 5              // one note step (line to space)
const ABOVE_STAFF = 40      // VexFlow puts a staff's top line this far below the y it's given

/** The clef that suits a hand's notes in these bars */
function clefFor(bars: ScoreBar[], hand: 'L' | 'R'): 'treble' | 'bass' {
  const keys = keysOf(bars, hand)
  if (!keys.length) return hand === 'R' ? 'treble' : 'bass'
  const sorted = [...keys].sort((a, b) => a - b), mid = sorted[sorted.length >> 1]
  if (hand === 'R') return mid < 55 ? 'bass' : 'treble'
  return mid > 64 ? 'treble' : 'bass'
}
const keysOf = (bars: ScoreBar[], hand: 'L' | 'R') => bars.flatMap(b => [...b[hand], ...(b[hand === 'R' ? 'R2' : 'L2'] ?? [])].flatMap(e => e.keys ?? []))

// a note's step on the staff (C4 = 35), and each clef's top and bottom lines
const dia = (m: number) => Math.floor(m / 12) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][m % 12]
const LINES = { treble: { top: dia(77), bottom: dia(64) }, bass: { top: dia(57), bottom: dia(43) } }
/** How far a hand's notes reach above and below its staff, in pixels */
function reach(bars: ScoreBar[], hand: 'L' | 'R'): { above: number; below: number } {
  const keys = keysOf(bars, hand), l = LINES[clefFor(bars, hand)]
  if (!keys.length) return { above: 0, below: 0 }
  return { above: Math.max(0, Math.max(...keys.map(dia)) - l.top) * STEP, below: Math.max(0, l.bottom - Math.min(...keys.map(dia))) * STEP }
}

/** The room every line of the page gets: enough for the furthest notes of
 *  any line (a bit more for stems and beams), the chord names and the pedal */
export function pageLayout(score: Score, lines: [number, number][], opts: { chords: boolean; pedal: boolean }): PageLayout {
  let aR = 0, bR = 0, aL = 0, bL = 0
  for (const [a, b] of lines) {
    const bars = score.bars.slice(a, b), r = reach(bars, 'R'), l = reach(bars, 'L')
    aR = Math.max(aR, r.above); bR = Math.max(bR, r.below); aL = Math.max(aL, l.above); bL = Math.max(bL, l.below)
  }
  const cap = (v: number) => Math.min(150, v)
  const chordRoom = opts.chords ? 22 : 0
  const upperTop = 6 + chordRoom + cap(aR) + 28
  const gap = Math.max(44, cap(bR) + cap(aL) + 44)
  const lowerTop = upperTop + STAFF + gap
  const pedalRoom = opts.pedal && score.bars.some(b => b.pedal?.length) ? 30 : 0
  const height = lowerTop + STAFF + cap(bL) + 26 + pedalRoom + 6
  return { upperTop, lowerTop, height, chordY: 6 + 15, pedalLine: Math.ceil((cap(bL) + 16) / 10) }
}

interface Made { hand: 'L' | 'R'; voice: 1 | 2; ev: ScoreEvent; note: Note }

/** A tie joins only the notes both chords have (a note let go or added in
 *  between isn't tied) */
function tie(ties: StaveTie[], a: { ev: ScoreEvent; note: Note }, b: { ev: ScoreEvent; note: Note }) {
  const ak = a.ev.keys ?? [], bk = b.ev.keys ?? []
  const first: number[] = [], lastIdx: number[] = []
  ak.forEach((k, i) => { const j = bk.indexOf(k); if (j >= 0) { first.push(i); lastIdx.push(j) } })
  if (first.length) ties.push(new StaveTie({ firstNote: a.note, lastNote: b.note, firstIndexes: first, lastIndexes: lastIdx }))
}

export function drawSystem(el: HTMLDivElement, bars: ScoreBar[], opts: {
  width: number; fifths: number; showTime: (bar: ScoreBar, i: number) => boolean
  tieIn: { R: boolean; L: boolean }; pedalIn: boolean; page: PageLayout
  chords: 'off' | 'main' | 'all'; pedal: boolean; fingering?: boolean
  ink: string; dim: string; chordInk: string; font: string
  textScale?: number   // how much smaller the page is shown: chord names stay readable
}): SystemLayout {
  el.innerHTML = ''
  const { page } = opts
  const renderer = new Renderer(el, Renderer.Backends.SVG)
  renderer.resize(opts.width, page.height)
  const ctx = renderer.getContext()
  ctx.setFillStyle(opts.ink); ctx.setStrokeStyle(opts.ink)
  const keySpec = keySpecOf(opts.fifths)
  const clefs = { R: clefFor(bars, 'R'), L: clefFor(bars, 'L') }
  const left = 8, right = 4
  const usable = opts.width - left - right
  const hands = ['R', 'L'] as const

  // the first bar carries the clef and key: allow for it, then share out the rest
  const startExtra = 58 + Math.abs(opts.fifths) * 10
  const timeExtra = (i: number) => (opts.showTime(bars[i], i) ? 26 : 0)
  const weights = bars.map(b => Math.max(1, b.R.length, b.L.length, b.R2?.length ?? 0, b.L2?.length ?? 0) ** 0.6 + 1.2)
  const fixed = startExtra + bars.reduce((a, _, i) => a + timeExtra(i), 0)
  const per = (usable - fixed) / weights.reduce((a, b) => a + b, 0)
  const layout: SystemLayout = { height: page.height, bars: [], notes: [] }
  const last: Record<'R' | 'L', { note: Note; ev: ScoreEvent } | null> = { R: null, L: null }
  const allLow: { ev: ScoreEvent; note: Note }[] = []   // the left hand's first voice, for the pedal
  const chordSpots: { x: number; name: string; weight: number }[] = []

  let x = left
  bars.forEach((bar, i) => {
    const w = weights[i] * per + (i === 0 ? startExtra : 0) + timeExtra(i)
    const staves = { R: new Stave(x, page.upperTop - ABOVE_STAFF, w), L: new Stave(x, page.lowerTop - ABOVE_STAFF, w) }
    for (const h of hands) {
      if (i === 0) staves[h].addClef(clefs[h]).addKeySignature(keySpec)
      if (opts.showTime(bar, i)) staves[h].addTimeSignature(`${bar.num}/${bar.den}`)
    }
    const startX = Math.max(...hands.map(h => staves[h].getNoteStartX()))
    for (const h of hands) { staves[h].setNoteStartX(startX); staves[h].setContext(ctx).draw() }
    if (i === 0) {
      new StaveConnector(staves.R, staves.L).setType('brace').setContext(ctx).draw()
      new StaveConnector(staves.R, staves.L).setType('singleLeft').setContext(ctx).draw()
    }
    new StaveConnector(staves.R, staves.L).setType('singleRight').setContext(ctx).draw()

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
          // the player's fingering: above the right hand's notes, below the left's
          if (opts.fingering !== false && ev.fingers && !ev.ghost) ev.fingers.forEach((f, k) => {
            if (f) (note as StaveNote).addModifier(new FretHandFinger(String(f)).setPosition(hand === 'R' ? Modifier.Position.ABOVE : Modifier.Position.BELOW), k)
          })
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
            if (last[hand]?.ev.tie) tie(ties, last[hand]!, m)
            else if (i === 0 && opts.tieIn[hand]) ties.push(new StaveTie({ lastNote: m.note, firstIndexes: idx, lastIndexes: idx }))   // from the line before
          }
          const next = mine[k + 1]
          if (m.ev.tie && next?.ev.keys) tie(ties, m, next)
        })
        if (v === 1) {
          const lastEv = mine[mine.length - 1]
          last[hand] = lastEv?.ev.keys ? { note: lastEv.note, ev: lastEv.ev } : null
          if (i === bars.length - 1 && lastEv?.ev.tie && lastEv.ev.keys) { const idx = lastEv.ev.keys.map((_, j) => j); ties.push(new StaveTie({ firstNote: lastEv.note, firstIndexes: idx, lastIndexes: idx })) }   // on to the next line
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
    // where each chord name goes: at the note (either hand) where it starts
    if (opts.chords !== 'off') for (const c of bar.chords ?? []) {
      if (opts.chords === 'main' && c.weight < 14) continue   // passing chords left out
      const at = [...made].filter(m => !m.ev.ghost && m.ev.pos <= c.pos).sort((a, b) => b.ev.pos - a.ev.pos)[0] ?? made[0]
      if (at) chordSpots.push({ x: c.pos === 0 ? Math.min(at.note.getAbsoluteX(), startX + 2) : at.note.getAbsoluteX(), name: c.name, weight: c.weight })
    }
    for (const m of made) if (m.ev.keys && !m.ev.ghost) layout.notes.push({ time: m.ev.time, x: m.note.getAbsoluteX() + 6, hand: m.hand, el: m.note.getSVGElement() ?? null })
    layout.bars.push({ n: bar.n, x, w })
    x += w
  })

  // chord names: one line above the treble staff; where two would touch, the
  // one that carries less (shorter, off the beat) gives way, so a crowded line
  // keeps the main harmony
  if (chordSpots.length) {
    ctx.save()
    ctx.setFont(opts.font, Math.round(Math.max(15, 12 / (opts.textScale ?? 1))), 'bold')
    const spots = chordSpots.map(s => ({ ...s, w: ctx.measureText(s.name).width }))
    let crowded = true
    while (crowded) {
      crowded = false
      for (let k = 0; k + 1 < spots.length; k++) {
        if (spots[k + 1].x < spots[k].x + spots[k].w + 10) {
          spots.splice(spots[k].weight >= spots[k + 1].weight ? k + 1 : k, 1)
          crowded = true
          break
        }
      }
    }
    ctx.setFillStyle(opts.chordInk)
    spots.forEach((s, k) => { if (k === 0 || s.name !== spots[k - 1].name) ctx.fillText(s.name, s.x, page.chordY) })
    ctx.restore()
  }

  // the sustain pedal, carried on from the line before and over to the next
  if (opts.pedal && allLow.length) {
    const marks: StaveNote[] = []
    const list = allLow.filter(a => a.note instanceof StaveNote)
    const at = (t: number, after: boolean) => {
      const pick = after ? list.find(a => a.ev.time >= t - 0.05) ?? list[list.length - 1] : [...list].reverse().find(a => a.ev.time <= t + 0.05) ?? list[0]
      return pick.note as StaveNote
    }
    let down = opts.pedalIn && list.length ? list[0].note as StaveNote : null
    for (const p of bars.flatMap(b => b.pedal ?? []).sort((a, b) => a.time - b.time)) {
      if (p.down && !down) down = at(p.time, true)
      else if (!p.down && down) { const up = at(p.time, false); if (up !== down) marks.push(down, up); down = null }
    }
    if (down && list.length) { const end = list[list.length - 1].note as StaveNote; if (end !== down) marks.push(down, end) }
    if (marks.length) {
      // "Ped." where it starts, then a line with a notch at each change, the way
      // pianists read frequent pedalling; below the lowest notes, in the notes' colour
      const svgEl = el.querySelector('svg'), before = svgEl?.childElementCount ?? 0
      PedalMarking.createSustain(marks).setType('mixed').setLine(page.pedalLine)
        .setStyle({ fillStyle: opts.ink, strokeStyle: opts.ink }).setContext(ctx).draw()
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
