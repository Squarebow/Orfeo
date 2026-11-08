import { useEffect } from 'react'
import { useStore } from '../store'
import { runLyricsScan } from '../utils/lyricsScan'

// ── Library background check for the lyrics mark (Settings › Show files with
// lyrics). Runs only while that switch is on; restarts whenever the Library or
// the demo songs change, or the remembered results are cleared (dev panel), and
// a newer run cancels the older one. See utils/lyricsScan.ts. ─────────────────
export function useLyricsScan() {
  const enabled = useStore((s) => s.showLyricsMark)
  const files = useStore((s) => s.libraryFiles)
  const demoFiles = useStore((s) => s.demoFiles)
  const cleared = useStore((s) => Object.keys(s.lyricsIndex).length === 0)
  useEffect(() => {
    const api = window.electronAPI
    if (!enabled || !api?.checkLyrics) return
    const paths = [...files, ...demoFiles].map(f => f.path)
    if (!paths.length) return
    let alive = true
    const S = () => useStore.getState()
    runLyricsScan(paths, {
      stat: (ps) => api.statFiles(ps),
      check: (ps) => api.checkLyrics(ps),
      getIndex: () => S().lyricsIndex,
      save: (entries) => S().setLyricsEntries(entries),
      isActive: () => alive && S().showLyricsMark,
      isBusy: () => S().playbackState === 'playing',
      pause: (ms) => new Promise(r => setTimeout(r, ms)),
    }).catch(() => {})
    return () => { alive = false }
  }, [enabled, files, demoFiles, cleared])
}
