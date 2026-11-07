// ── Typing with an input method (Chinese, Japanese, Korean) ──────────────────
// While a word is being composed, arrow keys, letters and Enter belong to the
// input method. Without this they would also reach Orfeo's shortcuts and move
// Step Through or toggle things. This listener is the first one on the window,
// so one check covers every shortcut in the app. The input method itself isn't
// affected: nothing here cancels the key. Imported first in main.tsx.
export const isImeKey = (e: { isComposing?: boolean; keyCode?: number }) =>
  e.isComposing === true || e.keyCode === 229

export function installImeGuard(target: Pick<Window, 'addEventListener'>) {
  const stop = (e: Event) => { if (isImeKey(e as KeyboardEvent)) e.stopImmediatePropagation() }
  target.addEventListener('keydown', stop, true)
  target.addEventListener('keyup', stop, true)
}

if (typeof window !== 'undefined') installImeGuard(window)
