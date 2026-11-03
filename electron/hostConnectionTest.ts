import { ConnectionHolder, type PortLike } from './hostConnection'

// Fakes that record what happened, so "the late close of the old port" can be
// replayed exactly in the order the real MessagePort is allowed to deliver it.
class FakePort implements PortLike {
  readonly name: string
  readonly log: string[]
  listeners: Record<string, ((e?: unknown) => void)[]> = { message: [], close: [] }
  closes = 0
  sent: unknown[] = []
  throwOnPost = false
  throwOnClose = false

  constructor(name: string, log: string[]) { this.name = name; this.log = log }
  on(event: 'message' | 'close', listener: (e?: unknown) => void): void { this.listeners[event].push(listener) }
  close(): void {
    this.closes++
    this.log.push(`close:${this.name}`)
    if (this.throwOnClose) throw new Error('already closed')
  }
  start?(): void { this.log.push(`start:${this.name}`) }
  // As Electron's MessagePortMain: a second argument that is present must be an
  // array — postMessage(msg, undefined) throws "transferables must be an array
  // of MessagePorts" (checked against Electron 44)
  postMessage(...args: unknown[]): void {
    const [message] = args
    if (args.length > 1 && !Array.isArray(args[1])) throw new Error('transferables must be an array of MessagePorts')
    if (this.throwOnPost) throw new Error('port is not writable')
    this.sent.push(message)
    this.log.push(`post:${this.name}`)
  }
  // simulate the other side
  emitClose(): void { for (const l of this.listeners.close) l() }
  emitMessage(data: unknown): void { for (const l of this.listeners.message) l({ data }) }
}

export function runHostConnectionTest(): number {
  console.group('[hostConnection] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const mk = () => {
    const log: string[] = []
    const holder = new ConnectionHolder<FakePort>()
    const calls: string[] = []
    const hooksFor = (name: string) => ({
      onMessage: (e: any) => calls.push(`message:${name}:${e?.data?.t ?? '?'}`),
      onClose: () => calls.push(`closed:${name}`),
      // onReplace is about the *outgoing* port, so it names that one
      onReplace: (previous: FakePort) => calls.push(`replaced:${previous.name}`),
    })
    return { log, holder, calls, hooksFor }
  }

  // 1. the reported case: the old port's close arrives after the new one is live
  {
    const t = mk()
    const p1 = new FakePort('p1', t.log), p2 = new FakePort('p2', t.log)
    t.holder.replace(p1, t.hooksFor('p1'))
    t.holder.replace(p2, t.hooksFor('p2'))
    check(t.calls.join(',') === 'replaced:p1', `the second init settled the first page, saw ${JSON.stringify(t.calls)}`)
    p1.emitClose()                                  // late, as the real one can be
    check(t.calls.join(',') === 'replaced:p1', `a late close of the replaced port changes nothing, saw ${JSON.stringify(t.calls)}`)
    check(t.holder.current === p2, 'the new connection is still the current one')
    check(t.holder.post({ t: 'ready' }), 'and it still receives messages')
    check(p2.sent.length === 1 && (p2.sent[0] as any).t === 'ready', 'posted to the new port, not the old')
    check(p1.sent.length === 0, 'the old port gets nothing after being replaced')

    p2.emitClose()                                  // the real end of the live one
    check(t.calls.join(',') === 'replaced:p1,closed:p2', 'the current port closing does clean up')
    check(t.holder.current === null && !t.holder.post({ t: 'x' }), 'and nothing is current afterwards')
    p1.emitClose(); p2.emitClose()
    check(t.calls.join(',') === 'replaced:p1,closed:p2', 'a close never counts twice')
  }

  // 2. replacing settles the old page's work before the new port is wired
  {
    const t = mk()
    const p1 = new FakePort('p1', t.log), p2 = new FakePort('p2', t.log)
    t.holder.replace(p1, t.hooksFor('p1'))
    t.calls.length = 0
    t.holder.replace(p2, t.hooksFor('p2'))
    check(t.calls.join(',') === 'replaced:p1', 'replacement reports what the old page leaves behind')
    check(p2.listeners.close.length === 1, 'the new connection got exactly one close handler')
    check(p1.closes === 1 && t.log.indexOf('close:p1') < t.log.indexOf('start:p2'),
      `the old port is closed before the new one starts (${t.log.join(' ')})`)
    check(p2.listeners.message.length === 1 && p1.listeners.message.length === 1, 'each connection has its own handlers')
    p1.emitMessage({ t: 'start' })
    check(t.calls.join(',') === 'replaced:p1,message:p1:start', `a stray message on the old port never reaches the new handlers, saw ${JSON.stringify(t.calls)}`)
  }

  // 3. re-attaching the same port is not a replacement, and a failing close is tolerated
  {
    const t = mk()
    const p1 = new FakePort('p1', t.log)
    t.holder.replace(p1, t.hooksFor('p1'))
    t.calls.length = 0
    t.holder.replace(p1, t.hooksFor('p1'))
    check(t.calls.length === 0 && p1.closes === 0, 'the same port twice does not close or replace anything')

    const p2 = new FakePort('p2', t.log)
    p1.throwOnClose = true
    t.holder.replace(p2, t.hooksFor('p2'))
    check(t.holder.current === p2, 'a close that throws still lets the new connection in')
  }

  // 4. posting is safe in every state
  {
    const t = mk()
    // a message without ports must really arrive: Electron rejects an explicit
    // `undefined` for the transfer list, and post() swallowing that left the
    // Native sound stuck at "starting…" with every status and export message lost
    const p0 = new FakePort('p0', t.log)
    t.holder.replace(p0, t.hooksFor('p0'))
    check(t.holder.post({ t: 'started' }) && p0.sent.length === 1, 'a message without ports arrives')
    t.holder.current = null
    check(!t.holder.post({ t: 'status' }), 'no connection: post reports it instead of throwing')
    const p1 = new FakePort('p1', t.log)
    p1.throwOnPost = true
    t.holder.replace(p1, t.hooksFor('p1'))
    check(!t.holder.post({ t: 'status' }), 'a port that refuses a message is swallowed (a closed page is normal)')
  }

  console.log(`hostConnection: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
