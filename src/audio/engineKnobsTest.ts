import { setMasterReverb, setMasterChorus, setMasterTone, masterKnobs } from './engine'

export function runEngineKnobsTest(): number {
  console.group('[engine knobs] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const k0 = masterKnobs()
  check(k0.reverb === null && k0.chorus === null && k0.tone === 0, `untouched: no master reverb/chorus, flat tone, got ${JSON.stringify(k0)}`)
  setMasterReverb(0.4); setMasterChorus(0.2); setMasterTone(-0.5)
  const k = masterKnobs()
  check(k.reverb === 0.4 && k.chorus === 0.2 && k.tone === -0.5, `remembers the last values, got ${JSON.stringify(k)}`)
  console.log(`engine knobs: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
