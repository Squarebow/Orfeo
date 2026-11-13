// The languages the menu under the logo lists: English first, then the ticked
// languages that have words on this computer, in the order they were ticked.
// The language in use is always there (after English if it isn't ticked), so it can be seen and picked again.
export function menuItems(menuLanguages: readonly string[], hasWords: (code: string) => boolean, inUse = 'en'): string[] {
  const out = ['en']
  if (inUse !== 'en' && !menuLanguages.includes(inUse) && hasWords(inUse)) out.push(inUse)
  for (const c of menuLanguages) if (c !== 'en' && !out.includes(c) && hasWords(c)) out.push(c)
  return out
}

// Whether picking a language should ask to reload: the language in use does
// nothing, unless Follow system is on (then it saves that language explicitly).
export function pickChangesLanguage(code: string, choice: string, system: string): boolean {
  return code !== choice || choice === system
}
