// ── Export to audio: finishing and file formats ─────────────────────────────
// finishAudio: from the first sound to 2 s after the song's last note, the
// whole thing raised or lowered so its loudest peak sits at -1 dBFS (one even
// level for the file, no clipping). The formats are fixed, no options:
//   WAV — 44.1 kHz, 16-bit, stereo, uncompressed PCM (CD quality)
//   MP3 — 320 kbps constant bitrate, 44.1 kHz, stereo, LAME encoder

export interface Stereo { l: Float32Array; r: Float32Array; rate: number }

// ── A short pause that lets the page (and Studio playback, which times its notes
// on this thread) take a turn. A message, not a timer: in a hidden or minimised
// window timers are slowed to once a second or less, which would stall an
// export the moment you switched to another program.
const _yieldChannel = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null
const _yieldQueue: (() => void)[] = []
if (_yieldChannel) {
  _yieldChannel.port1.onmessage = () => { _yieldQueue.shift()?.() }
  ;(_yieldChannel.port1 as any).unref?.()   // never keeps a Node test process alive
}
export function yieldToPage(): Promise<void> {
  if (!_yieldChannel) return new Promise(res => setTimeout(res, 0))
  return new Promise(res => { _yieldQueue.push(res); _yieldChannel.port2.postMessage(0) })
}

export const EXPORT_RATE = 44100
export const TAIL_SEC = 2.0
const SILENT = 1e-4                         // -80 dBFS
const TARGET_PEAK = Math.pow(10, -1 / 20)   // -1 dBFS
/** A whole file that peaks below this (−54 dBFS) is not quiet material: it is
 *  the sound floor of a render with nothing in it. Raising it to a normal level
 *  would only raise that floor — so it is refused, not amplified. */
export const MIN_USABLE_PEAK = 0.002
/** …and even a real recording is never raised further than this. Without a cap
 *  a near-silent song could be multiplied by thousands, and the "-1 dBFS so it
 *  never clips" promise would still be kept while the file itself was rubbish. */
export const MAX_BOOST_DB = 20
const MP3_KBPS = 320

/** `Stereo` plus what the pass decided: `peak` is the loudest sample *before*
 *  the gain, `gainDb` what was applied (capped at MAX_BOOST_DB). A caller that
 *  has to explain "nothing to export" and "nothing worth exporting" needs both. */
export interface Finished extends Stereo { peak: number; gainDb: number }

export function finishAudio(a: Stereo, songDuration: number): Finished {
  const n = a.l.length
  let first = 0
  while (first < n && Math.abs(a.l[first]) <= SILENT && Math.abs(a.r[first]) <= SILENT) first++
  const end = Math.min(n, Math.round((songDuration + TAIL_SEC) * a.rate))
  if (first >= end) return { l: new Float32Array(0), r: new Float32Array(0), rate: a.rate, peak: 0, gainDb: 0 }
  // in place: a window onto the rendered audio, no second copy of a whole song
  const l = a.l.subarray(first, end), r = a.r.subarray(first, end)
  let peak = 0
  for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]))
  const wanted = TARGET_PEAK / peak
  const g = wanted > 1 ? Math.min(wanted, Math.pow(10, MAX_BOOST_DB / 20)) : wanted
  for (let i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g }
  return { l, r, rate: a.rate, peak, gainDb: 20 * Math.log10(g) }
}


export function encodeWav(a: Stereo): Uint8Array {
  const n = a.l.length
  const out = new Uint8Array(44 + n * 4)
  const dv = new DataView(out.buffer)
  const str = (o: number, s: string) => { for (let i = 0; i < 4; i++) out[o + i] = s.charCodeAt(i) }
  str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE')
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true)
  dv.setUint32(24, a.rate, true); dv.setUint32(28, a.rate * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true)
  str(36, 'data'); dv.setUint32(40, n * 4, true)
  // samples through a 16-bit view (WAV is little-endian, as every machine Orfeo runs on):
  // several times faster than per-sample DataView writes, so a song doesn't stall the window
  // (a typed-array store truncates an in-range value: within one 16-bit step)
  const pcm = new Int16Array(out.buffer, 44, n * 2)
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const x = a.l[i] * 32767, y = a.r[i] * 32767
    pcm[o] = x > 32767 ? 32767 : x < -32768 ? -32768 : x
    pcm[o + 1] = y > 32767 ? 32767 : y < -32768 ? -32768 : y
  }
  return out
}

/** MP3, 320 kbps CBR, 44.1 kHz stereo — LAME (compiled to WebAssembly, via
 *  wasm-media-encoders), a second of audio per step with the page getting a
 *  turn in between; empty when cancelled */
export async function encodeMp3(a: Stereo, onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Uint8Array> {
  if (a.rate !== EXPORT_RATE) throw new Error(`MP3 export expects ${EXPORT_RATE} Hz`)
  // loaded on first use: the encoder never weighs on Orfeo's start-up
  const { createMp3Encoder } = await import('wasm-media-encoders')
  const enc = await createMp3Encoder()
  enc.configure({ sampleRate: a.rate, channels: 2, bitrate: MP3_KBPS })
  const n = a.l.length
  const chunks: Uint8Array[] = []
  for (let s = 0; s < n; s += a.rate) {
    if (isCancelled?.()) return new Uint8Array(0)
    const e = Math.min(n, s + a.rate)
    // the encoder reuses its output buffer: copy each piece out
    chunks.push(enc.encode([a.l.subarray(s, e), a.r.subarray(s, e)]).slice())
    onProgress?.(e / n)
    await yieldToPage()
  }
  chunks.push(enc.finalize().slice())
  const out = new Uint8Array(chunks.reduce((t, c) => t + c.length, 0))
  let o = 0
  for (const c of chunks) { out.set(c, o); o += c.length }
  return out
}
