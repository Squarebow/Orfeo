import { checkTranslations } from './updates'
import type { LangStats, Snapshot } from './readiness'

const stat = (code: string, total: number, translated: number, lastChange: string | null = '2026-11-01T00:00:00Z'): LangStats =>
  ({ code, total, translated, fuzzy: 0, lastChange })

export async function runUpdatesTest(): Promise<number> {
  console.group('[updates] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const make = (stats: LangStats[] | null, remote: Snapshot | null = null) => {
    const downloads: string[] = [], remembered: string[][] = [], refreshes: Array<boolean | undefined> = []
    const bridge = {
      i18nRefresh: async (force?: boolean) => { refreshes.push(force); return { stats, remote, fetchedAt: 1, offline: stats === null } },
      i18nDownload: async (code: string) => { downloads.push(code); return 'saved' as const },
      i18nRememberReady: async (codes: string[]) => { remembered.push(codes) },
    }
    return { bridge, downloads, remembered, refreshes }
  }
  const base = { bundled: {} as Snapshot, seenReady: [] as string[], currentLanguage: 'en' }

  // download: new ready language with no words is fetched; a not-ready one is not
  {
    const f = make([stat('de', 100, 90), stat('fr', 100, 10)])
    const r = await checkTranslations({ force: true }, { ...base, bridge: f.bridge, have: {}, menuLanguages: [], updates: 'download' })
    check(f.downloads.join() === 'de', 'downloads only the ready language')
    check(f.refreshes[0] === true, 'force passed on')
    check(r.stats?.length === 2 && !r.offline, 'returns the refresh result')
    check(f.remembered.length === 1 && f.remembered[0].join() === 'de', 'ready languages remembered')
  }
  // wait: never downloads, still remembers
  {
    const f = make([stat('de', 100, 90)])
    await checkTranslations({}, { ...base, bridge: f.bridge, have: {}, menuLanguages: [], updates: 'wait' })
    check(f.downloads.length === 0, 'wait never downloads')
    check(f.remembered[0]?.join() === 'de', 'wait still remembers')
  }
  // have words, not wanted: newer translations not downloaded; wanted ones are
  {
    const f = make([stat('de', 100, 90, '2026-11-10T00:00:00Z'), stat('pl', 100, 90, '2026-11-10T00:00:00Z')])
    const have = { de: '2026-11-01T00:00:00Z', pl: '2026-11-01T00:00:00Z' }
    await checkTranslations({}, { ...base, bridge: f.bridge, have, menuLanguages: ['de'], updates: 'download' })
    check(f.downloads.join() === 'de', 'only wanted language with newer words is updated')
  }
  // current language counts as wanted
  {
    const f = make([stat('pl', 100, 90, '2026-11-10T00:00:00Z')])
    await checkTranslations({}, { ...base, bridge: f.bridge, have: { pl: '2026-11-01T00:00:00Z' }, menuLanguages: [], currentLanguage: 'pl', updates: 'download' })
    check(f.downloads.join() === 'pl', 'language in use is kept up to date')
  }
  // drafts: remembered list is checked-only
  {
    const s = { ...stat('de', 100, 50), fuzzy: 40 }
    const f = make([s, stat('fr', 100, 85)])
    await checkTranslations({}, { ...base, bridge: f.bridge, have: {}, menuLanguages: [], updates: 'download' })
    check(f.remembered[0]?.join() === 'fr', 'draft-only language not remembered')
    check(f.downloads.sort().join() === 'de,fr', 'draft-ready language still downloads')
  }
  // offline: no live numbers, nothing remembered, no crash
  {
    const f = make(null)
    const r = await checkTranslations({}, { ...base, bridge: f.bridge, have: {}, menuLanguages: [], updates: 'download' })
    check(r.offline && f.remembered.length === 0 && f.downloads.length === 0, 'offline does nothing')
  }
  // a failing download does not stop the rest
  {
    const f = make([stat('de', 100, 90), stat('fr', 100, 90)])
    const bridge = { ...f.bridge, i18nDownload: async (c: string) => { f.downloads.push(c); if (c === 'de') throw new Error('x'); return 'saved' as const } }
    await checkTranslations({}, { ...base, bridge, have: {}, menuLanguages: [], updates: 'download' })
    check(f.downloads.length === 2, 'one failure does not stop the others')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
