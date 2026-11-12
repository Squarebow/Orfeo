import {
  colourChanges, defaultSetup, isKeyLightSetup, noteLightMessages, parseRgb, partyKeysAllOff, partyKeysColours,
  partyKeysEnter, partyKeysExit, type Rgb,
} from './keyLights'
import { echoKey, isLightEcho, noteLightSent, clearLightEchoes } from './keyLightEcho'

export function runKeyLightsTest(): number {
  console.group('[keyLights] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const hex = (b: number[] | null) => b ? b.map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(' ') : 'null'

  // Settings
  check(defaultSetup('PartyKeys 36').mode === 'partykeys', 'PartyKeys recognised by name')
  check(defaultSetup('LUMI Keys BLOCK').mode === 'off', 'other keyboards start dark')
  check(isKeyLightSetup({ mode: 'notes', channel: 1 }) && !isKeyLightSetup({ mode: 'notes', channel: 17 }) && !isKeyLightSetup({ mode: 'x', channel: 1 }), 'saved setups checked')

  // Colours
  check(parseRgb('#e8a33d')?.join() === '232,163,61', 'hex colour')
  check(parseRgb('#abc')?.join() === '170,187,204', 'short hex colour')
  check(parseRgb('rgb(10, 20, 300)')?.join() === '10,20,255', 'rgb() colour, clamped')
  check(parseRgb('var(--text-amber)') === null, 'unresolved colour')

  // Note messages: only what changed, on the chosen channel, quiet
  const msgs = noteLightMessages([60, 64], [64, 67], 1)
  check(msgs.length === 2 && hex(msgs[0]) === '80 3C 00' && hex(msgs[1]) === '90 43 01', `note changes ${msgs.map(hex)}`)
  check(hex(noteLightMessages([], [60], 16)[0]) === '9F 3C 01', 'channel 16')
  check(noteLightMessages([60], [60], 1).length === 0, 'nothing changed, nothing sent')

  // PartyKeys, against the examples in its protocol document
  check(hex(partyKeysEnter()) === 'F0 05 30 7F 7F 20 00 0F 01 F7', 'enter lighting mode')
  check(hex(partyKeysExit()) === 'F0 05 30 7F 7F 20 00 0F 00 F7', 'leave lighting mode')
  check(hex(partyKeysAllOff()) === 'F0 05 30 7F 7F 20 00 71 00 F7', 'all off')
  const red: Rgb = [255, 0, 0], blue: Rgb = [0, 0, 255]
  const doc = partyKeysColours(new Map<number, Rgb | null>([[48, red], [60, blue], [72, blue]]))
  check(hex(doc) === 'F0 05 30 7F 7F 20 00 15 02 01 7F 00 00 00 00 01 00 00 00 00 00 01 7F 02 0C 18 F7', `document example ${hex(doc)}`)
  const off = partyKeysColours(new Map([[50, null]]))
  check(hex(off) === 'F0 05 30 7F 7F 20 00 15 01 00 00 00 00 00 00 01 02 F7', 'a key going dark is black')
  check(partyKeysColours(new Map([[40, red], [90, red]])) === null, 'keys beyond C3–B5 left out')

  const before = new Map<number, Rgb>([[60, red], [62, red]])
  const now = new Map<number, Rgb>([[62, blue], [64, red]])
  const ch = colourChanges(before, now)
  check(ch.get(60) === null && ch.get(62)?.join() === '0,0,255' && ch.get(64)?.join() === '255,0,0' && ch.size === 3, 'colour changes')
  check(colourChanges(now, new Map(now)).size === 0, 'same colours, no change')

  // Echoes: a keyboard sending our light notes back isn't the player
  clearLightEchoes()
  noteLightSent('kb', [[0x90, 60, 1]], 1000)
  check(isLightEcho('kb', 60, 1, 1050), 'echo within the window')
  check(!isLightEcho('kb', 60, 1, 1060), 'each echo counted once')
  noteLightSent('kb', [[0x90, 62, 1]], 1000)
  check(!isLightEcho('kb', 62, 90, 1010), 'the player pressing it harder is real')
  check(!isLightEcho('kb', 62, 1, 1400), 'too late to be an echo')
  check(!isLightEcho('other', 64, 1, 1000) && echoKey('kb', 60) === 'kb:60', 'other keyboards unaffected')

  console.log(`keyLights: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
