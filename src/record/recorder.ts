import { create } from 'zustand'

// ── Recording your playing (after 2.0) ───────────────────────────────────────
// Every key you press and release, how hard, and your pedals, at the moment
// they happened, kept as a take. A take becomes an ordinary MIDI file
// (record/recordingToMidi.ts), so everything Orfeo does with songs works on
// it. This file is the groundwork: the take itself (pure, tested) and the
// wiring to your keyboard. The Blank and Overdub modes come on top of it.

export type RecEvent =
  | { t: number; type: 'on'; note: number; vel: number }
  | { t: number; type: 'off'; note: number }
  | { t: number; type: 'cc'; cc: number; value: number }

export interface Recording {
  events: RecEvent[]          // in time order, t in seconds from the start of the take
  duration: number            // seconds, start to stop
  bpm: number                 // the tempo the take was played to (the click), for bars
  timeSig: [number, number]
  startedAt: number           // when it began (Date.now())
}

export interface TakeOptions { bpm?: number; timeSig?: [number, number] }

/** One take, fed in the moment each thing happens (performance.now() ms).
 *  Pure apart from the clock values it's given: tests feed it by hand. */
export class Take {
  private events: RecEvent[] = []
  private held = new Map<number, number>()   // note → how many presses still down (two keyboards may hold the same note)
  private pedals = new Map<number, number>()
  private readonly t0: number
  private readonly bpm: number
  private readonly timeSig: [number, number]
  private readonly startedAt: number
  private stopped: Recording | null = null

  constructor(nowMs: number, o: TakeOptions = {}, wallClock = Date.now()) {
    this.t0 = nowMs
    this.bpm = o.bpm ?? 120
    this.timeSig = o.timeSig ?? [4, 4]
    this.startedAt = wallClock
  }

  private at(ms: number) { return Math.max(0, (ms - this.t0) / 1000) }

  key(note: number, vel: number, on: boolean, ms: number): void {
    if (this.stopped) return
    if (on && vel > 0) {
      this.held.set(note, (this.held.get(note) ?? 0) + 1)
      this.events.push({ t: this.at(ms), type: 'on', note, vel })
    } else {
      const n = this.held.get(note) ?? 0
      if (n === 0) return                       // a release for a press from before the take
      if (n === 1) this.held.delete(note); else this.held.set(note, n - 1)
      this.events.push({ t: this.at(ms), type: 'off', note })
    }
  }

  pedal(cc: number, value: number, ms: number): void {
    if (this.stopped) return
    if (this.pedals.get(cc) === value) return
    this.pedals.set(cc, value)
    this.events.push({ t: this.at(ms), type: 'cc', cc, value })
  }

  get noteCount(): number { return this.events.filter(e => e.type === 'on').length }

  /** End the take: keys and pedals still down are let go at the end */
  stop(ms: number): Recording {
    if (this.stopped) return this.stopped
    const end = this.at(ms)
    for (const [note, n] of this.held) for (let i = 0; i < n; i++) this.events.push({ t: end, type: 'off', note })
    this.held.clear()
    for (const [cc, v] of this.pedals) if (v >= 64) this.events.push({ t: end, type: 'cc', cc, value: 0 })
    this.events.sort((a, b) => a.t - b.t)
    this.stopped = { events: this.events, duration: end, bpm: this.bpm, timeSig: this.timeSig, startedAt: this.startedAt }
    return this.stopped
  }
}

// ── Wiring: your keyboard into a take ────────────────────────────────────────
interface RecorderState {
  recording: boolean
  notes: number              // pressed so far (a live count)
  last: Recording | null     // the last finished take
}
export const useRecorder = create<RecorderState>(() => ({ recording: false, notes: 0, last: null }))

let take: Take | null = null
let unsubs: (() => void)[] = []

export async function startRecording(o: TakeOptions = {}): Promise<void> {
  if (take) return
  // loaded here, not at the top: the pure part above stays testable without the app
  const { onPlayedKey, onPlayedControl } = await import('../hooks/useMidiInput')
  take = new Take(performance.now(), o)
  unsubs = [
    onPlayedKey(k => { take?.key(k.note, k.vel, k.on, k.at); useRecorder.setState({ notes: take?.noteCount ?? 0 }) }),
    onPlayedControl(c => take?.pedal(c.cc, c.value, c.at)),
  ]
  useRecorder.setState({ recording: true, notes: 0 })
}

export function stopRecording(): Recording | null {
  if (!take) return null
  for (const u of unsubs) u()
  unsubs = []
  const rec = take.stop(performance.now())
  take = null
  useRecorder.setState({ recording: false, last: rec })
  return rec
}
