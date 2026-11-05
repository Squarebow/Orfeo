// Every translation file Weblate has delivered, by language code (zh_Hans.json
// is zh_Hans). English is the source text, so it needs no catalog.
const files = import.meta.glob('./locales/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>

export const CATALOGS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(files)
    .map(([path, catalog]) => [path.replace(/^.*\/|\.json$/g, ''), catalog] as const)
    .filter(([code]) => code !== 'en'),
)
