import { Chord } from 'tonal'
import type { ParsedTrack, ChordEvent, NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import { CHORD_TEMPLATES } from './chordVocabulary'
import { localizeChord, buildCompactVoicing } from './chordDetection'

// ── Tuning — see docs/superpowers/specs/2026-08-31-chord-detection-redesign-design.md §6 ──
// Symmetric ≈1-bar kernel — a forward-weighted kernel anticipates the next
// chord across a bar line and over-segments block progressions (validated:
// I-IV-V-I with a forward kernel → 7 segments not 4).
const SMOOTH_KERNEL: Array<[number, number]> = [[-1, 0.25], [0, 1], [1, 0.25]]
const ACC_MAX_BEATS = 4    // a beat's window reaches back at most this far to
                           // gather an arpeggiated chord
const ACC_MIN_PCS = 3      // …and stops as soon as it has this many pitch classes
const ACC_PC_FLOOR = 0.12  // fraction-of-window-energy for a pitch class to count
const W_IN = 2.0            // reward: energy on template tones
const W_OUT = 2.1           // penalty: energy off template tones
const W_MISS_TRIAD = 1.7    // penalty per absent triad tone
const TRIAD_MIN = 0.07      // normalised-energy floor for a triad tone to be "present"
const COMPLEXITY_W = 0.3    // × template.complexity (light tie-breaker only)
const STICKY_LABEL = 0.45   // score bonus for keeping the exact previous chord
const STICKY_ROOT = 0.18    // …or at least the previous root
const REGISTER_LOW = 40     // MIDI — below here, ×0.4 (deep bass octave)
const REGISTER_HIGH = 82    // MIDI — above here, ×0.5 (melody register)

// ── Decoration ──────────────────────────────────────────────────────────
// The per-beat matcher only ever picks a plain triad / sus shape (6 stable
// templates). Sevenths and every tension are added back per-segment, and
// ONLY where the added tone sustains across the whole segment — a real A6 /
// Amaj7 / Aadd9 holds the 6th/7th/9th the entire time; a melody line just
// passing through that note does not. This is what stops "Aadd9" flashing
// up mid-bar when the chord is plainly A with a melodic fill on top.
const DECO_MIN_WINDOWS = 2       // never decorate a segment shorter than this
const DECO_PRESENCE_FLOOR = 0.09 // normalised energy for a tone to "sound" in a window
const DECO_FRAC = 0.55           // fraction of the segment's windows the added tone must sound in
const DECO_MEAN = 0.09           // …and its mean normalised energy across the segment
const SLASH_MIN_COVER = 0.55     // one bass pc must hold this share of a segment's bass energy to earn a slash

const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface BuildChordSequenceOpts {
  noteNaming: NoteNaming
  accidentals: Accidentals
  namingStyle: ChordNamingStyle
  transpose: number
}

type Tpl = (typeof CHORD_TEMPLATES)[number]
type Match = { root: number; suffix: string; pcs: Set<number>; label: string; tpl: Tpl }

// The per-beat matcher only ever picks one of these six — plain triads +
// suspensions. Every seventh and tension is decoration, added per-segment
// in decorateSegment() below. Six stable shapes is what keeps the chord
// from flipping to a 6 / add9 / maj7 the instant a melody note lands on
// that scale degree.
const SKELETON_SUFFIXES = new Set(['', 'm', 'dim', 'aug', 'sus4', 'sus2'])
const SKELETON_TEMPLATES: ReadonlyArray<Tpl> =
  CHORD_TEMPLATES.filter(t => SKELETON_SUFFIXES.has(t.suffix))

// ── One window's smoothed 12-bin chroma → best (root × skeleton triad) ───
// The bass line is deliberately NOT an input here. It is used only after
// the fact, to add a slash (X/Y) when the bass note is a non-root chord
// tone — never to choose the root or quality. (A song whose harmony is a
// walking/arpeggiated bass with no comping instrument will therefore read
// thin in those bars; that is the accepted trade for not having every
// bass note yank the chord around.)
function matchWindow(
  vec: Float64Array,
  prevRoot: number | null,
  prevLabel: string | null,
): Match | null {
  let total = 0
  for (let p = 0; p < 12; p++) total += vec[p]
  if (total < 1e-6) return null
  const nv = new Float64Array(12)
  for (let p = 0; p < 12; p++) nv[p] = vec[p] / total

  let best: Match | null = null
  let bestScore = -Infinity
  for (let root = 0; root < 12; root++) {
    for (const tpl of SKELETON_TEMPLATES) {
      const pcs = new Set(tpl.pcs.map(i => (root + i) % 12))
      let inE = 0, outE = 0
      for (let p = 0; p < 12; p++) (pcs.has(p) ? (inE += nv[p]) : (outE += nv[p]))
      let missTriad = 0
      for (let k = 0; k < 3; k++) if (nv[(root + tpl.pcs[k]) % 12] < TRIAD_MIN) missTriad++

      let score =
        inE * W_IN - outE * W_OUT - missTriad * W_MISS_TRIAD -
        tpl.complexity * COMPLEXITY_W
      const label = PC_SHARP[root] + tpl.suffix
      if (prevLabel === label) score += STICKY_LABEL
      else if (prevRoot === root) score += STICKY_ROOT

      if (score > bestScore) {
        bestScore = score
        best = { root, suffix: tpl.suffix, pcs, label, tpl }
      }
    }
  }
  return best
}

export function buildChordSequence(
  scopeTracks: ParsedTrack[],
  bassTrack: ParsedTrack | null,
  grid: { bars: number[]; halfBars: number[]; beats: number[] },
  opts: BuildChordSequenceOpts,
): ChordEvent[] {
  // One window per beat — every genuine chord change lands within a beat of
  // where it's played, instead of being averaged into a per-bar summary.
  const windows = grid.beats
  const NW = windows.length - 1
  if (NW < 1) return []
  const winStart = (w: number) => windows[w]
  const winEnd = (w: number) => windows[w + 1]

  // ── per-beat chroma (this beat's notes only) ──────────────────────────
  // Scope (comping) tracks only. The bass line is NOT folded in — it was,
  // and every passing bass note dragged the chord with it. Bass now feeds
  // one thing only: the slash label (see bassPcAt / disp below).
  const perBeat: Float64Array[] = Array.from({ length: NW }, () => new Float64Array(12))
  const addTrack = (tr: ParsedTrack, weight: number) => {
    for (const nt of tr.notes) {
      // note times are absolute seconds and unaffected by transpose; only
      // the pitch shifts.
      const noteEnd = nt.time + nt.duration
      const midi = nt.midi + opts.transpose
      const reg = midi < REGISTER_LOW ? 0.4 : midi > REGISTER_HIGH ? 0.5 : 1
      const pc = ((midi % 12) + 12) % 12
      for (let w = 0; w < NW; w++) {
        if (winStart(w) >= noteEnd) break         // windows sorted; no later overlap
        const a = Math.max(nt.time, winStart(w))
        const b = Math.min(noteEnd, winEnd(w))
        if (b > a) perBeat[w][pc] += (b - a) * reg * weight
      }
    }
  }
  for (const tr of scopeTracks) addTrack(tr, 1)

  // ── per-window matching vector — adaptive trailing accumulation ───────
  // Start from this beat's own notes; if that's fewer than ACC_MIN_PCS
  // pitch classes (an arpeggio, a broken chord), reach back beat by beat
  // until the chord is complete or ACC_MAX_BEATS is hit. A block chord
  // fills its own beat and never widens; an arpeggiated one gathers the
  // notes it's spelling out. Then a light 3-beat smooth to damp a single
  // stray beat.
  const distinctPcs = (v: Float64Array) => {
    let tot = 0; for (let p = 0; p < 12; p++) tot += v[p]
    if (tot < 1e-9) return 0
    let n = 0; for (let p = 0; p < 12; p++) if (v[p] / tot >= ACC_PC_FLOOR) n++
    return n
  }
  const acc: Float64Array[] = Array.from({ length: NW }, () => new Float64Array(12))
  for (let w = 0; w < NW; w++) {
    const v = acc[w]
    for (let p = 0; p < 12; p++) v[p] = perBeat[w][p]
    for (let back = 1; back < ACC_MAX_BEATS && w - back >= 0 && distinctPcs(v) < ACC_MIN_PCS; back++) {
      const src = perBeat[w - back]
      for (let p = 0; p < 12; p++) v[p] += src[p]
    }
  }
  const sm: Float64Array[] = Array.from({ length: NW }, () => new Float64Array(12))
  for (let w = 0; w < NW; w++) {
    for (const [d, wf] of SMOOTH_KERNEL) {
      const j = w + d
      if (j < 0 || j >= NW) continue
      for (let p = 0; p < 12; p++) sm[w][p] += acc[j][p] * wf
    }
  }

  // ── dominant bass pc over a time span ────────────────────────────────
  // The ONLY use of the bass line. Returns the pitch class that holds the
  // low end for most of [a, b), plus its share of the bass energy there —
  // a slash is only drawn (per SEGMENT, below) when one bass note actually
  // sits under the whole chord, never for a walking/arpeggiated bass that
  // moves every beat.
  const bassPcOver = (a: number, b: number): { pc: number; cover: number } => {
    const scan = (tracks: ParsedTrack[], lowOnly: boolean): Float64Array => {
      const pw = new Float64Array(12)
      for (const tr of tracks) {
        for (const nt of tr.notes) {
          const midi = nt.midi + opts.transpose
          if (lowOnly && midi > 55) continue
          const ov = Math.min(nt.time + nt.duration, b) - Math.max(nt.time, a)
          if (ov > 0) pw[((midi % 12) + 12) % 12] += ov
        }
      }
      return pw
    }
    let pw = bassTrack ? scan([bassTrack], false) : scan(scopeTracks, true)
    let tot = 0
    for (let p = 0; p < 12; p++) tot += pw[p]
    if (tot < 1e-9 && bassTrack) { pw = scan(scopeTracks, true); tot = 0; for (let p = 0; p < 12; p++) tot += pw[p] }
    if (tot < 1e-9) return { pc: -1, cover: 0 }
    let bi = -1, bw = 0
    for (let p = 0; p < 12; p++) if (pw[p] > bw) { bw = pw[p]; bi = p }
    return { pc: bi, cover: bw / tot }
  }

  // ── match every window (skeleton triad only; bass not consulted) ──────
  type Lab = { root: number; suffix: string; label: string; tpl: Tpl }
  const labels: (Lab | null)[] = []
  for (let w = 0; w < NW; w++) {
    const prev = labels[w - 1]
    const m = matchWindow(sm[w], prev?.root ?? null, prev?.label ?? null)
    labels.push(m ? { root: m.root, suffix: m.suffix, label: m.label, tpl: m.tpl } : null)
  }

  // ── merge equal-label windows into segments ──────────────────────────
  type Seg = { disp: string; root: number; suffix: string; s: number; e: number; tpl: Tpl }
  let segs: Seg[] = []
  for (let w = 0; w < NW; w++) {
    const L = labels[w]
    if (!L) continue
    const last = segs[segs.length - 1]
    if (last && last.disp === L.label) last.e = w
    else segs.push({ disp: L.label, root: L.root, suffix: L.suffix, s: w, e: w, tpl: L.tpl })
  }

  // ── segment clean-up — ONE pass only ─────────────────────────────────
  // Absorb a lone single-beat segment whose two neighbours are the SAME
  // chord (a one-beat detection wobble). Everything else stays: a genuine
  // one-beat chord between two DIFFERENT chords is a real change and must
  // be shown.
  const collapsed: Seg[] = []
  for (let k = 0; k < segs.length; k++) {
    const cur = segs[k]
    const prev = collapsed[collapsed.length - 1]
    if (cur.e - cur.s < 1 && prev && segs[k + 1] && prev.disp === segs[k + 1].disp) {
      prev.e = segs[k + 1].e
      k++
      continue
    }
    collapsed.push({ ...cur })
  }

  // ── decorate each segment from its own sustained chroma ──────────────
  // The skeleton says e.g. "A major, bars 9–13". Now look across just those
  // windows: is the 6th / 7th / 9th held the whole time (a real A6 / Amaj7
  // / Aadd9), or did a melody line only pass through it? Only a tone that
  // sounds in ≥ DECO_FRAC of the segment's own windows is admitted. Then a
  // slash iff ONE bass note covers most of the segment and is a non-root
  // chord tone.
  type Dec = { root: number; suffix: string; slashPc: number; s: number; e: number; tpl: Tpl; disp: string }
  const decorated: Dec[] = collapsed.map((seg) => {
    const d = decorateSegment(seg.root, seg.suffix, seg.s, seg.e, sm)
    const pcs = new Set(d.tpl.pcs.map(i => (seg.root + i) % 12))
    const bass = bassPcOver(winStart(seg.s), winStart(seg.e + 1))
    const slashPc =
      bass.pc >= 0 && bass.pc !== seg.root && pcs.has(bass.pc) && bass.cover >= SLASH_MIN_COVER
        ? bass.pc : -1
    const disp = PC_SHARP[seg.root] + d.suffix + (slashPc >= 0 ? '/' + PC_SHARP[slashPc] : '')
    return { root: seg.root, suffix: d.suffix, slashPc, s: seg.s, e: seg.e, tpl: d.tpl, disp }
  })

  // decoration can make two neighbours identical (both "A" → both "Amaj7")
  const finalSegs: Dec[] = []
  for (const seg of decorated) {
    const prev = finalSegs[finalSegs.length - 1]
    if (prev && prev.disp === seg.disp) prev.e = seg.e
    else finalSegs.push(seg)
  }

  // ── segments → ChordEvent[] ───────────────────────────────────────────
  const barLen = medianBarLength(grid.bars)
  return finalSegs.map((seg) => {
    const rootName = PC_SHARP[seg.root]
    const bassPc = seg.slashPc >= 0 ? seg.slashPc : seg.root
    const name = localizeChord(seg.disp, opts.noteNaming, opts.accidentals, opts.namingStyle) ?? seg.disp
    const t = winStart(seg.s)
    const durBars = winStart(seg.e + 1) - t
    return {
      time: t,
      displayTime: t,
      name,
      notes: (Chord.get(rootName + seg.suffix).notes ?? []),
      realMidi: buildCompactVoicing(seg.root, seg.tpl.tonalIntervals, bassPc, 88),
      structured: {
        rootPitchClass: seg.root,
        intervals: seg.tpl.tonalIntervals,
        rawRootName: rootName + seg.suffix,
      },
      short: durBars < barLen * 0.98,
    }
  })
}

// ── decorateSegment ─────────────────────────────────────────────────────
// Given a segment's root + skeleton suffix and its window span, return the
// richest chord template whose every tone beyond the skeleton triad sounds
// in at least DECO_FRAC of the segment's windows (mean normalised energy
// ≥ DECO_MEAN). Falls back to the skeleton unchanged.
function decorateSegment(
  root: number,
  skelSuffix: string,
  s: number,
  e: number,
  sm: Float64Array[],
): { suffix: string; tpl: Tpl } {
  const skel = SKELETON_TEMPLATES.find(t => t.suffix === skelSuffix) ?? SKELETON_TEMPLATES[0]
  const winCount = e - s + 1
  if (winCount < DECO_MIN_WINDOWS) return { suffix: skel.suffix, tpl: skel }

  const frac = new Float64Array(12)
  const mean = new Float64Array(12)
  for (let w = s; w <= e; w++) {
    let tot = 0
    for (let p = 0; p < 12; p++) tot += sm[w][p]
    if (tot < 1e-9) continue
    for (let p = 0; p < 12; p++) {
      const v = sm[w][p] / tot
      mean[p] += v
      if (v >= DECO_PRESENCE_FLOOR) frac[p] += 1
    }
  }
  for (let p = 0; p < 12; p++) { frac[p] /= winCount; mean[p] /= winCount }

  const skelPcs = new Set(skel.pcs.map(i => (root + i) % 12))
  let best = skel
  let bestSize = skelPcs.size
  for (const tpl of CHORD_TEMPLATES) {
    if (tpl.suffix === skel.suffix) continue
    const pcs = tpl.pcs.map(i => (root + i) % 12)
    let superset = true
    for (const sp of skelPcs) if (!pcs.includes(sp)) { superset = false; break }
    if (!superset) continue
    // every ADDED tone (beyond the skeleton triad) must genuinely sustain
    let ok = true
    for (const p of pcs) {
      if (skelPcs.has(p)) continue
      if (frac[p] < DECO_FRAC || mean[p] < DECO_MEAN) { ok = false; break }
    }
    if (!ok) continue
    const size = new Set(pcs).size
    if (size > bestSize || (size === bestSize && tpl.complexity < best.complexity)) {
      best = tpl
      bestSize = size
    }
  }
  return { suffix: best.suffix, tpl: best }
}

function medianBarLength(bars: number[]): number {
  const lens: number[] = []
  for (let i = 1; i < bars.length; i++) lens.push(bars[i] - bars[i - 1])
  lens.sort((a, b) => a - b)
  return lens[lens.length >> 1] ?? 2
}
