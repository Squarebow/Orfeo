import { useEffect, useState } from 'react'

// ── Live device-pixel-ratio — window.devicePixelRatio only reflects
// whatever the OS scaling / app zoom was at mount time; it never updates on
// its own. A matchMedia resolution query only ever matches once for a given
// dppx value, so it's re-armed after every fire rather than being a
// persistent listener. Used anywhere a canvas backing store is sized in
// device pixels, so a live Windows-scaling change doesn't leave it sized
// for the wrong ratio until some unrelated re-render happens to touch it. ──
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)

  useEffect(() => {
    let query: MediaQueryList
    const arm = () => {
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      query.addEventListener('change', onChange, { once: true })
    }
    const onChange = () => {
      setDpr(window.devicePixelRatio || 1)
      arm()
    }
    arm()
    return () => query.removeEventListener('change', onChange)
  }, [])

  return dpr
}
