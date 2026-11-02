import { HostRenders, type RenderLike } from './hostRenders'

// Fakes with a clock we control: what matters here is what the audio host does
// when a render thread answers, fails, vanishes, or stops answering at all.
class FakeRender implements RenderLike {
  takeAt = -1                      // tick number at which take() answers, -1 = never
  result: [Float32Array, Float32Array] | null = [new Float32Array([1]), new Float32Array([2])]
  throws: string | null = null
  progressValue = 0
  cancelled = 0
  private ticks = 0
  take(): [Float32Array, Float32Array] | null {
    this.ticks++
    if (this.throws) throw new Error(this.throws)
    return this.takeAt >= 0 && this.ticks > this.takeAt ? this.result : null
  }
  cancel(): void { this.cancelled++ }
  progress(): number { return this.progressValue }
}

export function runHostRendersTest(): number {
  console.group('[hostRenders] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a scripted clock and scripted timers, so "90 s without progress" costs no waiting
  const make = (opts: { stallMs?: number } = {}) => {
    const posted: Record<string, unknown>[] = []
    let clock = 1000
    let timers: { fn: () => void; id: number }[] = []
    let stopped: number[] = []
    let nextId = 1
    const hr = new HostRenders({
      post: (m) => posted.push(m),
      stallMs: opts.stallMs ?? 90_000,
      pollMs: 100,
      now: () => clock,
      every: (fn) => { const t = { fn, id: nextId++ }; timers.push(t); return t.id },
      stopTimer: (id) => { stopped.push(id); timers = timers.filter(t => t.id !== id) },
    })
    const tickTimes = (n: number) => { for (let i = 0; i < n; i++) for (const t of [...timers]) t.fn() }
    const advance = (ms: number) => { clock += ms }
    const kinds = () => posted.map(p => `${p.t}`).join(',')
    return { hr, posted, tickTimes, advance, kinds, live: () => timers.length, stopped }
  }

  // 1. a render that answers: the result is posted once, then nothing more
  {
    const t = make()
    const r = new FakeRender()
    r.takeAt = 1
    r.progressValue = 0.4
    t.hr.add(7, r)
    t.tickTimes(1)                              // progress report first, then the answer
    t.tickTimes(1)
    t.tickTimes(1)
    check(t.kinds() === 'render-progress,render-done', `progress then done, got "${t.kinds()}"`)
    const done = t.posted.find(p => p.t === 'render-done')
    check(!!done && done.id === 7 && Array.isArray((done as any).l) === false && (done as any).l.length === 1, 'the finished audio comes with its id')
    check(t.hr.size === 0 && t.live() === 0, 'answered render: no timer left')
  }

  // 2. a render that fails: the reason reaches the renderer as an error
  {
    const t = make()
    const r = new FakeRender()
    r.throws = 'can’t export a song 90000 s long'
    t.hr.add(1, r)
    t.tickTimes(1)
    const err = t.posted.find(p => p.t === 'render-error')
    check(!!err && String(err.message).includes('90000'), `failure reason is passed on, got ${JSON.stringify(err?.message)}`)
    check(t.hr.size === 0 && t.live() === 0, 'failed render: no timer left')
  }

  // 3. a cancelled render is a plain answer, not an error
  {
    const t = make()
    const r = new FakeRender()
    r.throws = 'cancelled'
    t.hr.add(2, r)
    t.hr.cancel(2)
    check(r.cancelled === 1, 'cancel() reached the render')
    t.tickTimes(1)
    const done = t.posted.find(p => p.t === 'render-done')
    check(!!done && (done as any).cancelled === true && !t.posted.some(p => p.t === 'render-error'), 'cancelled → render-done with cancelled, no error')
    check(t.hr.size === 0, 'cancelled render is dropped from the bookkeeping')
  }

  // 4. progress that keeps moving is never a stall, however long the song takes
  {
    const t = make()
    const r = new FakeRender()
    t.hr.add(3, r)
    for (let i = 1; i <= 40; i++) { r.progressValue = i / 40; t.advance(30_000); t.tickTimes(1) }
    check(!t.posted.some(p => p.t === 'render-error'), 'a long but moving render is not called broken')
    check(t.posted.filter(p => p.t === 'render-progress').length === 40, 'every move of progress is reported')
  }

  // 5. progress that stops: one error, the thread is cancelled, no waiting forever
  {
    const t = make({ stallMs: 90_000 })
    const r = new FakeRender()
    r.progressValue = 0.62
    t.hr.add(4, r)
    t.tickTimes(1)                              // first report restarts the clock
    t.advance(89_000); t.tickTimes(1)
    check(!t.posted.some(p => p.t === 'render-error'), 'just under the stall limit: still waiting')
    t.advance(2_000); t.tickTimes(1)
    const err = t.posted.find(p => p.t === 'render-error')
    check(!!err && /stopped answering at 62%/.test(String(err.message)), `a stalled render says so (${JSON.stringify(err?.message)})`)
    check(r.cancelled === 1, 'the stalled render is cancelled, not left running')
    check(t.hr.size === 0 && t.live() === 0, 'a stalled render: no timer left')
    t.tickTimes(3)
    check(t.posted.filter(p => p.t === 'render-error').length === 1, 'and it is reported exactly once')
  }

  // 6. closing the connection: everything running is dropped at once
  {
    const t = make()
    const a = new FakeRender(), b = new FakeRender()
    t.hr.add(11, a); t.hr.add(12, b)
    check(t.hr.size === 2 && t.live() === 2, 'two renders are watched')
    t.hr.cancelAll()
    check(a.cancelled === 1 && b.cancelled === 1, 'cancelAll stops every running render')
    check(t.hr.size === 0 && t.live() === 0, 'cancelAll leaves no timer behind')
    t.hr.add(13, new FakeRender())              // the host carries on: the live engine is separate
    t.tickTimes(1)
    check(t.hr.size === 1, 'cancelAll does not close the bookkeeping itself')
    t.hr.cancelAll()
    check(t.hr.size === 0 && t.live() === 0, 'and it can be called twice')
  }

  // 7. a second render under the same id: the first is stopped, and cancelling an
  //    id nobody asked about is harmless
  {
    const t = make()
    const first = new FakeRender(), second = new FakeRender()
    t.hr.add(5, first)
    t.hr.add(5, second)
    check(first.cancelled === 1, 're-using an id stops the older render')
    check(t.hr.size === 1 && t.live() === 1, 'and leaves exactly one watched')
    t.hr.cancel(999)                             // no throw, no post about an id nobody asked for
    t.tickTimes(1)
    check(t.hr.size === 1 && t.posted.every(p => p.id === 5) && !t.posted.some(p => p.t === 'render-error'),
      'cancelling an unknown id changes nothing')
  }

  console.log(`hostRenders: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
