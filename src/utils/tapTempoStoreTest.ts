import { useStore } from '../store'
import type { ParsedMidi } from '../types'
import { songKey } from './songIdentity'

// Store-level Tap Tempo wiring: stored corrections apply on load, live grid
// swaps don't reset playback, and a load ends any live session.
function fakeMidi(bytes: number[]): ParsedMidi {
  const beats = Array.from({ length: 45 }, (_, i) => i)
  return {
    fileName: 't.mid', duration: 40, bpm: 60, timeSignatureNumerator: 4, timeSignatureDenominator: 4,
    tracks: [], noteCount: 0,
    _beatTimes: beats, _barTimes: beats.filter(b => b % 4 === 0), _tempoMap: [{ bpm: 60, time: 0 }],
    ...({ _barStarts: beats.filter(b => b % 4 === 0), _timeSigMap: [{ num: 4, den: 4, time: 0 }], _raw: new Uint8Array(bytes).buffer } as any),
  } as ParsedMidi
}

export function runTapTempoStoreTest(): number {
  console.group('[tapTempo store] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const S = () => useStore.getState() as any
  const seg = { start: 0, anchor: 1.3, period: 0.65, beatsPerBar: 4, den: 4 }

  // 1. no correction stored -> file grid, songKey set
  const a = fakeMidi([1, 2, 3])
  S().setMidi(a)
  check(S().songKey === songKey((a as any)._raw), `songKey set, got ${S().songKey}`)
  check(S().midi._beatTimes.length === 45 && S().barStarts[1] === 4, 'file grid when uncorrected')

  // 2. stored correction applies on load; bpm/originalBpm stay the file's
  S().setTempoCorrections({ [songKey((a as any)._raw)]: { segments: [seg] } })
  check(near(S().midi._barTimes[0], 1.3), 'setTempoCorrections reapplies to the loaded song')
  S().setMidi(fakeMidi([1, 2, 3]))
  check(near(S().midi._barTimes[0], 1.3) && near(S().barStarts[0], 1.3), 'correction applied on load')
  check(S().bpm === 60 && S().originalBpm === 60, 'bpm/originalBpm untouched')

  // 3. setBeatGrid swaps the grid without resetting playback
  useStore.setState({ currentTime: 12.5, playbackState: 'playing' } as any)
  S().setSongCorrection(S().songKey, null)
  check(S().midi._beatTimes.length === 45, 'setSongCorrection(null) restores file grid')
  check(S().currentTime === 12.5 && S().playbackState === 'playing', 'grid swap keeps playback running')
  check(!(S().songKey in S().tempoCorrections), 'reset removes the stored entry')

  // 4. loading a file ends a live session and restores the metronome
  S().setMetronomeEnabled(true)
  S().setTapSession({ phase: 'preview', start: 0, taps: [], segment: seg, prevMetronome: false, message: null, lastTapAt: 0 })
  S().setMidi(fakeMidi([9, 9, 9]))
  check(S().tapSession === null && S().metronomeEnabled === false, 'load ends session, metronome restored')
  S().setTapSession({ phase: 'armed', start: 0, taps: [], segment: null, prevMetronome: true, message: null, lastTapAt: 0 })
  S().setMidi(null)
  check(S().tapSession === null && S().songKey === null && S().metronomeEnabled === true, 'unload ends session too')

  console.log(`tapTempo store: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
