import { songKey } from './songIdentity'

export function runSongIdentityTest(): number {
  console.group('[songIdentity] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const buf = (bytes: number[]) => new Uint8Array(bytes).buffer

  const a = songKey(buf([77, 84, 104, 100, 0, 0, 0, 6]))
  check(a === songKey(buf([77, 84, 104, 100, 0, 0, 0, 6])), 'stable for identical bytes')
  check(a !== songKey(buf([77, 84, 104, 100, 0, 0, 0, 7])), 'differs on a 1-byte change')
  check(/^8-[0-9a-f]{16}$/.test(a), `format, got ${a}`)
  check(/^0-[0-9a-f]{16}$/.test(songKey(buf([]))), 'empty buffer ok')
  const big = new Uint8Array(1_000_000); for (let i = 0; i < big.length; i++) big[i] = i & 255
  const t0 = performance.now(); songKey(big.buffer); const ms = performance.now() - t0
  check(ms < 50, `1MB hashes fast, took ${ms.toFixed(1)}ms`)

  console.log(`songIdentity: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
