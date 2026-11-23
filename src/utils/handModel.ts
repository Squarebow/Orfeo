// ── Hand model: a trained second reading of which hand plays each note ───────
//
// Today's engine (assignHands) reads a piano part with hand-written rules.
// The hand model is a small recurrent network, trained on the dev machine on
// public-domain two-staff piano scores (scripts/hand-model/, gitignored), that
// reads the same part note by note, forwards and backwards, sees what the
// engine thinks of every note (handModelFeatures.ts), and gives its own
// answer and how sure it is. It runs here in plain TypeScript: no library, no
// download, the same answer on every computer.

import { noteFeatures, playingOrder, FEATURES, FEATURE_VERSION, type FeatureNote, type EngineRead } from './handModelFeatures'

export interface HandModelWeights {
  featureVersion: number
  features: number
  embed: number
  hidden: number
  layers: number
  /** how far from undecided (log-odds) a reading must be to count as sure:
   *  at most 1 note in 1000 wrong, measured on scores set aside in training */
  sureZ?: number
  /** name → flat row-major numbers (PyTorch state_dict layout) */
  weights: Record<string, { shape: number[]; data: ArrayLike<number> }>
}

/** The packed form shipped in the app (handModelWeights.ts): half-precision numbers in base64. */
export interface PackedHandModel {
  name: string; featureVersion: number; features: number; embed: number; hidden: number; layers: number; sureZ: number
  tensors: Record<string, [number[], string]>
}

function fromHalf(h: number): number {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff
  if (e === 0) return s * m * 2 ** -24
  if (e === 31) return m ? NaN : s * Infinity
  return s * (1 + m / 1024) * 2 ** (e - 15)
}

export function unpackHandModel(p: PackedHandModel): HandModelWeights {
  const weights: HandModelWeights['weights'] = {}
  for (const [k, [shape, b64]] of Object.entries(p.tensors)) {
    const bin = atob(b64)
    const data = new Float64Array(bin.length / 2)
    for (let i = 0; i < data.length; i++) data[i] = fromHalf(bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8))
    weights[k] = { shape, data }
  }
  return { featureVersion: p.featureVersion, features: p.features, embed: p.embed, hidden: p.hidden, layers: p.layers, sureZ: p.sureZ, weights }
}

export interface ModelRead {
  hand: 'L' | 'R'
  /** 0..1 on the engine's scale: 0.9 and up = sure (at most 1 in 1000 wrong) */
  confidence: number
  /** 0..1, chance the right hand plays it */
  right: number
}

interface Gru { wih: Float64Array; whh: Float64Array; bih: Float64Array; bhh: Float64Array; inSize: number }

// a·b over n numbers, four at a time (four running sums keep the CPU busy)
function dot(a: Float64Array, ao: number, b: Float64Array, bo: number, n: number): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, i = 0
  for (; i + 3 < n; i += 4) {
    s0 += a[ao + i] * b[bo + i]; s1 += a[ao + i + 1] * b[bo + i + 1]
    s2 += a[ao + i + 2] * b[bo + i + 2]; s3 += a[ao + i + 3] * b[bo + i + 3]
  }
  for (; i < n; i++) s0 += a[ao + i] * b[bo + i]
  return (s0 + s1) + (s2 + s3)
}

export class HandModel {
  private readonly H: number
  private readonly E: number
  private readonly inp: { w: Float64Array; b: Float64Array }
  private readonly out: { w: Float64Array; b: number }
  private readonly layers: { fwd: Gru; bwd: Gru }[] = []
  private readonly sureZ: number | undefined

  constructor(m: HandModelWeights) {
    if (m.featureVersion !== FEATURE_VERSION || m.features !== FEATURES) throw new Error('hand model trained on other features')
    const f = (k: string) => Float64Array.from(m.weights[k].data)
    this.H = m.hidden; this.E = m.embed; this.sureZ = m.sureZ
    this.inp = { w: f('inp.weight'), b: f('inp.bias') }
    this.out = { w: f('out.weight'), b: f('out.bias')[0] }
    for (let l = 0; l < m.layers; l++) {
      const g = (sfx: string): Gru => ({
        wih: f(`gru.weight_ih_l${l}${sfx}`), whh: f(`gru.weight_hh_l${l}${sfx}`),
        bih: f(`gru.bias_ih_l${l}${sfx}`), bhh: f(`gru.bias_hh_l${l}${sfx}`),
        inSize: l === 0 ? m.embed : 2 * m.hidden,
      })
      this.layers.push({ fwd: g(''), bwd: g('_reverse') })
    }
  }

  /** The model's hand for every note, in the order given. */
  read(notes: FeatureNote[], engine: EngineRead[]): ModelRead[] {
    const N = notes.length
    if (!N) return []
    const order = playingOrder(notes)
    const x = noteFeatures(notes, engine, order)
    const { H, E } = this

    // input layer
    let seq = new Float64Array(N * E)
    for (let t = 0; t < N; t++) {
      for (let o = 0; o < E; o++) {
        let s = this.inp.b[o]
        const wr = o * FEATURES, xr = t * FEATURES
        for (let i = 0; i < FEATURES; i++) s += this.inp.w[wr + i] * x[xr + i]
        seq[t * E + o] = s > 0 ? s : 0
      }
    }
    let width = E
    for (const layer of this.layers) {
      const next = new Float64Array(N * 2 * H)
      this.run(layer.fwd, seq, width, N, next, 0, false)
      this.run(layer.bwd, seq, width, N, next, H, true)
      seq = next; width = 2 * H
    }

    const res: ModelRead[] = new Array(N)
    for (let t = 0; t < N; t++) {
      let s = this.out.b
      for (let i = 0; i < width; i++) s += this.out.w[i] * seq[t * width + i]
      const right = 1 / (1 + Math.exp(-s))
      // sure (sureZ) lands on 0.9, the engine's "sure"; a coin toss on 0
      const z = Math.abs(s)
      const confidence = this.sureZ ? z / (z + this.sureZ / 9) : Math.abs(2 * right - 1)
      res[order[t]] = { hand: s >= 0 ? 'R' : 'L', confidence, right }
    }
    return res
  }

  // One direction of a GRU layer (PyTorch's gates: reset, update, new).
  private run(g: Gru, input: Float64Array, inSize: number, N: number, out: Float64Array, outOff: number, reverse: boolean): void {
    const H = this.H, H3 = 3 * H, outW = 2 * H
    const { wih, whh, bih, bhh } = g
    // the input's share of every gate, for every note at once (no waiting on h)
    const gi = new Float64Array(N * H3)
    for (let t = 0; t < N; t++) {
      const xr = t * inSize, gr = t * H3
      for (let o = 0; o < H3; o++) {
        gi[gr + o] = bih[o] + dot(wih, o * inSize, input, xr, inSize)
      }
    }
    const h = new Float64Array(H), gh = new Float64Array(H3)
    for (let step = 0; step < N; step++) {
      const t = reverse ? N - 1 - step : step
      for (let o = 0; o < H3; o++) {
        gh[o] = bhh[o] + dot(whh, o * H, h, 0, H)
      }
      const gr = t * H3, orow = t * outW + outOff
      for (let k = 0; k < H; k++) {
        const r = 1 / (1 + Math.exp(-(gi[gr + k] + gh[k])))
        const z = 1 / (1 + Math.exp(-(gi[gr + H + k] + gh[H + k])))
        const n = Math.tanh(gi[gr + 2 * H + k] + r * gh[2 * H + k])
        const v = (1 - z) * n + z * h[k]
        h[k] = v
        out[orow + k] = v
      }
    }
  }
}
