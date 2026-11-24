import { titleWords, sameSong, pianoFingerprint, preferOrder } from './sameSong'
import { oneOfEachSong } from './scanReady'

export function runSameSongTest(): number {
  console.group('[sameSong] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const same = (a: string, b: string) => sameSong({ path: a }, { path: b })

  // the words of a file name that say which song it is
  check(titleWords('D:/M/05-elton_john_1972-rocket_man-[k].mid').join(' ') === 'elton john rocket man', 'track number, year, [k] and extension left out')
  check(titleWords('D:/M/Orfeo/Rocket Man_ORFEO_v2.mid').join(' ') === 'rocket man', "Orfeo's version mark left out")
  check(titleWords('D:/M/Piano Concerto No.1.mid').join(' ') === 'concerto no1', 'a catalogue number stays part of the title')

  // the same song
  check(same('D:/M/Elton John - Rocket Man.mid', 'D:/M/05-elton_john_1972-rocket_man-[k].mid'), 'one title in different spellings')
  check(same('D:/M/Rocket Man.mid', 'D:/M/Elton John - Rocket Man (2).mid'), 'the artist added, a copy number')
  check(same('D:/M/Piano Concerto No.1.mid', 'D:/M/Tchaikovsky_Piano_Concerto_No_1_Op_23.mid'), 'a piece with its catalogue number')
  check(same('D:/M/a.mid', 'D:/M/b.mid') === false, 'names with nothing in common')
  // not the same song
  check(!same('D:/M/Piano Concerto No.1.mid', 'D:/M/Piano Concerto No.2.mid'), 'No. 1 and No. 2 are different pieces')
  check(!same('D:/M/Piano Man.mid', 'D:/M/Elton John - Rocket Man.mid'), 'one short word in common is not enough')
  check(!same('D:/M/Queen - Killer Queen.mid', 'D:/M/Queen - Somebody To Love.mid'), 'the same artist is not the same song')

  // the same notes under unrelated names
  const piano = (shift = 0) => [{ group: 'piano', program: 0, notes: Array.from({ length: 40 }, (_, i) => ({ midi: 60 + (i % 7) + shift, time: i * 0.25 })) }]
  const fa = pianoFingerprint(piano()), fb = pianoFingerprint(piano()), fc = pianoFingerprint(piano(1))
  check(fa !== '' && fa === fb && fa !== fc, 'the piano fingerprint follows the notes')
  check(sameSong({ path: 'D:/M/Kate Bush - Babushka.mid', fp: fa }, { path: 'D:/M/01-kate_bush_1980-babooshka-[k].mid', fp: fb }), 'the same piano part: the same song, whatever the spelling')
  check(pianoFingerprint([{ group: 'piano', program: 6, notes: piano()[0].notes }]) === '', 'a harpsichord has no piano fingerprint')

  // one of each song, the version prepared in Orfeo first
  check(preferOrder('D:/M/Orfeo/Rocket Man_ORFEO_v2.mid', 'D:/M/Rocket Man.mid') < 0, 'a prepared version comes first')
  const r = oneOfEachSong(
    [{ path: 'D:/M/Elton John - Rocket Man.mid' }, { path: 'D:/M/Orfeo/Elton John - Rocket Man_ORFEO_v1.mid' }, { path: 'D:/M/05-elton_john_1972-rocket_man-[k].mid' }, { path: 'D:/M/Fly Me to the Moon.mid' }],
    [{ path: 'D:/M/Fly_Me_to_the_Moon (2).mid' }])
  check(r.add.length === 1 && /ORFEO_v1/.test(r.add[0]) && r.versions === 3, `three Rocket Mans: the prepared one added; Fly Me already queued (added ${r.add.join(', ')}, left out ${r.versions})`)

  console.log(`  sameSong: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
