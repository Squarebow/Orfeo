// ── The trained model's readings, remembered ─────────────────────────────────
// The model needs a fraction of a second per thousand notes, too slow to read
// a long song every time it opens. Each reading is kept under a fingerprint of
// what the model was given (the notes, and the engine's hands and confidence
// it reads them with), so the same notes are never read twice: the background
// reading (handPrescan.ts) reads the library ahead, a song opens on what it
// left. A fingerprint holds the model's name, so a new model reads afresh.
//
// Every reading is stored, and handed out, at the precision it is kept in
// (one byte a note: the hand, and the confidence in 127 steps), so a reading
// from the store and one just made are the same.

import type { Hand, HandInput, SecondHandReader } from './handAssignment'

type Read = { hand: Hand; confidence: number }

const MAX_ENTRIES = 4000

// two 32-bit hashes over the same numbers: one fingerprint in 2^64
function fingerprint(model: string, notes: HandInput[], engine: Read[]): string {
  let a = 0x811c9dc5, b = 0x9e3779b9
  const mix = (v: number) => {
    v |= 0
    a = Math.imul(a ^ v, 0x01000193)
    b = Math.imul(b ^ v, 0x5bd1e995); b ^= b >>> 15
  }
  for (let i = 0; i < model.length; i++) mix(model.charCodeAt(i))
  mix(notes.length)
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i], e = engine[i]
    mix(n.midi); mix(Math.round(n.time * 10000)); mix(Math.round((n.duration ?? 0) * 10000))
    mix(e.hand === 'R' ? 1 : 0); mix(Math.round(e.confidence * 10000))
  }
  return (a >>> 0).toString(36) + '.' + (b >>> 0).toString(36) + '.' + notes.length.toString(36)
}

const pack = (r: Read[]): Uint8Array => Uint8Array.from(r, x => (x.hand === 'R' ? 0x80 : 0) | Math.round(Math.min(1, Math.max(0, x.confidence)) * 127))
const unpack = (p: Uint8Array): Read[] => Array.from(p, v => ({ hand: (v & 0x80 ? 'R' : 'L') as Hand, confidence: (v & 0x7f) / 127 }))

const store = new Map<string, Uint8Array>()
let fresh: [string, Uint8Array][] = []
let hits = 0, misses = 0

/** A reader that answers from the store when it can, and reads (then keeps) when it can't */
export function rememberingReader(model: string, read: SecondHandReader): SecondHandReader {
  return (notes, engine) => {
    const key = fingerprint(model, notes, engine)
    const got = store.get(key)
    if (got && got.length === notes.length) { hits++; store.delete(key); store.set(key, got); return unpack(got) }
    misses++
    const p = pack(read(notes, engine))
    remember(key, p)
    fresh.push([key, p])
    return unpack(p)
  }
}

function remember(key: string, p: Uint8Array): void {
  store.delete(key); store.set(key, p)
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string)
}

// ── Moving readings between the background reader, the app and the disk ───
const toB64 = (p: Uint8Array) => { let s = ''; for (let i = 0; i < p.length; i++) s += String.fromCharCode(p[i]); return btoa(s) }
const fromB64 = (s: string) => { const bin = atob(s); const p = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) p[i] = bin.charCodeAt(i); return p }

export type StoredReadings = [string, string][]

/** Readings made here since the last call (to pass on and to save) */
export function takeFreshReadings(): StoredReadings {
  const out = fresh.map(([k, p]) => [k, toB64(p)] as [string, string])
  fresh = []
  return out
}
/** Take in readings made elsewhere (the disk, the background reader) */
export function addReadings(list: StoredReadings): void {
  for (const [k, b] of list) remember(k, fromB64(b))
}
/** Everything kept, oldest first (for the disk) */
export function allReadings(): StoredReadings {
  return [...store].map(([k, p]) => [k, toB64(p)])
}
export function forgetReadings(): void { store.clear(); fresh = []; hits = misses = 0 }
export const readingStats = () => ({ kept: store.size, hits, misses })
