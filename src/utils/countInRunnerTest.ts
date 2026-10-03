import { useStore } from '../store'
import type { ParsedMidi } from '../types'
import { startCountIn, cancelCountIn, isCountingIn, setCountInDeps, learnEngineStart } from './countInRunner'

function fakeMidi(): ParsedMidi {
  const beats = Array.from({ length: 200 }, (_, i) => i * 0.5)
  return {
    fileName: 't.mid', duration: 90, bpm: 120, timeSignatureNumerator: 4, timeSignatureDenominator: 4, noteCount: 1,
    tracks: [{ index: 0, notes: [{ time: 4, midi: 60, duration: 1, velocity: 0.8 }] }] as any,
    _beatTimes: beats, _barTimes: beats.filter((_, i) => i % 4 === 0), _tempoMap: [{ bpm: 120, time: 0 }],
    ...({ _barStarts: beats.filter((_, i) => i % 4 === 0), _timeSigMap: [{ num: 4, den: 4, time: 0 }], _raw: new Uint8Array([7, 7]).buffer } as any),
  } as ParsedMidi
}

export function runCountInRunnerTest(): number {
  console.group('[countInRunner] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol
  const S = () => useStore.getState() as any

  // fake audio clock + timers
  let audioNow = 100
  const clicks: { when: number; accent: boolean; stopped: boolean }[] = []
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = []
  let anchor: [number, number] | null = null
  let clicked: number | null = null
  let engineStarted: number | null = null
  let perf = 5000
  let prepared = 0
  setCountInDeps({
    now: () => audioNow,
    perfNow: () => perf,
    ctxLatency: () => 0.02,
    engineLatency: () => 0.05,
    click: (when, accent) => { const c = { when, accent, stopped: false }; clicks.push(c); return { stop: () => { c.stopped = true } } },
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t },
    clearTimer: (t: any) => { t.cleared = true },
    anchor: (a, s, c) => { anchor = [a, s]; clicked = c ?? null },
    engine: () => 'gm',
    prepare: () => { prepared++ },
    engineStartedAt: () => engineStarted,
  })

  S().setMidi(fakeMidi())
  // off -> no count-in, play proceeds as before
  S().setCountInEnabled(false)
  check(startCountIn() === false && clicks.length === 0, 'disabled -> no count-in')

  // on, 1 bar, playhead in the empty lead-in -> jumps to the first note (4 s)
  S().setCountInEnabled(true); S().setCountInBars(1)
  useStore.setState({ currentTime: 0, playbackState: 'stopped', bpm: 120, originalBpm: 120 } as any)
  check(startCountIn() === true && isCountingIn(), 'counting in')
  check(S().currentTime === 4 && S().playbackState !== 'playing', 'playhead on the first note, music not started yet')
  check(prepared === 1, 'engine prepared during the count-in')
  check(clicks.length === 4 && clicks[0].accent && near(clicks[1].when - clicks[0].when, 0.5), `4 clicks half a second apart, got ${clicks.length}`)
  const musicAt = clicks[3].when + 0.5
  // engine is started early by (engine latency - click latency) so both are heard together
  // …and by the GM engine's (prepared) start-up time (default guess 50 ms until measured)
  check(timers.length === 1 && near(timers[0].ms / 1000, (musicAt - audioNow) + 0.02 - 0.05 - 0.05, 1e-6), `start timer, got ${timers[0]?.ms}`)
  timers[0].fn()
  check(S().playbackState === 'playing' && !isCountingIn(), 'music starts when the timer fires')
  check(!!anchor && near(anchor![0], musicAt) && anchor![1] === 4, 'metronome anchored to the count-in clock')

  // cancel mid count-in: clicks silenced, no start, playhead restored
  useStore.setState({ currentTime: 30.7, playbackState: 'paused' } as any)
  clicks.length = 0; timers.length = 0
  startCountIn()
  check(S().currentTime === 30, 'mid-song: counts into the start of the bar')
  cancelCountIn()
  check(clicks.every(c => c.stopped) && timers[0].cleared && S().currentTime === 30.7 && !isCountingIn() && S().playbackState === 'paused', 'cancel silences, restores')

  // metronome on: the song's first beat is clicked by the count-in itself, on
  // exactly the same clock, and the metronome carries on from the next beat
  S().setMetronomeEnabled(true)
  useStore.setState({ currentTime: 0, playbackState: 'stopped' } as any)
  clicks.length = 0; timers.length = 0
  startCountIn()
  check(clicks.length === 5 && near(clicks[4].when - clicks[3].when, 0.5) && clicks[4].accent, `first song beat clicked, got ${clicks.length}`)
  timers[0].fn()
  check(clicked === 4, `metronome told the first beat is done, got ${clicked}`)
  S().setMetronomeEnabled(false)
  useStore.setState({ playbackState: 'stopped' } as any)

  // the engine takes time to really start (GM builds the song first): the
  // count-in learns that delay and starts the engine that much earlier
  useStore.setState({ currentTime: 0, playbackState: 'stopped' } as any)
  clicks.length = 0; timers.length = 0
  startCountIn()
  const firstDelay = timers[0].ms
  perf = 6000; timers[0].fn()                      // engine asked to start at perf 6000…
  engineStarted = 6400                              // …and really started 400 ms later
  learnEngineStart()
  useStore.setState({ currentTime: 0, playbackState: 'stopped' } as any)
  clicks.length = 0; timers.length = 0
  startCountIn()
  // the first count-in assumed GM needs 50 ms; it measured 400 -> 350 ms earlier now
  check(Math.abs((firstDelay - timers[0].ms) - 350) < 5, `next count-in starts the engine earlier, got ${firstDelay} -> ${timers[0].ms}`)
  cancelCountIn()

  // a song change during the count-in never starts the new song
  clicks.length = 0; timers.length = 0
  startCountIn()
  S().setMidi(fakeMidi())
  timers[0].fn()
  check(S().playbackState !== 'playing' && !isCountingIn(), 'loading a song cancels the count-in')

  console.log(`countInRunner: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
