// The words Orfeo ships, by language code (zh_Hans.json is zh_Hans): checked texts only,
// written by `npm run i18n:ready` at release. ./locales/ is Weblate's own copy, machine
// drafts included, and is never read by the app. English is the source text.
const files = import.meta.glob('./shipped/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>

export const CATALOGS: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(files)
    .map(([path, catalog]) => [path.replace(/^.*\/|\.json$/g, ''), catalog] as const)
    .filter(([code]) => code !== 'en'),
)
