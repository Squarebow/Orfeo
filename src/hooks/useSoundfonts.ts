import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useStore } from '../store'
import type { SoundfontId, SoundfontInfo } from '../types'
import { initSamplesEngine, loadSelectedSoundfont, getOutputLatencySec as getSamplesOutputLatencySec } from './useSamplesEngine'
import { getOutputLatencySec as getGmOutputLatencySec } from './useAudioEngine'

// ── Sound sets + Samples loading — one shared copy for the drawer's Quick
// Settings and the Settings window (both show the same status). ──────────
interface SfState {
  samplesStatus: 'idle' | 'loading' | 'ready' | 'error'
  samplesProgress: number
  extra: SoundfontInfo[]
  downloadingId: SoundfontId | null
  downloadProgress: number
  error: string | null
}
export const useSoundfontState = create<SfState>(() => ({
  samplesStatus: 'idle', samplesProgress: 0, extra: [], downloadingId: null, downloadProgress: 0, error: null,
}))
const setSf = (p: Partial<SfState>) => useSoundfontState.setState(p)

export const allSoundfonts = (extra: SoundfontInfo[]): SoundfontInfo[] => [
  { id: 'generaluser-gs', name: 'GeneralUser GS', sizeMB: 30.8, downloaded: true },
  ...extra,
]

// Loads the Samples engine (first use this session) and switches to it.
export async function startSamples(): Promise<boolean> {
  const sf = useSoundfontState.getState()
  const st = useStore.getState()
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
  setSf({ error: null, downloadingId: id, downloadProgress: 0 })
  const res = await window.electronAPI.downloadSoundfont(id)
  if (!res.ok) { setSf({ error: res.error ?? 'Download failed', downloadingId: null }); return }
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
    window.electronAPI.onSoundfontProgress(({ progress }) => {
      setSf({ downloadProgress: progress })
      if (progress >= 1) { setSf({ downloadingId: null }); refreshSoundfonts() }
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
  const [sec, setSec] = useState(0)
  useEffect(() => {
    let attempts = 0
    const read = () => (audioEngine === 'samples' ? getSamplesOutputLatencySec() : getGmOutputLatencySec())
    const id = setInterval(() => {
      const v = read(); setSec(v); attempts++
      if (v > 0 || attempts >= 5) clearInterval(id)
    }, 400)
    return () => clearInterval(id)
  }, [audioEngine, samplesStatus])
  return sec
}
