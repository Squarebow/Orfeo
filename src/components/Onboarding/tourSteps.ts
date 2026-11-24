import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import type { Side, TourId } from '../../utils/tours'
import { usePractice } from '../../practice/practiceMode'

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
  if (id === 'practice') return [
    { title: t`Practice mode`, side: 'bottom', targets: [], welcome: true,
      text: t`Practise a song's piano part with your own keyboard. Orfeo plays the band, lights the keys you play next, waits for you when you want it to, and tells you how it went. A quick look round the screen:` },
    // only while trying a song that isn't a lesson yet
    ...(usePractice.getState().trial ? [{ title: t`Trying it as it is`, side: 'bottom' as const, targets: ['practice-trial'],
      teaser: t`A song that isn't a lesson yet.`,
      text: t`This song isn't a lesson yet, so you're trying it as it is: both hands, with Orfeo's guess at which hand plays what. Click here to see why, and how to make it a lesson.` }] : []),
    { title: t`Play`, side: 'bottom', targets: ['practice-transport'],
      teaser: t`Play, pause and where you are.`,
      text: t`Play and pause (or Space), back to the start (or to the start of your loop), and the time. While the song plays, everything else fades, so nothing takes your eyes off the music.` },
    { title: t`Timeline`, side: 'bottom', targets: ['practice-ticks'],
      teaser: t`The whole song, to jump anywhere.`,
      text: t`The whole song at a glance: click or drag to jump anywhere. To repeat a passage, hold Alt and drag across the piano roll; the loop shows here too.` },
    { title: t`What you hear`, side: 'bottom', targets: ['practice-band'],
      teaser: t`Your piano alone, or with the band.`,
      text: t`Your piano alone, Focus (with the bass and drums), or the whole band. Mute any track, or show a keyboard in the band (an organ, say) on the piano roll to see its harmony.` },
    { title: t`Key and tempo`, side: 'bottom', targets: ['practice-key', 'practice-tempo'],
      teaser: t`Slower to learn, in a key that suits you.`,
      text: t`Slow the song down while you learn it: use the arrows, or double-click the tempo and type one. The key arrows move the whole song up or down a semitone at a time.` },
    { title: t`How you play`, side: 'top', targets: ['practice-mode'],
      teaser: t`Play along, Wait for me, Performance.`,
      text: t`Play along: the song goes on and you play with it. Wait for me: the song waits until you play the right notes, so you learn at your own pace. Performance: three levels, for when you know it. Speed up starts slow and gets faster each time you play it cleanly.` },
    { title: t`Hands`, side: 'top', targets: ['practice-hands'],
      teaser: t`One hand at a time, or both.`,
      text: t`Practise one hand at a time: Orfeo plays the other hand for you, its notes faded on the piano roll. Or play both together.` },
    { title: t`My part and Wait`, side: 'top', targets: ['practice-mine', 'practice-wait'],
      teaser: t`Hear your part as a guide; let the song wait.`,
      text: t`My part: hear your own part quietly as a guide, or not at all. Wait: in Play along, the song stops at your next notes until you've played them.` },
    { title: t`To play, you play`, side: 'top', targets: ['practice-chords'],
      teaser: t`The chord coming up, and the one you hold.`,
      text: t`To play: the chord your next notes make. You play: the chord in the keys you're holding. Handy when you think in chords.` },
    { title: t`Your keys`, side: 'top', targets: ['keyboard'],
      teaser: t`Your next notes light up.`,
      text: t`The keys you play next light up a moment before they're due, in your hand's colour, with finger numbers where there are some. A keyboard with lights shows the same keys.` },
    { title: t`View`, side: 'top', targets: ['practice-view'],
      teaser: t`Piano roll, score, or both.`,
      text: t`The falling notes of the piano roll, the score, or both at once (Split). Suggested fingering is here too.` },
    { title: t`Practice log`, side: 'bottom', targets: ['practice-log'],
      teaser: t`How it went, and your progress.`,
      text: t`When you stop: a few words on how it went, the bars worth another go (one click loops them), a note-by-note review, and your progress over days and weeks.` },
    { title: t`Fix hands`, side: 'bottom', targets: ['practice-fix'],
      teaser: t`A note in the wrong hand? Fix it.`,
      text: t`A note in the wrong hand? Fix hands opens the Note Editor at the bars you're playing, and Back to practice brings you straight back here.` },
    { title: t`Exit`, side: 'bottom', targets: ['practice-exit'],
      teaser: t`Back to the song as it was.`,
      text: t`Leave practice mode: your tracks, tempo and key are back as they were. Settings › Appearance › Onboarding tours shows this tour again.` },
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
