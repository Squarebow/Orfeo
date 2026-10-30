// ── Native exports waiting on the audio process ─────────────────────────────
// Every export resolves or fails, whatever happens to that process: its result
// or error by id, all of them failed at once when the process goes away, and a
// cancelled export that gets no answer gives up after a grace time (null).
type Result = Float32Array[] | null
interface Waiting { done: (r: Result) => void; fail: (e: Error) => void; stop: () => void }

export class PendingRenders {
  private waiting = new Map<number, Waiting>()
  get size() { return this.waiting.size }

  wait(id: number, o: { isCancelled?: () => boolean; graceMs?: number; pollMs?: number } = {}): Promise<Result> {
    return new Promise<Result>((resolve, reject) => {
      let cancelledAt = 0
      const timer = o.isCancelled ? setInterval(() => {
        if (!o.isCancelled!()) return
        cancelledAt ||= Date.now()
        if (Date.now() - cancelledAt >= (o.graceMs ?? 2000)) this.done(id, null)
      }, o.pollMs ?? 100) : null
      const stop = () => { if (timer) clearInterval(timer); this.waiting.delete(id) }
      this.waiting.set(id, { done: r => { stop(); resolve(r) }, fail: e => { stop(); reject(e) }, stop })
    })
  }

  done(id: number, r: Result) { this.waiting.get(id)?.done(r) }
  fail(id: number, message: string) { this.waiting.get(id)?.fail(new Error(message)) }
  failAll(message: string) { for (const w of [...this.waiting.values()]) w.fail(new Error(message)) }
}
