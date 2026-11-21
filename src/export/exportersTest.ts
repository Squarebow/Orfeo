import { exportFileName, takeBaseName, EXPORT_FORMATS } from './exporters'

export function runExportersTest(): number {
  console.group('[exporters] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  check(exportFileName('He\'s a Pirate', 'take-midi') === 'He\'s a Pirate.mid', 'the ending added')
  check(exportFileName('Take.mid', 'take-midi') === 'Take.mid', 'never twice')
  check(exportFileName('a/b\\c:d*?"<>|', 'numbers-csv') === 'abcd.csv', 'no characters a file name can\'t carry')
  check(exportFileName('  Song.  ', 'score-pdf') === 'Song.pdf', 'no trailing dots or spaces')
  check(exportFileName('???', 'take-midi') === 'Orfeo export.mid', 'never an empty name')
  const at = new Date(2026, 10, 21, 9, 5).getTime()
  check(takeBaseName('Little Wonder.mid', at) === 'Little Wonder 2026-11-21 09.05', 'a take: the song and when')
  check(takeBaseName(null, at) === 'Recording 2026-11-21 09.05', 'a take from a blank song')
  check(EXPORT_FORMATS['take-midi'].ready && !EXPORT_FORMATS['session-mp3'].ready, 'what is ready, what is planned')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
