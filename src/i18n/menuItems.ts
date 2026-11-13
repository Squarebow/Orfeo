// The languages the menu under the logo lists: English first, then the ticked
// languages that have words on this computer, in the order they were ticked.
export function menuItems(menuLanguages: readonly string[], hasWords: (code: string) => boolean): string[] {
  const out = ['en']
  for (const c of menuLanguages) if (c !== 'en' && !out.includes(c) && hasWords(c)) out.push(c)
  return out
}

// Whether picking a language should ask to reload: the language in use does
// nothing, unless Follow system is on (then it saves that language explicitly).
export function pickChangesLanguage(code: string, choice: string, system: string): boolean {
  return code !== choice || choice === system
}
