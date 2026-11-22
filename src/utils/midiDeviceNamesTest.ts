import { modelName, cleanPortName, looksVirtual } from './midiDeviceNames'

export function runMidiDeviceNamesTest(): number {
  console.group('[midiDeviceNames] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Just the model, for tooltips
  for (const [n, want] of [['KOMPLETE KONTROL S88 MK3', 'S88 MK3'], ['Launchkey MK4 37', 'Launchkey MK4 37'], ['MPK mini Plus', 'MPK mini Plus'],
    ['PartyKeys 36', 'PartyKeys 36'], ['KeyLab Essential 88 mk3', 'KeyLab Essential 88 mk3'], ['P-125', 'P-125'], ['USB MIDI', 'USB MIDI']])
    check(modelName(n) === want, `${n} → ${want} (${modelName(n)})`)

  // Virtual ports, as their tools name them
  for (const n of ['loopMIDI Port', 'loopMIDI Port 1', 'LoopBe Internal MIDI', 'Default App Loopback (A)', 'Service Test Loopback B',
    'Midi Through Port-0', 'IAC Driver Bus 1', 'MIDI Yoke:  1'])
    check(looksVirtual(cleanPortName(n)), `${n} is virtual`)

  // Ports that can carry a real player stay listed
  for (const n of ['Bome MIDI Translator 1', 'rtpMIDI Network Session 1', 'Network Session 1', 'Virtual MIDI Piano Keyboard'])
    check(!looksVirtual(cleanPortName(n)), `${n} stays listed`)

  // Real keyboards stay keyboards
  for (const n of ['Komplete Kontrol S88 MK3', 'MPK mini Plus', 'Launchkey MK4 37', 'Digital Piano', 'PartyKeys 36', 'CASIO USB-MIDI', 'Yamaha EZ-220', 'Roland FP-30X'])
    check(!looksVirtual(cleanPortName(n)), `${n} is a keyboard`)
  // A name the player chose for a Windows loopback can't be told by name
  check(!looksVirtual('Lights A'), 'a self-named loopback needs marking by hand')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
