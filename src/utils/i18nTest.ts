import { defaultChoice, pseudo, resolveLanguage, SYSTEM, t, translated, wordsFor, systemLocale } from './i18n'
import type { BootState } from '../../electron/translations'

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

  // Which languages Orfeo has words for, and which are ready: injected, as the page and main do
  const words = new Set(['zh_Hans', 'de', 'fr', 'pt_BR'])
  const ready = new Set(['zh_Hans', 'de'])
  const hasWords = (c: string) => words.has(c)
  const isReady = (c: string) => ready.has(c)
  const pick = (choice: string, locale: string) => resolveLanguage(choice, locale, isReady, hasWords)
  for (const locale of ['zh-CN', 'zh', 'zh-Hans', 'zh_CN', 'zh-SG']) check(pick(SYSTEM, locale) === 'zh_Hans', `${locale} means Simplified`)
  for (const locale of ['zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW']) check(pick(SYSTEM, locale) === 'en', `${locale} isn't sent to Simplified`)
  for (const locale of ['en-US', 'sl-SI', '']) check(pick(SYSTEM, locale) === 'en', `${locale || 'no locale'} is English`)
  check(pick(SYSTEM, 'de-AT') === 'de', 'German computer, German ready')
  check(pick(SYSTEM, 'fr-FR') === 'en', 'French has words but is not ready: English')
  check(pick(SYSTEM, 'pt-BR') === 'en', 'Brazilian Portuguese not ready: English')
  check(resolveLanguage(SYSTEM, 'pt-BR', () => true, hasWords) === 'pt_BR', 'a regional code is found')
  check(resolveLanguage(SYSTEM, 'it-IT', () => true, hasWords) === 'en', 'ready but no words: English')
  check(pick('en', 'zh-CN') === 'en', 'a chosen language beats the computer')
  check(pick('nonsense', 'en-US') === 'en', 'an unknown saved language is English')
  check(pick('fr', 'en-US') === 'fr', 'a chosen language with words stays even if not ready')
  check(resolveLanguage('de', 'en-US', () => false, hasWords) === 'de', 'a chosen language is never switched back')
  check(pick('it', 'en-US') === 'en', 'a chosen language with no words at all is English')
  check(pick('pseudo', 'en-US') === 'pseudo', 'the test language resolves in test builds')
  check(defaultChoice() === 'en', 'nothing saved means English')

  // Downloaded words go on top of the shipped ones: a text reworded since keeps its old translation
  const bootWith = (d: Record<string, string>): BootState => ({ seenReady: [], downloaded: { de: { catalog: d, lastChange: null } }, stats: null, fetchedAt: null, remote: null, locale: '' })
  const shipped = { de: { Old: 'Alt', Same: 'Gleich' } }
  const merged = wordsFor('de', bootWith({ Same: 'Gleich neu', New: 'Neu' }), shipped)
  check(merged?.Old === 'Alt' && merged?.Same === 'Gleich neu' && merged?.New === 'Neu', 'downloaded words win, shipped ones fill the gaps')
  check(wordsFor('de', null, shipped)?.Old === 'Alt', 'no download: shipped words')
  check(wordsFor('it', bootWith({}), shipped) === undefined, 'no words at all: nothing')
  // Follow system: the page uses the computer language main read, so both pick the same language
  check(systemLocale({ ...bootWith({}), locale: 'de-AT' }, 'en-US') === 'de-AT', 'the computer language from main wins')
  check(systemLocale({ ...bootWith({}), locale: '' }, 'en-US') === 'en-US' && systemLocale(null, 'fr') === 'fr', 'no locale from main: the page uses its own')
  check(wordsFor('de', { ...bootWith({}), downloaded: { de: { catalog: { New: 'Neu' }, lastChange: null } } }, {})?.New === 'Neu', 'download only: its words')

  console.log(`i18n: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
