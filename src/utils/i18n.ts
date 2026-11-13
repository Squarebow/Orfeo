import { CATALOGS } from '../i18n/catalogs'
import { isReady, type Snapshot } from '../i18n/readiness'
import bundledTranslations from '../i18n/translations.json'
import type { BootState } from '../../electron/translations'

// ── Translations. `t` looks a text up in the chosen language and falls back to
// the English, text by text, so a half-translated language still works. Many
// texts are read once at start-up, so changing language reloads the window.
// See docs/I18N_PLAN.md (gitignored) for the full rollout plan. ───────────────
const LANGUAGE_KEY = 'orfeo-language'
const ENGLISH = 'en'
// "Follow system language": the computer's language, if Orfeo has it ready
export const SYSTEM = 'system'

// Test builds only: every prepared text comes out bracketed, accented and longer,
// so plain English left on screen stands out, and so do layouts that can't stretch
const PSEUDO = 'pseudo'
const testTools = import.meta.env?.DEV || import.meta.env?.MODE === 'test-build'

const BUNDLED = bundledTranslations as Snapshot

// What the main process read from disk before the page started (null outside the app)
function readBoot(): BootState | null {
  try { return (typeof window !== 'undefined' && window.electronAPI?.i18nBoot?.()) || null } catch { return null }
}
const boot = readBoot()

// Words Orfeo has: shipped with the app, or downloaded earlier
export const hasWords = (code: string, b: BootState | null = boot): boolean => !!CATALOGS[code] || !!b?.downloaded[code]
export const isLanguageReady = (code: string, b: BootState | null = boot): boolean =>
  isReady(code, { live: b?.stats ?? null, bundled: BUNDLED, remote: b?.remote ?? null, seenReady: b?.seenReady ?? [] })
const catalogFor = (code: string, b: BootState | null = boot) => b?.downloaded[code]?.catalog ?? CATALOGS[code]

// What start-up knows, for the Settings page and the menu
function codesWithWords(b: BootState | null): string[] {
  return [...new Set([...Object.keys(CATALOGS), ...Object.keys(b?.downloaded ?? {})])]
}
export const startup: { ready: string[]; have: Record<string, string | null>; boot: BootState | null } = {
  ready: [...new Set([...codesWithWords(boot), ...Object.keys(BUNDLED), ...(boot?.stats?.map(s => s.code) ?? []), ...Object.keys(boot?.remote ?? {}), ...(boot?.seenReady ?? [])])]
    .filter(c => c !== ENGLISH && isLanguageReady(c)),
  have: Object.fromEntries(codesWithWords(boot).map(c => [c, boot?.downloaded[c]?.lastChange ?? BUNDLED[c]?.lastChange ?? null])),
  boot,
}

// Languages the old switcher menu lists (a later menu replaces it)
export const LANGUAGES = [
  { code: ENGLISH, name: 'English', htmlLang: 'en' },
  { code: 'zh_Hans', name: '简体中文', htmlLang: 'zh-Hans' },
].filter(l => l.code === ENGLISH || hasWords(l.code))

// The codes a computer language could mean, best match first. Traditional Chinese
// readers aren't sent to Simplified: they get English until Orfeo has their script.
function codesForLocale(locale: string): string[] {
  const parts = locale.replace(/_/g, '-').split('-').filter(Boolean)
  if (!parts.length) return []
  const lang = parts[0].toLowerCase()
  const tag = parts.join('-').toLowerCase()
  if (lang === 'zh') return /hant|-tw|-hk|-mo/.test(tag) ? [] : ['zh_Hans']
  const region = parts.slice(1).find(p => /^[A-Za-z]{2}$/.test(p))
  return [...(region ? [`${lang}_${region.toUpperCase()}`] : []), lang]
}

export function languageForLocale(locale: string, ok: (code: string) => boolean): string {
  return codesForLocale(locale).find(ok) ?? ENGLISH
}

export const defaultChoice = (): string => ENGLISH

export function resolveLanguage(choice: string, locale: string, ready: (code: string) => boolean, has: (code: string) => boolean): string {
  if (choice === PSEUDO) return testTools ? PSEUDO : ENGLISH
  if (choice === SYSTEM) return languageForLocale(locale, c => has(c) && ready(c))
  return choice !== ENGLISH && has(choice) ? choice : ENGLISH
}

// The language and words to start with, from the saved choice: the main process uses
// this too, so both sides read the same words
export function chooseStartup(choice: string, locale: string, b: BootState | null = boot): { code: string; catalog: Record<string, string> | undefined } {
  const code = resolveLanguage(choice, locale, c => isLanguageReady(c, b), c => hasWords(c, b))
  return { code, catalog: catalogFor(code, b) }
}

function savedChoice(): string {
  try {
    const code = localStorage.getItem(LANGUAGE_KEY)
    return code === SYSTEM || code === PSEUDO || (!!code && (code === ENGLISH || hasWords(code))) ? code : defaultChoice()
  } catch { return defaultChoice() }
}

export const currentChoice = savedChoice()
const initial = chooseStartup(currentChoice, typeof navigator === 'undefined' ? '' : navigator.language)
export const currentLanguage = initial.code
let language = currentLanguage
let catalog = initial.catalog

// The main process has no saved language of its own: it's told at start-up and on change
export function applyLanguage(code: string, words?: Record<string, string>) {
  language = code
  catalog = words ?? CATALOGS[code]
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
