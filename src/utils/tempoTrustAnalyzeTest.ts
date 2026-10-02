import { Midi } from '@tonejs/midi'
import { analyzeBuffer, needsCheck } from './tempoTrustAnalyze'
import { TRUST_VERSION } from './tempoTrust'

// A real MIDI file: drums + bass playing at ~92 bpm, but the file says 60
function wrongTempoFile(): ArrayBuffer {
  const m = new Midi()
  m.header.setTempo(60)
  const drums = m.addTrack(); drums.channel = 9
  const bass = m.addTrack(); bass.channel = 1; bass.instrument.number = 33
  for (let t = 0; t < 120; t += 0.652) {
    drums.addNote({ midi: 36, time: t, duration: 0.1, velocity: 0.9 })
    bass.addNote({ midi: 40, time: t, duration: 0.5, velocity: 0.8 })
  }
  const a = m.toArray()
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}

export function runTempoTrustAnalyzeTest(): number {
  console.group('[tempoTrustAnalyze] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const buf = wrongTempoFile()
  const r = analyzeBuffer(buf)
  check(r.flagged && r.hintBpm !== null && Math.abs(r.hintBpm - 92) <= 1 && r.fileBpm === 60, `wrong tempo flagged, got ${JSON.stringify(r)}`)

  // a kept Tap Tempo that fixes it -> no warning
  const fixed = analyzeBuffer(buf, { segments: [{ start: 0, anchor: 0, period: 0.652, beatsPerBar: 4, den: 4 }] })
  check(!fixed.flagged, `fixed by correction, got ${JSON.stringify(fixed)}`)

  // garbage bytes -> a "couldn't check" result, never a throw
  let threw = false, junk: any = null
  try { junk = analyzeBuffer(new Uint8Array([1, 2, 3, 4]).buffer) } catch { threw = true }
  check(!threw && junk && !junk.flagged, 'broken file -> not flagged, no throw')

  // which library files need (re)checking
  const stat = { path: 'a.mid', size: 100, mtime: 5 }
  check(needsCheck(undefined, stat, {}, TRUST_VERSION), 'unknown file needs a check')
  const idx = { size: 100, mtime: 5, songKey: 'k' }
  check(!needsCheck(idx, stat, { k: { ...r, v: TRUST_VERSION } }, TRUST_VERSION), 'unchanged + cached -> no check')
  check(needsCheck(idx, { ...stat, mtime: 6 }, { k: { ...r, v: TRUST_VERSION } }, TRUST_VERSION), 'changed on disk -> check')
  check(needsCheck(idx, stat, { k: { ...r, v: TRUST_VERSION - 1 } }, TRUST_VERSION), 'older detector -> check')
  check(needsCheck(idx, stat, {}, TRUST_VERSION), 'no cached result -> check')

  console.log(`tempoTrustAnalyze: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
