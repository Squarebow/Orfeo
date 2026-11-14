import { getSargamName, resolveSa, noteLabelText } from './noteNames'

export function runSargamTest(): number {
  console.group('[sargam] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Counting up from Sa = C (MIDI 60), Latin and Devanagari, as the requester confirmed
  const latin = Array.from({ length: 12 }, (_, i) => getSargamName(60 + i, 0, 'latin')).join(' ')
  check(latin === 'Sa re Re ga Ga Ma Ma′ Pa dha Dha ni Ni', `Latin from C: ${latin}`)
  const deva = Array.from({ length: 12 }, (_, i) => getSargamName(60 + i, 0, 'devanagari')).join(' ')
  check(deva === 'सा रे॒ रे ग॒ ग म म॑ प ध॒ ध नि॒ नि', `Devanagari from C: ${deva}`)

  // Sa moves: with Sa on C# (1), C# is Sa and C is Ni; with Sa on B (11), B is Sa
  check(getSargamName(61, 1, 'latin') === 'Sa' && getSargamName(60, 1, 'latin') === 'Ni', 'Sa on C#')
  check(getSargamName(59, 11, 'latin') === 'Sa' && getSargamName(66, 11, 'latin') === 'Pa', 'Sa on B: F# is Pa')
  check(getSargamName(21, 0, 'latin') === 'Dha' && getSargamName(108, 0, 'latin') === 'Sa', 'any octave')

  // Sa follows the key as heard (with transpose), or is set by hand; no key yet → C
  check(resolveSa('auto', { semitone: 2, isMinor: false, transpose: 0 }) === 2, 'auto: D major → Sa on D')
  check(resolveSa('auto', { semitone: 9, isMinor: true, transpose: 0 }) === 9, 'auto: A minor → Sa on A')
  check(resolveSa('auto', { semitone: 0, isMinor: false, transpose: -1 }) === 11, 'auto follows transpose')
  check(resolveSa('auto', null) === 0, 'auto with no key → C')
  check(resolveSa(1, { semitone: 7, isMinor: false, transpose: 3 }) === 1, 'set by hand wins over the key')

  // The keyboard and piano roll label: Sargam for single notes, the others unchanged
  const sg = { sa: 0, script: 'latin' as const }
  check(noteLabelText(62, 'sargam', 'flat', sg) === 'Re', 'Sargam label')
  check(noteLabelText(61, 'english', 'flat', sg) === 'Db', 'English label unchanged')
  check(noteLabelText(61, 'hidden', 'flat', sg) === '', 'hidden stays hidden')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
