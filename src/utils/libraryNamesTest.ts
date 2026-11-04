import { libraryDisplayName, sortBySong } from './libraryNames'

export function runLibraryNamesTest(): number {
  console.group('[libraryNames] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const is = (got: string, want: string, m: string) => check(got === want, `${m}: got "${got}"`)

  // the default view is exactly what the Library has always shown
  is(libraryDisplayName('Abba - Fernando.mid', false), 'Abba - Fernando', 'default hides .mid')
  is(libraryDisplayName('Abba - Fernando.MIDI', false), 'Abba - Fernando', 'default hides .MIDI')
  is(libraryDisplayName('Abba - Fernando.gp5', false), 'Abba - Fernando.gp5', 'default keeps other extensions')

  is(libraryDisplayName('Abba - Fernando.mid', true), 'Fernando — Abba', 'song first')
  is(libraryDisplayName('Abba - Fernando.gp5', true), 'Fernando — Abba.gp5', 'other extensions stay')
  is(libraryDisplayName('Abba - Fernando_ORFEO_v2.mid', true), 'Fernando — Abba_ORFEO_v2', 'versions stay distinct')
  is(libraryDisplayName('Abba - Fernando - Live.mid', true), 'Fernando - Live — Abba', 'only the first separator splits')
  is(libraryDisplayName('Mr. Blue Sky.mid', true), 'Mr. Blue Sky', 'no separator: unchanged')
  is(libraryDisplayName('Fernando_ORFEO_v3.mid', true), 'Fernando_ORFEO_v3', 'no separator keeps its version')
  is(libraryDisplayName(' - Fernando.mid', true), '- Fernando', 'no artist: nothing to swap')
  is(libraryDisplayName('Well-Tempered.mid', true), 'Well-Tempered', 'a hyphen is not a separator')

  const f = (name: string) => ({ name, path: `/x/${name}` })
  const names = (l: { name: string }[]) => l.map(x => x.name).join(' | ')
  const input = [f('Toto - Africa.mid'), f('Abba - Fernando.mid'), f('Yesterday.mid'), f('Abba - Fernando_ORFEO_v2.mid'), f('Beatles - Yesterday.mid'), f('Song 10.mid'), f('Song 9.mid')]
  const sorted = sortBySong(input)
  is(names(sorted), 'Toto - Africa.mid | Abba - Fernando.mid | Abba - Fernando_ORFEO_v2.mid | Song 9.mid | Song 10.mid | Yesterday.mid | Beatles - Yesterday.mid', 'by song, versions together, numbers in order')
  check(input[0].name === 'Toto - Africa.mid' && input[1].name === 'Abba - Fernando.mid', 'the original list is untouched')
  check(sorted[0] === input[0], 'the same file objects come back')

  console.log(`libraryNames: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
