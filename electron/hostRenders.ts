// ── The audio host's offline renders, in one place ───────────────────────────
// `electron/audioHost.ts` carries the live engine and the MessagePort. The
// offline renders an export starts need their own bookkeeping on top: they outlive
// the message that started them, they are polled, they can be cancelled, they all
// have to die when the page goes away, and one that stops answering has to be
// named instead of waited on forever. That is what this file is — no add-on, no
// Electron, so `npm test` can check the rules for real (hostRendersTest.ts).
//
// Two rules in here exist because of specific failures:
//   • a worker thread that vanished with neither a result nor an error used to
//     leave the export sitting at one percentage until the user pressed Cancel;
//   • closing the port (reload, new window, window gone) used to leave every
//     running render polling and posting into nothing.

/** The part of the add-on's OfflineRender this bookkeeping touches. */
export interface RenderLike {
  /** null while still rendering, the finished [left, right] when done, throws on failure or cancel */
  take(): [Float32Array, Float32Array] | null
  cancel(): void
  /** 0..1 */
  progress(): number
}

export interface HostRendersOptions {
  post: (msg: Record<string, unknown>) => void
  pollMs?: number
  /** no progress at all for this long = a render that is not coming back
   *  (90 s, not a total-time limit: a healthy render reports every ~0.5 s of audio) */
  stallMs?: number
  now?: () => number
  every?: (fn: () => void, ms: number) => any
  stopTimer?: (handle: any) => void
}

interface Item { render: RenderLike; timer: any; lastProgress: number; since: number }

export class HostRenders {
  private items = new Map<number, Item>()
  private readonly post: (msg: Record<string, unknown>) => void
  private readonly pollMs: number
  private readonly stallMs: number
  private readonly now: () => number
  private readonly every: (fn: () => void, ms: number) => any
  private readonly stopTimer: (handle: any) => void

  constructor(o: HostRendersOptions) {
    this.post = o.post
    this.pollMs = o.pollMs ?? 100
    this.stallMs = o.stallMs ?? 90_000
    this.now = o.now ?? (() => Date.now())
    this.every = o.every ?? ((fn, ms) => setInterval(fn, ms))
    this.stopTimer = o.stopTimer ?? ((h) => clearInterval(h))
  }

  get size(): number { return this.items.size }

  /** Start watching one render; the first progress report restarts the clock. */
  add(id: number, render: RenderLike): void {
    // the same id twice means the older one was never answered: stop it, or its
    // thread renders a song that nobody is waiting for any more
    const previous = this.items.get(id)
    if (previous) { try { previous.render.cancel() } catch { /* gone already */ } }
    this.remove(id)
    const item: Item = { render, timer: null, lastProgress: -1, since: this.now() }
    item.timer = this.every(() => this.tick(id), this.pollMs)
    this.items.set(id, item)
  }

  /** Ask one render to stop; its result (cancelled) arrives on the next tick. */
  cancel(id: number): void { this.items.get(id)?.render.cancel() }

  /** Everything running is dropped: the page that asked for it is gone, and a
   *  thread rendering a song for nobody costs memory and a sound set each. */
  cancelAll(): void {
    for (const [id, item] of [...this.items.entries()]) {
      try { item.render.cancel() } catch { /* already gone */ }
      this.remove(id)
    }
    this.items.clear()
  }

  has(id: number): boolean { return this.items.has(id) }

  private remove(id: number): void {
    const item = this.items.get(id)
    if (!item) return
    if (item.timer !== null) this.stopTimer(item.timer)
    this.items.delete(id)
  }

  private tick(id: number): void {
    const item = this.items.get(id)
    if (!item) return
    let out: [Float32Array, Float32Array] | null = null
    try {
      out = item.render.take()
    } catch (e: any) {
      const message = String(e?.message ?? e)
      this.remove(id)
      this.post(message === 'cancelled' ? { t: 'render-done', id, cancelled: true } : { t: 'render-error', id, message })
      return
    }
    if (out) {
      const [l, r] = out
      this.remove(id)
      // copied, not transferred: a main-process MessagePort only transfers ports
      this.post({ t: 'render-done', id, l, r })
      return
    }
    const p = item.render.progress()
    if (p !== item.lastProgress) {
      item.lastProgress = p
      item.since = this.now()
      this.post({ t: 'render-progress', id, p })
      return
    }
    if (this.now() - item.since < this.stallMs) return
    // progress has not moved in a while: the thread is not coming back, and the
    // renderer is waiting on an answer that will never be posted
    try { item.render.cancel() } catch { /* already gone */ }
    this.remove(id)
    this.post({ t: 'render-error', id, message: `the render stopped answering at ${(p * 100).toFixed(0)}%` })
  }
}
