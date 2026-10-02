import { needsCheck } from './tempoTrustAnalyze'
import { TRUST_VERSION, type TrustResult } from './tempoTrust'
import type { SongTempoCorrection } from './tempoCorrection'

// ── Library background scan for tempo warnings — one file at a time, never
// while a song is playing, skipping files already checked (same size and
// modified time + a result from the current detector). A file that can't
// be read or parsed is recorded as checked-and-fine so it isn't retried on
// every Library refresh. Dependencies are injected so the queue logic is
// testable without Electron. ──────────────────────────────────────────
export interface ScanDeps {
  stat: (paths: string[]) => Promise<{ path: string; size: number; mtime: number }[]>
  read: (path: string) => Promise<ArrayBuffer>
  keyOf: (buf: ArrayBuffer) => string
  analyze: (buf: ArrayBuffer, correction: SongTempoCorrection | null) => TrustResult
  getIndex: () => Record<string, { size: number; mtime: number; songKey: string }>
  getCache: () => Record<string, { v: number }>
  getCorrection: (key: string) => SongTempoCorrection | null
  setEntry: (path: string, stat: { size: number; mtime: number }, key: string, result: TrustResult) => void
  isActive: () => boolean     // toggle still on, component still mounted
  isBusy: () => boolean       // a song is playing — don't compete with audio
  pause: (ms: number) => Promise<void>
}

const SLICE_MS = 30
// Bigger files (e.g. "black MIDI" with millions of notes) are never read in
// the background — they'd stall the app; recorded as checked instead.
const MAX_BYTES = 5_000_000
const BUSY_WAIT_MS = 1000
const FAILED: TrustResult = { flagged: false, from: null, throughout: false, hintBpm: null, shifted: false, fileBpm: 0, okWindows: 0, offWindows: 0, unclearWindows: 0 }

export async function runTrustScan(paths: string[], d: ScanDeps): Promise<void> {
  if (!d.isActive() || paths.length === 0) return
  const stats = await d.stat(paths)
  for (const st of stats) {
    if (!d.isActive()) return
    if (!needsCheck(d.getIndex()[st.path], st, d.getCache(), TRUST_VERSION)) continue
    if (st.size > MAX_BYTES) { d.setEntry(st.path, st, `toolarge:${st.path}:${st.size}:${st.mtime}`, FAILED); continue }
    while (d.isBusy()) { await d.pause(BUSY_WAIT_MS); if (!d.isActive()) return }
    let key = `unreadable:${st.path}:${st.size}:${st.mtime}`
    let result = FAILED
    try {
      const buf = await d.read(st.path)
      key = d.keyOf(buf)
      if (!d.isActive()) return
      result = d.analyze(buf, d.getCorrection(key))
    } catch { /* recorded as checked, never retried until the file changes */ }
    if (!d.isActive()) return
    d.setEntry(st.path, st, key, result)
    await d.pause(SLICE_MS)
  }
}
