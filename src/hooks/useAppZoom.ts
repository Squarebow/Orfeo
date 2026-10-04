import { useEffect, useState } from 'react'

export function useAppZoom() {
  const [z, setZ] = useState<{ percent: number; steps: number[]; max: number }>({ percent: 100, steps: [100], max: 200 })
  useEffect(() => { window.electronAPI.getZoom().then(setZ).catch(() => {}) }, [])
  useEffect(() => {
    const handler = ({ percent }: { percent: number; capped: boolean }) => setZ((p) => ({ ...p, percent }))
    window.electronAPI.onZoomChanged(handler)
    return () => window.electronAPI.offZoomChanged(handler)
  }, [])
  const step = (direction: 1 | -1) => {
    const idx = z.steps.indexOf(z.percent)
    const next = Math.max(0, Math.min(z.steps.length - 1, (idx === -1 ? z.steps.indexOf(100) : idx) + direction))
    void window.electronAPI.setZoom(z.steps[next])
  }
  return { ...z, step, reset: () => void window.electronAPI.setZoom(100) }
}
