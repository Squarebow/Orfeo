import {
  addTag, renameTag, deleteTag, setSongsTag, tagCoverage, songHasAllTags, remapSongTags, restoreTagState,
  cleanTagName, DEFAULT_TAGS, STARTER_ROW, MAX_TAG_LENGTH, type TagState,
} from './libraryTags'

export function runLibraryTagsTest(): number {
  console.group('[libraryTags] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const base: TagState = { tags: ['Jazz', 'Beginner'], songTags: { '/a.mid': ['Jazz'], '/b.mid': ['Jazz', 'Beginner'] }, pinned: ['Jazz', 'Beginner'] }

  // Making tags
  const added = addTag(base, '  Hands   separate ')
  check(added?.tags.at(-1) === 'Hands separate' && !added.pinned.includes('Hands separate'), 'a new tag is tidied and added at the end, but not put in the tags row')
  check(addTag(base, 'jazz') === null, 'a tag that differs only in capitals is refused')
  check(addTag(base, '   ') === null, 'an empty name is refused')
  check(cleanTagName('x'.repeat(40)).length === MAX_TAG_LENGTH, `names are kept to ${MAX_TAG_LENGTH} characters`)

  // Renaming follows the tag everywhere
  const renamed = renameTag(base, 'Jazz', 'Swing')!
  check(renamed.tags[0] === 'Swing' && renamed.pinned[0] === 'Swing', 'renaming keeps the place in the list and the pin')
  check(renamed.songTags['/a.mid'][0] === 'Swing' && renamed.songTags['/b.mid'].includes('Swing'), 'renaming keeps the tag on every song')
  check(renameTag(base, 'Jazz', 'beginner') === null, "renaming onto another tag's name is refused")
  check(renameTag(base, 'Jazz', 'JAZZ')?.tags[0] === 'JAZZ', 'changing only the capitals is allowed')

  // Deleting takes it off every song
  const deleted = deleteTag(base, 'jazz')
  check(!deleted.tags.includes('Jazz') && !deleted.pinned.includes('Jazz'), 'deleting removes the tag and its pin')
  check(!('/a.mid' in deleted.songTags) && deleted.songTags['/b.mid'].join() === 'Beginner', 'deleting takes it off every song, and a song left without tags is dropped')

  // Tagging a selection
  const tagged = setSongsTag(base.songTags, ['/a.mid', '/c.mid'], 'Beginner', true)
  check(tagged['/a.mid'].join() === 'Jazz,Beginner' && tagged['/c.mid'].join() === 'Beginner', 'a tag goes on every selected song')
  check(setSongsTag(tagged, ['/a.mid'], 'Beginner', true)['/a.mid'].length === 2, 'never twice on one song')
  check(!('/c.mid' in setSongsTag(tagged, ['/c.mid'], 'beginner', false)), 'taking the last tag off drops the song from the list')
  check(tagCoverage(base.songTags, ['/a.mid', '/b.mid'], 'Beginner') === 'some', 'a mixed selection shows a partial tick')
  check(tagCoverage(base.songTags, ['/a.mid', '/b.mid'], 'Jazz') === 'all', 'all selected songs carry it: full tick')

  // Filtering: every active pill must match
  check(songHasAllTags(base.songTags, '/b.mid', ['Jazz', 'Beginner']), 'a song with both tags passes two pills')
  check(!songHasAllTags(base.songTags, '/a.mid', ['Jazz', 'Beginner']), 'a song with only one of two tags is filtered out')
  check(songHasAllTags(base.songTags, '/z.mid', []), 'no pills on: every song passes')

  // Following renames and moves
  const moved = remapSongTags(base.songTags, [{ oldPath: '/a.mid', newPath: '/Jazz/a.mid' }])
  check(moved['/Jazz/a.mid']?.[0] === 'Jazz' && !('/a.mid' in moved), 'a moved song keeps its tags')

  // Restoring saved tags
  const first = restoreTagState({})
  check(first.tags.join() === DEFAULT_TAGS.join() && first.pinned.join() === STARTER_ROW.join() && STARTER_ROW.length === 4, 'the very first start gets the ready-made tags, the first four in the row')
  check(restoreTagState({ libraryTags: ['Jazz'] }).pinned.length === 0, 'an older save without a row choice starts with the row empty')
  check(restoreTagState({ libraryTags: [] }).tags.length === 0, 'a user who deleted every tag keeps none')
  const restored = restoreTagState({ libraryTags: ['Jazz', 'jazz', 5, 'Pop'], songTags: { '/a.mid': ['Jazz', 'Gone'], '/x.mid': [] }, pinnedTags: ['Pop', 'Gone'] })
  check(restored.tags.join() === 'Jazz,Pop', 'saved tags are checked: no doubles, no junk')
  check(restored.songTags['/a.mid'].join() === 'Jazz' && !('/x.mid' in restored.songTags), 'unknown tags fall off songs, empty songs are dropped')
  check(restored.pinned.join() === 'Pop', 'only real tags stay pinned')

  console.log(`libraryTags: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
