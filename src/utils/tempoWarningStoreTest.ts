import { useStore } from '../store'
import { TRUST_VERSION, type TrustResult } from './tempoTrust'

export function runTempoWarningStoreTest(): number {
  console.group('[tempoWarning store] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const S = () => useStore.getState() as any
  const res: TrustResult = { flagged: true, from: 0, throughout: true, hintBpm: 91, shifted: false, fileBpm: 60, okWindows: 0, offWindows: 10, unclearWindows: 1 }

  check(S().tempoWarningsEnabled === false, 'off by default')
  S().setTempoWarningsEnabled(true)
  check(S().tempoWarningsEnabled === true, 'switch on')

  S().setTrustEntry('D:/a.mid', { size: 10, mtime: 2 }, 'key-a', res)
  check(S().libraryTrustIndex['D:/a.mid']?.songKey === 'key-a' && S().tempoTrustCache['key-a']?.v === TRUST_VERSION, 'library entry stored with detector version')
  S().setTrustEntry(null, null, 'key-b', res)
  check(!!S().tempoTrustCache['key-b'] && !S().libraryTrustIndex['null'], 'open-song result cached without an index entry')

  S().dismissTempoWarning('key-a')
  check(S().tempoWarningDismissed['key-a'] === true, 'dismissed')
  S().clearTempoWarningDismissals()
  check(Object.keys(S().tempoWarningDismissed).length === 0, 'dismissals cleared')

  S().setCurrentTrust(res)
  check(S().currentTrust?.hintBpm === 91, 'current song result')
  S().setMidi(null)
  check(S().currentTrust === null, 'unloading clears the current result')

  console.log(`tempoWarning store: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
