import {
  colourChanges, defaultSetup, isKeyLightSetup, noteLightMessages, parseRgb, partyKeysAllOff, partyKeysColours,
  partyKeysEnter, partyKeysExit, choiceOf, setupForChoice, fingerLightMessages, fingersEnter, oneSmartEnter, oneSmartMessages, vangoaMessages,
  type LightHand, type Rgb,
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

  // Finger channels, ONE and Vangoa: against what Synthesia sent for the same keys
  const fm = fingerLightMessages(new Map(), new Map<number, LightHand>([[65, 'R'], [48, 'L']]))
  check(fm.map(hex).join() === '9C 41 01,9B 30 01', `finger channels on ${fm.map(hex)}`)
  const fOff = fingerLightMessages(new Map<number, LightHand>([[65, 'R']]), new Map())
  check(fOff.map(hex).join() === '80 41 00', 'finger light off on channel 1')
  check(hex(fingersEnter()) === 'B0 10 07', 'finger channels: both hands, as Synthesia says it')
  const fMove = fingerLightMessages(new Map<number, LightHand>([[60, 'R']]), new Map<number, LightHand>([[60, 'L']]))
  check(fMove.map(hex).join() === '80 3C 00,9B 3C 01', 'a key changing hand goes dark, then lights again')
  check(oneSmartEnter().map(hex).join() === 'F0 00 20 2B 69 00 00 55 79 F7,F0 00 20 2B 69 16 02 00 F7', 'ONE switch-on')
  const one = oneSmartMessages([65], [74, 10])
  check(one.map(hex).join() === 'A2 2C 00,A2 35 01', `ONE key from A0, keys below A0 left out ${one.map(hex)}`)
  const vg = vangoaMessages([65], [74])
  check(vg.map(hex).join() === 'F0 4D 4C 4E 45 41 00 F7,F0 4D 4C 4E 45 4A 01 F7', `Vangoa ${vg.map(hex)}`)
  check(isKeyLightSetup({ mode: 'vangoa', channel: 1 }) && isKeyLightSetup({ mode: 'fingers', channel: 1 }), 'new choices saved')
  const cas = setupForChoice('casio', { mode: 'off', channel: 5 })
  check(cas.mode === 'notes' && cas.channel === 3 && choiceOf(cas) === 'casio' && isKeyLightSetup(cas), 'Casio is Note messages on channel 3')
  check(choiceOf(setupForChoice('yamaha', cas)) === 'yamaha' && setupForChoice('yamaha', cas).channel === 1, 'Yamaha is channel 1')
  check(choiceOf({ mode: 'notes', channel: 1 }) === 'notes', 'plain Note messages on channel 1 stays Note messages')
  check(setupForChoice('notes', cas).channel === 3 && choiceOf(setupForChoice('notes', cas)) === 'notes', 'any channel keeps the channel it had')

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
