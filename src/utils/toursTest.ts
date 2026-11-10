import { toursFromPrefs, placeCard, nextShownStep, CARD_GAP, VIEW_MARGIN } from './tours'

export function runToursTest(): number {
  console.group('[tours] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Who sees them
  const fresh = toursFromPrefs({ firstLaunch: false, firstSong: false })
  check(!fresh.seen.firstLaunch && !fresh.seen.firstSong && !fresh.needsSave, 'a new install: both tours still to show')
  const updated = toursFromPrefs(undefined)
  check(updated.seen.firstLaunch && updated.seen.firstSong && updated.needsSave, 'an updated copy (settings, no mark): both seen, and saved as seen')
  check(toursFromPrefs({ firstLaunch: true }).seen.firstSong, 'a half-written mark counts as seen')
  check(toursFromPrefs([false, false]).seen.firstLaunch && toursFromPrefs('x').seen.firstLaunch, 'a broken mark counts as seen')
  const half = toursFromPrefs({ firstLaunch: true, firstSong: false })
  check(half.seen.firstLaunch && !half.seen.firstSong, 'first launch done, first song still to come')

  // Where the card sits
  const view = { width: 1400, height: 900 }
  const card = { width: 300, height: 140 }
  const b = placeCard({ left: 600, top: 40, width: 32, height: 32 }, card, view, 'bottom')
  check(b.side === 'bottom' && b.top === 40 + 32 + CARD_GAP && Math.abs(b.left + b.arrow - 616) < 0.5, 'below the button, pointing at its middle')
  const flip = placeCard({ left: 600, top: 820, width: 32, height: 32 }, card, view, 'bottom')
  check(flip.side === 'top' && flip.top + card.height === 820 - CARD_GAP, 'no room below: it goes above')
  const edge = placeCard({ left: 2, top: 40, width: 30, height: 30 }, card, view, 'bottom')
  check(edge.left === VIEW_MARGIN && edge.arrow >= 18, 'at the window edge: stays inside, pointer still on the card')
  const right = placeCard({ left: 0, top: 100, width: 260, height: 600 }, card, view, 'right')
  check(right.side === 'right' && right.left === 260 + CARD_GAP && right.top >= VIEW_MARGIN, 'beside a tall panel')
  const left = placeCard({ left: 1140, top: 60, width: 260, height: 700 }, card, view, 'left')
  check(left.side === 'left' && left.left + card.width === 1140 - CARD_GAP, 'left of the Tracks panel')
  const tiny = placeCard({ left: 0, top: 0, width: 1400, height: 900 }, card, view, 'top')
  check(tiny.left >= VIEW_MARGIN && tiny.top >= VIEW_MARGIN && tiny.top + card.height <= view.height - VIEW_MARGIN, 'a target filling the window: the card still stays on screen')

  // Steps whose button isn't there are passed over
  const has = (i: number) => i !== 1
  check(nextShownStep(0, 1, 4, has) === 2, 'forward over a missing step')
  check(nextShownStep(2, -1, 4, has) === 0, 'back over a missing step')
  check(nextShownStep(3, 1, 4, has) === null && nextShownStep(0, -1, 4, has) === null, 'past either end: none')
  check(nextShownStep(-1, 1, 4, has) === 0, 'the first step that can be shown')

  console.log(`tours: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
