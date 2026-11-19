import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import type { Side, TourId } from '../../utils/tours'

// ── The stops of both tours. `targets` are data-tour marks on existing controls;
// the first one found decides where the card sits, every one found gets a ring.
// `fallback` is used when none of `targets` is on screen. `prepare` makes sure the
// control is showing (opens a panel, switches a tab) before the card points at it.
// A `welcome` step points at nothing: a big card in the middle of the window, not
// numbered, with `text` as its opening line and the list of stops to come (each
// stop's title and `teaser`) below it.
// `oneRing` draws a single ring round all its targets together, for an area made of
// several parts. `corners` puts the card between its first two targets, above them,
// with a pointer near each lower corner. ──
export interface TourStep {
  title: string
  text: string
  /** one line for the list on the welcome card */
  teaser?: string
  targets: string[]
  fallback?: string
  side: Side
  prepare?: () => void
  welcome?: boolean
  oneRing?: boolean
  corners?: boolean
}

const showDrawer = (tab: 'library' | 'settings') => () => {
  const s = useStore.getState()
  s.setDrawerTab(tab)
  if (!s.settingsPanelOpen) s.setSettingsPanelOpen(true)
}
const openTracks = () => useStore.getState().setTrackPanelOpen(true)

// built on demand, so the words are read in the language chosen at the time
export function tourSteps(id: TourId): TourStep[] {
  if (id === 'firstLaunch') return [
    { title: t`Welcome to Orfeo`, side: 'bottom', targets: [], welcome: true,
      text: t`Orfeo helps you turn any MIDI file into a piano lesson. You see every note on the piano roll and the keys, hear it with real instruments, and slow it down until your fingers catch up. Let's get you set up in five quick stops.` },
    { title: t`Your songs`, side: 'right', targets: ['drawer-tabs', 'library-header'], oneRing: true, fallback: 'tab-library', prepare: showDrawer('library'),
      teaser: t`Show Orfeo where your music lives.`,
      text: t`Show Orfeo where your songs live on your computer: set your MIDI folder here and every song in it appears in the Library. The demo songs are already here, so you can start straight away.` },
    { title: t`Open a song`, side: 'bottom', targets: ['open-file'],
      teaser: t`Four ways in, all one click away.`,
      text: t`To open a song, click it in the Library, click this icon, press Ctrl+O or drag a file onto Orfeo. It loads at once and is ready for you.` },
    { title: t`Right-click for more`, side: 'right', targets: ['library-song'], fallback: 'library-header', prepare: showDrawer('library'),
      teaser: t`Tags, your practice queue and more.`,
      text: t`Right-click any song in your Library to see what you can do with it: tag it, put it in your practice queue, show it in its folder, and more.` },
    { title: t`Sound`, side: 'right', targets: ['setting-soundEngine'], prepare: showDrawer('settings'),
      teaser: t`Real instruments instead of the basic sound.`,
      text: t`We recommend switching from GM to Studio or Native: high-quality sound engines with real sampled instruments, for the best experience.` },
    { title: t`Your keyboard`, side: 'bottom', targets: ['midi-keyboard'],
      teaser: t`Plug in and play along.`,
      text: t`When you plug in your USB keyboard, its name shows here. Click the MIDI icon to open the Keyboard settings.` },
  ]
  return [
    { title: t`Create your first lesson`, side: 'bottom', targets: [], welcome: true,
      text: t`Your song is open. In a few simple steps you'll turn it into a lesson that fits your hands: choose what you hear, set a tempo you can keep, loop the tricky bars and see every chord as it goes by.` },
    { title: t`Tracks`, side: 'left', targets: ['tracks-panel'], prepare: openTracks,
      teaser: t`Every part of the song, to hear and to see.`,
      text: t`Listen and watch: every part of the song is here. The eye shows a part on the piano roll and the keyboard; mute and solo decide what you hear.` },
    { title: t`Play, tempo and metronome`, side: 'bottom', targets: ['transport', 'tempo', 'metronome'],
      teaser: t`Slow it down and count yourself in.`,
      text: t`Space plays and pauses. To practise slower, lower the tempo with its arrows, or double-click it and type one. The metronome adds a click track; right-click it for its volume and a count-in, so Play counts you in before the music starts.` },
    { title: t`Loop a passage`, side: 'bottom', targets: ['loop'],
      teaser: t`Repeat the hard bars until they're easy.`,
      text: t`Click to loop the whole song. To loop a few bars, hold Alt and drag across the piano roll first.` },
    { title: t`Chords`, side: 'top', targets: ['chord-name'],
      teaser: t`Every chord named as it plays.`,
      text: t`The chord being played, named as the song goes. Right-click it to see the chord on the keyboard.` },
    { title: t`Chords and Scales Explorers`, side: 'top', targets: ['explorer-chords', 'explorer-scales'], corners: true,
      teaser: t`Two playgrounds for your ears.`,
      text: t`Curious how a song is built? Open the Chords Explorer to play any chord and hear progressions come alive, or the Scales Explorer to light up any scale in any key and find the notes that fit. Great for warming up, and for writing your own.` },
    { title: t`Orfeo tools`, side: 'left', targets: ['tool-playback-editor', 'tool-note-editor', 'tool-mixer'], oneRing: true, prepare: openTracks,
      teaser: t`Make the song your own.`,
      text: t`Make the song your own. The Playback Editor chooses what you hear and see, renames parts and splits the piano into left and right hand. The Note Editor fixes single notes on the piano roll. The Mixer balances every instrument, with reverb and more.` },
  ]
}
