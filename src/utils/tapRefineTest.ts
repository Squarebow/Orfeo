import type { ParsedMidi } from '../types'
import { refineToNotes, matchFileBeat } from './tapRefine'

// Synthetic song: 120 bpm drums (kick on 1&3, snare on 2&4, hats on 8ths)
// + a bass note on every beat, from 0 to 40 s. Optional swing/noise.
function song(opts: { bpm?: number; jitterMs?: number; drums?: boolean; sparse?: boolean } = {}): ParsedMidi {
  const p = 60 / (opts.bpm ?? 120)
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
  const j = () => ((opts.jitterMs ?? 0) / 1000) * rnd() * 2
  const drumNotes: any[] = [], bassNotes: any[] = [], padNotes: any[] = []
  for (let k = 0; k * p < 40; k++) {
    const t = k * p
    if (opts.sparse) { if (k % 16 === 0) padNotes.push({ time: t + 0.3, duration: 4, midi: 60, velocity: 0.5 }); continue }
    if (opts.drums !== false) {
      drumNotes.push({ time: t + j(), duration: 0.1, midi: k % 2 === 0 ? 36 : 38, velocity: 0.9 })
      drumNotes.push({ time: t + j(), duration: 0.05, midi: 42, velocity: 0.5 })
      drumNotes.push({ time: t + p / 2 + j(), duration: 0.05, midi: 42, velocity: 0.4 })
    }
    bassNotes.push({ time: t + j(), duration: p * 0.9, midi: 36 + (k % 4), velocity: 0.8 })
  }
  return {
    fileName: 's.mid', duration: 40, bpm: 60, timeSignatureNumerator: 4, timeSignatureDenominator: 4, noteCount: 0,
    tracks: [
      { index: 0, name: 'drums', gmName: 'Drums', program: 0, group: 'Drums', isDrum: true, color: '', channel: 9, notes: drumNotes },
      { index: 1, name: 'bass', gmName: 'Bass', program: 33, group: 'Bass', isDrum: false, color: '', channel: 1, notes: bassNotes },
      { index: 2, name: 'pad', gmName: 'Pad', program: 89, group: 'Synth Pad', isDrum: false, color: '', channel: 2, notes: padNotes },
    ],
  } as unknown as ParsedMidi
}

export function runTapRefineTest(): number {
  console.group('[tapRefine] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

  // taps 35 ms late and 1% slow -> grid snaps back onto the drums
  const s1 = song()
  const r1 = refineToNotes(s1, { period: 0.505, anchor: 10.035 }, 10, 40)
  const k = Math.round((20 - r1.anchor) / r1.period)
  check(r1.snapped && near(r1.period, 0.5, 0.0005), `tempo snapped, got ${r1.period}`)
  check(near(r1.anchor + k * r1.period, 20, 0.003), `beat at 20 s lands on the drums, got ${(r1.anchor + k * r1.period).toFixed(4)}`)

  // humanised playing (±10 ms) still snaps within a few ms
  const r2 = refineToNotes(song({ jitterMs: 10 }), { period: 0.497, anchor: 9.97 }, 10, 40)
  const k2 = Math.round((25 - r2.anchor) / r2.period)
  check(r2.snapped && near(r2.anchor + k2 * r2.period, 25, 0.006), `jittered snap, got ${(r2.anchor + k2 * r2.period).toFixed(4)}`)

  // the first tapped beat stays the "1": refinement never slides a whole beat
  check(near(r1.anchor, 10, 0.01), `anchor stays near the tapped 1, got ${r1.anchor}`)

  // bass only (no drums) still snaps
  const r3 = refineToNotes(song({ drums: false }), { period: 0.5, anchor: 10.04 }, 10, 40)
  check(r3.snapped && near(r3.anchor, 10, 0.004), `bass-only snap, got ${r3.anchor}`)

  // nothing rhythmic to lock onto -> taps are kept as they were
  const r4 = refineToNotes(song({ sparse: true }), { period: 0.5, anchor: 10.04 }, 10, 40)
  check(!r4.snapped && r4.period === 0.5 && r4.anchor === 10.04, 'sparse song keeps the taps')

  // file-beat match: tapped beat = every 2nd file beat, on the beat -> ratio 2
  const fileBeats = Array.from({ length: 200 }, (_, i) => i * 0.316)
  check(matchFileBeat(fileBeats, 0.632, 6.32, 6) === 2, 'half-speed match')
  check(matchFileBeat(fileBeats, 0.316, 6.32, 6) === 1, 'same-speed match')
  check(matchFileBeat(fileBeats, 0.158, 6.32, 6) === 0.5, 'double-speed match')
  check(matchFileBeat(fileBeats, 0.632, 6.32 + 0.15, 6) === null, 'off the file beat -> no match')
  check(matchFileBeat(fileBeats, 0.65, 6.32, 6) === null, 'different tempo -> no match')

  console.log(`tapRefine: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
