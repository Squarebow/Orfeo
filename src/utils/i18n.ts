import { CATALOGS } from '../i18n/catalogs'

// ── Translations. `t` looks a text up in the chosen language and falls back to
// the English, text by text, so a half-translated language still works. Many
// texts are read once at start-up, so changing language reloads the window.
// See docs/I18N_PLAN.md (gitignored) for the full rollout plan. ───────────────
const LANGUAGE_KEY = 'orfeo-language'
const ENGLISH = 'en'
// The default choice: whichever language the computer uses, if Orfeo has it
export const SYSTEM = 'system'

// Test builds only: every prepared text comes out bracketed, accented and longer,
// so plain English left on screen stands out, and so do layouts that can't stretch
const PSEUDO = 'pseudo'
const testTools = import.meta.env?.DEV || import.meta.env?.MODE === 'test-build'

export const LANGUAGES = [
  { code: ENGLISH, name: 'English', htmlLang: 'en' },
  { code: 'zh_Hans', name: '简体中文', htmlLang: 'zh-Hans' },
  ...(testTools ? [{ code: PSEUDO, name: 'Pseudo (test builds only)', htmlLang: 'en' }] : []),
].filter(l => l.code === ENGLISH || l.code === PSEUDO || CATALOGS[l.code])

// Traditional Chinese readers aren't sent to Simplified: they get English until
// Orfeo has their script, and can still pick Simplified from the menu
export function languageForLocale(locale: string, languages: readonly { code: string; htmlLang: string }[] = LANGUAGES): string {
  const tag = locale.toLowerCase().replace(/_/g, '-')
  if (/^zh\b/.test(tag) && /hant|-tw|-hk|-mo/.test(tag)) return ENGLISH
  const primary = tag.split('-')[0]
  return languages.find(l => l.code !== PSEUDO && l.htmlLang.split('-')[0] === primary)?.code ?? ENGLISH
}

export function resolveLanguage(choice: string, locale: string): string {
  if (choice === SYSTEM) return languageForLocale(locale)
  return LANGUAGES.some(l => l.code === choice) ? choice : ENGLISH
}

function savedChoice(): string {
  try {
    const code = localStorage.getItem(LANGUAGE_KEY)
    return code === SYSTEM || LANGUAGES.some(l => l.code === code) ? code! : SYSTEM
  } catch { return SYSTEM }
}

export const currentChoice = savedChoice()
export const currentLanguage = resolveLanguage(currentChoice, typeof navigator === 'undefined' ? '' : navigator.language)
let language = currentLanguage
let catalog = CATALOGS[language]

// The main process has no saved language of its own: it's told at start-up and on change
export function applyLanguage(code: string) {
  language = code
  catalog = CATALOGS[code]
}

const ACCENTS: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú' }
export const pseudo = (text: string): string =>
  `[${text.replace(/[aeiouAEIOU]/g, v => ACCENTS[v])}${'~'.repeat(Math.ceil(text.length * 0.3))}]`

if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = LANGUAGES.find(l => l.code === currentLanguage)?.htmlLang ?? 'en'
}

export async function changeLanguage(code: string) {
  localStorage.setItem(LANGUAGE_KEY, code)
  await window.electronAPI.setLanguage(code)
  location.reload()
}

// Same key as scripts/i18n-extract.mjs: the English with ${…} parts as {{v0}}, {{v1}}…
export function translated(found: Record<string, string> | undefined, strings: readonly string[], values: unknown[]): string {
  const text = found?.[strings.reduce((acc, str, i) => acc + str + (i < values.length ? `{{v${i}}}` : ''), '')]
  if (text) return text.replace(/\{\{v(\d+)\}\}/g, (_, i) => String(values[Number(i)]))
  return strings.reduce((acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''), '')
}

// A name that's also data, marked with n() (i18n/mark.ts), translated for showing
export function tName(name: string): string {
  return language === PSEUDO ? pseudo(name) : catalog?.[name] || name
}

export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  if (language === PSEUDO) return pseudo(translated(undefined, strings, values))
  return translated(catalog, strings, values)
}
