import enCatalog from '../i18n/locales/en.json'
import zhTwCatalog from '../i18n/locales/zh-TW.json'

export type AppLocale = 'en' | 'zh-TW'

const stored = typeof localStorage !== 'undefined'
  ? localStorage.getItem('orfeo-locale')
  : null
export const currentLocale: AppLocale =
  stored === 'zh-TW' ? 'zh-TW' : 'en'

const catalogs: Record<AppLocale, Record<string, string>> = {
  'en': enCatalog,
  'zh-TW': zhTwCatalog,
}
const catalog = catalogs[currentLocale]

export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  const key = strings.reduce(
    (acc, str, i) => acc + str + (i < values.length ? `{{v${i}}}` : ''),
    '',
  )
  let result = catalog[key] ?? key
  for (let i = 0; i < values.length; i++) {
    result = result.replaceAll(`{{v${i}}}`, String(values[i]))
  }
  return result
}
