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
function pushU32(out: number[], v: number) { out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255) }

/** The song from `cutTick` on, with everything that set up the sound before it
 *  in force at the start. The input itself when there's nothing to cut or the
 *  file times in SMPTE frames (no bars to cut on). */
export function trimSmfLead(bytes: ArrayBuffer, cutTick: number): ArrayBuffer {
  const b = new Uint8Array(bytes)
  if (cutTick <= 0 || b.length < 14 || tag(b, 0) !== 'MThd') return bytes
  const hlen = u32(b, 4)
  if (u16(b, 12) & 0x8000) return bytes
  const out: number[] = Array.from(b.subarray(0, 8 + hlen))
  let p = 8 + hlen
  while (p + 8 <= b.length) {
    const len = u32(b, p + 4), start = p + 8, end = Math.min(b.length, start + len)
    if (tag(b, p) !== 'MTrk') { for (let i = p; i < end; i++) out.push(b[i]); p = end; continue }
    const events: { tick: number; data: ArrayLike<number> }[] = []
    let q = start, tick = 0, status = 0, endTick = 0
    while (q < end) {
      let delta: number
      ;[delta, q] = readVar(b, q)
      tick += delta
      let s = b[q]
      if (s < 0x80) s = status          // running status: no status byte
      else { q++; if (s < 0xf0) status = s }
      let data: ArrayLike<number>
      if (s === 0xff) {
        const type = b[q]
        const [l, q2] = readVar(b, q + 1)
        const head = [0xff, type]; pushVar(head, l)
        data = [...head, ...b.subarray(q2, q2 + l)]
        q = q2 + l
        if (type === 0x2f) { endTick = tick; continue }   // written once, at the end
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
      const isNote = s < 0xf0 && (kind === 0x80 || kind === 0x90)
      if (tick < cutTick) { if (!isNote) events.push({ tick: 0, data }) }
      else events.push({ tick: tick - cutTick, data })
    }
    const body: number[] = []
    let last = 0
    for (const e of events) { pushVar(body, e.tick - last); last = e.tick; for (let i = 0; i < e.data.length; i++) body.push(e.data[i]) }
    pushVar(body, Math.max(0, Math.max(last, endTick - cutTick) - last))
    body.push(0xff, 0x2f, 0x00)
    out.push(0x4d, 0x54, 0x72, 0x6b)   // MTrk
    pushU32(out, body.length)
    for (const x of body) out.push(x)
    p = end
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
  ;(out.header as any).meta = ((edited.header as any).meta ?? [])
    .map((m: any) => ({ ...m, ticks: m.ticks > 0 ? m.ticks + cutTick : 0 }))
  return out
}
