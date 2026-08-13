import { useEffect, useRef, type RefObject, type Dispatch, type SetStateAction } from 'react'

// ── Keeps a floating modal's bottom edge visually fixed as its content grows
// or shrinks — the box expands upward instead of downward. Without this,
// `top: pos.y` stays fixed and added content (e.g. a new pattern row in
// Chord/Scale Explorer) always pushes the bottom edge further down, drifting
// the modal away from wherever it was deliberately anchored (e.g. just above
// the keyboard). Each height change shifts pos.y by the exact negative delta,
// so the bottom edge never moves regardless of how much the content grows. ──
export function useAnchorBottomOnResize(
  ref: RefObject<HTMLElement | null>,
  setPos: Dispatch<SetStateAction<{ x: number; y: number }>>,
  enabled: boolean,
  // Floor for pos.y — callers with an Electron titleBarOverlay (native OS
  // window controls painted on top of the page in the top N px, regardless
  // of DOM z-index) need this so growing content can't push the modal's
  // header back into that dead zone. This hook previously had NO clamp at
  // all, unlike the same modals' initial-position and manual-drag code —
  // which meant a modal opened safely below the overlay could still end up
  // with its close button under it purely from content changing size, with
  // no drag involved. Optional — omit for modals with no such floor. ───────
  minY?: number,
) {
  const lastHeight = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) { lastHeight.current = null; return }
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const h = entries[0]?.contentRect.height
      if (h === undefined) return
      if (lastHeight.current !== null) {
        const delta = h - lastHeight.current
        if (delta !== 0) setPos(p => ({ ...p, y: minY !== undefined ? Math.max(minY, p.y - delta) : p.y - delta }))
      }
      lastHeight.current = h
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, ref, setPos, minY])
}
