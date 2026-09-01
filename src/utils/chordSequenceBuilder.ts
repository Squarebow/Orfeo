import { Chord } from 'tonal'
import type { ParsedTrack, ChordEvent, NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import { CHORD_TEMPLATES } from './chordVocabulary'
import { localizeChord, buildCompactVoicing } from './chordDetection'

// ─────────────────────────────────────────────────────────────────────────
// Live chord sequence — "harmonic rhythm + steadiest reading"
// See docs/superpowers/specs/2026-08-31-chord-detection-redesign-design.md
//
// A chord lasts until the ACCOMPANIMENT moves. We never chop the song into
// equal time-slices and average them. Instead:
//
//   1. Split every accompaniment note into HARMONY (sustained / stacked /
//      mid-low) vs MELODY (a short, moving note on top). The tune gets no
//      vote on the chord.
//   2. Mark a boundary at every beat where the harmony genuinely turns over
//      — the bass note changes, or the set of held notes clearly changes.
//      This deliberately over-marks.
//   3. Name each span from the notes ringing across it, against the full
//      chord dictionary, with a gentle lean toward the simpler name.
//   4. Join neighbours that got the same name — so a boundary only survives
//      where the chord actually changes.
//   5. One sensitivity-controlled pass: a very short span that is only a
//      wobble (or a passing colour between two identical chords) is absorbed
//      at low sensitivity and kept at high. This is the single user knob.
//   6. The bass note under a span, if it is a non-root chord tone, makes it
//      a slash chord / inversion.
// ─────────────────────────────────────────────────────────────────────────

const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// ── note classification ─────────────────────────────────────────────────
// A note is MELODY (heavily discounted) only when it floats on top of an
// accompaniment and moves. A note that IS the accompaniment — no harmony
// bed anywhere below it nearby — is always kept as harmony, however it
// moves (so a solo arpeggio or a mono comp still carries the chord).
const MELODY_TOP_MARGIN = 2        // within this many semitones of the top voice
const MELODY_MOVE_MAX = 14         // moves to/from an adjacent note by at most this
const MELODY_STACK_WIN = 0.06      // notes attacking this close together are one stack
const MELODY_BED_MIN_GAP = 4       // a harmony "bed" note is ≥ this many semitones below
const MELODY_WEIGHT = 0.15         // melody notes still count this little (thin textures)
const REGISTER_LOW = 40            // MIDI — deep bass octave, ×0.45
const REGISTER_LOW_W = 0.45
const REGISTER_HIGH = 84           // MIDI — melody register, ×0.5
const REGISTER_HIGH_W = 0.5

// ── turnover / boundary detection ───────────────────────────────────────
const TURN_CHROMA_DIST = 0.10   // beat-to-beat chroma cosine-distance that marks a candidate
const TURN_NEWPC_FLOOR = 0.10   // a newly-onset pitch class needs this share to count as "new"

// ── naming ──────────────────────────────────────────────────────────────
const NAME_MIN_BEATS = 2        // spans shorter than this are named with ±context so an
                                // arpeggio slice reads as the whole chord
const SIMPLE_MAX_COMPLEXITY = 0.5  // a span shorter than half a bar can only be named a
                                   // plain shape (triad / sus / 6 / basic 7th) — you don't
                                   // write "Gmaj13" for a passing eighth-note chord
const W_IN = 2.0                // reward: share of energy on chord tones
const W_OUT = 2.1               // penalty: share of energy off chord tones
const W_MISS = 1.6              // penalty per chord tone that is essentially silent
const W_WEAK_EXT = 1.1          // penalty per extension tone (7th/9th/11th/13th) that is weak
const PRESENT_FLOOR = 0.06      // normalised energy for a chord tone to count as present
const EXT_FLOOR = 0.11          // …a stiffer bar for an extension/colour tone
const W_COMPLEXITY = 0.35       // × template.complexity — the "prefer the simpler name" lean
const BASS_ROOT_BONUS = 0.55    // the span's steady bass note == candidate root
const LOW_ROOT_BONUS = 0.30     // …or the lowest harmony note == candidate root
const BASS_OFF_PENALTY = 0.25   // steady bass note is not in the candidate chord at all

// ── steadiest-reading pass ──────────────────────────────────────────────
const CONF_IN_ENERGY = 0.80     // a span explaining ≥ this much of its energy, with every
                                // chord tone present, is "confident" — kept even when short
const SLASH_MIN_COVER = 0.55    // one bass pc must hold this share of a span's bass energy

export interface BuildChordSequenceOpts {
  noteNaming: NoteNaming
  accidentals: Accidentals
  namingStyle: ChordNamingStyle
  transpose: number
  /** 0..1 — how eager Orfeo is to call something a new chord. Higher surfaces
   *  faster changes and embellishing chords. Auto ≈ 0.4, Harmony ≈ 0.62. */
  sensitivity?: number
}

type Tpl = (typeof CHORD_TEMPLATES)[number]

interface Tagged {
  pc: number
  midi: number
  time: number
  end: number
  weight: number   // register taper × melody discount
}

interface Named {
  root: number
  tpl: Tpl
  pcs: Set<number>
  label: string    // e.g. "G", "Gm7", "Gmaj9" — no slash
  inEnergy: number // share of the span's energy explained
  allPresent: boolean
}

// ── nameSpan — a 12-bin chroma → best (root × chord) from the dictionary ─
// `simpleOnly` restricts the vocabulary to plain shapes — used for spans
// too short to justify an extended name.
function nameSpan(chroma: Float64Array, bassPc: number, lowPc: number, simpleOnly: boolean): Named | null {
  let total = 0
  for (let p = 0; p < 12; p++) total += chroma[p]
  if (total < 1e-9) return null
  const nv = new Float64Array(12)
  for (let p = 0; p < 12; p++) nv[p] = chroma[p] / total

  let best: Named | null = null
  let bestScore = -Infinity
  for (let root = 0; root < 12; root++) {
    for (const tpl of CHORD_TEMPLATES) {
      if (simpleOnly && tpl.complexity > SIMPLE_MAX_COMPLEXITY) continue
      const pcs = tpl.pcs.map(i => (root + i) % 12)
      const pcsSet = new Set(pcs)
      let inE = 0
      for (const p of pcsSet) inE += nv[p]
      const outE = 1 - inE

      let miss = 0
      for (const p of pcs) if (nv[p] < PRESENT_FLOOR) miss++
      // extension tones = template pcs beyond the triad (index ≥ 3)
      let weakExt = 0
      for (let k = 3; k < pcs.length; k++) if (nv[pcs[k]] < EXT_FLOOR) weakExt++

      let score =
        inE * W_IN - outE * W_OUT - miss * W_MISS - weakExt * W_WEAK_EXT -
        tpl.complexity * W_COMPLEXITY
      if (bassPc >= 0) {
        if (bassPc === root) score += BASS_ROOT_BONUS
        else if (!pcsSet.has(bassPc)) score -= BASS_OFF_PENALTY
      }
      if (lowPc >= 0 && lowPc === root) score += LOW_ROOT_BONUS

      if (score > bestScore) {
        bestScore = score
        best = {
          root, tpl, pcs: pcsSet,
          label: PC_SHARP[root] + tpl.suffix,
          inEnergy: inE,
          allPresent: miss === 0,
        }
      }
    }
  }
  return best
}

function cosDistance(a: Float64Array, b: Float64Array): number {
  let dot = 0, na = 0, nb = 0
  for (let p = 0; p < 12; p++) { dot += a[p] * b[p]; na += a[p] * a[p]; nb += b[p] * b[p] }
  if (na < 1e-12 || nb < 1e-12) return na < 1e-12 && nb < 1e-12 ? 0 : 1
  return 1 - dot / Math.sqrt(na * nb)
}

export function buildChordSequence(
  scopeTracks: ParsedTrack[],
  bassTrack: ParsedTrack | null,
  grid: { bars: number[]; halfBars: number[]; beats: number[] },
  opts: BuildChordSequenceOpts,
): ChordEvent[] {
  const beats = grid.beats
  const NB = beats.length - 1
  if (NB < 1) return []
  const beatStart = (w: number) => beats[w]
  const beatEnd = (w: number) => beats[w + 1]

  const beatLen = medianGap(beats) || 0.5
  const barLen = medianBarLength(grid.bars) || beatLen * 4
  const sens = Math.min(1, Math.max(0, opts.sensitivity ?? 0.4))
  const tx = opts.transpose

  // ── 1. tag every accompaniment note as harmony (full weight) or melody
  //       (heavily discounted). Per NOTE, not per track — a pianist's right
  //       hand plays both. ────────────────────────────────────────────────
  const allNotes: { midi: number; time: number; end: number; trackNotes: ParsedTrack['notes'] }[] = []
  for (const tr of scopeTracks) {
    for (const nt of tr.notes) {
      allNotes.push({ midi: nt.midi + tx, time: nt.time, end: nt.time + nt.duration, trackNotes: tr.notes })
    }
  }
  // highest pitch sounding at a given instant (across the whole accompaniment)
  const topAt = (t: number): number => {
    let hi = -Infinity
    for (const n of allNotes) if (n.time <= t + 1e-4 && n.end > t + 1e-4 && n.midi > hi) hi = n.midi
    return hi
  }
  const tagged: Tagged[] = []
  for (const tr of scopeTracks) {
    const notes = tr.notes
    for (let i = 0; i < notes.length; i++) {
      const nt = notes[i]
      const midi = nt.midi + tx
      const time = nt.time
      const end = nt.time + nt.duration

      let melodic = false
      const top = topAt(time + 1e-3)
      if (midi >= top - MELODY_TOP_MARGIN) {
        // does this note's own line move? (adjacent notes in the track, by
        // index — a slow half-note melody moves too, just not quickly)
        const prevN = i > 0 ? notes[i - 1].midi + tx : midi
        const nextN = i < notes.length - 1 ? notes[i + 1].midi + tx : midi
        const moved =
          (Math.abs(prevN - midi) > 0 && Math.abs(prevN - midi) <= MELODY_MOVE_MAX) ||
          (Math.abs(nextN - midi) > 0 && Math.abs(nextN - midi) <= MELODY_MOVE_MAX)
        if (moved) {
          // it is the top of a chord VOICING (not a melody note) if it was
          // struck together with a stack-mate within an octave below, or if
          // ≥ 2 harmony notes are ringing within an octave below it now
          let struckWith = 0
          let ringingBelow = 0
          for (const o of allNotes) {
            if (o.midi >= midi || midi - o.midi > 12) continue
            if (Math.abs(o.time - time) <= MELODY_STACK_WIN) struckWith++
            else if (o.time <= time + 1e-4 && o.end > time + 1e-4) ringingBelow++
          }
          const supported = struckWith >= 1 || ringingBelow >= 2
          // …and there must be an accompaniment bed somewhere below in this
          // stretch — otherwise this line IS the accompaniment (a solo comp
          // or arpeggio) and must be kept.
          let hasBed = false
          if (!supported) {
            for (const o of allNotes) {
              if (o.midi <= midi - MELODY_BED_MIN_GAP && o.time < end && o.end > time - barLen && o.time < time + barLen) { hasBed = true; break }
            }
          }
          melodic = !supported && hasBed
        }
      }

      const reg = midi < REGISTER_LOW ? REGISTER_LOW_W : midi > REGISTER_HIGH ? REGISTER_HIGH_W : 1
      tagged.push({
        pc: ((midi % 12) + 12) % 12,
        midi, time, end,
        weight: reg * (melodic ? MELODY_WEIGHT : 1),
      })
    }
  }

  // ── per-beat harmony chroma (duration-weighted overlap) ────────────────
  const beatChroma: Float64Array[] = Array.from({ length: NB }, () => new Float64Array(12))
  const beatOnsetPc: Set<number>[] = Array.from({ length: NB }, () => new Set<number>())
  for (const n of tagged) {
    for (let w = 0; w < NB; w++) {
      if (beatStart(w) >= n.end) break
      const a = Math.max(n.time, beatStart(w))
      const b = Math.min(n.end, beatEnd(w))
      if (b > a) beatChroma[w][n.pc] += (b - a) * n.weight
      if (n.time >= beatStart(w) - 1e-4 && n.time < beatEnd(w) - 1e-4) beatOnsetPc[w].add(n.pc)
    }
  }

  // ── 2. bass pitch class per beat (bass line only — never picks the chord)
  const bassPcAt = (w: number): number => {
    const a = beatStart(w), b = beatEnd(w)
    const scan = (tracks: ParsedTrack[], lowOnly: boolean): number => {
      const pw = new Float64Array(12)
      for (const tr of tracks) for (const nt of tr.notes) {
        const midi = nt.midi + tx
        if (lowOnly && midi > 55) continue
        const ov = Math.min(nt.time + nt.duration, b) - Math.max(nt.time, a)
        if (ov > 0) pw[((midi % 12) + 12) % 12] += ov
      }
      let bi = -1, bw = 0
      for (let p = 0; p < 12; p++) if (pw[p] > bw) { bw = pw[p]; bi = p }
      return bi
    }
    let bi = bassTrack ? scan([bassTrack], false) : scan(scopeTracks, true)
    if (bi === -1 && bassTrack) bi = scan(scopeTracks, true)
    return bi
  }
  const bassPc: number[] = []
  for (let w = 0; w < NB; w++) bassPc.push(bassPcAt(w))

  // ── 3. candidate boundaries — deliberately generous ───────────────────
  // A boundary at beat w when the UPPER harmony turns over vs the previous
  // beat: the set of ringing chord notes clearly shifts, or a new pitch
  // class is struck that was not part of the previous beat. The bass is NOT
  // consulted — a walking bass under a held chord is one chord, not a
  // progression; the bass only earns a slash later (steadyBassOver).
  const isBoundary: boolean[] = new Array(NB).fill(false)
  isBoundary[0] = true
  for (let w = 1; w < NB; w++) {
    const chromaMoved = cosDistance(beatChroma[w], beatChroma[w - 1]) > TURN_CHROMA_DIST
    let newPc = false
    if (!chromaMoved) {
      let prevTot = 0
      for (let p = 0; p < 12; p++) prevTot += beatChroma[w - 1][p]
      const curTot = Math.max(sum12(beatChroma[w]), 1e-9)
      for (const pc of beatOnsetPc[w]) {
        const prevShare = prevTot > 1e-9 ? beatChroma[w - 1][pc] / prevTot : 0
        if (prevShare < TURN_NEWPC_FLOOR && beatChroma[w][pc] / curTot >= EXT_FLOOR) {
          newPc = true; break
        }
      }
    }
    isBoundary[w] = chromaMoved || newPc
  }

  // ── span list from boundaries ─────────────────────────────────────────
  const spanEdges: number[] = []
  for (let w = 0; w < NB; w++) if (isBoundary[w]) spanEdges.push(w)
  spanEdges.push(NB)

  // aggregate chroma over [s, e) beats, padded to NAME_MIN_BEATS for naming
  const chromaOver = (s: number, e: number): Float64Array => {
    let lo = s, hi = e
    while (hi - lo < NAME_MIN_BEATS && (lo > 0 || hi < NB)) {
      if (lo > 0) lo--
      if (hi - lo < NAME_MIN_BEATS && hi < NB) hi++
    }
    const v = new Float64Array(12)
    for (let w = lo; w < hi; w++) for (let p = 0; p < 12; p++) v[p] += beatChroma[w][p]
    return v
  }
  const lowestPcOver = (s: number, e: number): number => {
    let lo = Infinity, pc = -1
    for (const n of tagged) {
      if (n.end <= beatStart(s) || n.time >= beatEnd(e - 1)) continue
      if (n.midi < lo) { lo = n.midi; pc = n.pc }
    }
    return pc
  }
  const steadyBassOver = (s: number, e: number): { pc: number; cover: number } => {
    const pw = new Float64Array(12)
    for (let w = s; w < e; w++) if (bassPc[w] >= 0) pw[bassPc[w]] += 1
    let tot = 0, bw = 0, bi = -1
    for (let p = 0; p < 12; p++) { tot += pw[p]; if (pw[p] > bw) { bw = pw[p]; bi = p } }
    return tot > 0 ? { pc: bi, cover: bw / tot } : { pc: -1, cover: 0 }
  }

  // ── 4. name every span ───────────────────────────────────────────────
  interface Span { s: number; e: number; named: Named; slashPc: number }
  const spans: Span[] = []
  for (let i = 0; i < spanEdges.length - 1; i++) {
    const s = spanEdges[i], e = spanEdges[i + 1]
    if (e <= s) continue
    const sb = steadyBassOver(s, e)
    const lowPc = lowestPcOver(s, e)
    const spanSec = beatStart(e) - beatStart(s)
    const named = nameSpan(chromaOver(s, e), sb.cover >= SLASH_MIN_COVER ? sb.pc : -1, lowPc, spanSec < barLen * 0.5)
    if (!named) continue
    const slashPc =
      sb.pc >= 0 && sb.cover >= SLASH_MIN_COVER && sb.pc !== named.root && named.pcs.has(sb.pc)
        ? sb.pc : -1
    spans.push({ s, e, named, slashPc })
  }
  if (spans.length === 0) return []

  // ── 5. join neighbours that got the same chord name (+ same slash) ────
  const disp = (sp: Span) => sp.named.label + (sp.slashPc >= 0 ? '/' + PC_SHARP[sp.slashPc] : '')
  let merged: Span[] = []
  for (const sp of spans) {
    const last = merged[merged.length - 1]
    if (last && disp(last) === disp(sp)) last.e = sp.e
    else merged.push({ ...sp })
  }

  // ── 6. steadiest-reading pass — the sensitivity knob ─────────────────
  // minSpan: how much of a bar a chord must fill to stand on its own.
  // Relaxed (Auto) ≈ 0.6 of a bar; Detailed (full sensitivity) ≈ a quarter.
  // Meter-independent — works in 3/4, 6/8, 7/8 alike.
  const minSpanSec = barLen * (0.85 - 0.6 * sens)
  // keepShortBlip: below this sensitivity, a confident-but-brief chord
  // sandwiched between two identical chords is treated as a passing colour
  // and folded away; above it, it is shown.
  const keepShortBlip = 0.5

  const durOf = (sp: Span) => beatStart(sp.e) - beatStart(sp.s)
  const beatsOf = (sp: Span) => sp.e - sp.s
  const confident = (sp: Span) => sp.named.inEnergy >= CONF_IN_ENERGY && sp.named.allPresent

  let changed = true
  let guard = 0
  while (changed && guard++ < 64) {
    changed = false
    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i]
      if (durOf(cur) >= minSpanSec) continue
      const prev = merged[i - 1]
      const next = merged[i + 1]
      if (!prev && !next) continue

      const sandwichedSame = prev && next && disp(prev) === disp(next) && disp(prev) !== disp(cur)

      if (sandwichedSame && (!confident(cur) || sens < keepShortBlip)) {
        // fold this span into the surrounding run
        prev.e = next.e
        merged.splice(i, 2)
        changed = true
        break
      }
      if (!confident(cur)) {
        // a murky short span — absorb into the longer / same-root neighbour
        const toPrev =
          prev && (!next || beatsOf(prev) >= beatsOf(next) || prev.named.root === cur.named.root)
        if (toPrev && prev) { prev.e = cur.e; merged.splice(i, 1) }
        else if (next) { next.s = cur.s; merged.splice(i, 1) }
        else continue
        changed = true
        break
      }
    }
  }
  // a second same-name join in case the pass exposed new neighbours
  const joined: Span[] = []
  for (const sp of merged) {
    const last = joined[joined.length - 1]
    if (last && disp(last) === disp(sp)) last.e = sp.e
    else joined.push(sp)
  }

  // ── 7. spans → ChordEvent[] ─────────────────────────────────────────
  return joined.map((sp) => {
    const rootName = PC_SHARP[sp.named.root]
    const label = disp(sp)
    const bassPcOut = sp.slashPc >= 0 ? sp.slashPc : sp.named.root
    const name = localizeChord(label, opts.noteNaming, opts.accidentals, opts.namingStyle) ?? label
    const t = beatStart(sp.s)
    const durSec = beatStart(sp.e) - t
    return {
      time: t,
      displayTime: t,
      name,
      notes: Chord.get(rootName + sp.named.tpl.suffix).notes ?? [],
      realMidi: buildCompactVoicing(sp.named.root, sp.named.tpl.tonalIntervals, bassPcOut, 88),
      structured: {
        rootPitchClass: sp.named.root,
        intervals: sp.named.tpl.tonalIntervals,
        rawRootName: rootName + sp.named.tpl.suffix,
      },
      short: durSec < barLen * 0.98,
    }
  })
}

function sum12(v: Float64Array): number {
  let t = 0
  for (let p = 0; p < 12; p++) t += v[p]
  return t
}

function medianGap(xs: number[]): number {
  const g: number[] = []
  for (let i = 1; i < xs.length; i++) g.push(xs[i] - xs[i - 1])
  if (g.length === 0) return 0
  g.sort((a, b) => a - b)
  return g[g.length >> 1]
}

function medianBarLength(bars: number[]): number {
  const lens: number[] = []
  for (let i = 1; i < bars.length; i++) lens.push(bars[i] - bars[i - 1])
  lens.sort((a, b) => a - b)
  return lens[lens.length >> 1] ?? 2
}
