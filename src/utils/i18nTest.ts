import { languageForLocale, pseudo, resolveLanguage, SYSTEM, t, translated } from './i18n'

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

  const both = [{ code: 'en', htmlLang: 'en' }, { code: 'zh_Hans', htmlLang: 'zh-Hans' }]
  for (const locale of ['zh-CN', 'zh', 'zh-Hans', 'zh_CN', 'zh-SG']) check(languageForLocale(locale, both) === 'zh_Hans', `${locale} means Simplified`)
  for (const locale of ['zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW']) check(languageForLocale(locale, both) === 'en', `${locale} isn't sent to Simplified`)
  for (const locale of ['en-US', 'sl-SI', 'de', '']) check(languageForLocale(locale, both) === 'en', `${locale || 'no locale'} is English`)
  check(resolveLanguage(SYSTEM, 'en-US') === 'en', 'Follow system reads the computer')
  check(resolveLanguage('en', 'zh-CN') === 'en', 'a chosen language beats the computer')
  check(resolveLanguage('nonsense', 'en-US') === 'en', 'an unknown saved language is English')

  console.log(`i18n: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
