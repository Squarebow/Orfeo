import { placeMenu } from './ContextMenu'

export function runContextMenuTest(): number {
  console.group('[contextMenu] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const vw = 1000, vh = 800, w = 180, h = 240
  const at = (x: number, y: number) => JSON.stringify(placeMenu(x, y, w, h, vw, vh))

  check(at(100, 100) === JSON.stringify({ left: 100, top: 100 }), 'room below and right: opens down-right at the click')
  check(at(100, 700) === JSON.stringify({ left: 100, top: 460 }), 'near the bottom: opens upwards, its bottom at the click')
  check(at(900, 100) === JSON.stringify({ left: 720, top: 100 }), 'near the right edge: opens to the left of the click')
  check(at(900, 700) === JSON.stringify({ left: 720, top: 460 }), 'bottom-right corner: up and left')
  // taller than the space either way: kept inside the window, 8 px from its edges
  const tall = placeMenu(100, 400, w, 900, vw, vh)
  check(tall.top === 8, `taller than the window: pinned to the top edge, got ${JSON.stringify(tall)}`)
  const up = placeMenu(100, 300, w, 500, vw, vh)
  check(up.top >= 8 && up.top + 500 <= vh - 8, `never off-screen either way, got ${JSON.stringify(up)}`)

  console.log(`contextMenu: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
