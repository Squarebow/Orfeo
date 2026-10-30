import { PendingRenders } from './pendingRenders'

export async function runPendingRendersTest(): Promise<number> {
  console.group('[pendingRenders] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const settle = (p: Promise<unknown>) => p.then(v => ({ v }), e => ({ e: String(e?.message ?? e) }))

  // 1. The audio process goes away: every export waiting on it fails with the reason
  const pr = new PendingRenders()
  const a = settle(pr.wait(1)), b = settle(pr.wait(2))
  pr.failAll('the audio process stopped')
  check(JSON.stringify(await a) === JSON.stringify({ e: 'the audio process stopped' }), 'pending export 1 fails')
  check(JSON.stringify(await b) === JSON.stringify({ e: 'the audio process stopped' }), 'pending export 2 fails')
  check(pr.size === 0, 'nothing left waiting')

  // 2. Done / failed by id
  const c = settle(pr.wait(3)); pr.done(3, ['L', 'R'] as any)
  check(JSON.stringify(await c) === JSON.stringify({ v: ['L', 'R'] }), 'done delivers the result')
  const d = settle(pr.wait(4)); pr.fail(4, 'boom')
  check(JSON.stringify(await d) === JSON.stringify({ e: 'boom' }), 'fail delivers the error')

  // 3. Cancelled and no answer: gives up after the grace time (null = cancelled)
  let cancel = false
  const e = settle(pr.wait(5, { isCancelled: () => cancel, graceMs: 150, pollMs: 20 }))
  setTimeout(() => { cancel = true }, 30)
  const t = Date.now()
  const er = await e
  check(JSON.stringify(er) === JSON.stringify({ v: null }) && Date.now() - t < 1000, `a cancel with no answer resolves as cancelled, got ${JSON.stringify(er)}`)

  console.log(`pendingRenders: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
