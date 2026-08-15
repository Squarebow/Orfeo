import { useEffect, type RefObject } from 'react'

// ── Shared focus trap for floating modals ───────────────────────────────────
// Keeps Tab/Shift+Tab cycling inside `ref`'s subtree while `active` is true,
// focuses the first focusable element on open, and restores focus to
// whatever was focused before the modal opened on close/unmount.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const container = ref.current
    if (!active || !container) return
    const previouslyFocused = document.activeElement as HTMLElement | null

    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null)

    if (!container.contains(document.activeElement)) {
      const first = getFocusable()[0]
      ;(first ?? container).focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || !container.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last || !container.contains(document.activeElement)) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [active, ref])
}
