import {
  addToQueue, removeFromQueue, moveInQueue, neighbour, followOpenSong, remapQueue, pruneQueue, restoreQueue,
  EMPTY_QUEUE, type QueueState,
} from './practiceQueue'

export function runPracticeQueueTest(): number {
  console.group('[practiceQueue] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const q = (paths: string[], index: number): QueueState => ({ paths, index })

  // Adding
  const added = addToQueue(EMPTY_QUEUE, ['/a.mid', '/b.mid'])
  check(added.paths.join() === '/a.mid,/b.mid' && added.index === -1, 'songs go in at the end, nothing open yet')
  check(addToQueue(added, ['/B.MID', '/c.mid']).paths.join() === '/a.mid,/b.mid,/c.mid', 'a song already queued is not added twice (Windows paths ignore capitals)')
  check(addToQueue(q(['C:\\x\\a.mid'], 0), ['C:/x/a.mid']).paths.length === 1, 'either slash is the same song')

  // Next / previous
  const abc = q(['/a', '/b', '/c'], -1)
  check(neighbour(abc, 1) === 0 && neighbour(abc, -1) === null, 'before the first song: next is the first, no previous')
  check(neighbour(q(abc.paths, 1), 1) === 2 && neighbour(q(abc.paths, 1), -1) === 0, 'in the middle: both ways')
  check(neighbour(q(abc.paths, 2), 1) === null, 'after the last song there is no next (no wrap round)')
  check(neighbour(q(abc.paths, 0), -1) === null, 'before the first there is no previous')
  check(neighbour(EMPTY_QUEUE, 1) === null, 'an empty queue has no next')

  // Removing keeps the position sensible
  check(removeFromQueue(q(abc.paths, 2), '/a').index === 1, 'removing an earlier song keeps the position on the same song')
  const removedCurrent = removeFromQueue(q(abc.paths, 1), '/b')
  check(removedCurrent.paths.join() === '/a,/c' && neighbour(removedCurrent, 1) === 1, 'removing the current song: next is the one that followed it')
  check(removeFromQueue(q(abc.paths, 0), '/c').index === 0, 'removing a later song changes nothing')
  check(removeFromQueue(q(['/a'], 0), '/a').index === -1, 'removing the only song empties the queue')

  // Dragging to reorder
  const moved = moveInQueue(q(abc.paths, 0), 0, 2)
  check(moved.paths.join() === '/b,/c,/a' && moved.index === 2, 'dragging the current song: the position goes with it')
  check(moveInQueue(q(abc.paths, 1), 2, 0).paths.join() === '/c,/a,/b' && moveInQueue(q(abc.paths, 1), 2, 0).index === 2, 'dragging another song: the position stays on the current one')

  // Opening songs from anywhere
  check(followOpenSong(abc, '/c').index === 2, 'opening a queued song from the Library moves the position to it')
  check(followOpenSong(q(abc.paths, 1), '/zz').index === 1, 'opening a song outside the queue leaves the position alone')

  // Renames, moves, deletes
  check(remapQueue(abc, [{ oldPath: '/b', newPath: '/Jazz/b' }]).paths[1] === '/Jazz/b', 'a moved song keeps its place in the queue')
  const pruned = pruneQueue(q(abc.paths, 2), p => p !== '/a')
  check(pruned.paths.join() === '/b,/c' && pruned.index === 1, 'a song gone from the Library leaves the queue, the position follows')

  // Restoring
  check(restoreQueue({}).paths.length === 0 && restoreQueue({}).index === -1, 'no saved queue: empty')
  const r = restoreQueue({ queuePaths: ['/a', 5, '/a', '/b'], queueIndex: 9 })
  check(r.paths.join() === '/a,/b' && r.index === 1, 'saved queue is checked: no junk, no doubles, position kept inside')

  console.log(`practiceQueue: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
