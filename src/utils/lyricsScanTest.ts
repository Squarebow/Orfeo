import { runLyricsScan, needsLyricsCheck, LYRICS_BATCH, type LyricsEntry } from './lyricsScan'
import { LYRICS_VERSION } from './lyricsCheck'

export async function runLyricsScanTest(): Promise<number> {
  console.group('[lyricsScan] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const st = { size: 100, mtime: 5 }
  check(needsLyricsCheck(undefined, st), 'a song never checked needs a check')
  check(!needsLyricsCheck({ ...st, lyrics: true, v: LYRICS_VERSION }, st), 'a checked, unchanged song is skipped')
  check(needsLyricsCheck({ ...st, lyrics: true, v: LYRICS_VERSION }, { size: 100, mtime: 6 }), 'a changed song is checked again')
  check(needsLyricsCheck({ ...st, lyrics: true, v: LYRICS_VERSION - 1 }, st), 'a result from an older rule is checked again')

  // A fake Library: 45 MIDI songs, a Guitar Pro file, one song already checked
  const paths = [...Array.from({ length: 45 }, (_, i) => `/lib/song${i}.mid`), '/lib/tab.gp5']
  const index: Record<string, LyricsEntry> = { '/lib/song0.mid': { ...st, lyrics: false, v: LYRICS_VERSION } }
  const checkedCalls: string[][] = []
  let busyFor = 2
  await runLyricsScan(paths, {
    stat: async (ps) => ps.map(path => ({ path, ...st })),
    check: async (ps) => { checkedCalls.push(ps); return ps.map(path => ({ path, ...st, lyrics: path.endsWith('7.mid') })) },
    getIndex: () => index,
    save: (entries) => { for (const { path, ...e } of entries) index[path] = e },
    isActive: () => true,
    isBusy: () => busyFor-- > 0,
    pause: async () => {},
  })
  const all = checkedCalls.flat()
  check(!all.includes('/lib/tab.gp5'), 'only MIDI-family files are checked')
  check(!all.includes('/lib/song0.mid'), 'the already-checked song is skipped')
  check(all.length === 44, '44 songs checked')
  check(checkedCalls.every(c => c.length <= LYRICS_BATCH), `a few at a time (at most ${LYRICS_BATCH})`)
  check(index['/lib/song7.mid']?.lyrics === true && index['/lib/song8.mid']?.lyrics === false, 'results are saved per song')
  check(index['/lib/song7.mid']?.v === LYRICS_VERSION, 'results carry the rule version')

  // Switched off part-way: stops without saving more
  let calls = 0
  const stopIndex: Record<string, LyricsEntry> = {}
  await runLyricsScan(paths, {
    stat: async (ps) => ps.map(path => ({ path, ...st })),
    check: async (ps) => { calls++; return ps.map(path => ({ path, ...st, lyrics: false })) },
    getIndex: () => stopIndex,
    save: (entries) => { for (const { path, ...e } of entries) stopIndex[path] = e },
    isActive: () => calls < 1,
    isBusy: () => false,
    pause: async () => {},
  })
  check(calls === 1 && Object.keys(stopIndex).length === 0, 'switching off mid-way stops and saves nothing more')

  console.log(`lyricsScan: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
