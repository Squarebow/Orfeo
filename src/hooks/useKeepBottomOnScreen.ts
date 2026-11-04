import { useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react'

// ── A floating window that grows downward, without leaving the screen ────────
// The Explorers keep their top edge where you put it: content growing or
// shrinking (Common / Extended / Power, a new pattern row) only moves the
// bottom edge. If that would take the bottom past the window, the panel moves
// up by exactly the overflow and no further; minY keeps its header clear of the
// titleBarOverlay, where the system's own window controls are drawn.
export function useKeepBottomOnScreen(
  ref: RefObject<HTMLElement | null>,
  setPos: Dispatch<SetStateAction<{ x: number; y: number }>>,
  enabled: boolean,
  minY: number,
) {
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const height = el.getBoundingClientRect().height
      setPos(p => {
        const over = p.y + height - window.innerHeight
        return over > 0 ? { ...p, y: Math.max(minY, p.y - over) } : p
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, ref, setPos, minY])
}
