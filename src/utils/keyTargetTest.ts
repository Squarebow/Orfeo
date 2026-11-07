import { isTextEntry } from './keyTarget'

export function runKeyTargetTest(): number {
  console.group('[keyTarget] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const el = (tagName: string, type?: string) => ({ tagName, type }) as unknown as EventTarget

  check(isTextEntry(el('INPUT', 'text')), 'a text field')
  check(isTextEntry(el('INPUT', 'number')), 'a number field')
  check(isTextEntry(el('INPUT', 'checkbox')), 'a checkbox keeps Space for itself')
  check(isTextEntry(el('TEXTAREA')), 'a text area')
  check(!isTextEntry(el('INPUT', 'range')), 'a slider leaves the shortcuts alone')
  check(!isTextEntry(el('BUTTON')), 'a button')
  check(!isTextEntry(null), 'nothing focused')

  console.log(`keyTarget: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
