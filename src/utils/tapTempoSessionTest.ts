import { useStore } from '../store'
import type { ParsedMidi } from '../types'
import {
  armTapSession, registerTap, finishTapping, shiftPreviewDownbeat, keepTap, tapAgain,
  cancelTap, resetSongTempo, isTapCapturing, setTapLatencyProvider, tappingInterrupted, interruptTapping, noteClockTick,
} from './tapTempoSession'

function fakeMidi(): ParsedMidi {
  const beats = Array.from({ length: 45 }, (_, i) => i)
  return {
    fileName: 't.mid', duration: 40, bpm: 60, timeSignatureNumerator: 4, timeSignatureDenominator: 4,
    tracks: [], noteCount: 0,
    _beatTimes: beats, _barTimes: beats.filter(b => b % 4 === 0), _tempoMap: [{ bpm: 60, time: 0 }],
    ...({ _barStarts: beats.filter(b => b % 4 === 0), _timeSigMap: [{ num: 4, den: 4, time: 0 }], _raw: new Uint8Array([4, 5, 6]).buffer } as any),
  } as ParsedMidi
}

export function runTapTempoSessionTest(): number {
  console.group('[tapTempo session] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol
  const S = () => useStore.getState() as any
  const tapAt = (t: number) => { useStore.setState({ currentTime: t } as any); registerTap() }

  setTapLatencyProvider(() => 0)
  S().setMidi(fakeMidi())
  S().setMetronomeEnabled(false)

  // arm while stopped at 13 s: starts ~2 bars early (bar at 12 -> run-in bar 4)
  useStore.setState({ currentTime: 13, playbackState: 'stopped' } as any)
  armTapSession()
  check(S().tapSession?.phase === 'armed' && S().tapSession.start === 13, 'armed with start = playhead')
  check(S().playbackState === 'playing' && S().currentTime === 4, `run-in two bars early, got ${S().currentTime}`)
  check(isTapCapturing(), 'capturing while armed')

  // too few taps -> message, still armed
  tapAt(14); tapAt(14.65); finishTapping()
  check(S().tapSession.phase === 'armed' && !!S().tapSession.message && S().tapSession.taps.length === 2, 'need 4 taps keeps taps')

  // 8 steady taps at 92.3 bpm -> preview, metronome forced on, grid live
  tapAgain()
  for (let i = 0; i < 8; i++) tapAt(14 + i * 0.65)
  check(S().tapSession.phase === 'tapping', 'tapping phase')
  finishTapping()
  const ses = S().tapSession
  check(ses.phase === 'preview' && near(ses.segment.period, 0.65) && near(ses.segment.start, 13), 'preview segment from start')
  check(S().metronomeEnabled === true, 'metronome forced on in preview')
  check(S().midi._barTimes.some((b: number) => near(b, 14)), 'live grid has a bar on the first tap')
  check(S().midi._beatTimes.includes(12) && !S().midi._beatTimes.includes(13), 'file grid kept before the start point')
  check(!isTapCapturing(), 'not capturing in preview')

  // shift the 1 later by a beat
  shiftPreviewDownbeat(1)
  check(S().midi._barTimes.some((b: number) => near(b, 14.65)) && !S().midi._barTimes.some((b: number) => near(b, 14)), 'shift moves bars')

  // cancel restores file grid + metronome
  cancelTap()
  check(S().tapSession === null && S().midi._beatTimes.includes(13) && S().metronomeEnabled === false, 'cancel restores')

  // full run + keep -> persisted, metronome restored
  armTapSession()
  for (let i = 0; i < 6; i++) tapAt(20 + i * 0.65)
  finishTapping(); keepTap()
  check(S().tapSession === null && !!S().tempoCorrections[S().songKey], 'keep stores correction')
  check(S().metronomeEnabled === false, 'keep restores metronome')
  check(S().midi._barTimes.some((b: number) => near(b, 20)), 'kept grid live')

  // reset
  resetSongTempo()
  check(!S().tempoCorrections[S().songKey] && S().midi._beatTimes.includes(20), 'reset restores file grid')

  // heard-time latency: playhead minus device delay × speed
  setTapLatencyProvider(() => 0.1)
  armTapSession(); tapAt(30)
  check(near(S().tapSession.taps[0], 29.9), `latency compensated, got ${S().tapSession.taps[0]}`)
  cancelTap()
  setTapLatencyProvider(() => 0)

  // interruption rule (loop wrap / seek / stop)
  const st = (currentTime: number, playbackState = 'playing') => ({ currentTime, playbackState })
  check(tappingInterrupted(st(10), st(10.016)) === false, 'normal frame advance')
  check(tappingInterrupted(st(10), st(4)) === true, 'loop wrap / seek back')
  check(tappingInterrupted(st(10), st(15)) === true, 'seek forward')
  check(tappingInterrupted(st(10), st(10, 'paused')) === true, 'pause/stop')

  // interruption with >=4 taps that don't fit -> session ends (spec §3.2), not left armed
  useStore.setState({ currentTime: 30, playbackState: 'playing' } as any)
  armTapSession()
  ;[30, 30.2, 31.9, 32.0, 34.5].forEach(tapAt)
  interruptTapping()
  check(S().tapSession === null, `failed fit on interrupt cancels, got ${JSON.stringify(S().tapSession?.phase)}`)
  // interruption with a good fit -> preview
  armTapSession(); for (let i = 0; i < 5; i++) tapAt(30 + i * 0.6)
  interruptTapping()
  check(S().tapSession?.phase === 'preview', 'good fit on interrupt previews')
  // Tap again puts the metronome back the way the user had it while re-tapping
  tapAgain()
  check(S().metronomeEnabled === false && S().tapSession?.phase === 'armed', 'tap again restores metronome')
  cancelTap()

  // taps between animation frames are extrapolated from the last playhead tick
  useStore.setState({ currentTime: 50, playbackState: 'playing' } as any)
  armTapSession()
  noteClockTick(performance.now() - 12)
  registerTap()
  const tt = S().tapSession.taps[0]
  check(tt > 50.008 && tt < 50.03, `extrapolated tap time, got ${tt}`)
  noteClockTick(performance.now() - 500) // stale tick: extrapolation capped
  registerTap()
  check(S().tapSession.taps[1] <= 50.051, `extrapolation capped, got ${S().tapSession.taps[1]}`)
  cancelTap()

  console.log(`tapTempo session: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
