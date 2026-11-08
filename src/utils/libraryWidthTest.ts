import { clampLibraryWidth, libraryPanelWidth, LIBRARY_MIN_WIDTH, LIBRARY_MAX_WIDTH } from './libraryWidth'

export function runLibraryWidthTest(): number {
  console.group('[libraryWidth] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  check(LIBRARY_MAX_WIDTH / LIBRARY_MIN_WIDTH === 1.25, 'the widest is a quarter more than today')
  check(clampLibraryWidth(100) === LIBRARY_MIN_WIDTH && clampLibraryWidth(999) === LIBRARY_MAX_WIDTH, 'dragging stops at both ends')
  check(clampLibraryWidth(Number.NaN) === LIBRARY_MIN_WIDTH, 'a broken saved value falls back to today\'s width')
  check(clampLibraryWidth(290.6) === 291, 'whole pixels')
  check(libraryPanelWidth(325, 1920) === 325, 'a big window gives the full width')
  check(libraryPanelWidth(325, 900) === LIBRARY_MIN_WIDTH, 'the smallest window keeps today\'s width, so the piano roll loses nothing')
  check(libraryPanelWidth(325, 930) === 290, 'a window just above the smallest gives only the room it has')
  check(libraryPanelWidth(280, 1920) === 280, 'a chosen width in between is kept')

  console.log(`libraryWidth: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
