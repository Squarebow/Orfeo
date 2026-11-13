import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import english from '../src/i18n/locales/en.json'
import { bootState, download, refresh, rememberReady, weblateFile, WEBLATE_LIST, EVER_READY_URL, type TranslationsDeps } from './translations'
import type { Snapshot } from '../src/i18n/readiness'

const en = english as Record<string, string>

export async function runTranslationsTest(): Promise<number> {
  console.group('[translations] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const root = mkdtempSync(join(tmpdir(), 'orfeo-tr-'))
  let n = 0
  const fresh = () => join(root, `d${n++}`)
  try {
    const page1 = { next: 'https://x/page2', results: [
      { language_code: 'en', total: 10, translated: 10, fuzzy: 0, last_change: '2026-11-01T00:00:00Z' },
      { language_code: 'de', total: 10, translated: 9, fuzzy: 1, last_change: '2026-11-02T00:00:00Z' }] }
    const page2 = { next: null, results: [{ language_code: 'fr', total: 10, translated: 2, fuzzy: 0, last_change: null }] }
    const remoteSnap: Snapshot = { de: { percent: 90, total: 10, translated: 9, readySince: '2026-11-02T00:00:00Z', lastChange: '2026-11-02T00:00:00Z' } }
    const keys = Object.keys(en)
    const goodCatalog: Record<string, string> = {}
    for (const k of keys) goodCatalog[k] = 'T:' + k
    const calls: string[] = []
    const headers: unknown[] = []
    let offline = false
    const fakeFetch = (async (url: string, init?: { headers?: unknown }) => {
      calls.push(url)
      headers.push(init?.headers)
      if (offline) throw new Error('offline')
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
      if (url === WEBLATE_LIST) return ok(page1)
      if (url === 'https://x/page2') return ok(page2)
      if (url === EVER_READY_URL) return ok(remoteSnap)
      if (url === weblateFile('de')) return ok(goodCatalog)
      if (url === weblateFile('fr')) return ok({ 'Not in English': 'x' })
      return { ok: false, status: 404, json: async () => ({}) } as Response
    }) as unknown as typeof fetch
    let now = 1_000_000
    const mk = (dir: string): TranslationsDeps => ({ fetch: fakeFetch, dir, now: () => now })

    // refresh: pages, mapping, English left out, cache
    const d1 = fresh(), deps1 = mk(d1)
    let r = await refresh(deps1)
    check(calls.length === 3 && calls.includes('https://x/page2'), 'follows next pages and reads the remote record')
    check(r.stats?.length === 2 && r.stats[0].code === 'de' && r.stats[0].fuzzy === 1 && r.stats[0].lastChange === '2026-11-02T00:00:00Z', 'maps fields, no English')
    check(r.remote?.de?.percent === 90 && !r.offline && r.fetchedAt === now, 'remote and fetchedAt')
    check(headers.every(h => JSON.stringify(h) === '{"User-Agent":"Orfeo"}'), 'only User-Agent is sent')
    check(existsSync(join(d1, 'stats.json')) && existsSync(join(d1, 'remote.json')), 'cache files written')
    now += 1000; calls.length = 0
    r = await refresh(deps1)
    check(calls.length === 0 && r.stats?.length === 2, 'second refresh within the hour makes no request')
    r = await refresh(deps1, true)
    check(calls.length === 3, 'force asks again')
    now += 3_600_001; calls.length = 0
    await refresh(deps1)
    check(calls.length === 3, 'asks again after an hour')

    // failure: cached numbers, offline
    offline = true
    r = await refresh(deps1, true)
    check(r.offline && r.stats?.length === 2 && r.remote?.de !== undefined, 'failure returns cache with offline')
    r = await refresh(mk(fresh()), true)
    check(r.offline && r.stats === null && r.remote === null && r.fetchedAt === null, 'failure without cache gives null')
    offline = false

    // download
    const d2 = fresh(), deps2 = mk(d2)
    await refresh(deps2)
    check(await download(deps2, 'de') === 'saved', 'valid download saved')
    check(existsSync(join(d2, 'de.json')), 'de.json written')
    const dl = JSON.parse(readFileSync(join(d2, 'downloaded.json'), 'utf8'))
    check(dl.de === '2026-11-02T00:00:00Z', 'lastChange recorded from stats')
    const before = readFileSync(join(d2, 'de.json'), 'utf8')
    check(await download(deps2, 'fr') === 'invalid', 'invalid file refused')
    check(!existsSync(join(d2, 'fr.json')) && !('fr' in JSON.parse(readFileSync(join(d2, 'downloaded.json'), 'utf8'))), 'invalid leaves nothing')
    offline = true
    check(await download(deps2, 'de') === 'failed', 'failed fetch')
    offline = false
    check(readFileSync(join(d2, 'de.json'), 'utf8') === before, 'old file untouched after failure')
    check(await download(deps2, 'xx') === 'failed', '404 is failed')

    // bootState
    let b = bootState(deps2, {})
    check(b.downloaded.de?.lastChange === '2026-11-02T00:00:00Z' && b.downloaded.de.catalog[keys[0]] === 'T:' + keys[0], 'boot reads downloads')
    check(b.stats?.length === 2 && b.remote?.de !== undefined && b.fetchedAt !== null, 'boot has cache')
    writeFileSync(join(d2, 'de.json'), '{broken')
    b = bootState(deps2, {})
    check(!('de' in b.downloaded), 'corrupt download left out')
    writeFileSync(join(d2, 'de.json'), before)
    const bundledNew: Snapshot = { de: { percent: 100, total: 10, translated: 10, readySince: null, lastChange: '2026-11-05T00:00:00Z' } }
    b = bootState(deps2, bundledNew)
    check(!('de' in b.downloaded) && !existsSync(join(d2, 'de.json')), 'download older than bundled is deleted')
    check(!('de' in JSON.parse(readFileSync(join(d2, 'downloaded.json'), 'utf8'))), 'and forgotten')
    const b0 = bootState(mk(fresh()), {})
    check(b0.stats === null && b0.remote === null && b0.fetchedAt === null && b0.seenReady.length === 0, 'empty folder boots empty')

    // unsafe codes
    const d4 = fresh(), deps4 = mk(d4)
    check(await download(deps4, '../evil') === 'failed' && !existsSync(join(d4, '..', 'evil.json')) && !calls.some(u => u.includes('evil')), 'bad code refused, nothing written')
    rememberReady(deps4, ['../x', 'de'])
    check(bootState(deps4, {}).seenReady.join() === 'de', 'bad code not remembered')
    page2.results.push({ language_code: '../bad', total: 1, translated: 1, fuzzy: 0, last_change: null })
    r = await refresh(mk(fresh()), true)
    check(r.stats?.every(s => s.code !== '../bad') === true && r.stats?.length === 2, 'bad code in Weblate list left out')
    // clock moved back: a cache from the future counts as stale
    const deps5 = mk(fresh()); await refresh(deps5)
    now -= 10_000; calls.length = 0
    await refresh(deps5)
    check(calls.length === 3, 'cache from the future is stale')

    // rememberReady
    const deps3 = mk(fresh())
    rememberReady(deps3, ['de', 'fr']); rememberReady(deps3, ['de', 'pl'])
    check(bootState(deps3, {}).seenReady.join() === 'de,fr,pl', 'rememberReady adds once')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
