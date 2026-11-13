import {
  COUNT_MACHINE_DRAFTS, READY_SHARE, buildRows, isCheckedReady, isNewer, isReady, isReadyNow, languagesToDownload, percentOf,
  type LangStats, type ReadySources, type Snapshot,
} from './readiness'

const live = (code: string, total: number, translated: number, lastChange: string | null): LangStats =>
  ({ code, total, translated, fuzzy: 0, lastChange })

export function runReadinessTest(): number {
  console.group('[readiness] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const T1 = '2026-11-12T10:00:00Z', T2 = '2026-11-13T10:00:00Z'
  const src = (l: LangStats[] | null, bundled: Snapshot = {}, remote: Snapshot | null = null, seen: string[] = []): ReadySources =>
    ({ live: l, bundled, remote, seenReady: seen })

  check(READY_SHARE === 0.8, 'ready share is 80 %')
  check(percentOf({ total: 1418, translated: 51 }) === 3, '51 of 1418 is 3 %')
  check(percentOf({ total: 0, translated: 0 }) === 0, 'empty is 0 %')
  check(isReadyNow({ total: 100, translated: 80 }), '80 of 100 ready')
  check(!isReadyNow({ total: 100, translated: 79 }), '79 of 100 not ready')

  check(COUNT_MACHINE_DRAFTS, 'machine drafts count in 1.8')
  check(percentOf({ total: 1418, translated: 51, fuzzy: 1367 }) === 100, 'drafts count towards percent')
  check(isReadyNow({ total: 1418, translated: 51, fuzzy: 1367 }), 'drafts make a language ready now')
  check(!isCheckedReady({ total: 1418, translated: 51 }), 'checked-only readiness ignores drafts')
  check(isCheckedReady({ total: 100, translated: 80 }), 'checked-only 80 of 100 ready')
  check(percentOf({ total: 1000, translated: 300, fuzzy: 120 }) === 42, '300 + 120 drafts of 1000 is 42 %')
  check(percentOf({ total: 100, translated: 50 }) === 50, 'missing fuzzy counts as 0')
  const dr = buildRows(src([{ code: 'fr', total: 1000, translated: 300, fuzzy: 120, lastChange: T1 }, { code: 'ja', total: 200, translated: 100, fuzzy: 48, lastChange: T1 }],
    { ja: { percent: 90, total: 200, translated: 180, readySince: T1, lastChange: T1 } }), { ja: T1 }, 'download')
  const frd = dr.find(r => r.code === 'fr')!.status, jad = dr.find(r => r.code === 'ja')!.status
  check(frd.kind === 'needs' && frd.percent === 38, 'needs follows percent with drafts: 38')
  check(jad.kind === 'newWords' && jad.count === 52, 'newWords subtracts drafts: 52')

  const snapDe: Snapshot = { de: { percent: 90, total: 100, translated: 90, readySince: T1, lastChange: T1 } }
  check(isReady('de', src(null, snapDe)), 'bundled readySince is ready')
  check(isReady('de', src(null, {}, snapDe)), 'remote readySince is ready')
  check(isReady('de', src(null, {}, null, ['de'])), 'seenReady is ready')
  check(!isReady('de', src([live('de', 100, 79, T1)])), '79 % live with nothing else is not ready')
  check(isReady('de', src([live('de', 100, 80, T1)])), '80 % live is ready')

  check(isNewer(T2, T1), 'later is newer')
  check(!isNewer(null, T1), 'null is not newer')
  check(isNewer(T1, null), 'anything is newer than null')
  check(!isNewer(T1, T1), 'equal is not newer')
  check(!isNewer(null, null), 'null vs null not newer')

  // buildRows
  const l: LangStats[] = [
    live('en', 100, 100, T1),
    live('de', 100, 90, T1),
    live('fr', 1000, 420, T1),
    live('it', 100, 95, T2),
    live('es', 200, 148, T2),
    live('pt', 100, 85, T1),
  ]
  const s = src(l, { es: { percent: 90, total: 200, translated: 180, readySince: T1, lastChange: T1 } })
  const have = { de: T1, it: T1, es: T1 }
  const rows = buildRows(s, have, 'download')
  const by = (c: string) => rows.find(r => r.code === c)!
  check(!rows.some(r => r.code === 'en'), 'English never listed')
  check(rows.map(r => r.percent).every((p, i, a) => i === 0 || a[i - 1] >= p), 'sorted by percent')
  check(by('de').status.kind === 'upToDate' && by('de').tickable && by('de').ready, 'equal lastChange is upToDate')
  check(by('it').status.kind === 'newTranslations', 'newer live is newTranslations')
  const es = by('es').status
  check(es.kind === 'newWords' && es.count === 52 && by('es').ready && by('es').tickable, 'newWords 52, still ready and tickable')
  const fr = by('fr')
  check(fr.status.kind === 'needs' && fr.status.percent === 38 && !fr.tickable && !fr.ready, 'needs 38, not tickable')
  const pt = by('pt')
  check(pt.ready && !pt.tickable && pt.status.kind === 'arriving' && pt.status.when === 'nextStart', 'no words yet: arriving nextStart')
  check(buildRows(s, have, 'wait').find(r => r.code === 'pt')!.status.kind === 'arriving' &&
    (buildRows(s, have, 'wait').find(r => r.code === 'pt')!.status as { when: string }).when === 'nextVersion', 'wait: nextVersion')

  // fallbacks when live is missing
  const rr = buildRows(src(null, snapDe, { fr: { percent: 42, total: 100, translated: 42, readySince: null, lastChange: T1 } }), {}, 'download')
  check(rr.length === 1 && rr[0].code === 'fr', 'rows come from remote when there are no live numbers')
  check(buildRows(src(null, snapDe), {}, 'download').length === 1, 'rows from bundled only')

  // languagesToDownload
  const dl = languagesToDownload(s, have, ['de', 'it', 'fr'])
  check(dl.includes('it'), 'wanted and newer is downloaded')
  check(!dl.includes('de'), 'wanted but up to date is skipped')
  check(dl.includes('pt'), 'ready with no words is downloaded even if not wanted')
  check(!dl.includes('fr'), 'never-ready language is never downloaded')
  check(!dl.includes('en'), 'English never downloaded')
  check(!dl.includes('es'), 'unwanted newer-or-equal skipped')
  check(new Set(dl).size === dl.length, 'unique codes')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
