// ── ConfirmDialog controller ────────────────────────────────────────────────
// Imperative singleton — lets any renderer code await a themed confirm dialog
// without IPC, native OS dialogs, or prop drilling.
//
// Usage:
//   const choice = await confirmDialog({ message: '...', buttons: ['OK', 'Cancel'] })
//   // choice === index of clicked button, or buttons.length - 1 for Escape/backdrop

export type ConfirmOptions = {
  title?: string
  message: string
  detail?: string
  buttons: string[]       // last button = "safe" default (Escape / backdrop click)
  destructiveIndex?: number // index to render with destructive color (e.g. red)
}

export type ConfirmState = ConfirmOptions & { resolve: (index: number) => void }

const listeners = new Set<(state: ConfirmState | null) => void>()
let current: ConfirmState | null = null

// ── Subscribe to dialog open/close events ────────────────────────────────────
export function subscribeConfirm(fn: (state: ConfirmState | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify() {
  listeners.forEach((fn) => fn(current))
}

// ── Open a themed confirm dialog; resolves to the index of the clicked button ─
export function confirmDialog(options: ConfirmOptions): Promise<number> {
  return new Promise((resolve) => {
    current = {
      ...options,
      resolve: (index: number) => {
        current = null
        notify()
        resolve(index)
      },
    }
    notify()
  })
}
