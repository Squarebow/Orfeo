import { menuItems, pickChangesLanguage, withLanguageInUse } from './menuItems'

export function runMenuItemsTest(): number {
  console.group('[menuItems] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const has = (c: string) => c !== 'ru'
  check(JSON.stringify(menuItems([], has)) === '["en"]', 'empty list is English only')
  check(JSON.stringify(menuItems(['sl', 'ru', 'de'], has)) === '["en","sl","de"]', 'order kept, no words dropped')
  check(JSON.stringify(menuItems(['de', 'en', 'de'], has)) === '["en","de"]', 'English and repeats not doubled')
  check(JSON.stringify(menuItems(['de'], has, 'sl')) === '["en","sl","de"]', 'the language in use is listed after English even if not ticked')
  check(JSON.stringify(menuItems(['de', 'sl'], has, 'sl')) === '["en","de","sl"]', 'a ticked language in use keeps its place')
  check(JSON.stringify(menuItems(['de'], has, 'en')) === '["en","de"]', 'English in use: nothing added')
  check(JSON.stringify(menuItems([], c => c !== 'pseudo', 'pseudo')) === '["en"]', 'a language in use without words is left out')
  check(JSON.stringify(withLanguageInUse(['de'], 'sl', has)) === '["de","sl"]', 'the language in use is ticked at start')
  const same = ['de', 'sl']
  check(withLanguageInUse(same, 'sl', has) === same && withLanguageInUse(same, 'en', has) === same, 'already ticked, or English: unchanged')
  check(withLanguageInUse(same, 'ru', has) === same, 'a language in use without words is not ticked')
  check(!pickChangesLanguage('de', 'de', 'system'), 'language in use does nothing')
  check(pickChangesLanguage('en', 'de', 'system'), 'other language changes')
  check(pickChangesLanguage('de', 'system', 'system'), 'follow system: any pick saves it')
  check(pickChangesLanguage('en', 'system', 'system'), 'follow system on, pick the language in use: changes')
  check(!pickChangesLanguage('en', 'en', 'system'), 'follow system off, language in use: nothing')
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
