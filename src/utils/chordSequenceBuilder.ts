import { Chord } from 'tonal'
import type { ParsedTrack, ChordEvent, NoteNaming, Accidentals, ChordNamingStyle } from '../types'
import { CHORD_TEMPLATES } from './chordVocabulary'
import { localizeChord, buildCompactVoicing } from './chordDetection'

// ── Tuning — see docs/superpowers/specs/2026-08-31-chord-detection-redesign-design.md §6 ──
// Symmetric ≈1-bar kernel — a forward-weighted kernel anticipates the next
// chord across a bar line and over-segments block progressions (validated:
// I-IV-V-I with a forward kernel → 7 segments not 4).
const SMOOTH_KERNEL: Array<[number, number]> = [[-1, 0.5], [0, 1], [1, 0.5]]
const W_IN = 2.0            // reward: energy on template tones
const W_OUT = 1.8           // penalty: energy off template tones
const W_MISS_TRIAD = 1.3    // penalty per absent triad tone
const W_WEAK_EXT = 0.9      // penalty per extension tone with < EXT_MIN energy
const EXT_MIN = 0.11        // normalised-energy floor for an extension tone to "count"
const TRIAD_MIN = 0.06      // normalised-energy floor for a triad tone to be "present"
const COMPLEXITY_W = 0.4    // × template.complexity
const BASS_ROOT_BONUS = 0.5
const BASS_NONCHORD_PENALTY = 0.22
const STICKY_ROOT = 0.25
const STICKY_LABEL = 0.30
const REGISTER_LOW = 48     // MIDI — below here, ×0.45 (octave-doubled bass)
const REGISTER_HIGH = 79    // MIDI — above here, ×0.55 (melody)

const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface BuildChordSequenceOpts {
  noteNaming: NoteNaming
  accidentals: Accidentals
  namingStyle: ChordNamingStyle
  transpose: number
}

type Match = { root: number; suffix: string; pcs: Set<number>; label: string }

// ── One window's smoothed 12-bin chroma → best (root × template) ─────────
function matchWindow(
  vec: Float64Array,
  bassPc: number,
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
    for (const tpl of CHORD_TEMPLATES) {
      const pcs = new Set(tpl.pcs.map(i => (root + i) % 12))
      let inE = 0, outE = 0
      for (let p = 0; p < 12; p++) (pcs.has(p) ? (inE += nv[p]) : (outE += nv[p]))
      // triad tones = first three template pcs
      let missTriad = 0
      for (let k = 0; k < 3; k++) if (nv[(root + tpl.pcs[k]) % 12] < TRIAD_MIN) missTriad++
      let weakExt = 0
      for (let k = 3; k < tpl.pcs.length; k++) if (nv[(root + tpl.pcs[k]) % 12] < EXT_MIN) weakExt++

      let score =
        inE * W_IN - outE * W_OUT - missTriad * W_MISS_TRIAD - weakExt * W_WEAK_EXT -
        tpl.complexity * COMPLEXITY_W
      if (bassPc >= 0) {
        if (bassPc === root) score += BASS_ROOT_BONUS
        else if (!pcs.has(bassPc)) score -= BASS_NONCHORD_PENALTY
      }
      const label = PC_SHARP[root] + tpl.suffix
      if (prevRoot === root) score += STICKY_ROOT
      if (prevLabel === label) score += STICKY_LABEL

      if (score > bestScore) {
        bestScore = score
        best = { root, suffix: tpl.suffix, pcs, label }
      }
    }
  }
  return best
}

export function buildChordSequence(
  scopeTracks: ParsedTrack[],
  bassTrack: ParsedTrack | null,
  grid: { bars: number[]; halfBars: number[] },
  opts: BuildChordSequenceOpts,
): ChordEvent[] {
  const windows = grid.halfBars
  const NW = windows.length - 1
  if (NW < 1) return []
  const winStart = (w: number) => windows[w]
  const winEnd = (w: number) => windows[w + 1]

  // ── raw per-window chroma ─────────────────────────────────────────────
  const raw: Float64Array[] = Array.from({ length: NW }, () => new Float64Array(12))
  for (const tr of scopeTracks) {
    for (const nt of tr.notes) {
      // note times are absolute seconds and unaffected by transpose; only
      // the pitch shifts.
      const noteEnd = nt.time + nt.duration
      const midi = nt.midi + opts.transpose
      const reg = midi < REGISTER_LOW ? 0.45 : midi > REGISTER_HIGH ? 0.55 : 1
      const pc = ((midi % 12) + 12) % 12
      for (let w = 0; w < NW; w++) {
        if (winStart(w) >= noteEnd) break        // windows sorted; no later overlap
        const a = Math.max(nt.time, winStart(w))
        const b = Math.min(noteEnd, winEnd(w))
        if (b > a) raw[w][pc] += (b - a) * reg
      }
    }
  }

  // ── ≈1-bar centred smoothing ──────────────────────────────────────────
  const sm: Float64Array[] = Array.from({ length: NW }, () => new Float64Array(12))
  for (let w = 0; w < NW; w++) {
    for (const [d, wf] of SMOOTH_KERNEL) {
      const j = w + d
      if (j < 0 || j >= NW) continue
      for (let p = 0; p < 12; p++) sm[w][p] += raw[j][p] * wf
    }
  }

  // ── bass pc per window ────────────────────────────────────────────────
  const bassPcAt = (w: number): number => {
    const a = winStart(w), b = winEnd(w)
    const pw = new Float64Array(12)
    const src = bassTrack ? [bassTrack] : scopeTracks
    for (const tr of src) {
      for (const nt of tr.notes) {
        const midi = nt.midi + opts.transpose
        if (!bassTrack && midi > 55) continue
        const ov = Math.min(nt.time + nt.duration, b) - Math.max(nt.time, a)
        if (ov > 0) pw[((midi % 12) + 12) % 12] += ov
      }
    }
    let bi = -1, bw = 0
    for (let p = 0; p < 12; p++) if (pw[p] > bw) { bw = pw[p]; bi = p }
    return bi
  }

  // ── match every window ────────────────────────────────────────────────
  type Lab = { disp: string; root: number; suffix: string; label: string; bassPc: number }
  const labels: (Lab | null)[] = []
  for (let w = 0; w < NW; w++) {
    const bp = bassPcAt(w)
    const prev = labels[w - 1]
    const m = matchWindow(sm[w], bp, prev?.root ?? null, prev?.label ?? null)
    if (!m) { labels.push(null); continue }
    let disp = m.label
    if (bp >= 0 && bp !== m.root && m.pcs.has(bp)) disp = m.label + '/' + PC_SHARP[bp]
    labels.push({ disp, root: m.root, suffix: m.suffix, label: m.label, bassPc: bp })
  }

  // ── merge equal-disp windows into segments ────────────────────────────
  type Seg = { disp: string; root: number; suffix: string; bassPc: number; s: number; e: number }
  let segs: Seg[] = []
  for (let w = 0; w < NW; w++) {
    const L = labels[w]
    if (!L) continue
    const last = segs[segs.length - 1]
    if (last && last.disp === L.disp) last.e = w
    else segs.push({ disp: L.disp, root: L.root, suffix: L.suffix, bassPc: L.bassPc, s: w, e: w })
  }

  // ── segment clean-up ─────────────────────────────────────────────────
  const merged: Seg[] = []
  for (let k = 0; k < segs.length; k++) {
    const cur = segs[k]
    // (1) absorb a lone 1-window blip sitting between two identical neighbours
    if (cur.e - cur.s < 1 && merged.length && segs[k + 1] && merged[merged.length - 1].disp === segs[k + 1].disp) {
      merged[merged.length - 1].e = segs[k + 1].e
      k++
      continue
    }
    // (2) extension blip: a lone 1-window segment with the SAME root as the
    // previous segment but a busier suffix (a bar-boundary transition where
    // the next chord's notes briefly bleed in) folds back into the previous.
    const prevM = merged[merged.length - 1]
    if (cur.e - cur.s < 1 && prevM && prevM.root === cur.root && prevM.suffix !== cur.suffix) {
      prevM.e = cur.e
      continue
    }
    merged.push({ ...cur })
  }

  // ── collapse a run of same-root-same-suffix segments differing only by
  // slash, each slash sub-run under ~1 bar (2 windows), into one — kills
  // "G → G/B → G/D → G" arpeggio chatter, keeps a real bar-long inversion.
  const collapsed: Seg[] = []
  for (const seg of merged) {
    const prev = collapsed[collapsed.length - 1]
    const sameChord = prev && prev.root === seg.root && prev.suffix === seg.suffix
    const shortSlash = seg.e - seg.s < 2
    if (sameChord && shortSlash) {
      prev.e = seg.e // keep prev's (earlier) slash / disp
      continue
    }
    collapsed.push({ ...seg })
  }

  // ── segments → ChordEvent[] ───────────────────────────────────────────
  const barLen = medianBarLength(grid.bars)
  return collapsed.map((seg) => {
    const tpl = CHORD_TEMPLATES.find(t => t.suffix === seg.suffix)!
    const rootName = PC_SHARP[seg.root]
    const hasSlash = seg.disp.includes('/')
    const bassPc = hasSlash ? seg.bassPc : seg.root
    // seg.disp is e.g. "G" / "Gm7" / "Gmaj7/B" — already a valid tonal name.
    const name = localizeChord(seg.disp, opts.noteNaming, opts.accidentals, opts.namingStyle) ?? seg.disp
    const t = winStart(seg.s)
    const durBars = winStart(seg.e + 1) - t
    return {
      time: t,
      displayTime: t,
      name,
      notes: (Chord.get(rootName + seg.suffix).notes ?? []),
      realMidi: buildCompactVoicing(seg.root, tpl.tonalIntervals, bassPc, 88),
      structured: {
        rootPitchClass: seg.root,
        intervals: tpl.tonalIntervals,
        rawRootName: rootName + seg.suffix,
      },
      short: durBars < barLen * 0.98,
    }
  })
}

function medianBarLength(bars: number[]): number {
  const lens: number[] = []
  for (let i = 1; i < bars.length; i++) lens.push(bars[i] - bars[i - 1])
  lens.sort((a, b) => a - b)
  return lens[lens.length >> 1] ?? 2
}
