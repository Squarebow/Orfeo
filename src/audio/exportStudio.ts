// ── Export to audio: the Studio sound ───────────────────────────────────────
// Plays an ExportSong offline through its own Samples synth (spessasynth, the
// same synth the Studio engine runs — never the live one, so playback is
// untouched) and then the Studio master chain. Mixing mirrors the live engine:
// applyTrackMix (CC7/11/10/91/93 per channel), song volume moves under the
// fader (setChannelVolume / songVolume.ts), GeneralUser under any extra set.
import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core'
import type { ExportSong } from './exportSong'
import { EXPORT_RATE, TAIL_SEC, yieldToPage, type Stereo } from './exportEncode'
import { COMPRESSOR_PRESETS, SAMPLES_BOOST, COMPRESSOR_RELEASE } from '../hooks/useSamplesEngine'

const BLOCK = 128
const YIELD_EVERY = EXPORT_RATE / 2   // let the UI breathe every ~0.5 s of audio

const cc127 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 127)

/** The synth alone: 44.1 kHz, the song plus the 2 s tail. Empty when cancelled. */
export async function renderStudioSynth(song: ExportSong, banks: ArrayBuffer[], onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
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
  const L = new Float32Array(total), R = new Float32Array(total)
  const outs = Array.from({ length: 16 }, () => [new Float32Array(BLOCK), new Float32Array(BLOCK)])
  const eL = new Float32Array(BLOCK), eR = new Float32Array(BLOCK)
  const ev = song.events
  let i = 0, sinceYield = 0
  for (let frame = 0; frame < total; frame += BLOCK) {
    if (isCancelled?.()) return { l: new Float32Array(0), r: new Float32Array(0), rate: EXPORT_RATE }
    const t = frame / EXPORT_RATE
    while (i < ev.length && ev[i].time <= t) {
      const { status, d1, d2 } = ev[i++]
      const kind = status & 0xf0, ch = status & 0x0f
      if (kind === 0x90) p.noteOn(ch, d1, d2)
      else if (kind === 0x80) p.noteOff(ch, d1)
      else if (kind === 0xc0) p.programChange(ch, d1)
      else if (kind === 0xb0) {
        // the song's volume moves play under the fader (volumeAt)
        const c = song.channels[ch]
        p.controllerChange(ch, d1 as any, d1 === 7 && c ? cc127(d2 / 127 * c.volume) : d2)
      }
    }
    const n = Math.min(BLOCK, total - frame)
    for (const o of outs) { o[0].fill(0); o[1].fill(0) }
    eL.fill(0); eR.fill(0)
    p.processSplit(outs, eL, eR, 0, n)
    for (let k = 0; k < n; k++) {
      let l = eL[k], r = eR[k]
      for (const o of outs) { l += o[0][k]; r += o[1][k] }
      L[frame + k] = l; R[frame + k] = r
    }
    sinceYield += n
    if (sinceYield >= YIELD_EVERY) {
      sinceYield = 0
      onProgress?.(Math.min(1, (frame + n) / total))
      await yieldToPage()
    }
  }
  onProgress?.(1)
  return { l: L, r: R, rate: EXPORT_RATE }
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Synth + the Studio master chain (gain → tone → compressor → safety limiter),
 *  in an OfflineAudioContext with the same node settings as initSamplesEngine */
export async function renderStudio(song: ExportSong, banks: ArrayBuffer[], onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
  let dry: Stereo | null = await renderStudioSynth(song, banks, onProgress, isCancelled)
  if (!dry.l.length) return dry
  const ctx = new OfflineAudioContext(2, dry.l.length, EXPORT_RATE)
  const buf = ctx.createBuffer(2, dry.l.length, EXPORT_RATE)
  buf.copyToChannel(dry.l as Float32Array<ArrayBuffer>, 0)
  buf.copyToChannel(dry.r as Float32Array<ArrayBuffer>, 1)
  dry = null   // the synth's copy can go while the master chain renders: a long song is big
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.value = song.master.gain * SAMPLES_BOOST
  const tone = ctx.createBiquadFilter()
  tone.type = 'highshelf'; tone.frequency.value = 3000; tone.gain.value = song.master.toneDb
  const preset = song.master.comp.enabled ? COMPRESSOR_PRESETS[song.master.comp.preset] : null
  const makeup = ctx.createGain()
  makeup.gain.value = dbToGain(preset ? preset.makeupDb : 0)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = preset ? preset.threshold : 0
  comp.ratio.value = preset ? preset.ratio : 1
  comp.attack.value = preset ? preset.attack : 0.003
  comp.knee.value = preset ? preset.knee : 0
  comp.release.value = COMPRESSOR_RELEASE
  const safety = ctx.createDynamicsCompressor()
  safety.threshold.value = -1; safety.ratio.value = 20; safety.knee.value = 0
  safety.attack.value = 0.001; safety.release.value = 0.05
  src.connect(gain); gain.connect(tone); tone.connect(makeup); makeup.connect(comp); comp.connect(safety); safety.connect(ctx.destination)
  src.start()
  const out = await ctx.startRendering()
  return { l: out.getChannelData(0), r: out.getChannelData(1), rate: EXPORT_RATE }
}
