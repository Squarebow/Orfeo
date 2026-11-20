import { stripOrfeoSuffix, nextOrfeoVersion, nextOrfeoBaseName, isOrfeoVersionBase } from './orfeoVersioning'
import { noteEditsChangeMusic } from './noteEditorState'

// ── When a save makes a new version (since 1.8.x): a change to the music makes
// the next _ORFEO_vN; everything else saves into the same Orfeo copy. ────────
export function runOrfeoVersioningTest(): number {
  console.group('[orfeoVersioning] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // the names
  check(nextOrfeoBaseName('Song') === 'Song_ORFEO_v1', 'the first change of an original is v1')
  check(nextOrfeoBaseName('Song_ORFEO_v3') === 'Song_ORFEO_v4', 'the next version after v3 is v4')
  check(stripOrfeoSuffix('Song_ORFEO_MERGED') === 'Song' && nextOrfeoVersion('Song_ORFEO_SPLIT') === 1, 'old suffixes are read too')

  // which files are Orfeo's own copies, and may be saved into again
  check(isOrfeoVersionBase('Song_ORFEO_v2') && isOrfeoVersionBase('song_orfeo_V12'), 'an _ORFEO_vN copy')
  check(!isOrfeoVersionBase('Song') && !isOrfeoVersionBase('Song_ORFEO_MERGED') && !isOrfeoVersionBase('My_ORFEO_v2 live'), 'not an original, an old suffix or a lookalike')

  // which Note Editor edits change the music
  check(!noteEditsChangeMusic(['Assign left hand', 'Assign right hand to 4 notes', 'Confirm hands in a passage (3 notes)']), 'hands alone: the same file')
  check(noteEditsChangeMusic(['Assign left hand', 'Move note midi=60: tick 0 → 120']), 'a moved note: a new version')
  check(noteEditsChangeMusic(['Velocity note midi=60: 0.50 → 0.70']), 'louder or softer: a new version')
  check(noteEditsChangeMusic(['Add note midi=60 at tick=0']) && noteEditsChangeMusic(['Remove 3 notes']) && noteEditsChangeMusic(['Repitch note: midi 60 → 62']), 'added, removed, repitched: a new version')
  check(!noteEditsChangeMusic([]), 'nothing edited: nothing new')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
