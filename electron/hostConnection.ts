// ── One renderer connection at a time, and who may clean up after it ─────────
// The main process replaces the audio host's MessagePort on a page reload, a new
// window or a re-connect after a crash. A port's `close` event can arrive *after*
// the newer port is already wired up — and a close handler that then clears
// shared state (the live engine, the running offline renders, “the current port”)
// tears down the new connection instead of the old one. That is not theory: it
// was enough to cancel exports the new page had just started.
//
// Two rules, both checked in hostConnectionTest.ts:
//   • a close handler acts only while its own port is still the current one;
//   • replacing a connection settles what the old page had running *at the
//     replacement*, explicitly, instead of relying on a late close event.
export interface PortLike {
  on(event: 'message', listener: (e: unknown) => void): void
  on(event: 'close', listener: () => void): void
  close(): void
  start?(): void
  postMessage?(message: unknown, ports?: unknown[]): void
}

export interface ConnectionHooks<T> {
  onMessage: (e: unknown) => void
  /** the connection ended for real: the page is gone */
  onClose: () => void
  /** a newer page is taking over: what the old one had running goes now */
  onReplace?: (previous: T) => void
}

export class ConnectionHolder<T extends PortLike> {
  current: T | null = null

  /** Install `next` as the only live connection. */
  replace(next: T, hooks: ConnectionHooks<T>): void {
    const previous = this.current
    if (previous && previous !== next) {
      hooks.onReplace?.(previous)
      try { previous.close() } catch { /* gone already */ }
    }
    this.current = next
    next.on('message', hooks.onMessage)
    next.on('close', () => {
      if (this.current !== next) return          // a newer connection owns the state now
      this.current = null
      hooks.onClose()
    })
    next.start?.()
  }

  /** Send to whoever is current; a closed or replaced port must never throw. */
  post(message: unknown, ports?: unknown[]): boolean {
    try {
      const target = this.current
      if (!target?.postMessage) return false
      // Electron's MessagePortMain throws on postMessage(msg, undefined): the
      // transfer list goes along only when there is one
      if (ports) target.postMessage(message, ports)
      else target.postMessage(message)
      return true
    } catch { return false }
  }
}
