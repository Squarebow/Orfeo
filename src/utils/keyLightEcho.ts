// ── Light notes a keyboard sends back ───────────────────────────────────────
// Some keyboards echo every note they receive. A note-on Orfeo sent only to
// light a key must not come back as the player pressing it. Same velocity,
// same key, soon after: an echo, counted once. Shared by the lights output
// (hooks/keyLightsOutput.ts) and the MIDI input (hooks/useMidiInput.ts).
import { LIGHT_VELOCITY } from './keyLights'

const ECHO_MS = 250
const _sent = new Map<string, number[]>()  // `${device}:${note}` -> send times

export const echoKey = (device: string, note: number) => `${device}:${note}`

export function noteLightSent(device: string, msgs: number[][], now = performance.now()): void {
  for (const [status, note, vel] of msgs) {
    if ((status & 0xF0) !== 0x90 || vel === 0) continue
    const k = echoKey(device, note)
    _sent.set(k, [...(_sent.get(k) ?? []).filter(t => now - t < ECHO_MS), now])
  }
}

export function isLightEcho(device: string, note: number, vel: number, now = performance.now()): boolean {
  if (vel !== LIGHT_VELOCITY) return false
  const k = echoKey(device, note)
  const times = (_sent.get(k) ?? []).filter(t => now - t < ECHO_MS)
  if (!times.length) { _sent.delete(k); return false }
  times.shift()
  if (times.length) _sent.set(k, times); else _sent.delete(k)
  return true
}

export function clearLightEchoes(): void { _sent.clear() }
