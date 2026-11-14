import { shortTime, tickState } from './languagePage'
import type { LangRow } from './readiness'

export function runLanguagePageTest(): number {
  console.group('[languagePage] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const row = (code: string, ready: boolean, percent: number, kind: LangRow['status']['kind']): LangRow =>
    ({ code, percent, ready, tickable: ready && kind !== 'arriving', status: kind === 'arriving' ? { kind, when: 'nextStart' } : kind === 'needs' ? { kind, percent: 80 - percent } : kind === 'newWords' ? { kind, count: 5 } : { kind } } as LangRow)
  const has = (c: string) => c !== 'it' && c !== 'ja'

  // a ready language with words: can be ticked and unticked
  let s = tickState(row('de', true, 95, 'upToDate'), [], 'en', has)
  check(!s.checked && !s.disabled && s.percent === null, 'ready, not ticked: can be ticked')
  s = tickState(row('de', true, 95, 'upToDate'), ['de'], 'en', has)
  check(s.checked && !s.disabled && s.percent === null, 'ready, ticked: can be unticked')

  // ticked or in use, no longer ready: stays ticked and can be unticked, no percentage
  s = tickState(row('fr', false, 42, 'needs'), ['fr'], 'en', has)
  check(s.checked && !s.disabled && s.percent === null, 'ticked, not ready any more: ticked, can be unticked')
  s = tickState(row('fr', false, 42, 'needs'), [], 'fr', has)
  check(!s.disabled && s.percent === null, 'the language in use, not ready: can be ticked again')
  s = tickState(row('fr', false, 42, 'needs'), ['fr'], 'fr', has)
  check(s.checked && !s.disabled, 'the language in use, ticked: ticked, can be unticked')

  // not ready, not ticked: greyed with its percentage
  s = tickState(row('pl', false, 42, 'needs'), [], 'en', has)
  check(!s.checked && s.disabled && s.percent === 42, 'not ready: greyed, with percentage')

  // ready but its words haven't arrived: the name alone, greyed
  s = tickState(row('it', true, 85, 'arriving'), [], 'en', has)
  check(!s.checked && s.disabled && s.percent === null, 'words on the way: name alone, greyed')
  s = tickState(row('ja', false, 10, 'needs'), ['ja'], 'en', has)
  check(!s.checked && s.disabled && s.percent === 10, 'ticked but no words on this computer: not in the menu, greyed')

  // the time below the table follows the language in use, English stays British
  const ms = Date.UTC(2026, 10, 13, 9, 5)
  check(shortTime(ms, 'en').includes('Nov') && shortTime(ms, 'en') === shortTime(ms, 'en-GB'), `English reads as British, got ${shortTime(ms, 'en')}`)
  check(shortTime(ms, 'de') !== shortTime(ms, 'en-GB') && shortTime(ms, 'de').includes('Nov'), `German date, got ${shortTime(ms, 'de')}`)
  check(shortTime(ms, 'not a locale!!') === shortTime(ms, 'en-GB'), 'a bad language tag falls back to British English')
  check(shortTime(ms, '') === shortTime(ms, 'en-GB'), 'no language: British English')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
