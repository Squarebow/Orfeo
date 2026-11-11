import { frameZoom, fitFrame, defaultFrame, resizeFrame, restoreFrame, DESIGN, TOP_CLEAR, MARGIN, MIN, MAX_ZOOM } from './settingsFrame'

export function runSettingsFrameTest(): number {
  console.group('[settingsFrame] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const big = { w: 1920, h: 1080 }, small = { w: 900, h: 600 }

  // Scaling
  check(frameZoom({ x: 0, y: 0, ...DESIGN }) === 1, 'the designed size is scale 1')
  check(frameZoom({ x: 0, y: 0, w: 1500, h: 960 }) === 1.5, 'one and a half times the size, one and a half times the scale')
  check(frameZoom({ x: 0, y: 0, w: 1500, h: 640 }) === 1, 'wider only: the height keeps the scale, the width gives room')
  check(frameZoom({ x: 0, y: 0, w: 700, h: 450 }) === 1, 'smaller than designed: never smaller text')
  check(frameZoom({ x: 0, y: 0, w: 5000, h: 4000 }) === MAX_ZOOM, 'scale stops at the most')

  // A first opening
  const d = defaultFrame(big)
  check(Math.abs(d.w / d.h - DESIGN.w / DESIGN.h) < 0.01 && frameZoom(d) > 1.3, `on a big screen it opens larger than designed, same proportions, got ${JSON.stringify(d)}`)
  check(d.y >= TOP_CLEAR && d.y + d.h <= big.h - MARGIN && d.x >= MARGIN && d.x + d.w <= big.w - MARGIN, 'and fits below the title strip')
  const ds = defaultFrame(small)
  check(ds.w <= small.w - 2 * MARGIN && ds.h <= small.h - TOP_CLEAR - MARGIN && ds.y >= TOP_CLEAR, `on a small window it fits inside, got ${JSON.stringify(ds)}`)

  // Edges
  const f = { x: 400, y: 200, w: 1000, h: 640 }
  const e = resizeFrame(f, 'e', 200, 50, big)
  check(e.w === 1200 && e.h === 640 && e.x === 400 && e.y === 200, 'the right edge changes the width only')
  const w = resizeFrame(f, 'w', -100, 0, big)
  check(w.w === 1100 && w.x === 300 && w.x + w.w === f.x + f.w, 'the left edge keeps the right side where it was')
  const n = resizeFrame(f, 'n', 0, -1000, big)
  check(n.y === TOP_CLEAR && n.y + n.h === f.y + f.h, 'the top edge stops at the title strip')
  const tiny = resizeFrame(f, 's', 0, -900, big)
  check(tiny.h === MIN.h, 'never smaller than the least size')

  // Corners keep proportions
  const se = resizeFrame(f, 'se', 300, 20, big)
  check(Math.abs(se.w / se.h - f.w / f.h) < 0.01 && se.w === 1300 && se.x === f.x && se.y === f.y, `a corner keeps the proportions, got ${JSON.stringify(se)}`)
  const nw = resizeFrame(f, 'nw', -2000, -2000, big)
  check(Math.abs(nw.w / nw.h - f.w / f.h) < 0.01 && nw.y >= TOP_CLEAR && nw.x >= MARGIN && nw.x + nw.w === f.x + f.w, `a corner stops where either side meets an edge, got ${JSON.stringify(nw)}`)

  // Keeping it inside
  const fit = fitFrame({ x: 1500, y: 0, w: 3000, h: 2000 }, big)
  check(fit.x >= MARGIN && fit.y >= TOP_CLEAR && fit.x + fit.w <= big.w - MARGIN && fit.y + fit.h <= big.h - MARGIN, 'a saved frame too big for the window is brought inside')

  // Saved frames
  check(restoreFrame({ x: 1, y: 2, w: 3, h: 4 })?.w === 3 && restoreFrame({ x: 1, y: 2, w: 'a', h: 4 }) === null && restoreFrame(null) === null, 'a saved frame is checked')

  console.log(`settingsFrame: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
