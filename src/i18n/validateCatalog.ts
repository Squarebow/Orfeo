// Checks a downloaded language file before the app uses it. Anything that
// could break the screen is dropped, so English shows there instead.

const MIN_KEPT_SHARE = 0.1

const placeholders = (s: string): string => (s.match(/\{\{v\d+\}\}/g) ?? []).sort().join('|')

export function validateCatalog(
  raw: unknown,
  english: Record<string, string>,
): { catalog: Record<string, string>; kept: number; dropped: number } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.some(([, v]) => typeof v !== 'string')) return null

  const catalog: Record<string, string> = {}
  let kept = 0
  let dropped = 0
  for (const [key, value] of entries as [string, string][]) {
    if (!Object.prototype.hasOwnProperty.call(english, key) || value === '' ||
        placeholders(key) !== placeholders(value)) {
      dropped++
      continue
    }
    catalog[key] = value
    kept++
  }

  const total = Object.keys(english).length
  if (total === 0 || kept / total < MIN_KEPT_SHARE) return null
  return { catalog, kept, dropped }
}
