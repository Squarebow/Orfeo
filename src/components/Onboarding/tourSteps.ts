import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import type { Side, TourId } from '../../utils/tours'

// ── The stops of both tours. `targets` are data-tour marks on existing controls;
// the first one found decides where the card sits, every one found gets a ring.
// `fallback` is used when none of `targets` is on screen. `prepare` makes sure the
// control is showing (opens a panel, switches a tab) before the card points at it.
// A `welcome` step points at nothing: a card in the middle of the window, not numbered.
// `oneRing` draws a single ring round all its targets together, for an area made of
// several parts. ──
export interface TourStep {
  title: string
  text: string
  targets: string[]
  fallback?: string
  side: Side
  prepare?: () => void
  welcome?: boolean
  oneRing?: boolean
}

const showDrawer = (tab: 'library' | 'settings') => () => {
  const s = useStore.getState()
  s.setDrawerTab(tab)
  if (!s.settingsPanelOpen) s.setSettingsPanelOpen(true)
}

// built on demand, so the words are read in the language chosen at the time
export function tourSteps(id: TourId): TourStep[] {
  if (id === 'firstLaunch') return [
    { title: t`Welcome to Orfeo`, side: 'bottom', targets: [], welcome: true,
      text: t`Here are a few simple steps to get you going.` },
    { title: t`Your songs`, side: 'right', targets: ['drawer-tabs', 'library-header'], oneRing: true, fallback: 'tab-library', prepare: showDrawer('library'),
      text: t`Set your MIDI folder to see your own songs here. The Demo songs are already in the Library, so you can start straight away.` },
    { title: t`Open a song`, side: 'bottom', targets: ['open-file'],
      text: t`Open a file from your computer, drag one onto Orfeo, or click a song in the Library.` },
    { title: t`Sound`, side: 'right', targets: ['setting-soundEngine'], prepare: showDrawer('settings'),
      text: t`GM plays straight away. Studio and Native sound like real instruments.` },
    { title: t`Your keyboard`, side: 'bottom', targets: ['midi-keyboard'],
      text: t`Plug in a MIDI keyboard by USB and Orfeo picks it up. Click here for its settings.` },
  ]
  return [
    { title: t`Your first lesson`, side: 'bottom', targets: [], welcome: true,
      text: t`Make your first piano lesson by following these simple steps.` },
    { title: t`Tracks`, side: 'left', targets: ['tracks-panel'], prepare: () => useStore.getState().setTrackPanelOpen(true),
      text: t`Every part of the song. The eye shows a part on the piano roll and the keyboard; mute and solo decide what you hear.` },
    { title: t`Play and tempo`, side: 'bottom', targets: ['transport', 'tempo'],
      text: t`Space plays and pauses. To practise slower, lower the tempo with its arrows, or double-click it and type one.` },
    { title: t`Loop a passage`, side: 'bottom', targets: ['loop'],
      text: t`Click to loop the whole song. To loop a few bars, hold Alt and drag across the piano roll first.` },
    { title: t`Chords`, side: 'top', targets: ['chord-name'],
      text: t`The chord being played, named as the song goes. Right-click it to see the chord on the keyboard.` },
    { title: t`Explorers`, side: 'top', targets: ['explorer-chords', 'explorer-scales'],
      text: t`Open Chords or Scales to try out chords and scales on the keyboard.` },
  ]
}
