import { mergeRecord, releaseWords, type ReleaseWordsDeps } from './releaseWords'
import type { Snapshot } from './readiness'

export async function runReleaseWordsTest(): Promise<number> {
  console.group('[releaseWords] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // mergeRecord: the same rule as tools/stats/translations.py merge()
  const row = (total: number, translated: number, fuzzy = 0, lastChange: string | null = '2026-11-01T10:00:00Z') => ({ total, translated, fuzzy, lastChange })
  let r = mergeRecord({}, { de: row(100, 79) }, '2026-11-01')
  check(r.de.readySince === null, '79 % checked is not ready')
  r = mergeRecord(r, { de: row(100, 80) }, '2026-11-02')
  check(r.de.readySince === '2026-11-02', 'readySince set on first reaching 80 %')
  r = mergeRecord(r, { de: row(100, 10) }, '2026-11-04')
  check(r.de.readySince === '2026-11-02', 'never cleared when it drops')
  r = mergeRecord(r, {}, '2026-11-05')
  check(r.de.readySince === '2026-11-02', 'kept when missing from the list')
  r = mergeRecord(r, { fr: row(100, 0, 85) }, '2026-11-05')
  check(r.fr.readySince === null && r.fr.percent === 85, 'drafts count in percent, never in readySince')
  check(r.fr.total === 100 && r.fr.translated === 0 && r.fr.fuzzy === 85 && r.fr.lastChange === '2026-11-01T10:00:00Z', 'fields as given')
  r = mergeRecord(r, { es: row(0, 0) }, '2026-11-06')
  check(r.es.percent === 0 && r.es.readySince === null, 'empty component')
  check(Object.keys(r).join() === 'de,es,fr', 'sorted by code')

  // releaseWords
  const english: Record<string, string> = {}
  for (let i = 0; i < 20; i++) english[`Text ${i} {{v0}}`] = `Text ${i} {{v0}}`
  const keys = Object.keys(english)
  const words = (n: number, tag: string) => Object.fromEntries(keys.slice(0, n).map(k => [k, `${tag} ${k}`]))
  const LIST = 'list', LIST2 = 'list2', RECORD = 'record'
  const file = (c: string) => `file/${c}`
  const run = async (answers: Record<string, unknown>, previous: Snapshot = {}, failWrite: string[] = []) => {
    const asked: string[] = []
    const written: Record<string, Record<string, string>> = {}
    const deps: ReleaseWordsDeps = {
      get: async (url: string) => { asked.push(url); if (!(url in answers)) throw new Error('HTTP 404'); return answers[url] },
      listUrl: LIST, recordUrl: RECORD, fileUrl: file, english, previous, today: '2026-11-13',
      isCode: c => /^[a-z]{2}(_[A-Za-z]+)?$/.test(c),
      write: (code, catalog) => { if (failWrite.includes(code)) throw new Error('disk full'); written[code] = catalog },
    }
    const out = await releaseWords(deps)
    return { out, asked, written }
  }
  const T_DE = '2026-11-13T08:00:00Z', T_ZH = '2026-11-12T08:00:00Z', T_OLD = '2026-10-01T00:00:00Z'
  const list = { next: LIST2, results: [
    { language_code: 'en', total: 20, translated: 20, fuzzy: 0, last_change: T_DE },
    { language_code: 'de', total: 20, translated: 2, fuzzy: 18, last_change: T_DE }] }
  const list2 = { next: null, results: [
    { language_code: 'zh_Hans', total: 20, translated: 17, fuzzy: 0, last_change: T_ZH },
    { language_code: 'sl', total: 20, translated: 1, fuzzy: 0, last_change: T_ZH }] }

  // no record on the stats branch: the snapshot comes from Weblate's list
  {
    const prev: Snapshot = { zh_Hans: { percent: 90, total: 20, translated: 18, readySince: '2026-11-01', lastChange: T_OLD } }
    const { out, asked, written } = await run({ [LIST]: list, [LIST2]: list2, [file('de')]: words(20, 'DE'), [file('zh_Hans')]: { ...words(19, 'ZH'), 'Gone text': 'x', [keys[19]]: '' }, [file('sl')]: words(1, 'SL') }, prev)
    const s = out.snapshot!
    check(!!s && Object.keys(s).join() === 'de,sl,zh_Hans', `languages from the list, English left out, got ${s && Object.keys(s).join()}`)
    check(asked.includes(LIST2), 'follows next pages')
    check(s.de.percent === 100 && s.de.readySince === null && s.de.lastChange === T_DE, 'drafts in percent, no readySince for drafts, lastChange from the same run')
    check(s.zh_Hans.readySince === '2026-11-01', 'a readySince already bundled is kept')
    check(s.zh_Hans.lastChange === T_ZH && s.zh_Hans.translated === 17, 'written language: fresh entry')
    check(Object.keys(written).sort().join() === 'de,zh_Hans', 'files written for languages that pass the check')
    check(!!written.zh_Hans && !('Gone text' in written.zh_Hans) && !(keys[19] in written.zh_Hans) && Object.keys(written.zh_Hans).length === 19, 'unknown and empty texts left out of the file')
    check(!('sl' in written) && s.sl.lastChange === null, 'a refused file (too few texts) is not written; no previous entry: no lastChange')
    check(!asked.includes(file('en')), 'English is never downloaded')
  }
  // with a record on the stats branch: its readySince is used, counts and lastChange from the list
  {
    const record: Snapshot = { de: { percent: 50, total: 20, translated: 16, readySince: '2026-11-10', lastChange: T_OLD } }
    const { out } = await run({ [LIST]: list, [LIST2]: list2, [RECORD]: record, [file('de')]: words(20, 'DE'), [file('zh_Hans')]: words(19, 'ZH') })
    const s = out.snapshot!
    check(s.de.readySince === '2026-11-10' && s.de.lastChange === T_DE && s.de.percent === 100, 'record readySince, fresh counts and lastChange')
    check(s.zh_Hans.readySince === '2026-11-13', 'checked-ready today gets today')
  }
  // a file that fails keeps the language's previous entry
  {
    const prev: Snapshot = { de: { percent: 70, total: 20, translated: 14, readySince: null, lastChange: T_OLD } }
    const { out, written } = await run({ [LIST]: list, [LIST2]: list2, [file('zh_Hans')]: words(19, 'ZH') }, prev)
    check(!('de' in written) && JSON.stringify(out.snapshot!.de) === JSON.stringify(prev.de), 'download failed: previous entry kept as it was')
    const w = await run({ [LIST]: list, [LIST2]: list2, [file('de')]: words(20, 'DE'), [file('zh_Hans')]: words(19, 'ZH') }, prev, ['de'])
    check(JSON.stringify(w.out.snapshot!.de) === JSON.stringify(prev.de) && 'zh_Hans' in w.written, 'write failed: previous entry kept, the others carry on')
    const bad = await run({ [LIST]: list, [LIST2]: list2, [file('de')]: { [keys[0]]: 'no placeholder' }, [file('zh_Hans')]: ['not', 'an', 'object'] }, prev)
    check(Object.keys(bad.written).length === 0 && bad.out.snapshot!.de.lastChange === T_OLD, 'files that fail the check are not written')
  }
  // a previous readySince is never lost, even when the file fails
  {
    const prev: Snapshot = { de: { percent: 70, total: 20, translated: 14, readySince: null, lastChange: T_OLD } }
    const record: Snapshot = { de: { percent: 90, total: 20, translated: 18, readySince: '2026-11-10', lastChange: T_OLD } }
    const { out } = await run({ [LIST]: list, [LIST2]: list2, [RECORD]: record }, prev)
    check(out.snapshot!.de.readySince === '2026-11-10' && out.snapshot!.de.lastChange === T_OLD, 'failed file: previous entry, but the readySince is kept')
  }
  // Weblate unreadable or empty
  {
    const prev: Snapshot = { de: { percent: 70, total: 20, translated: 14, readySince: null, lastChange: T_OLD } }
    const empty = await run({ [LIST]: { next: null, results: [{ language_code: 'en', total: 1, translated: 1, fuzzy: 0, last_change: null }] } }, prev)
    check(empty.out.snapshot === null && Object.keys(empty.written).length === 0, 'only English and no record: nothing written')
    const none = await run({}, prev)
    check(none.out.snapshot === null && none.out.notes.length > 0, 'nothing readable: nothing written, a note says why')
    const record: Snapshot = { de: { percent: 90, total: 20, translated: 18, readySince: '2026-11-10', lastChange: T_DE }, fr: { percent: 5, total: 20, translated: 1, readySince: null, lastChange: T_DE } }
    const recOnly = await run({ [RECORD]: record }, prev)
    check(Object.keys(recOnly.written).length === 0, 'no list: no files downloaded')
    check(recOnly.out.snapshot!.de.lastChange === T_OLD && recOnly.out.snapshot!.de.readySince === '2026-11-10', 'no list: bundled words unchanged, so their lastChange stays')
    check(recOnly.out.snapshot!.fr.lastChange === null && recOnly.out.snapshot!.fr.percent === 5, 'no list, new language from the record: no lastChange')
    const badRecord = await run({ [RECORD]: { de: { total: 'x' } } }, prev)
    check(badRecord.out.snapshot === null, 'a broken record counts as unreadable')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
