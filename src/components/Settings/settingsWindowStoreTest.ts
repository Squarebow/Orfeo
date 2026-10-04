import { useStore, applySamplesIntroducedPref } from '../../store'
import { followNeedsPick } from './followPick'

export function runSettingsWindowStoreTest(): number {
  console.group('[settings window store] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const S = () => useStore.getState()

  check(S().settingsWindowOpen === false && S().settingsWindowGroup === 'audio', 'closed, Audio by default')
  S().openSettingsWindow('keyboard')
  check(S().settingsWindowOpen && S().settingsWindowGroup === 'keyboard', 'opens on the asked group')
  S().closeSettingsWindow()
  S().openSettingsWindow()
  check(S().settingsWindowOpen && S().settingsWindowGroup === 'keyboard', 'no group -> last group this session')
  S().closeSettingsWindow()
  check(!S().settingsWindowOpen, 'closes')

  check(S().samplesIntroduced === false, 'samplesIntroduced starts false')
  S().setSamplesIntroduced(true)
  check(S().samplesIntroduced === true, 'setter works')

  // restoring saved prefs: an existing Samples user counts as introduced
  useStore.setState({ samplesIntroduced: false } as any)
  applySamplesIntroducedPref({ audioEngine: 'samples' }, S())
  check(S().samplesIntroduced === true, 'restored Samples user counts as introduced')
  useStore.setState({ samplesIntroduced: false } as any)
  applySamplesIntroducedPref({ audioEngine: 'gm' }, S())
  check(S().samplesIntroduced === false, 'GM user without the flag stays not introduced')
  applySamplesIntroducedPref({ audioEngine: 'gm', samplesIntroduced: true }, S())
  check(S().samplesIntroduced === true, 'saved flag restored')

  // Follow needs a pick for the CURRENT kind (group vs track) — a saved group
  // doesn't help when By Track is active, and vice versa
  check(followNeedsPick({ chordFollowSubMode: 'track', chordFollowGroup: 'piano', chordFollowTrackIndex: null }), 'By Track with only a group picked -> needs a pick')
  check(!followNeedsPick({ chordFollowSubMode: 'group', chordFollowGroup: 'piano', chordFollowTrackIndex: null }), 'By Group with a group -> fine')
  check(followNeedsPick({ chordFollowSubMode: 'group', chordFollowGroup: null, chordFollowTrackIndex: 3 }), 'By Group with only a track -> needs a pick')
  check(!followNeedsPick({ chordFollowSubMode: 'track', chordFollowGroup: null, chordFollowTrackIndex: 0 }), 'By Track with track 0 -> fine')

  console.log(`settings window store: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
