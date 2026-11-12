// ── Key lights: lighting the keys of the player's own keyboard ──────────────
// From public documents, and from what Synthesia sends to a virtual cable for
// each of its Key Lights choices (recorded 12. 11. 2026, black box only):
//   - 'notes'     Note on / note off on one MIDI channel. The basic way most
//                 lighted keyboards follow a computer (Yamaha's EZ-220 manual:
//                 notes received on channel 1 light the keys; the EZ-300 picks
//                 the channel in its Light Part settings). Velocity 1, so a
//                 keyboard that also sounds them stays as quiet as it can.
//   - 'partykeys' PartyKeys' open LED protocol (SysEx, per-key RGB, no echo):
//                 github.com/allen4z/PartykeysProtocol LED_PROTOCOL.md
//   - 'fingers'   Synthesia's "Finger-based channel" (iPiano Model-U): a note-on
//                 at velocity 1 whose channel is the finger, right hand 7–11
//                 thumb to little finger, 13 = right hand, finger unknown. The
//                 light always goes off with a note-off on channel 1. Orfeo has
//                 no fingering, so it sends the "finger unknown" channel per hand.
//   - 'onesmart'  Synthesia's "Proprietary 1" (The ONE Smart Piano, Piano LED
//                 Plus): two SysEx messages switch the lights on, then
//                 polyphonic key pressure on channel 3, key counted from A0 = 0,
//                 value 1 lit / 0 dark.
//   - 'vangoa'    Synthesia's "Proprietary 3" (Vangoa): one SysEx per key,
//                 F0 4D 4C 4E 45 ("MLNE") note 01|00 F7.
// Research and sources: docs/IDEA-lit-keys-research.md (local).

export const KEY_LIGHT_MODES = ['off', 'notes', 'partykeys', 'fingers', 'onesmart', 'vangoa'] as const
export type KeyLightMode = typeof KEY_LIGHT_MODES[number]
// channel 1–16, for 'notes'; brand: chosen as a ready-made "Yamaha" or "Casio" in Settings
export interface KeyLightSetup { mode: KeyLightMode; channel: number; brand?: 'yamaha' | 'casio' }

export const LIGHT_VELOCITY = 1

export const isKeyLightSetup = (v: any): v is KeyLightSetup =>
  !!v && (KEY_LIGHT_MODES as readonly string[]).includes(v.mode) && Number.isInteger(v.channel) && v.channel >= 1 && v.channel <= 16

// ── The choices in Settings: the modes, plus two ready-made Note messages ──
// Synthesia's own list: channel 1 "most Yamaha, a few Casio", channel 3 "most
// Casio models, Akai"
export type KeyLightChoice = KeyLightMode | 'yamaha' | 'casio'
const BRAND_CHANNEL = { yamaha: 1, casio: 3 } as const
export function choiceOf(s: KeyLightSetup): KeyLightChoice {
  if (s.mode === 'notes' && s.brand && s.channel === BRAND_CHANNEL[s.brand]) return s.brand
  return s.mode
}
export function setupForChoice(choice: KeyLightChoice, current: KeyLightSetup): KeyLightSetup {
  if (choice === 'yamaha' || choice === 'casio') return { mode: 'notes', channel: BRAND_CHANNEL[choice], brand: choice }
  return { mode: choice, channel: current.channel }
}

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

// ── Finger channels (iPiano) ─────────────────────────────────────────────────
export type LightHand = 'L' | 'R'
export const FINGER_RH_UNKNOWN = 13
export const FINGER_LH_UNKNOWN = 12  // left hand, finger unknown: one left-hand key in a both-hands recording
// Sent once before the first light. Synthesia sends controller 16 on channel 1,
// value 5 with the right hand chosen and 7 with both hands; Orfeo lights both.
export const fingersEnter = (): number[] => [0xB0, 0x10, 0x07]
// Lit before → lit now, each key with its hand. A key that changes hand goes
// dark first, then lights on its new channel.
export function fingerLightMessages(before: Map<number, LightHand>, now: Map<number, LightHand>): number[][] {
  const out: number[][] = []
  for (const [n, h] of before) if (now.get(n) !== h) out.push([0x80, n, 0])
  for (const [n, h] of now) if (before.get(n) !== h) out.push([0x90 | ((h === 'L' ? FINGER_LH_UNKNOWN : FINGER_RH_UNKNOWN) - 1), n, LIGHT_VELOCITY])
  return out
}

// ── The ONE Smart Piano / Piano LED Plus ────────────────────────────────────
export const ONE_LOW = 21, ONE_KEYS = 88
export const oneSmartEnter = (): number[][] => [
  [0xF0, 0x00, 0x20, 0x2B, 0x69, 0x00, 0x00, 0x55, 0x79, 0xF7],
  [0xF0, 0x00, 0x20, 0x2B, 0x69, 0x16, 0x02, 0x00, 0xF7],
]
export function oneSmartMessages(before: Iterable<number>, now: Iterable<number>): number[][] {
  const was = new Set(before), is = new Set(now)
  const msg = (n: number, on: boolean) => [0xA2, n - ONE_LOW, on ? 1 : 0]
  const fits = (n: number) => n >= ONE_LOW && n < ONE_LOW + ONE_KEYS
  const out: number[][] = []
  for (const n of was) if (!is.has(n) && fits(n)) out.push(msg(n, false))
  for (const n of is) if (!was.has(n) && fits(n)) out.push(msg(n, true))
  return out
}

// ── Vangoa ───────────────────────────────────────────────────────────────────
export function vangoaMessages(before: Iterable<number>, now: Iterable<number>): number[][] {
  const was = new Set(before), is = new Set(now)
  const msg = (n: number, on: boolean) => [0xF0, 0x4D, 0x4C, 0x4E, 0x45, n & 0x7F, on ? 1 : 0, 0xF7]
  const out: number[][] = []
  for (const n of was) if (!is.has(n)) out.push(msg(n, false))
  for (const n of is) if (!was.has(n)) out.push(msg(n, true))
  return out
}
