import { CATALOGS } from '../i18n/catalogs'

// ── Translations. `t` looks a text up in the chosen language and falls back to
// the English, text by text, so a half-translated language still works. Many
// texts are read once at start-up, so changing language reloads the window.
// See docs/I18N_PLAN.md (gitignored) for the full rollout plan. ───────────────
const LANGUAGE_KEY = 'orfeo-language'
const ENGLISH = 'en'

export const LANGUAGES = [
  { code: ENGLISH, name: 'English', htmlLang: 'en' },
  { code: 'zh_Hans', name: '简体中文', htmlLang: 'zh-Hans' },
].filter(l => l.code === ENGLISH || CATALOGS[l.code])

function savedLanguage(): string {
  try {
    const code = localStorage.getItem(LANGUAGE_KEY)
    return code && LANGUAGES.some(l => l.code === code) ? code : ENGLISH
  } catch { return ENGLISH }
}

export const currentLanguage = savedLanguage()
const catalog = CATALOGS[currentLanguage]

if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = LANGUAGES.find(l => l.code === currentLanguage)?.htmlLang ?? 'en'
}

export function changeLanguage(code: string) {
  localStorage.setItem(LANGUAGE_KEY, code)
  location.reload()
}

// Same key as scripts/i18n-extract.mjs: the English with ${…} parts as {{v0}}, {{v1}}…
export function translated(found: Record<string, string> | undefined, strings: readonly string[], values: unknown[]): string {
  const text = found?.[strings.reduce((acc, str, i) => acc + str + (i < values.length ? `{{v${i}}}` : ''), '')]
  if (text) return text.replace(/\{\{v(\d+)\}\}/g, (_, i) => String(values[Number(i)]))
  return strings.reduce((acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''), '')
}

export function t(strings: TemplateStringsArray, ...values: unknown[]): string {
  return translated(catalog, strings, values)
}
