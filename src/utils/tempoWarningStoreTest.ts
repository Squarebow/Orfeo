import { useStore } from '../store'
import { TRUST_VERSION, type TrustResult } from './tempoTrust'
import { warningVisible } from './tempoWarningRules'

export async function runTempoWarningStoreTest(): Promise<number> {
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

  // the logo's Reset (resetAll) also clears it -> no light over an empty app
  S().setCurrentTrust(res)
  S().resetAll()
  check(S().currentTrust === null, 'reset clears the current result')

  // library results are saved in batches, not one prefs write per song
  const saves: any[] = []
  ;(globalThis as any).window.electronAPI = { setPrefs: (d: any) => { saves.push(d); return Promise.resolve() } }
  for (let i = 0; i < 20; i++) S().setTrustEntry(`D:/s${i}.mid`, { size: i, mtime: i }, `k${i}`, res)
  const immediate = saves.filter(d => 'tempoTrustCache' in d).length
  await new Promise(r => setTimeout(r, 2600))
  const later = saves.filter(d => 'tempoTrustCache' in d)
  check(immediate === 0, `no per-song prefs write, got ${immediate}`)
  check(later.length === 1 && Object.keys(later[0].tempoTrustCache).length >= 20, `one batched write, got ${later.length}`)

  // a song with a kept Tap Tempo, or a dismissed one, never shows a warning
  const st = (over: any) => ({ tempoWarningsEnabled: true, tempoWarningDismissed: {}, tempoCorrections: {}, tempoTrustCache: { k: { ...res, v: TRUST_VERSION } }, ...over })
  check(warningVisible(st({}), 'k') === true, 'flagged song warns')
  check(warningVisible(st({ tempoCorrections: { k: { segments: [] } } }), 'k') === false, 'kept Tap Tempo -> no warning')
  check(warningVisible(st({ tempoWarningDismissed: { k: true } }), 'k') === false, 'dismissed -> no warning')
  check(warningVisible(st({ tempoWarningsEnabled: false }), 'k') === false, 'switched off -> no warning')
  check(warningVisible(st({ tempoTrustCache: { k: { ...res, v: TRUST_VERSION - 1 } } }), 'k') === false, 'old detector result -> no warning')

  console.log(`tempoWarning store: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
