import { useStore } from '../store'
import { useSoundfontState, startSamples, chooseSamplesFromQuick, withDownloadProgress } from './useSoundfonts'

export async function runSoundfontsTestAsync(): Promise<number> {
  console.group('[useSoundfonts] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const S = () => useStore.getState()

  // sounds already loaded (Samples was used at launch): switching counts as used
  useSoundfontState.setState({ samplesStatus: 'ready' })
  useStore.setState({ audioEngine: 'gm', samplesIntroduced: false, settingsWindowOpen: false } as any)
  await startSamples()
  check(S().audioEngine === 'samples' && S().samplesIntroduced === true, 'ready path marks Samples as used')

  // first time from Quick Settings opens the window on Audio; the next time doesn't
  useStore.setState({ audioEngine: 'gm', samplesIntroduced: false, settingsWindowOpen: false } as any)
  chooseSamplesFromQuick(); await Promise.resolve()
  check(S().settingsWindowOpen && S().settingsWindowGroup === 'audio', 'first time opens Settings on Audio')
  useStore.setState({ audioEngine: 'gm', settingsWindowOpen: false } as any)
  chooseSamplesFromQuick(); await Promise.resolve()
  check(!S().settingsWindowOpen && S().audioEngine === 'samples', 'later: just switches')

  // two downloads at once: each keeps its own progress, finished ones leave
  let downloads = withDownloadProgress({}, 'a', 0)
  downloads = withDownloadProgress(downloads, 'b', 0)
  downloads = withDownloadProgress(downloads, 'a', 0.5)
  downloads = withDownloadProgress(downloads, 'b', 0.2)
  check(downloads.a === 0.5 && downloads.b === 0.2, 'separate progress')
  downloads = withDownloadProgress(downloads, 'a', 1)
  check(downloads.a === undefined && downloads.b === 0.2, 'one finishing leaves the other')

  console.log(`useSoundfonts: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
