// ── Key lights: lighting the keys of the player's own keyboard ──────────────
// Only what's publicly documented, nothing vendor-specific beyond that:
//   - 'notes'     Note on / note off on one MIDI channel. The basic way most
//                 lighted keyboards follow a computer (Yamaha's EZ-220 manual:
//                 notes received on channel 1 light the keys; the EZ-300 picks
//                 the channel in its Light Part settings). Velocity 1, so a
//                 keyboard that also sounds them stays as quiet as it can.
//   - 'partykeys' PartyKeys' open LED protocol (SysEx, per-key RGB, no echo):
//                 github.com/allen4z/PartykeysProtocol LED_PROTOCOL.md
// Research and sources: docs/IDEA-lit-keys-research.md (local).

export type KeyLightMode = 'off' | 'notes' | 'partykeys'
export interface KeyLightSetup { mode: KeyLightMode; channel: number }  // channel 1–16, for 'notes'

export const LIGHT_VELOCITY = 1

export const isKeyLightSetup = (v: any): v is KeyLightSetup =>
  !!v && ['off', 'notes', 'partykeys'].includes(v.mode) && Number.isInteger(v.channel) && v.channel >= 1 && v.channel <= 16

// What a keyboard gets before the player chooses: PartyKeys is recognised by
// its name (as its protocol says to); everything else stays dark
export function defaultSetup(deviceKey: string): KeyLightSetup {
  return /partykeys/i.test(deviceKey) ? { mode: 'partykeys', channel: 1 } : { mode: 'off', channel: 1 }
}

export type Rgb = [number, number, number]

// '#e8a33d', '#abc', 'rgb(1, 2, 3)' → [r, g, b]; anything else → null
export function parseRgb(css: string): Rgb | null {
  const s = css.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return [...m[1]].map(c => parseInt(c + c, 16)) as Rgb
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s)
  if (m) return [+m[1], +m[2], +m[3]].map(v => Math.max(0, Math.min(255, v))) as Rgb
  return null
}

// ── Note messages ────────────────────────────────────────────────────────────
// Lit before → lit now: note-offs for keys going dark, note-ons for new ones
export function noteLightMessages(before: Iterable<number>, now: Iterable<number>, channel: number): number[][] {
  const was = new Set(before), is = new Set(now)
  const ch = (channel - 1) & 0x0F
  const out: number[][] = []
  for (const n of was) if (!is.has(n)) out.push([0x80 | ch, n, 0])
  for (const n of is) if (!was.has(n)) out.push([0x90 | ch, n, LIGHT_VELOCITY])
  return out
}

// ── PartyKeys ────────────────────────────────────────────────────────────────
const PK = [0xF0, 0x05, 0x30, 0x7F, 0x7F, 0x20, 0x00]
export const PK_LOW = 48, PK_KEYS = 36  // PartyKeys 36: C3–B5
export const partyKeysEnter = () => [...PK, 0x0F, 0x01, 0xF7]
export const partyKeysExit = () => [...PK, 0x0F, 0x00, 0xF7]
export const partyKeysAllOff = () => [...PK, 0x71, 0x00, 0xF7]

// CMD 15, per-key RGB: changed keys grouped by colour (off = black). Keys
// outside the keyboard are left out; an empty change gives no message.
export function partyKeysColours(changes: Map<number, Rgb | null>): number[] | null {
  const groups = new Map<string, { rgb: Rgb; keys: number[] }>()
  for (const [note, rgb] of changes) {
    const idx = note - PK_LOW
    if (idx < 0 || idx >= PK_KEYS) continue
    const c: Rgb = rgb ?? [0, 0, 0]
    const id = c.join()
    const g = groups.get(id) ?? { rgb: c, keys: [] }
    g.keys.push(idx)
    groups.set(id, g)
  }
  if (!groups.size) return null
  const bytes = [...PK, 0x15, groups.size]
  for (const { rgb, keys } of groups.values()) {
    for (const v of rgb) bytes.push(v >> 7, v & 0x7F)
    bytes.push(keys.length, ...keys)
  }
  bytes.push(0xF7)
  return bytes
}

// Lit before → lit now, with colours: what changed (null = goes dark)
export function colourChanges(before: Map<number, Rgb>, now: Map<number, Rgb>): Map<number, Rgb | null> {
  const out = new Map<number, Rgb | null>()
  for (const n of before.keys()) if (!now.has(n)) out.set(n, null)
  for (const [n, c] of now) { const b = before.get(n); if (!b || b.join() !== c.join()) out.set(n, c) }
  return out
}
