import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'
import type { SoundfontId, SoundfontInfo } from '../types'
import { initSamplesEngine, loadSelectedSoundfont } from './useSamplesEngine'
import { measuredOutputLatencySec } from '../audio/engine'
import { stopNative, useNativeAudio } from '../audio/nativeClient'

// ── Sound sets + Samples loading — one shared copy for the drawer's Quick
// Settings and the Settings window (both show the same status). ──────────
interface SfState {
  samplesStatus: 'idle' | 'loading' | 'ready' | 'error'
  samplesProgress: number
  extra: SoundfontInfo[]
  downloads: Record<string, number>  // sound sets downloading now, each with its own progress
  error: string | null
}
export const useSoundfontState = create<SfState>(() => ({
  samplesStatus: 'idle', samplesProgress: 0, extra: [], downloads: {}, error: null,
}))
const setSf = (p: Partial<SfState>) => useSoundfontState.setState(p)

// One sound set's progress, the others untouched; finished ones leave the list
export function withDownloadProgress(downloads: Record<string, number>, id: string, progress: number): Record<string, number> {
  const { [id]: _done, ...others } = downloads
  return progress >= 1 ? others : { ...others, [id]: progress }
}
const setDownload = (id: string, progress: number) =>
  setSf({ downloads: withDownloadProgress(useSoundfontState.getState().downloads, id, progress) })

export const allSoundfonts = (extra: SoundfontInfo[]): SoundfontInfo[] => [
  { id: 'generaluser-gs', name: 'GeneralUser GS', sizeMB: 30.8, downloaded: true },
  ...extra,
]

// Loads the Samples engine (first use this session) and switches to it.
export async function startSamples(): Promise<boolean> {
  const sf = useSoundfontState.getState()
  const st = useStore.getState()
  // The native engine may hold the sound card exclusively — let go of it first
  if (st.audioEngine === 'native') await stopNative()
  if (sf.samplesStatus === 'ready') { st.setAudioEngine('samples'); st.setSamplesIntroduced(true); return true }
  if (sf.samplesStatus === 'loading') return false
  setSf({ samplesStatus: 'loading', samplesProgress: 0 })
  try {
    await initSamplesEngine((p) => setSf({ samplesProgress: p }))
    setSf({ samplesStatus: 'ready' })
    useStore.getState().setAudioEngine('samples')
    useStore.getState().setSamplesIntroduced(true)
    return true
  } catch (e) {
    console.error('[Orfeo Samples] init failed:', e)
    setSf({ samplesStatus: 'error' })
    useStore.getState().openSettingsWindow('audio')
    return false
  }
}

// Quick Settings' Samples button: the very first time, open the Settings
// window on Audio so the loading (and any error) is visible there.
export function chooseSamplesFromQuick() {
  const st = useStore.getState()
  if (st.audioEngine === 'samples') return
  if (!st.samplesIntroduced) st.openSettingsWindow('audio')
  void startSamples()
}

export function refreshSoundfonts() {
  window.electronAPI.listSoundfonts().then((extra) => setSf({ extra })).catch(() => {})
}
export async function selectSoundfont(id: SoundfontId) {
  useStore.getState().setSelectedSoundfont(id)
  if (useStore.getState().audioEngine === 'samples') loadSelectedSoundfont(id).catch(() => {})
}
export async function downloadSoundfont(id: SoundfontId) {
  setSf({ error: null })
  setDownload(id, 0)
  const res = await window.electronAPI.downloadSoundfont(id)
  if (!res.ok) { setDownload(id, 1); setSf({ error: res.error ?? 'Download failed' }); return }
  refreshSoundfonts()
  await selectSoundfont(id)
}
export async function deleteSoundfont(id: SoundfontId) {
  if (useStore.getState().selectedSoundfont === id) await selectSoundfont('generaluser-gs')
  await window.electronAPI.deleteSoundfont(id)
  refreshSoundfonts()
}
export async function importSoundfont() {
  setSf({ error: null })
  const id = await window.electronAPI.importSoundfont()
  if (!id) return
  refreshSoundfonts()
  await selectSoundfont(id)
}

// Mount ONCE (SettingsPanel — always mounted). offSoundfontProgress() removes
// every listener, so a second subscriber would cancel the first.
export function useSoundfontService() {
  const audioEngine = useStore((s) => s.audioEngine)
  useEffect(() => {
    refreshSoundfonts()
    window.electronAPI.onSoundfontProgress(({ id, progress }) => {
      setDownload(id, progress)
      if (progress >= 1) refreshSoundfonts()
    })
    return () => window.electronAPI.offSoundfontProgress()
  }, [])
  // Saved engine is Samples → load it at launch (unchanged behaviour)
  useEffect(() => {
    if (audioEngine !== 'samples' || useSoundfontState.getState().samplesStatus !== 'idle') return
    setSf({ samplesStatus: 'loading', samplesProgress: 0 })
    initSamplesEngine((p) => setSf({ samplesProgress: p }))
      .then(() => { setSf({ samplesStatus: 'ready' }); useStore.getState().setSamplesIntroduced(true) })
      .catch(() => setSf({ samplesStatus: 'error' }))
  }, [audioEngine])
}

// Measured output delay (s) — same short poll as before (gives up after 5 tries).
export function useOutputLatency(): number {
  const audioEngine = useStore((s) => s.audioEngine)
  const samplesStatus = useSoundfontState((s) => s.samplesStatus)
  // Native: re-read whenever its output changes (exclusive ↔ shared, a new sound card)
  const nativeOutput = useNativeAudio((s) => s.status ? `${s.status.mode}:${s.status.bufferFrames}:${s.status.rate}:${s.status.reportedLatencyMs}` : '')
  const [sec, setSec] = useState(0)
  useEffect(() => {
    let attempts = 0
    const read = () => measuredOutputLatencySec()
    const id = setInterval(() => {
      const v = read(); setSec(v); attempts++
      if (v > 0 || attempts >= 5) clearInterval(id)
    }, 400)
    return () => clearInterval(id)
  }, [audioEngine, samplesStatus, nativeOutput])
  return sec
}
