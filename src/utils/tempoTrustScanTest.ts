import { runTrustScan, type ScanDeps } from './tempoTrustScan'
import { TRUST_VERSION, type TrustResult } from './tempoTrust'

const R = (flagged: boolean): TrustResult => ({ flagged, from: null, throughout: false, hintBpm: null, shifted: false, fileBpm: 120, okWindows: 0, offWindows: 0, unclearWindows: 0 })

function fakeDeps(over: Partial<ScanDeps> = {}) {
  const reads: string[] = [], entries: string[] = []
  const index: Record<string, { size: number; mtime: number; songKey: string }> = { 'old.mid': { size: 1, mtime: 1, songKey: 'k-old' } }
  const cache: Record<string, TrustResult & { v: number }> = { 'k-old': { ...R(false), v: TRUST_VERSION } }
  const deps: ScanDeps = {
    stat: async (paths) => paths.map(p => ({ path: p, size: 1, mtime: 1 })),
    read: async (p) => { reads.push(p); if (p === 'broken.mid') throw new Error('nope'); return new Uint8Array([p.length]).buffer },
    keyOf: (buf) => 'k-' + new Uint8Array(buf)[0],
    analyze: () => R(true),
    getIndex: () => index,
    getCache: () => cache,
    getCorrection: () => null,
    setEntry: (path) => { entries.push(path) },
    isActive: () => true,
    isBusy: () => false,
    pause: async () => {},
    ...over,
  }
  return { deps, reads, entries }
}

export async function runTempoTrustScanTestAsync(): Promise<number> {
  console.group('[tempoTrustScan] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // unchanged + cached files are not re-read; a broken file doesn't stop the queue
  const a = fakeDeps()
  await runTrustScan(['old.mid', 'new.mid', 'broken.mid', 'later.mid'], a.deps)
  check(!a.reads.includes('old.mid'), 'unchanged file not re-read')
  check(a.reads.includes('later.mid') && a.entries.includes('later.mid'), 'queue continues after a broken file')
  check(a.entries.includes('broken.mid'), 'broken file recorded as checked (no retry loop)')

  // switched off mid-scan -> stops reading
  let n = 0
  const b = fakeDeps({ isActive: () => n++ < 2 })
  await runTrustScan(['a1.mid', 'a22.mid', 'a333.mid', 'a4444.mid'], b.deps)
  check(b.reads.length <= 1, `stops when switched off, read ${b.reads.length}`)

  // while the song is playing, the scan waits instead of working
  let busy = true, pauses = 0
  const c = fakeDeps({ isBusy: () => busy, pause: async () => { pauses++; if (pauses >= 3) busy = false } })
  await runTrustScan(['p.mid'], c.deps)
  check(pauses >= 3 && c.reads.includes('p.mid'), 'waits while playing, then continues')

  console.log(`tempoTrustScan: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
