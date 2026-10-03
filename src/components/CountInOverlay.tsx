import { useEffect, useState } from 'react'
import { useStore } from '../store'

// ── Big 1-2-3-4 over the piano roll while a count-in runs (see
// utils/countInRunner.ts). Follows the click schedule by wall clock; the
// accented "1" of each bar is amber. ────────────────────────────────────
export function CountInOverlay() {
  const countIn = useStore((s) => s.countIn)
  const [shown, setShown] = useState<{ n: number; key: number } | null>(null)
  useEffect(() => {
    if (!countIn) { setShown(null); return }
    let raf = 0
    const tick = () => {
      const t = (performance.now() - countIn.startPerf) / 1000
      let idx = -1
      for (let i = 0; i < countIn.clicks.length; i++) if (countIn.clicks[i].rel <= t) idx = i
      setShown(idx >= 0 ? { n: countIn.clicks[idx].n, key: idx } : null)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [countIn])
  if (!countIn || !shown) return null
  return (
    <div aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 20 }}>
      <span
        key={shown.key}
        className="orfeo-countin-pop"
        style={{
          fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 140, lineHeight: 1,
          color: shown.n === 1 ? 'var(--text-amber)' : 'var(--text-default)', opacity: 0.85,
          textShadow: '0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        {shown.n}
      </span>
    </div>
  )
}
