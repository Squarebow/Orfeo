import { finishAudio, encodeWav, encodeMp3, encodeMp3Async, yieldToPage, type Stereo } from './exportEncode'

const RATE = 44100
function signal(parts: { sec: number; amp: number }[]): Stereo {
  const n = parts.reduce((s, p) => s + Math.round(p.sec * RATE), 0)
  const l = new Float32Array(n), r = new Float32Array(n)
  let i = 0
  for (const p of parts) {
    const m = Math.round(p.sec * RATE)
    for (let k = 0; k < m; k++, i++) { const v = p.amp * Math.sin(2 * Math.PI * 440 * k / RATE); l[i] = v; r[i] = v * 0.5 }
  }
  return { l, r, rate: RATE }
}
const peak = (a: Stereo) => { let p = 0; for (let i = 0; i < a.l.length; i++) p = Math.max(p, Math.abs(a.l[i]), Math.abs(a.r[i])); return p }

export async function runExportEncodeTest(): Promise<number> {
  console.group('[exportEncode] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // 1. 1 s silence + 1 s sine + 5 s silence, song ends at 2 s:
  //    starts at the sound, ends 2 s after the song, loudest peak at -1 dBFS
  const f = finishAudio(signal([{ sec: 1, amp: 0 }, { sec: 1, amp: 0.5 }, { sec: 5, amp: 0 }]), 2)
  const first = f.l.findIndex(v => Math.abs(v) > 1e-6)
  check(first >= 0 && first <= RATE * 0.001, `starts at the sound, first sample ${first}`)
  const want = Math.round((2 - 1 + 2.0) * RATE)
  check(Math.abs(f.l.length - want) <= 1, `length = 3 s (${want}), got ${f.l.length}`)
  check(Math.abs(peak(f) - Math.pow(10, -1 / 20)) <= 1e-4, `peak at -1 dBFS, got ${peak(f)}`)
  const side = (x: Float32Array) => { let p = 0; for (const v of x) p = Math.max(p, Math.abs(v)); return p }
  check(Math.abs(side(f.r) / side(f.l) - 0.5) < 1e-3, 'both sides scaled alike')

  // 1b. No second copy of a whole song: the finished audio is a window onto the rendered one
  const src = signal([{ sec: 1, amp: 0 }, { sec: 1, amp: 0.5 }, { sec: 5, amp: 0 }])
  const fin = finishAudio(src, 2)
  check(fin.l.buffer === src.l.buffer && fin.r.buffer === src.r.buffer, 'finishing works in place (no copy)')

  // 2. silence only: nothing left
  check(finishAudio(signal([{ sec: 1, amp: 0 }]), 1).l.length === 0, 'silence → empty')

  // 3. WAV: 44-byte header, PCM 16-bit stereo 44.1 kHz, data = samples × 4
  const one = signal([{ sec: 1, amp: 0.5 }])
  const w = encodeWav(one)
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength)
  const str = (o: number) => String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3])
  check(str(0) === 'RIFF' && str(8) === 'WAVE' && str(12) === 'fmt ' && str(36) === 'data', 'RIFF/WAVE/fmt/data')
  check(dv.getUint16(20, true) === 1 && dv.getUint16(22, true) === 2 && dv.getUint32(24, true) === 44100 && dv.getUint16(34, true) === 16, 'PCM, 2 ch, 44100 Hz, 16-bit')
  check(dv.getUint32(40, true) === one.l.length * 4 && w.length === 44 + one.l.length * 4, `data length ${dv.getUint32(40, true)}`)
  check(Math.abs(dv.getInt16(44 + 4 * 25, true) / 32767 - one.l[25]) < 1 / 32767 + 1e-6, 'samples written as 16-bit')

  // 4. MP3: first frame is MPEG-1 Layer III, 320 kbps, 44.1 kHz
  const m = encodeMp3(one)
  const s = m.findIndex((b, i) => b === 0xff && (m[i + 1] & 0xe0) === 0xe0)
  check(s >= 0, 'has an MP3 frame')
  check(s >= 0 && (m[s + 1] & 0x1e) === 0x1a, `MPEG-1 Layer III, got ${m[s + 1]?.toString(16)}`)
  check(s >= 0 && (m[s + 2] >> 4) === 14, `320 kbps (index 14), got ${m[s + 2] >> 4}`)
  check(s >= 0 && ((m[s + 2] >> 2) & 3) === 0, '44.1 kHz')
  // ~40 kB per second at 320 kbps
  check(m.length > 38000 && m.length < 44000, `size for 1 s at 320 kbps, got ${m.length}`)
  // cancelled straight away: nothing
  check(encodeMp3(one, undefined, () => true).length === 0, 'cancel → empty')

  // 5. The responsive version gives the same file, and yields to the page while it works
  const three = signal([{ sec: 3, amp: 0.5 }])
  let ticks = 0
  const timer = setInterval(() => ticks++, 0)
  const async = await encodeMp3Async(three)
  clearInterval(timer)
  const sync = encodeMp3(three)
  check(async.length === sync.length && async.every((b, i) => b === sync[i]), 'async MP3 = sync MP3, byte for byte')
  check(ticks > 0, `the page gets turns while encoding (${ticks})`)
  check((await encodeMp3Async(three, undefined, () => true)).length === 0, 'async cancel → empty')

  // 6. A whole song finishes and writes quickly (the window mustn't stall during an export)
  const long = { l: new Float32Array(44100 * 256), r: new Float32Array(44100 * 256), rate: RATE }
  for (let i = 0; i < long.l.length; i++) { long.l[i] = Math.sin(i / 30) * 0.3; long.r[i] = long.l[i] }
  let t = performance.now()
  const lf = finishAudio(long, 254)
  const tFinish = performance.now() - t
  t = performance.now()
  encodeWav(lf)
  const tWav = performance.now() - t
  check(tFinish + tWav < 200, `finish + WAV of a 4-minute song under 200 ms, took ${Math.round(tFinish)} + ${Math.round(tWav)} ms`)

  // 7. Pauses don't depend on timers (a hidden window slows timers to a crawl)
  const realTimeout = globalThis.setTimeout
  ;(globalThis as any).setTimeout = () => 0
  const outcome = await Promise.race([yieldToPage().then(() => 'ok'), new Promise(r => setImmediate(() => setImmediate(() => setImmediate(() => r('stuck')))))])
  globalThis.setTimeout = realTimeout
  check(outcome === 'ok', 'a pause finishes without timers, got ' + outcome)

  console.log(`exportEncode: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
