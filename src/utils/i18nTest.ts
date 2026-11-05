import { pseudo, t, translated } from './i18n'

export function runI18nTest(): number {
  console.group('[i18n] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const parts = (s: TemplateStringsArray) => s

  const catalog = { 'Keep': '保留', '{{v0}} bpm from {{v1}}': '从 {{v1}} 起 {{v0}} bpm', 'Empty': '' }
  check(translated(catalog, parts`Keep`, []) === '保留', 'a plain text')
  check(translated(catalog, ['', ' bpm from ', ''], [120, '0:10']) === '从 0:10 起 120 bpm', 'values in the translated order')
  check(translated(catalog, parts`Not there`, []) === 'Not there', 'falls back to English')
  check(translated(catalog, parts`Empty`, []) === 'Empty', 'an untranslated text stays English')
  check(translated(undefined, ['', ' bars'], [4]) === '4 bars', 'no language chosen')
  check(t`Plain ${1} text` === 'Plain 1 text', 't works in English')

  check(pseudo('Keep') === '[Kéép~~]', `test language, got ${pseudo('Keep')}`)

  console.log(`i18n: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
