import { tickPath } from './songTicks'

// The scrub bar's ticks: whole pixels, evenly spread, never crowded
export function runSongTicksTest(): number {
  console.group('[songTicks] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const xs = (d: string) => [...d.matchAll(/M([\d.]+) /g)].map(m => +m[1])

  const a = tickPath(287, 1880)
  check(a.unit === 0.5, `a 4¾-minute song on a wide bar: a tick every half second (${a.unit})`)
  const x = xs(a.d)
  const gaps = x.slice(1).map((v, i) => v - x[i])
  check(gaps.every(g => g >= 2 && g <= 4), `ticks evenly spread, 3–4 px apart (${Math.min(...gaps)}–${Math.max(...gaps)})`)
  check(x.every(v => v % 1 === 0.5), 'every tick on a whole pixel')
  check(x.length === Math.floor(287 / 0.5) + 1, 'one tick per half second, start to end')
  const b = tickPath(287, 800)
  const bx = xs(b.d)
  check(b.unit === 1 && bx.slice(1).every((v, i) => v - bx[i] >= 2), `a narrow bar: fewer ticks, never crowded (${b.unit} s)`)
  check(tickPath(0, 500).d === '' && tickPath(100, 0).d === '', 'no song or no room: no ticks')

  console.log(`songTicks: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
