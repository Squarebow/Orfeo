import { menuItems, pickChangesLanguage } from './menuItems'

export function runMenuItemsTest(): number {
  console.group('[menuItems] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const has = (c: string) => c !== 'ru'
  check(JSON.stringify(menuItems([], has)) === '["en"]', 'empty list is English only')
  check(JSON.stringify(menuItems(['sl', 'ru', 'de'], has)) === '["en","sl","de"]', 'order kept, no words dropped')
  check(JSON.stringify(menuItems(['de', 'en', 'de'], has)) === '["en","de"]', 'English and repeats not doubled')
  check(!pickChangesLanguage('de', 'de', 'system'), 'language in use does nothing')
  check(pickChangesLanguage('en', 'de', 'system'), 'other language changes')
  check(pickChangesLanguage('de', 'system', 'system'), 'follow system: any pick saves it')
  check(pickChangesLanguage('en', 'system', 'system'), 'follow system on, pick the language in use: changes')
  check(!pickChangesLanguage('en', 'en', 'system'), 'follow system off, language in use: nothing')
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
