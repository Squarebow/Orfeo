import { useEffect } from 'react'
import { useStore } from '../store'
import { runTrustScan } from '../utils/tempoTrustScan'
import { analyzeBuffer, analyzeParsed } from '../utils/tempoTrustAnalyze'
import { songKey } from '../utils/songIdentity'

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

// ── Library background scan (Settings → Tempo warnings). Restarts whenever
// the Library list changes; a newer run cancels the older one. Never runs
// while a song is playing. See utils/tempoTrustScan.ts. ─────────────────
export function useTempoTrustScan() {
  const enabled = useStore((s) => s.tempoWarningsEnabled)
  const files = useStore((s) => s.libraryFiles)
  useEffect(() => {
    if (!enabled || !files.length || !window.electronAPI?.statFiles) return
    let alive = true
    const S = () => useStore.getState()
    runTrustScan(files.map(f => f.path), {
      stat: (paths) => window.electronAPI.statFiles(paths),
      read: async (p) => { const r = await window.electronAPI.loadMidiFromPath(p); if (!r) throw new Error('unreadable'); return b64ToBuffer(r.base64) },
      keyOf: songKey,
      analyze: analyzeBuffer,
      getIndex: () => S().libraryTrustIndex,
      getCache: () => S().tempoTrustCache,
      getCorrection: (key) => S().tempoCorrections[key] ?? null,
      setEntry: (path, stat, key, result) => S().setTrustEntry(path, stat, key, result),
      isActive: () => alive && S().tempoWarningsEnabled,
      isBusy: () => S().playbackState === 'playing',
      pause: (ms) => new Promise(r => setTimeout(r, ms)),
    }).catch(() => {})
    return () => { alive = false }
  }, [enabled, files])
}

// ── Open song: judged ~300 ms after it loads or its beat grid changes (a kept
// Tap Tempo), never during a tap session's live preview. ────────────────
export function useCurrentTempoTrust() {
  const enabled = useStore((s) => s.tempoWarningsEnabled)
  const midi = useStore((s) => s.midi)
  const key = useStore((s) => s.songKey)
  const tapping = useStore((s) => !!s.tapSession)
  useEffect(() => {
    if (!enabled || !midi || !key || tapping) return
    const id = setTimeout(() => {
      const s = useStore.getState()
      if (s.midi !== midi) return
      const r = analyzeParsed(midi)
      s.setCurrentTrust(r)
      s.setTrustEntry(null, null, key, r)
    }, 300)
    return () => clearTimeout(id)
  }, [enabled, midi, key, tapping])
}
