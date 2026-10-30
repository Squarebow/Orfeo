// ── Export to audio: one section of a Studio export, on its own processor core
// (exportStudio.ts sends the song, the sound sets and the section; the played
// section comes back, its memory handed over rather than copied)
import { renderStudioSynth, type Section } from './exportStudioSynth'
import type { ExportSong } from './exportSong'

self.onmessage = async (e: MessageEvent<{ song: ExportSong; banks: ArrayBuffer[]; section: Section }>) => {
  const { song, banks, section } = e.data
  const out = await renderStudioSynth(song, banks, p => self.postMessage({ progress: p }), undefined, section)
  self.postMessage({ l: out.l, r: out.r }, { transfer: [out.l.buffer, out.r.buffer] })
}
