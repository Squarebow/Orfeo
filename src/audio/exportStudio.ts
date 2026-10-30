// ── Export to audio: the Studio sound ───────────────────────────────────────
// The song through the Studio synth (exportStudioSynth.ts) and then the Studio
// master chain. A song long enough is played in sections side by side, one
// per processor core (exportStudio.worker.ts), and joined; a short one, a big
// sound set, or a machine with few cores plays it in one go on this page.
import type { ExportSong } from './exportSong'
import { EXPORT_RATE, type Stereo } from './exportEncode'
import { renderStudioSynth, planSections, joinSections } from './exportStudioSynth'
import StudioWorker from './exportStudio.worker?worker&inline'
import { COMPRESSOR_PRESETS, SAMPLES_BOOST, COMPRESSOR_RELEASE } from '../hooks/useSamplesEngine'

const MAX_SECTIONS = 4
const MIN_SECTION_SEC = 20            // shorter, and the lead-in each section plays first outweighs the gain
const SECTIONS_MEMORY = 600e6         // each section loads its own copy of the sound sets

const EMPTY: Stereo = { l: new Float32Array(0), r: new Float32Array(0), rate: EXPORT_RATE }

function sectionCount(song: ExportSong, banks: ArrayBuffer[]): number {
  if (typeof Worker === 'undefined') return 1
  const cores = navigator.hardwareConcurrency || 1
  const bytes = banks.reduce((t, b) => t + b.byteLength, 0)
  return Math.max(1, Math.min(MAX_SECTIONS, cores - 1, Math.floor(song.duration / MIN_SECTION_SEC), Math.floor(SECTIONS_MEMORY / Math.max(1, bytes))))
}

/** The synth in sections, side by side; rejects if a section can't be played */
function renderSections(song: ExportSong, banks: ArrayBuffer[], parts: number, onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
  const sections = planSections(song, parts)
  const total = sections[sections.length - 1].end
  const work = sections.map(s => s.end - s.from)
  const workAll = work.reduce((t, w) => t + w, 0)
  const progress = new Array(parts).fill(0)
  const results: Stereo[] = []
  let left = parts
  const workers = sections.map(() => new StudioWorker())
  return new Promise((resolve, reject) => {
    const stop = () => { clearInterval(watch); for (const w of workers) w.terminate() }
    const watch = setInterval(() => { if (isCancelled?.()) { stop(); resolve(EMPTY) } }, 100)
    workers.forEach((w, k) => {
      w.onmessage = (e: MessageEvent) => {
        if (typeof e.data.progress === 'number') {
          progress[k] = e.data.progress
          onProgress?.(progress.reduce((t, p, j) => t + p * work[j], 0) / workAll)
          return
        }
        results[k] = { l: e.data.l, r: e.data.r, rate: EXPORT_RATE }
        if (--left === 0) { stop(); onProgress?.(1); resolve(joinSections(results, sections, total)) }
      }
      w.onerror = (e: ErrorEvent) => { stop(); reject(new Error(e.message || 'a section could not be played')) }
      w.postMessage({ song, banks, section: sections[k] })
    })
  })
}

/** The synth alone: in sections when it helps, else in one go (also if sections fail) */
async function renderStudioDry(song: ExportSong, banks: ArrayBuffer[], onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
  const parts = sectionCount(song, banks)
  if (parts > 1) {
    try { return await renderSections(song, banks, parts, onProgress, isCancelled) }
    catch (e) { console.warn('[export] sections failed, playing in one go:', e) }
  }
  return renderStudioSynth(song, banks, onProgress, isCancelled)
}

const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Synth + the Studio master chain (gain → tone → compressor → safety limiter),
 *  in an OfflineAudioContext with the same node settings as initSamplesEngine */
export async function renderStudio(song: ExportSong, banks: ArrayBuffer[], onProgress?: (p: number) => void, isCancelled?: () => boolean): Promise<Stereo> {
  let dry: Stereo | null = await renderStudioDry(song, banks, onProgress, isCancelled)
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
  // Tone at 0 dB and the compressor off pass the sound through untouched (as the
  // live engine keeps them wired); here they're left out, which renders faster
  const chain: AudioNode[] = [src, gain]
  if (song.master.toneDb !== 0) chain.push(tone)
  if (preset) chain.push(makeup, comp)
  chain.push(safety, ctx.destination)
  for (let k = 1; k < chain.length; k++) chain[k - 1].connect(chain[k])
  src.start()
  const out = await ctx.startRendering()
  return { l: out.getChannelData(0), r: out.getChannelData(1), rate: EXPORT_RATE }
}
