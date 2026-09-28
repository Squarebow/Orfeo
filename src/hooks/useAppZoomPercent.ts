import { useEffect, useState } from 'react'

// ── Live app-zoom percentage (Ctrl +/-/0 or Settings → Appearance) — pulled
// once on mount, then kept current via the same main-process push every
// other zoom-aware consumer uses (App.tsx's hint toast, SettingsPanel's
// readout). 100 until the real value arrives, matching the default zoom so
// nothing flashes at the wrong size before the first getZoom() resolves. ──
export function useAppZoomPercent(): number {
  const [percent, setPercent] = useState(100)

  useEffect(() => {
    window.electronAPI.getZoom().then((z) => setPercent(z.percent)).catch(() => {})
    const handler = ({ percent }: { percent: number; capped: boolean }) => setPercent(percent)
    window.electronAPI.onZoomChanged(handler)
    return () => window.electronAPI.offZoomChanged(handler)
  }, [])

  return percent
}
