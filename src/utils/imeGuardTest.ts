import { installImeGuard, isImeKey } from './imeGuard'

export function runImeGuardTest(): number {
  console.group('[imeGuard] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  check(isImeKey({ isComposing: true, keyCode: 39 }), 'a key during composition')
  check(isImeKey({ isComposing: false, keyCode: 229 }), 'the key that starts a composition')
  check(!isImeKey({ isComposing: false, keyCode: 39 }), 'an ordinary arrow key')
  check(!isImeKey({}), 'a key with no details')

  const added: { type: string; capture: unknown; fn: (e: Event) => void }[] = []
  installImeGuard({ addEventListener: ((type: string, fn: (e: Event) => void, capture: unknown) => { added.push({ type, fn, capture }) }) as Window['addEventListener'] })
  check(added.map(a => a.type).join() === 'keydown,keyup' && added.every(a => a.capture === true), 'listens first, for keys down and up')

  let stopped = 0
  const key = (isComposing: boolean) => ({ isComposing, keyCode: 39, stopImmediatePropagation: () => { stopped++ } }) as unknown as Event
  added[0].fn(key(false))
  check(stopped === 0, 'an ordinary key reaches the shortcuts')
  added[0].fn(key(true))
  check(stopped === 1, 'a composing key does not')

  console.log(`imeGuard: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
