import { recordNote, getStats, clearDiagnostics, buildPerformanceLog } from './midiDiagnostics'

export function runMidiDiagnosticsTest(): number {
  console.group('[midiDiagnostics] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  clearDiagnostics()
  recordNote(1000, 1001.5, 1002, 60, 80, 'usb')    // USB: stamped 1.5 ms before the handler
  recordNote(2000, 2002.5, 2003, 62, 80, 'usb')
  recordNote(0, 3000, 3001, 64, 80, 'usb')          // no stamp
  recordNote(3100, 3000, 3001, 64, 80, 'usb')       // stamp after the handler started
  recordNote(1000, 4200, 4201, 65, 80, 'ble')       // Bluetooth: 3.2 s "before", the keyboard's clock
  let s = getStats()
  check(s.notes === 5, `every note counted, got ${s.notes}`)
  check(s.avgInputMs === 2 && s.worstInputMs === 2.5, `average/worst from plausible stamps only, got ${s.avgInputMs}/${s.worstInputMs}`)
  check(s.implausibleInputs === 1, `one stamp too far back, got ${s.implausibleInputs}`)
  check(s.lastInputMs === null, 'last note implausible → no last input time')
  check(buildPerformanceLog().notes[4].inputMs === 3200, 'log keeps the raw value')

  clearDiagnostics()
  recordNote(1000, 4000, 4001, 60, 80, 'ble')
  s = getStats()
  check(s.avgInputMs === null && s.worstInputMs === null && s.implausibleInputs === 1, 'only implausible stamps → input not measurable')
  check(s.avgHandleMs === 1, `handling still measured, got ${s.avgHandleMs}`)
  clearDiagnostics()

  console.log(`midiDiagnostics: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
