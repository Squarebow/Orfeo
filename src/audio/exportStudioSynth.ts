// ── Export to audio: the Studio synth ───────────────────────────────────────
// Plays an ExportSong offline through its own Samples synth (spessasynth, the
// same synth the Studio engine runs — never the live one, so playback is
// untouched). Mixing mirrors the live engine: applyTrackMix (CC7/11/10/91/93
// per channel), song volume moves under the fader (setChannelVolume /
// songVolume.ts), GeneralUser under any extra set.
//
// A song can be played in sections side by side (exportStudio.worker.ts, one
// per processor core) and joined: planSections cuts it, renderStudioSynth plays
// one section, joinSections puts them back together. Nothing here touches the
// app, so it runs the same in a worker.
import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core'
import type { ExportSong } from './exportSong'
import { EXPORT_RATE, TAIL_SEC, yieldToPage, type Stereo } from './exportEncode'

// 128-sample blocks, as the live engine plays them: block size shapes the sound
const BLOCK = 128
const YIELD_EVERY = EXPORT_RATE / 2   // let the UI breathe every ~0.5 s of audio
// A section starts early enough that whatever is sounding at its join is already
// playing: every note still held (or pedalled, or ringing out) there from its own
// start, and at least LEAD_SEC of the song before it, so the reverb is ringing too
const LEAD_SEC = 4
const RING_SEC = 6                    // a let-go note's release, a cymbal's ring
// Joins are blended over 50 ms, so even a reverb tail that differs a hair can't click
const BLEND = Math.round(0.05 * EXPORT_RATE)

const cc127 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 127)
const grid = (f: number) => Math.floor(f / BLOCK) * BLOCK

/** In samples: plays from `from`, keeps `start`..`end` (plus the blend into the next) */
export interface Section { from: number; start: number; end: number }

/** When each note starts and stops sounding, in seconds: a note let go under the
 *  sustain pedal sounds until the pedal comes up; one never let go, to the end */
function noteSpans(song: ExportSong): { on: number; off: number }[] {
  const spans: { on: number; off: number }[] = []
  const held = new Map<number, number[]>()                       // channel*128+key → start times
  const pedalled: { on: number }[][] = Array.from({ length: 16 }, () => [])
  const pedal = new Array(16).fill(false)
  for (const e of song.events) {
    const kind = e.status & 0xf0, ch = e.status & 0x0f
    if (kind === 0x90 && e.d2 > 0) {
      const k = ch * 128 + e.d1
      const list = held.get(k)
      if (list) list.push(e.time); else held.set(k, [e.time])
    } else if (kind === 0x80 || kind === 0x90) {
      const on = held.get(ch * 128 + e.d1)?.shift()
      if (on === undefined) continue
      if (pedal[ch]) pedalled[ch].push({ on })
      else spans.push({ on, off: e.time })
    } else if (kind === 0xb0 && e.d1 === 64) {
      pedal[ch] = e.d2 >= 64
      if (!pedal[ch]) { for (const n of pedalled[ch]) spans.push({ on: n.on, off: e.time }); pedalled[ch] = [] }
    }
  }
  const end = song.duration + TAIL_SEC
  for (const list of held.values()) for (const on of list) spans.push({ on, off: end })
  for (const list of pedalled) for (const n of list) spans.push({ on: n.on, off: end })
  return spans
}

/** The song (plus the tail) cut into `parts` sections on the block grid */
export function planSections(song: ExportSong, parts: number): Section[] {
  const total = Math.round((song.duration + TAIL_SEC) * EXPORT_RATE)
  const starts = Array.from({ length: parts }, (_, k) => grid(total * k / parts))
  const spans = noteSpans(song)
  return starts.map((start, k) => {
    const t = start / EXPORT_RATE
    let from = start - LEAD_SEC * EXPORT_RATE
    for (const n of spans) if (n.on < t && n.off + RING_SEC > t) from = Math.min(from, n.on * EXPORT_RATE)
    return { from: Math.max(0, grid(from)), start, end: k + 1 < parts ? starts[k + 1] : total }
  })
}

/** Sections back into one song, each join blended over 50 ms */
export function joinSections(parts: Stereo[], sections: Section[], total: number): Stereo {
  const L = new Float32Array(total), R = new Float32Array(total)
  sections.forEach((s, k) => {
    const p = parts[k], prev = parts[k - 1], ps = sections[k - 1]
    for (let i = s.start; i < s.end; i++) {
      let l = p.l[i - s.start], r = p.r[i - s.start]
      const into = i - s.start
      if (prev && into < BLEND && i - ps.start < prev.l.length) {
        const w = into / BLEND
        l = l * w + prev.l[i - ps.start] * (1 - w)
        r = r * w + prev.r[i - ps.start] * (1 - w)
      }
      L[i] = l; R[i] = r
    }
  })
  return { l: L, r: R, rate: EXPORT_RATE }
}

/** The synth alone: 44.1 kHz, the song plus the 2 s tail — or one section of it
 *  (its part plus the blend into the next). Empty when cancelled. */
export async function renderStudioSynth(song: ExportSong, banks: ArrayBuffer[], onProgress?: (p: number) => void, isCancelled?: () => boolean, section?: Section): Promise<Stereo> {
  const p = new SpessaSynthProcessor(EXPORT_RATE, { effectsEnabled: true, maxBufferSize: BLOCK })
  // GeneralUser first; an extra sound set on top, as the live engine layers them
  const ids = banks.map((_, i) => `bank${i}`)
  banks.forEach((b, i) => p.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(b), ids[i]))
  if (ids.length > 1) p.soundBankManager.priorityOrder = [...ids].reverse()
  await p.processorInitialized

  // Starting mix, as applyTrackMix sends it
  for (let ch = 0; ch < 16; ch++) {
    const c = song.channels[ch]
    p.controllerChange(ch, 91, c ? cc127(c.reverb) : 0)
    p.controllerChange(ch, 93, c ? cc127(c.chorus) : 0)
    if (!c) continue
    p.controllerChange(ch, 7, cc127(c.volume))   // a channel with song volume moves gets its first one at time 0
    p.controllerChange(ch, 10, Math.round(Math.max(0, Math.min(127, (c.pan + 1) * 63.5))))
  }

  const total = Math.round((song.duration + TAIL_SEC) * EXPORT_RATE)
  const from = section?.from ?? 0, start = section?.start ?? 0
  const stop = section ? Math.min(total, section.end + BLEND) : total
  const L = new Float32Array(stop - start), R = new Float32Array(stop - start)
  const leadL = new Float32Array(BLOCK), leadR = new Float32Array(BLOCK)
  const ev = song.events
  const apply = (status: number, d1: number, d2: number, notes: boolean) => {
    const kind = status & 0xf0, ch = status & 0x0f
    if (kind === 0x90) { if (notes) p.noteOn(ch, d1, d2) }
    else if (kind === 0x80) { if (notes) p.noteOff(ch, d1) }
    else if (kind === 0xc0) p.programChange(ch, d1)
    else if (kind === 0xb0) {
      // the song's volume moves play under the fader (volumeAt)
      const c = song.channels[ch]
      p.controllerChange(ch, d1 as any, d1 === 7 && c ? cc127(d2 / 127 * c.volume) : d2)
    }
  }
  // A section: the sounds, pedal and volumes set before it, without its notes
  // (planSections made sure none of them still sound by the time it's heard)
  let i = 0
  while (i < ev.length && ev[i].time <= (from - BLOCK) / EXPORT_RATE) { const e = ev[i++]; apply(e.status, e.d1, e.d2, false) }
  // ...and the reverb's and chorus's slow wobble where it would be by then (it runs
  // from the song's first sample; out of step, a section's reverb sounds different)
  const reverb = (p as any).reverbProcessor?.dattorro, chorus = (p as any).chorusProcessor
  if (from > 0 && reverb && chorus) {
    reverb.excPhase += from * reverb.excursionRate / EXPORT_RATE
    chorus.phase = (chorus.phase + from * chorus.rateInc) % 1
  }

  let sinceYield = 0
  for (let frame = from; frame < stop; frame += BLOCK) {
    if (isCancelled?.()) return { l: new Float32Array(0), r: new Float32Array(0), rate: EXPORT_RATE }
    const t = frame / EXPORT_RATE
    while (i < ev.length && ev[i].time <= t) { const e = ev[i++]; apply(e.status, e.d1, e.d2, true) }
    const n = Math.min(BLOCK, stop - frame)
    // the whole mix, effects included, added straight into the song; the
    // lead-in before a section's own part is played and let go
    if (frame >= start) p.process(L, R, frame - start, n)
    else { leadL.fill(0); leadR.fill(0); p.process(leadL, leadR, 0, n) }
    sinceYield += n
    if (sinceYield >= YIELD_EVERY) {
      sinceYield = 0
      onProgress?.(Math.min(1, (frame + n - from) / (stop - from)))
      await yieldToPage()
    }
  }
  onProgress?.(1)
  return { l: L, r: R, rate: EXPORT_RATE }
}
