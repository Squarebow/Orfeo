// ── Song identity — content key for per-song tempo corrections, so a
// correction follows the file through renames/moves. Two independent 32-bit
// hashes (FNV-1a + a murmur-style multiply) + byte length. Synchronous so
// store.setMidi can use it inline; MIDI files are small. ──────────────────
export function songKey(raw: ArrayBuffer): string {
  const b = new Uint8Array(raw)
  let h1 = 0x811c9dc5, h2 = 0x9747b28c
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 0x01000193)
    h2 = Math.imul(h2 ^ b[i], 0x5bd1e995); h2 ^= h2 >>> 15
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return `${b.length}-${hex(h1)}${hex(h2)}`
}
