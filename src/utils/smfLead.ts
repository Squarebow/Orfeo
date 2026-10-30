// ── Skip empty bars at the start: cutting the song's own bytes ───────────────
// trimSmfLead removes everything before `cutTick` from a Standard MIDI File
// and moves the rest back, so every engine plays the same shortened song (GM
// plays these bytes directly; the parsed song is read from them too). What
// set the sound up before the cut — tempo, metre, key, instruments, volume,
// pedal, names — is kept, moved to the new start; only the notes go.
// restoreLeadForSave is the way back for the Note Editor's save: the original
// lead-in, with the edited notes moved forward again (saves never lose it).
import { Midi } from '@tonejs/midi'

const u32 = (b: Uint8Array, p: number) => ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0
const u16 = (b: Uint8Array, p: number) => (b[p] << 8) | b[p + 1]
const tag = (b: Uint8Array, p: number) => String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3])

function readVar(b: Uint8Array, p: number): [number, number] {
  let v = 0
  for (let i = 0; i < 4 && p < b.length; i++) {
    const x = b[p++]
    v = (v << 7) | (x & 0x7f)
    if (!(x & 0x80)) break
  }
  return [v, p]
}
function pushVar(out: number[], v: number) {
  const stack = [v & 0x7f]
  while ((v >>>= 7) > 0) stack.push((v & 0x7f) | 0x80)
  while (stack.length) out.push(stack.pop()!)
}
const TEMPO = 0x51, METRE = 0x58, KEY = 0x59
const WORDS = new Set([0x01, 0x05, 0x06, 0x07])   // text, lyric, marker, cue point

function pushU32(out: number[], v: number) { out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255) }

/** The song from `cutTick` on, with everything that set up the sound before it
 *  in force at the start. The input itself when there's nothing to cut or the
 *  file times in SMPTE frames (no bars to cut on). */
export function trimSmfLead(bytes: ArrayBuffer, cutTick: number): ArrayBuffer {
  const b = new Uint8Array(bytes)
  if (cutTick <= 0 || b.length < 14 || tag(b, 0) !== 'MThd') return bytes
  const hlen = u32(b, 4)
  if (u16(b, 12) & 0x8000) return bytes
  // read every track first: which tempo, metre and key is in force at the cut
  // is decided across all of them
  type Ev = { tick: number; data: ArrayLike<number>; meta: number; note: boolean }
  const chunks: ({ other: Uint8Array } | { events: Ev[]; endTick: number })[] = []
  let p = 8 + hlen
  while (p + 8 <= b.length) {
    const len = u32(b, p + 4), start = p + 8, end = Math.min(b.length, start + len)
    if (tag(b, p) !== 'MTrk') { chunks.push({ other: b.subarray(p, end) }); p = end; continue }
    const events: Ev[] = []
    let q = start, tick = 0, status = 0, endTick = 0
    while (q < end) {
      let delta: number
      ;[delta, q] = readVar(b, q)
      tick += delta
      let s = b[q]
      if (s < 0x80) s = status          // running status: no status byte
      else { q++; if (s < 0xf0) status = s }
      let data: ArrayLike<number>, meta = -1
      if (s === 0xff) {
        meta = b[q]
        const [l, q2] = readVar(b, q + 1)
        const head = [0xff, meta]; pushVar(head, l)
        data = [...head, ...b.subarray(q2, q2 + l)]
        q = q2 + l
        if (meta === 0x2f) { endTick = tick; continue }   // written once, at the end
      } else if (s === 0xf0 || s === 0xf7) {
        const [l, q2] = readVar(b, q)
        const head = [s]; pushVar(head, l)
        data = [...head, ...b.subarray(q2, q2 + l)]
        q = q2 + l
      } else {
        const n = (s & 0xf0) === 0xc0 || (s & 0xf0) === 0xd0 ? 1 : 2
        data = [s, ...b.subarray(q, q + n)]
        q += n
      }
      const kind = s & 0xf0
      events.push({ tick, data, meta, note: s < 0xf0 && (kind === 0x80 || kind === 0x90) })
    }
    chunks.push({ events, endTick })
    p = end
  }
  // tempo / metre / key: the one in force at the cut — the last before it, and
  // none at all when the music sets its own right on the cut
  const inForce = new Map<number, Ev>()
  for (const t of [TEMPO, METRE, KEY]) {
    const all = chunks.flatMap(c => 'events' in c ? c.events.filter(e => e.meta === t) : [])
    if (all.some(e => e.tick === cutTick)) continue
    const before = all.filter(e => e.tick < cutTick)
    const last = before.reduce<Ev | undefined>((a, e) => (!a || e.tick >= a.tick ? e : a), undefined)
    if (last) inForce.set(t, last)
  }
  const keepBefore = (e: Ev) => {
    if (e.note) return false
    if (e.meta === TEMPO || e.meta === METRE || e.meta === KEY) return inForce.get(e.meta) === e
    // words placed in the skipped bars (text, lyrics, markers, cues) go;
    // the song's own at its very start (title, Orfeo's notes) stay
    if (WORDS.has(e.meta)) return e.tick === 0
    return true
  }
  const out: number[] = Array.from(b.subarray(0, 8 + hlen))
  for (const c of chunks) {
    if ('other' in c) { for (let i = 0; i < c.other.length; i++) out.push(c.other[i]); continue }
    const body: number[] = []
    let last = 0
    for (const e of c.events) {
      if (e.tick < cutTick && !keepBefore(e)) continue
      const t = Math.max(0, e.tick - cutTick)
      pushVar(body, t - last); last = t
      for (let i = 0; i < e.data.length; i++) body.push(e.data[i])
    }
    pushVar(body, Math.max(0, Math.max(last, c.endTick - cutTick) - last))
    body.push(0xff, 0x2f, 0x00)
    out.push(0x4d, 0x54, 0x72, 0x6b)   // MTrk
    pushU32(out, body.length)
    for (const x of body) out.push(x)
  }
  return new Uint8Array(out).buffer
}

/** For saving edits made on a shortened song: the original song (its lead-in,
 *  tempo map, instruments, controllers), with the edited notes moved forward
 *  by `cutTick`, the edited track names and the edited song notes (meta). The
 *  Note Editor changes only notes, names and meta; tracks keep their order. */
export function restoreLeadForSave(edited: Midi, originalRaw: ArrayBuffer, cutTick: number): Midi {
  const out = new Midi(originalRaw)
  out.tracks.forEach((t, i) => {
    const e = edited.tracks[i]
    if (!e) return
    const lead = t.notes.filter(n => n.ticks < cutTick)
      .map(n => ({ midi: n.midi, ticks: n.ticks, durationTicks: n.durationTicks, velocity: n.velocity, noteOffVelocity: n.noteOffVelocity }))
    t.notes.length = 0
    for (const n of lead) t.addNote(n)
    for (const n of e.notes) t.addNote({ midi: n.midi, ticks: n.ticks + cutTick, durationTicks: n.durationTicks, velocity: n.velocity, noteOffVelocity: n.noteOffVelocity })
    t.name = e.name
  })
  // Song words (meta): the original's in the skipped bars, the edited copy's
  // from the cut on, moved back into place. Orfeo's own notes (ORFEO_…) come
  // only from the edited copy — that's where the save just rewrote them — and
  // stay at the start; the song's own words at its very start were kept on
  // the shortened song too, so they're taken once, from the original.
  const orfeo = (m: any) => typeof m.text === 'string' && m.text.startsWith('ORFEO_')
  const origMeta: any[] = (out.header as any).meta ?? []
  const atStart = new Set(origMeta.filter(m => m.ticks === 0 && !orfeo(m)).map(m => m.type + '\u0000' + m.text))
  ;(out.header as any).meta = [
    ...origMeta.filter(m => m.ticks < cutTick && !orfeo(m)),
    ...((edited.header as any).meta ?? []).flatMap((m: any) => {
      if (orfeo(m)) return [{ ...m, ticks: m.ticks > 0 ? m.ticks + cutTick : 0 }]
      if (m.ticks === 0 && atStart.has(m.type + '\u0000' + m.text)) return []
      return [{ ...m, ticks: m.ticks + cutTick }]
    }),
  ]
  return out
}
