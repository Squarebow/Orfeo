// ── Suggested fingering (an optional aid, off by default) ────────────────────
// For each hand, the fingering that asks least of the hand over the whole
// piece: every possible finger for every note (and every finger shape for a
// chord) weighed note to note, and the cheapest path kept (a shortest-path
// search over the piece, not a lookup table). The weights are the ergonomic
// rules of Parncutt, Sloboda, Clarke, Raekallio & Desain (1997, "An ergonomic
// model of keyboard fingering for melodic fragments": comfortable and
// practical spans per finger pair, stretches, weak fingers, thumb and little
// finger on black keys, thumb passing) plus what method books teach: stay in
// position, no same finger on two different notes in a row, no awkward
// crossings, chords in their usual shapes. The idea of searching the whole
// piece for the least effort follows pianoplayer by Marco Musy (MIT).
//
// 1 = thumb … 5 = little finger, in both hands. The left hand is worked out as
// a mirror of the right (its pitches turned round), so one set of rules serves
// both. Numbers you set yourself are kept, and the rest is worked out around
// them. Pure: no store, no app.
//
// It's a suggestion: it can't know the phrasing, the tempo you'll reach or your
// hand, and a teacher's fingering is better. The app says so where it's shown.

export type HandSize = 'small' | 'medium' | 'large'

export interface FingerNote { midi: number; time: number; dur: number; finger?: number }

// Spans in semitones between two fingers of the right hand, the lower finger
// first: [MinPrac, MinComf, MinRel, MaxRel, MaxComf, MaxPrac] (Parncutt et al.
// 1997, table 1). Negative: the thumb passing under / a finger over the thumb.
type Span = [number, number, number, number, number, number]
const SPANS: Record<string, Span> = {
  '1-2': [-5, -3, 1, 5, 8, 10],
  '1-3': [-4, -2, 3, 7, 10, 12],
  '1-4': [-3, -1, 5, 9, 12, 14],
  '1-5': [-1, 1, 7, 10, 13, 15],
  '2-3': [1, 1, 1, 2, 3, 5],
  '2-4': [1, 1, 3, 4, 5, 7],
  '2-5': [2, 2, 5, 6, 8, 10],
  '3-4': [1, 1, 1, 2, 2, 4],
  '3-5': [1, 1, 3, 4, 5, 7],
  '4-5': [1, 1, 1, 2, 3, 5],
}
/** How much further (or less far) a hand reaches */
const SIZE: Record<HandSize, number> = { small: 0.85, medium: 1, large: 1.15 }

/** The thumb passing under, or a finger crossing over it */
const PASS = 3

const BLACK = new Set([1, 3, 6, 8, 10])
const WHITE_OF = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
/** White keys from C-1 (a black key counts as the white one below it); mirrored for the left hand */
const whiteAt = (midi: number) => Math.floor(midi / 12) * 7 + WHITE_OF[((midi % 12) + 12) % 12]
const isBlack = (midi: number) => BLACK.has(((midi % 12) + 12) % 12)

// ── The standard scale fingerings (the tables in scale books and exam
// syllabuses): for each key, the finger on each note of the scale as it goes
// on over several octaves. A run of scale notes in the song's key follows its
// table (its last note is left to the search: a scale ends its own way). Minor keys: the harmonic minor, its 6th and 7th either way
// (natural or raised) on the same finger. ────────────────────────────────────
const SCALES_RH: Record<string, string> = {
  C: 'C1 D2 E3 F1 G2 A3 B4', G: 'G1 A2 B3 C1 D2 E3 F#4', D: 'D1 E2 F#3 G1 A2 B3 C#4',
  A: 'A1 B2 C#3 D1 E2 F#3 G#4', E: 'E1 F#2 G#3 A1 B2 C#3 D#4', B: 'B1 C#2 D#3 E1 F#2 G#3 A#4',
  F: 'F1 G2 A3 Bb4 C1 D2 E3', Bb: 'Bb4 C1 D2 Eb3 F1 G2 A3', Eb: 'Eb3 F1 G2 Ab3 Bb4 C1 D2',
  Ab: 'Ab3 Bb4 C1 Db2 Eb3 F1 G2', Db: 'Db2 Eb3 F1 Gb2 Ab3 Bb4 C1', 'F#': 'F#2 G#3 A#4 B1 C#2 D#3 F1',
  am: 'A1 B2 C3 D1 E2 F3 F#3 G4 G#4', em: 'E1 F#2 G3 A1 B2 C3 C#3 D4 D#4', dm: 'D1 E2 F3 G1 A2 Bb3 B3 C4 C#4',
  gm: 'G1 A2 Bb3 C1 D2 Eb3 E3 F4 F#4', cm: 'C1 D2 Eb3 F1 G2 Ab3 A3 Bb4 B4', bm: 'B1 C#2 D3 E1 F#2 G3 G#3 A4 A#4',
  fm: 'F1 G2 Ab3 Bb4 C1 Db2 D2 Eb3 E3',
  'f#m': 'F#3 G#4 A1 B2 C#3 D1 D#1 E2 F2', 'c#m': 'C#3 D#4 E1 F#2 G#3 A1 A#1 B2 C2', 'g#m': 'G#3 A#4 B1 C#2 D#3 E1 F1 F#2 G2',
  ebm: 'Eb3 F1 Gb2 Ab3 Bb4 Cb1 C1 Db2 D2', bbm: 'Bb4 C1 Db2 Eb3 F1 Gb2 G2 Ab3 A3',
}
const SCALES_LH: Record<string, string> = {
  C: 'C1 D4 E3 F2 G1 A3 B2', G: 'G1 A4 B3 C2 D1 E3 F#2', D: 'D1 E4 F#3 G2 A1 B3 C#2',
  A: 'A1 B4 C#3 D2 E1 F#3 G#2', E: 'E1 F#4 G#3 A2 B1 C#3 D#2', B: 'B4 C#3 D#2 E1 F#4 G#3 A#2',
  F: 'F1 G4 A3 Bb2 C1 D3 E2', Bb: 'Bb3 C2 D1 Eb4 F3 G2 A1', Eb: 'Eb3 F2 G1 Ab4 Bb3 C2 D1',
  Ab: 'Ab3 Bb2 C1 Db4 Eb3 F2 G1', Db: 'Db3 Eb2 F1 Gb4 Ab3 Bb2 C1', 'F#': 'F#4 G#3 A#2 B1 C#3 D#2 F1',
  am: 'A1 B4 C3 D2 E1 F3 F#3 G2 G#2', em: 'E1 F#4 G3 A2 B1 C3 C#3 D2 D#2', dm: 'D1 E4 F3 G2 A1 Bb3 B3 C2 C#2',
  gm: 'G1 A4 Bb3 C2 D1 Eb3 E3 F2 F#2', cm: 'C1 D4 Eb3 F2 G1 Ab3 A3 Bb2 B2', bm: 'B4 C#3 D2 E1 F#4 G3 G#3 A2 A#2',
  fm: 'F1 G4 Ab3 Bb2 C1 Db3 D3 Eb2 E2',
  'f#m': 'F#4 G#3 A2 B1 C#3 D2 D#2 E1 F1', 'c#m': 'C#3 D#2 E1 F#4 G#3 A2 A#2 B1 C1', 'g#m': 'G#3 A#2 B1 C#3 D#2 E1 F1 F#4 G4',
  ebm: 'Eb2 F1 Gb4 Ab3 Bb2 Cb1 C1 Db3 D3', bbm: 'Bb2 C1 Db3 Eb2 F1 Gb4 G4 Ab3 A3',
}
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const pcOf = (name: string) => (PC[name[0]] + (name.includes('#') ? 1 : name.includes('b') ? -1 : 0) + 12) % 12
const parseScale = (t: string) => new Map(t.split(' ').map(x => [pcOf(x.slice(0, -1)), Number(x.slice(-1))] as [number, number]))
const TABLES = { R: Object.fromEntries(Object.entries(SCALES_RH).map(([k, v]) => [k, parseScale(v)])), L: Object.fromEntries(Object.entries(SCALES_LH).map(([k, v]) => [k, parseScale(v)])) }
const TONIC: Record<string, number> = Object.fromEntries(Object.keys(SCALES_RH).map(k => [k, pcOf(k[0].toUpperCase() + k.slice(1).replace('m', ''))]))
/** How much a finger that matches its scale's table is preferred */
const SCALE_PULL = 3
/** The shortest run that counts as a scale */
const SCALE_RUN = 6

/** The table for a run of these pitch classes: the song's key when it fits,
 *  else the one major key whose notes hold them all, else none */
function scaleTable(pcs: Set<number>, hand: 'L' | 'R', key?: { tonic: number; minor: boolean }): Map<number, number> | null {
  const fits = (name: string) => [...pcs].every(pc => TABLES[hand][name].has(pc))
  if (key) {
    const name = Object.keys(TONIC).find(k => TONIC[k] === key.tonic && (k.endsWith('m') === key.minor) && k !== 'm')
    if (name && fits(name)) return TABLES[hand][name]
  }
  const majors = Object.keys(TONIC).filter(k => !k.endsWith('m') && fits(k))
  return majors.length === 1 ? TABLES[hand][majors[0]] : null
}

/** Notes this close together are one moment (a chord) */
export const CHORD_SEC = 0.03
/** A key struck again this soon is a fast repeat (sixteenths at about 110) */
const FAST_REPEAT = 0.14
/** A rest or a long note this long frees the hand to move anywhere */
const LIFT_SEC = 0.35

interface Moment { idx: number[]; pitch: number[]; white: number[]; black: boolean[]; time: number; end: number; fixed: (number | undefined)[]; scale?: number; midi: number[]; ends: number[] }

/** The cost of one finger to the next, `d` semitones apart (mirrored pitch), the
 *  hand still in place; Infinity when it can't be done without lifting */
function pairCost(f1: number, f2: number, d: number, b1: boolean, b2: boolean, scale: number): number {
  if (f1 === f2) return d === 0 ? 0 : Infinity
  const lo = Math.min(f1, f2), hi = Math.max(f1, f2)
  // the interval from the lower finger to the higher one
  const iv = f1 < f2 ? d : -d
  const [minP, minC, minR, maxR, maxC, maxP] = SPANS[`${lo}-${hi}`]
  const s = (x: number) => x * scale   // reach grows (and shrinks) with the hand
  const thumb = lo === 1
  // the thumb passing under (or a finger crossing over it): the thumb's key is
  // then the higher one. Worth it only when the hand has to travel (a scale);
  // up to about a 6th; easy from a black key (the finger is up there), hard onto one
  if (thumb && iv < 0) {
    // never under the little finger; from the 4th finger only now and then (F major)
    if (hi === 5 || iv < -9 * scale) return Infinity
    const bThumb = f1 === 1 ? b1 : b2, bOther = f1 === 1 ? b2 : b1
    return PASS + 0.6 * -iv + (hi === 4 ? 1 : 0) + (bThumb && !bOther ? 2 : 0)
  }
  if (iv > s(maxP) + 1e-9 || iv < s(minP) - 1e-9) return Infinity
  let c = 0
  if (iv > s(maxC)) c += 2 * (iv - s(maxC))
  if (iv < s(minC)) c += 2 * (s(minC) - iv)
  if (iv > s(maxR)) c += 1 * (iv - s(maxR))   // (Parncutt weighs 2 without the thumb; 1 keeps arpeggio thirds natural)
  if (iv < s(minR)) c += (thumb ? 2 : 1) * (s(minR) - iv)
  // 3 then 4, or 4 then 3 with 4 on a black key above a white 3: awkward
  if (f1 === 3 && f2 === 4) c += 1
  if (lo === 3 && hi === 4 && ((f1 === 4 && b1 && !b2) || (f2 === 4 && b2 && !b1))) c += 1
  return c
}

/** The cost of a finger on a key, wherever it comes from */
function placeCost(f: number, black: boolean, prevBlack: boolean | null): number {
  let c = 0
  if (f === 4 || f === 5) c += 0.5                        // weaker fingers
  if (f === 1 && black) c += 1 + (prevBlack === false ? 2 : 0)
  if (f === 5 && black) c += prevBlack === false ? 2 : 0
  return c
}

/** Every way to put fingers on a moment's notes (low to high, fingers rising) */
function shapes(m: Moment): number[][] {
  const k = m.pitch.length
  const out: number[][] = []
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) { out.push(acc.slice()); return }
    for (let f = start; f <= 5 - (k - acc.length - 1); f++) {
      const want = m.fixed[acc.length]
      if (want && want !== f) continue
      acc.push(f); rec(f + 1, acc); acc.pop()
    }
  }
  rec(1, [])
  return out
}

/** A chord's own cost: the stretch between neighbouring fingers */
function shapeCost(m: Moment, sh: number[], scale: number): number {
  let c = 0
  if (m.scale !== undefined && sh[0] === m.scale) c -= SCALE_PULL   // the scale book's finger
  // the usual shapes (1-3-5, 5-3-1): fingers as far apart as the keys, within the hand
  for (let i = 1; i < sh.length; i++) c += 0.6 * Math.abs((sh[i] - sh[i - 1]) - Math.min(4, Math.abs(m.white[i] - m.white[i - 1])))
  for (let i = 0; i < sh.length; i++) c += placeCost(sh[i], m.black[i], null)
  for (let i = 1; i < sh.length; i++) {
    const pc = pairCost(sh[i - 1], sh[i], m.pitch[i] - m.pitch[i - 1], m.black[i - 1], m.black[i], scale)
    if (!Number.isFinite(pc)) return Infinity
    c += pc
  }
  return c
}

/** From one moment's shape to the next */
function moveCost(a: Moment, sa: number[], b: Moment, sb: number[], scale: number): number {
  const lifted = b.time - a.end >= LIFT_SEC || b.time - a.time >= LIFT_SEC * 2.5
  // the outer notes lead the hand: the lowest and the highest of each moment
  const pairs: [number, number][] = [[0, 0]]
  if (sa.length > 1 || sb.length > 1) pairs.push([sa.length - 1, sb.length - 1])
  let c = 0
  const fast = b.time - a.time < FAST_REPEAT
  // a finger still holding its key can't play another one (a held note under a
  // moving tune in the same hand: the tune goes to the other fingers)
  for (let i = 0; i < sa.length; i++) {
    if (a.ends[i] <= b.time + CHORD_SEC) continue
    for (let j = 0; j < sb.length; j++) if (sb[j] === sa[i] && b.midi[j] !== a.midi[i]) return Infinity
  }
  for (const [i, j] of pairs) {
    const d = b.pitch[j] - a.pitch[i]
    if (d === 0 && sa.length === 1 && sb.length === 1) {
      // the same key again: at a calm pace the same finger; quickly repeated,
      // the fingers take turns inwards (3-2-1, 4-3-2-1)
      c += sa[i] === sb[j] ? (fast ? 1.5 : 0) : fast ? (sb[j] === sa[i] - 1 ? 0.2 : 1) : 2.5
      continue
    }
    let pc = pairCost(sa[i], sb[j], d, a.black[i], b.black[j], scale)
    if (sa[i] === sb[j] && d !== 0) pc = lifted ? 3 + Math.abs(d) * 0.1 : Infinity   // same finger, another key: only after lifting the hand
    // staying in position: the fingers as far apart as the keys (C to G in five-finger position: 1 to 5)
    else if (Number.isFinite(pc) && (sb[j] - sa[i]) * d > 0) pc += 0.3 * Math.abs(Math.abs(sb[j] - sa[i]) - Math.min(4, Math.abs(b.white[j] - a.white[i])))
    if (!Number.isFinite(pc)) pc = lifted ? 4 + Math.min(12, Math.abs(d)) * 0.25 : Infinity
    else if (lifted) pc *= 0.3
    c += pc
  }
  c /= pairs.length
  // the thumb or little finger on a black key, next to white ones (Parncutt)
  c += placeCost(sb[0], b.black[0], a.black[0]) - placeCost(sb[0], b.black[0], null)
  if (a.black[0] && !b.black[0] && (sa[0] === 1 || sa[0] === 5)) c += 2
  return c
}

/** How many moments back a held note is looked for */
const HELD_LOOKBACK = 16

/** Does `sb` put a finger that's still holding an earlier key (on the path ending
 *  in state `p` of the previous moment) onto another key? */
function heldClash(held: [number, number][], p: number, sb: number[], m: Moment, seg: Moment[], S: number[][][], back: number[][]): boolean {
  // the states along the path, from the previous moment back to the oldest held one
  let st = p
  const stateAt = new Map<number, number>([[seg.length - 1, p]])
  const oldest = Math.min(...held.map(h => h[0]))
  for (let v = seg.length - 1; v > oldest; v--) { st = back[v][st]; if (st < 0) return false; stateAt.set(v - 1, st) }
  for (const [u, i] of held) {
    const f = S[u][stateAt.get(u)!]?.[i]
    if (f === undefined) continue
    for (let j = 0; j < sb.length; j++) if (sb[j] === f && m.midi[j] !== seg[u].midi[i]) return true
  }
  return false
}

/** Suggested fingers for one hand's notes (in any order): one per note, or
 *  undefined where none can be given (more than five notes at once). Notes with
 *  a finger already keep it. */
export function suggestFingering(notes: FingerNote[], hand: 'L' | 'R', size: HandSize = 'medium', key?: { tonic: number; minor: boolean }): (number | undefined)[] {
  const scale = SIZE[size]
  const out: (number | undefined)[] = notes.map(n => n.finger)
  const order = notes.map((_, i) => i).sort((a, b) => notes[a].time - notes[b].time || notes[a].midi - notes[b].midi)
  const mirror = (midi: number) => (hand === 'R' ? midi : -midi)

  // the moments, each a chain broken where a moment can't be fingered
  const chains: Moment[][] = [[]]
  for (let i = 0; i < order.length;) {
    let j = i
    while (j < order.length && notes[order[j]].time - notes[order[i]].time < CHORD_SEC) j++
    const idx = order.slice(i, j)
    i = j
    // one key once; low to high in the hand's own direction
    const byKey = new Map<number, number>()
    for (const k of idx) if (!byKey.has(notes[k].midi) || notes[k].finger) byKey.set(notes[k].midi, k)
    const keys = [...byKey.values()].sort((a, b) => mirror(notes[a].midi) - mirror(notes[b].midi))
    if (keys.length > 5) { chains.push([]); continue }
    const m: Moment = {
      idx: keys, midi: keys.map(k => notes[k].midi), ends: keys.map(k => notes[k].time + notes[k].dur), pitch: keys.map(k => mirror(notes[k].midi)), white: keys.map(k => whiteAt(notes[k].midi)), black: keys.map(k => isBlack(notes[k].midi)),
      time: notes[keys[0]].time, end: Math.max(...idx.map(k => notes[k].time + notes[k].dur)),
      fixed: keys.map(k => notes[k].finger),
    }
    chains[chains.length - 1].push(m)
  }

  // scale runs: single notes stepping (a semitone, a tone, a harmonic minor's 3) the same way, long
  // enough, all in one scale: their inner notes get the table's finger
  for (const chain of chains) {
    let i = 0
    while (i < chain.length) {
      let j = i + 1, dir = 0
      while (j < chain.length && chain[j].midi.length === 1 && chain[j - 1].midi.length === 1) {
        const d = chain[j].midi[0] - chain[j - 1].midi[0]
        if (Math.abs(d) < 1 || Math.abs(d) > 3 || (dir && Math.sign(d) !== dir)) break   // up to 3: the harmonic minor's step
        dir = Math.sign(d); j++
      }
      if (j - i >= SCALE_RUN) {
        const table = scaleTable(new Set(chain.slice(i, j).map(m => ((m.midi[0] % 12) + 12) % 12)), hand, key)
        if (table) for (let u = i; u < j - 1; u++) {
          const want = table.get(((chain[u].midi[0] % 12) + 12) % 12)
          // the first note too, unless the table gives it 4 or 5 (a scale begins on a
          // lower finger: B♭ major starts on 2, and continues with 4 on B♭)
          if (u > i || (want !== undefined && want < 4)) chain[u].scale = want
        }
      }
      i = Math.max(i + 1, j - 1)
    }
  }

  for (const chain of chains) {
    // the cheapest path (Viterbi), in stretches: where nothing can follow (a jump
    // too far with no time to lift the hand) a fresh stretch starts
    let from = 0
    while (from < chain.length) {
      const seg: Moment[] = [chain[from]]
      const S = [shapes(chain[from])]
      let cost = S[0].map(sh => shapeCost(chain[from], sh, scale))
      const back: number[][] = [S[0].map(() => -1)]
      let t = from + 1
      for (; t < chain.length; t++) {
        const shs = shapes(chain[t])
        const next: number[] = [], via: number[] = []
        for (const sb of shs) {
          const own = shapeCost(chain[t], sb, scale)
          let best = Infinity, arg = -1
          if (Number.isFinite(own)) {
            const prev = S[S.length - 1], a = seg[seg.length - 1]
            // notes held from further back (still down when this moment starts):
            // their fingers, on the path that leads to each candidate, stay on them
            const held: [number, number][] = []
            for (let u = seg.length - 2; u >= Math.max(0, seg.length - 1 - HELD_LOOKBACK); u--) {
              seg[u].ends.forEach((e, i) => { if (e > chain[t].time + CHORD_SEC) held.push([u, i]) })
            }
            for (let p = 0; p < prev.length; p++) {
              if (!Number.isFinite(cost[p])) continue
              if (held.length && heldClash(held, p, sb, chain[t], seg, S, back)) continue
              const c = cost[p] + moveCost(a, prev[p], chain[t], sb, scale)
              if (c < best) { best = c; arg = p }
            }
          }
          next.push(best + own); via.push(arg)
        }
        if (next.every(c => !Number.isFinite(c))) break
        seg.push(chain[t]); S.push(shs); cost = next; back.push(via)
      }
      // walk back through this stretch
      // (a moment no hand of this size can play at all gets no numbers)
      const least = Math.min(...cost)
      let st = Number.isFinite(least) ? cost.indexOf(least) : -1
      for (let u = seg.length - 1; u >= 0 && st >= 0; u--) {
        const sh = S[u][st]
        seg[u].idx.forEach((k, i) => { if (!notes[k].finger) out[k] = sh[i] })
        st = back[u][st]
      }
      from = t
    }
  }
  // notes sharing a key in a moment (doubled) take that key's finger
  for (let i = 0; i < order.length; i++) {
    const k = order[i]
    if (out[k] !== undefined) continue
    const twin = order.find(o => o !== k && out[o] !== undefined && notes[o].midi === notes[k].midi && Math.abs(notes[o].time - notes[k].time) < CHORD_SEC)
    if (twin !== undefined) out[k] = out[twin]
  }
  return out
}
