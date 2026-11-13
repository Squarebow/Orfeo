// Language names in their own language, so a speaker can find theirs.
// Endonyms: deliberately not wrapped in t``.

const NAMES: Record<string, string> = {
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  pl: 'Polski',
  pt_BR: 'Português brasileiro',
  ru: 'Русский',
  sl: 'Slovenščina',
  zh_Hans: '简体中文',
  en: 'English',
}

export function languageName(code: string): string {
  if (Object.prototype.hasOwnProperty.call(NAMES, code)) return NAMES[code]
  const tag = code.replace(/_/g, '-')
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
    const clean = (name ?? '').replace(/\s*[(（][^)）]*[)）]/g, '').trim()
    if (clean && clean !== tag) return clean
  } catch { /* invalid tag: use the code */ }
  return code
}
