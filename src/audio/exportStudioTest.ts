import { readFileSync } from 'node:fs'
import { parseMidiBuffer } from '../utils/midiParser'
import { buildExportSong } from './exportSong'
import { renderStudioSynth, planSections, joinSections } from './exportStudioSynth'
import { renderDry, useSectionWorkersForTests, type RenderNotes, type SectionWorker } from './exportStudio'
import { TAIL_SEC, type Stereo } from './exportEncode'
import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core'

// Plays a demo song through the Studio export synth (GeneralUser, as shipped)
const file = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }

export async function runExportStudioTest(): Promise<number> {
  console.group('[exportStudio] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const midi = parseMidiBuffer(file('public/Demo/Scott Joplin - The Entertainer.mid'), 'Entertainer.mid') as any
  const tracks = midi.tracks.map((t: any) => ({ index: t.index, program: t.program, muted: false, solo: false, volume: 1, pan: 0, reverb: 0, chorus: 0 }))
  const song = buildExportSong(midi, tracks, 'original')
  // the first 20 s only, to keep the check quick
  const short = { ...song, events: song.events.filter(e => e.time < 20), duration: 20 }
  const bank = file('public/GeneralUser-GS.sf2')

  let progressed = 0
  const a = await renderStudioSynth(short, [bank], p => { progressed = Math.max(progressed, p) })
  const want = (20 + TAIL_SEC) * 44100
  check(a.rate === 44100, `44.1 kHz, got ${a.rate}`)
  check(Math.abs(a.l.length - want) <= 128, `length = song + tail (${want}), got ${a.l.length}`)
  let peak = 0
  for (let i = 0; i < a.l.length; i++) peak = Math.max(peak, Math.abs(a.l[i]), Math.abs(a.r[i]))
  check(peak > 0.01, `makes sound, peak ${peak}`)
  check(progressed >= 0.99, `progress reaches the end, got ${progressed}`)

  const b = await renderStudioSynth(short, [bank])
  let same = a.l.length === b.l.length
  for (let i = 0; same && i < a.l.length; i += 97) same = a.l[i] === b.l[i] && a.r[i] === b.r[i]
  check(same, 'two renders are identical')

  let cancelledAt = 0
  const c = await renderStudioSynth(short, [bank], p => { cancelledAt = p }, () => cancelledAt > 0.2)
  check(c.l.length === 0, `cancel → empty, got ${c.l.length}`)

  // Sections, played side by side: they cover the song end to end on 128-sample blocks,
  // and a note still sounding at a join makes that section start early enough to play it
  const minute = { ...song, events: song.events.filter(e => e.time < 60), duration: 60 }
  const total = Math.round((60 + TAIL_SEC) * 44100)
  const secs = planSections(minute, 4)
  check(secs.length === 4 && secs[0].start === 0 && secs[3].end === total, 'four sections, start to end')
  check(secs.every((x, k) => k === 0 || x.start === secs[k - 1].end), 'no gaps, no overlaps')
  check(secs.every(x => x.start % 128 === 0 && x.from % 128 === 0 && x.from <= x.start), 'on the block grid, each starting at or before its own part')
  const held = { ...minute, events: [
    { time: 1, track: 0, status: 0x90, d1: 60, d2: 100 }, { time: 50, track: 0, status: 0x80, d1: 60, d2: 0 },
    { time: 40, track: 0, status: 0x90, d1: 64, d2: 100 }, { time: 41, track: 0, status: 0x80, d1: 64, d2: 0 },
  ].sort((x, y) => x.time - y.time) }
  check(planSections(held, 4)[1].from <= 44100, 'a note held across a join is played from its start')
  // a note let go while the sustain pedal is down keeps sounding until the pedal comes up
  const pedal = { ...minute, events: [
    { time: 0.5, track: 0, status: 0xb0, d1: 64, d2: 127 },
    { time: 1, track: 0, status: 0x90, d1: 60, d2: 100 }, { time: 2, track: 0, status: 0x80, d1: 60, d2: 0 },
    { time: 50, track: 0, status: 0xb0, d1: 64, d2: 0 },
  ] }
  check(planSections(pedal, 4)[1].from <= 44100, 'a pedalled note across a join is played from its start')

  // Played in sections and joined, it sounds as played in one go — reverb and chorus
  // included: level per second within 0.3 dB, and no click or jump at the joins
  const wet = { ...minute, channels: minute.channels.map(c => c && { ...c, reverb: 0.5, chorus: 0.4 }) }
  const whole = await renderStudioSynth(wet, [bank])
  const parts: any[] = []
  for (const x of secs) parts.push(await renderStudioSynth(wet, [bank], undefined, undefined, x))
  const joined = joinSections(parts, secs, total)
  check(joined.l.length === total, 'joined length = song + tail, got ' + joined.l.length)
  const energy = (x: Stereo, a: number, b: number) => { let e = 0; for (let i = a; i < b; i++) e += x.l[i] * x.l[i] + x.r[i] * x.r[i]; return e }
  let worst = 0
  for (let sec = 0; sec < 60; sec++) {
    const db = (x: Stereo) => 10 * Math.log10(energy(x, sec * 44100, (sec + 1) * 44100) + 1e-12)
    worst = Math.max(worst, Math.abs(db(joined) - db(whole)))
  }
  check(worst < 0.3, 'level per second within 0.3 dB of one go, worst ' + worst.toFixed(2) + ' dB')
  for (const x of secs.slice(1)) {
    const a = x.start - 11025, b = x.start + 11025
    let diff = 0
    for (let i = a; i < b; i++) diff += (joined.l[i] - whole.l[i]) ** 2 + (joined.r[i] - whole.r[i]) ** 2
    const rel = 10 * Math.log10(diff / energy(whole, a, b) + 1e-12)
    check(rel < -30, 'the join at ' + (x.start / 44100).toFixed(1) + ' s matches one go (' + rel.toFixed(1) + ' dB difference)')
  }

  // Same sound as the first version: level per second within 0.3 dB of the 16-channel render
  const ref = await referenceRender(wet, bank)
  let worstRef = 0
  for (let sec = 0; sec < 58; sec++) {
    const db = (x: any) => 10 * Math.log10(energy(x, sec * 44100, (sec + 1) * 44100) + 1e-12)
    worstRef = Math.max(worstRef, Math.abs(db(whole) - db(ref)))
  }
  check(worstRef < 0.3, 'level per second matches the first version within 0.3 dB, worst ' + worstRef.toFixed(2) + ' dB')


  // ── A section worker that stops without answering must not hang the export ──
  // Real memory pressure cannot be provoked in a test, so the worker is swapped
  // for a fake (useSectionWorkersForTests). What the test checks is the part
  // production depends on: an answer for every section, or one honest fallback.
  const total2 = planSections(short, 2)[1].end
  const mkFake = (mode: 'answer' | 'close' | 'error' | 'silence') => {
    const made: Fake[] = []
    type Fake = SectionWorker & { terminated?: boolean; __section?: { start: number; end: number } }
    const factory = () => {
      const w: Fake = { postMessage: () => {}, terminate: () => { w.terminated = true }, onmessage: null, onerror: null, onclose: null }
      made.push(w)
      const send = (data: unknown) => w.onmessage?.({ data } as MessageEvent)
      queueMicrotask(() => {
        const section = w.__section
        if (mode === 'answer' && section) {
          const n = section.end - section.start + 4410
          send({ l: new Float32Array(n).fill(0.5), r: new Float32Array(n).fill(-0.5) })
        } else if (mode === 'close') w.onclose?.()
        else if (mode === 'error') w.onerror?.({ message: 'section threw' } as any)
        // 'silence': never answers, never closes — a cancel has to end it
      })
      return w
    }
    return { factory, made }
  }
  const withWorkers = <T>(factory: (() => SectionWorker) | null, body: () => Promise<T>): Promise<T> => {
    useSectionWorkersForTests(factory)
    return body().finally(() => useSectionWorkersForTests(null))
  }

  await withWorkers(null, async () => {
    // sections that answer: joined audio, no fallback mentioned
    const notes: RenderNotes = {}
    const { factory, made } = mkFake('answer')
    // each fake gets its own section, so it can answer with the right length
    const one = () => {
      const w = factory()
      const post = w.postMessage.bind(w)
      w.postMessage = (m: any) => { w.__section = m.section; post(m) }
      return w
    }
    const f = withWorkers(one, () => renderDry(short, [bank], undefined, undefined, notes, 2))
    const joined = await f
    check(joined.l.length === total2, `sections answer → joined length ${joined.l.length} = ${total2}`)
    let halves = 0
    for (let i = 0; i < joined.l.length; i++) if (Math.abs(joined.l[i]) === 0.5) halves++
    check(halves > joined.l.length * 0.5, `sections answer → the joined audio is made of both parts (${halves})`)
    check(!notes.singlePass && !notes.sectionsFailedWith, 'answering sections: nothing to report')
    check(made.length === 2 && made.every(w => w.terminated), 'every section worker is terminated')

    // a worker that closes without an answer: one pass on this thread instead
    const notes2: RenderNotes = {}
    const dead = await withWorkers(mkFake('close').factory, () => renderDry(short, [bank], undefined, undefined, notes2, 2))
    check(dead.l.length > 0 && dead.l.length === total2, `worker gone without an answer → whole-song pass, ${dead.l.length} samples`)
    check(notes2.singlePass === true && /without an answer/.test(notes2.sectionsFailedWith ?? ''), 'the fallback and its reason are reported')

    // a worker that reports an error: same way out
    const notes3: RenderNotes = {}
    const errored = await withWorkers(mkFake('error').factory, () => renderDry(short, [bank], undefined, undefined, notes3, 2))
    check(errored.l.length === total2 && notes3.singlePass === true, 'worker error → whole-song pass as well')

    // a worker that says nothing at all: only a cancel ends the render, and a
    // cancelled export is not a failed one
    const notes4: RenderNotes = {}
    let cancelled = false
    const stopped = await withWorkers(mkFake('silence').factory, async () => {
      const p = renderDry(short, [bank], undefined, () => cancelled, notes4, 2)
      setTimeout(() => { cancelled = true }, 300)
      return await p
    })
    check(stopped.l.length === 0, `silent workers + cancel → empty, got ${stopped.l.length}`)
    check(!notes4.singlePass, 'a cancelled export does not claim a fallback')
  })

  console.log(`exportStudio: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}

// The first version's render, for comparison: 16 channels + effects summed by hand, events on 128-sample blocks
async function referenceRender(song: any, bank: ArrayBuffer) {
  const p = new SpessaSynthProcessor(44100, { effectsEnabled: true, maxBufferSize: 128 })
  p.soundBankManager.addSoundBank(SoundBankLoader.fromArrayBuffer(bank), 'b')
  await p.processorInitialized
  const cc = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 127)
  for (let ch = 0; ch < 16; ch++) {
    const c = song.channels[ch]
    p.controllerChange(ch, 91 as any, c ? cc(c.reverb) : 0); p.controllerChange(ch, 93 as any, c ? cc(c.chorus) : 0)
    if (!c) continue
    p.controllerChange(ch, 7 as any, cc(c.volume)); p.controllerChange(ch, 10 as any, Math.round(Math.max(0, Math.min(127, (c.pan + 1) * 63.5))))
  }
  const total = Math.round((song.duration + TAIL_SEC) * 44100)
  const L = new Float32Array(total), R = new Float32Array(total)
  const outs = Array.from({ length: 16 }, () => [new Float32Array(128), new Float32Array(128)])
  const eL = new Float32Array(128), eR = new Float32Array(128)
  let i = 0
  for (let f = 0; f < total; f += 128) {
    while (i < song.events.length && song.events[i].time <= f / 44100) {
      const { status, d1, d2 } = song.events[i++]; const k = status & 0xf0, ch = status & 15
      if (k === 0x90) p.noteOn(ch, d1, d2); else if (k === 0x80) p.noteOff(ch, d1); else if (k === 0xc0) p.programChange(ch, d1)
      else if (k === 0xb0) { const c = song.channels[ch]; p.controllerChange(ch, d1 as any, d1 === 7 && c ? cc(d2 / 127 * c.volume) : d2) }
    }
    const n = Math.min(128, total - f)
    for (const o of outs) { o[0].fill(0); o[1].fill(0) } eL.fill(0); eR.fill(0)
    p.processSplit(outs, eL, eR, 0, n)
    for (let k = 0; k < n; k++) { let l = eL[k], r = eR[k]; for (const o of outs) { l += o[0][k]; r += o[1][k] } L[f + k] = l; R[f + k] = r }
  }
  return { l: L, r: R }
}
