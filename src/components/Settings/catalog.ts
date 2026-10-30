import { t } from '../../utils/i18n'
import type { SettingsGroupId } from '../../types'

// ── Every setting's words, once. The Settings window shows `description`;
// Setup (the drawer) shows `summary` under each name; search reads name + description +
// keywords. Controls live in defs/*.tsx, keyed by the same ids. A summary or
// description may mark **bold** words (SettingCard.tsx richText). ─────────

// `tabs`: a big group can split its cards into tabs in the Settings window
// (two cards across instead of three, so each has room). Search ignores tabs.
export interface GroupTab {
  name: string
  ids: SettingId[]
  columns?: 2 | 3           // cards across (default 2); 3 = one row of equal-height cards
  wide?: SettingId[]        // full-width cards under the others
  stack?: SettingId[][]     // explicit columns, top to bottom; every column ends at the same line
  aside?: string            // id of a small live readout at the right of the tab row (defs/midi.tsx TAB_ASIDES)
}
// `stack`: explicit columns for an untabbed group (top to bottom); every column ends at the same line
// `looseFirst`: with `stack`, the first column grows on its own when its card opens up
export interface GroupInfo { id: SettingsGroupId; name: string; intro: string; manualUrl: string; tabs?: GroupTab[]; stack?: SettingId[][]; looseFirst?: boolean }

export type SettingId =
  | 'soundEngine' | 'soundFonts' | 'autoLevel' | 'exportAudio'
  | 'showDemo' | 'chordTranscription'
  | 'noteEditor' | 'tapTempo' | 'tempoWarnings' | 'countIn' | 'skipEmptyBars' | 'handAssignment' | 'loopRegion' | 'focusMode'
  | 'stepThrough' | 'chordPrompter' | 'closePanels' | 'handTags' | 'trackVu'
  | 'displaySystem' | 'accidentals' | 'chordTracking' | 'chordReading' | 'chordNaming'
  | 'keyRange' | 'showOctaves' | 'showNoteNames' | 'reflectPianoRoll' | 'preciseScrubTime' | 'explorerPause'
  | 'rollZoom' | 'barNumbers' | 'playbar' | 'visualEffects'
  | 'theme' | 'handColors' | 'appZoom' | 'tooltips' | 'supportNote' | 'starmap'
  | 'midiKeyboards' | 'midiReconnect' | 'liveResponse' | 'latencyOffset' | 'gmOutput' | 'touchResponse' | 'duplicateFilter'
  | 'pedalsControls' | 'delayCheck' | 'midiTools'

export interface SettingInfo {
  id: SettingId
  group: SettingsGroupId
  name: string
  summary: string        // one-line description shown under the name in Setup (the drawer)
  description: string    // Settings window card text (plain; a def may render a richer version)
  keywords?: string      // extra search words
}

export const GROUPS: GroupInfo[] = [
  { id: 'audio', name: t`Audio`, intro: t`Set your audio preferences`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files' },
  { id: 'midi', name: t`MIDI Keyboard`, intro: t`Manage your keyboards`, manualUrl: 'https://orfeo.cc/docs/settings/midi-keyboard-settings',
    tabs: [
      { name: t`Keyboards`, ids: ['midiKeyboards', 'midiTools', 'midiReconnect'], columns: 3, aside: 'noKeyboards' },
      { name: t`Sound & Latency`, ids: ['delayCheck', 'liveResponse', 'latencyOffset', 'gmOutput'], stack: [['delayCheck'], ['liveResponse'], ['latencyOffset', 'gmOutput']], aside: 'keyToSpeaker' },
      { name: t`Touch & pedals`, ids: ['touchResponse', 'pedalsControls', 'duplicateFilter'] },
    ] },
  { id: 'midi-files-library', name: t`MIDI Files & Library`, intro: t`Organise your library`, manualUrl: 'https://orfeo.cc/docs/managing-midi-files' },
  { id: 'playback-editing', name: t`Playback`, intro: t`Shape playback`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files',
    stack: [['tapTempo'], ['tempoWarnings', 'preciseScrubTime', 'explorerPause'], ['countIn', 'skipEmptyBars', 'loopRegion', 'focusMode']] },
  { id: 'practice', name: t`Practice`, intro: t`Tools for practising`, manualUrl: 'https://orfeo.cc/docs/practicing-with-midi-files' },
  { id: 'editing', name: t`Editing`, intro: t`Edit your songs`, manualUrl: 'https://orfeo.cc/docs/editing-midi-files',
    stack: [['handAssignment'], ['noteEditor'], ['trackVu']], looseFirst: true },
  { id: 'notation', name: t`Chords & Notation`, intro: t`Read chords and notes`, manualUrl: 'https://orfeo.cc/docs/practicing-with-midi-files/how-orfeo-reads-chords' },
  { id: 'keyboard', name: t`Virtual Keyboard`, intro: t`Set up the keyboard`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files/the-virtual-keyboard' },
  { id: 'piano-roll', name: t`Piano Roll`, intro: t`Tune the falling notes`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files/the-piano-roll',
    stack: [['visualEffects'], ['rollZoom'], ['barNumbers', 'playbar']], looseFirst: true },
  { id: 'appearance', name: t`Appearance`, intro: t`Change the look`, manualUrl: 'https://orfeo.cc/docs/settings/appearance-settings' },
]

export const SETTINGS: SettingInfo[] = [
  // ── Audio
  { id: 'soundEngine', group: 'audio', name: t`Sound engine`, summary: t`GM is light and built in; Studio and Native sound like real instruments.`,
    description: t`GM uses the simple built-in synth. Studio plays real recorded instruments from a sound set. Native plays the same sound sets straight to your sound card, for the shortest delay when you play.`,
    keywords: 'gm general midi studio samples native synth latency output delay exclusive shared low latency mode engine sound card' },
  { id: 'soundFonts', group: 'audio', name: t`Sound Fonts`, summary: t`Extra sound sets for the Studio and Native engines.`,
    description: t`Extra sound sets for the Studio and Native engines. GeneralUser GS comes with Orfeo; others download on demand, or import your own .sf2/.sf3.`,
    keywords: 'soundfont sf2 sf3 download import fluid musescore generaluser' },
  { id: 'autoLevel', group: 'audio', name: t`Auto-Level on Load`, summary: t`Balances loud and quiet passages automatically.`,
    description: t`Automatically balances loud and quiet passages in a MIDI file using the Compressor's makeup gain.`,
    keywords: 'compressor volume loudness level' },
  { id: 'exportAudio', group: 'audio', name: t`Export to audio`, summary: t`Save any song as an MP3 or WAV from the Library.`,
    description: t`Adds Export to audio… to a song's right-click menu in the Library. Choose the version (the song as written, Focus, or as you hear it now), the sound and the format. Files go to the Exports folder inside your Library's Orfeo folder.`,
    keywords: 'export audio mp3 wav save render bounce file listen' },
  // ── MIDI Files & Library
  { id: 'showDemo', group: 'midi-files-library', name: t`Show demo content`, summary: t`Show the demo songs that come with Orfeo in your Library.`,
    description: t`The demo songs that come with Orfeo appear in your Library. Turn off to hide them — nothing is deleted.`,
    keywords: 'demo songs library hide' },
  { id: 'chordTranscription', group: 'midi-files-library', name: t`Chord Transcription`, summary: t`Make a chord chart PDF from any file in your Library.`,
    description: t`Adds a transcript icon to every file in your Library — click it to create a chord chart PDF in the ORFEO folder. Charts number the bars as the file has them, so switching this on switches off Skip empty bars at the start.`,
    keywords: 'pdf chart transcript export' },
  // ── Playback & Editing
  { id: 'tapTempo', group: 'playback-editing', name: t`Tap Tempo`, summary: t`A TAP pad for fixing songs whose bar lines don't match the music.`,
    description: t`Adds a red TAP pad next to the tempo, for fixing songs whose bar lines and metronome don't match the music.`,
    keywords: 'tap tempo bpm metronome beat' },
  { id: 'tempoWarnings', group: 'playback-editing', name: t`Tempo warnings`, summary: t`Mark songs whose bar lines miss the music's beat.`,
    description: t`Marks songs whose bar lines and metronome don't match the music's steady beat — the ones Tap Tempo can fix. Shown next to Key in the top bar and in the Library.`,
    keywords: 'tempo warning dot bpm' },
  { id: 'countIn', group: 'playback-editing', name: t`Count-in`, summary: t`Clicks 1–4 bars before the music starts.`,
    description: t`Clicks 1–4 bars at the song's tempo before Play, skipping empty bars at the start, so you come in on time. Also in the metronome's right-click menu.`,
    keywords: 'count in metronome click bars' },
  { id: 'skipEmptyBars', group: 'playback-editing', name: t`Skip empty bars at the start`, summary: t`Start every song where the music starts.`,
    description: t`Songs that begin with silent bars open with the music on bar 1: the piano roll, bar numbers, playback, loops and step-through all start there. Your files are never changed — switch it off to see a song exactly as written. Keep drum count-ins keeps one or two bars of plain drum clicks before the music. Switching this on switches off Chord Transcription, whose charts number the bars as the file has them.`,
    keywords: 'empty bars silence lead-in intro start trim count-in skip' },
  { id: 'handAssignment', group: 'editing', name: t`Hand Assignment`, summary: t`Colours each piano note by the hand that plays it.`,
    description: t`Automatic hand assignment for piano that colours each note by the hand that plays it — a guideline, not a verified transcript. For an exact split, use the MIDI Note Editor's hand tool to assign notes to the left and right hand yourself.`,
    keywords: 'left right hand fingers split' },
  { id: 'noteEditor', group: 'editing', name: t`MIDI Note Editor`, summary: t`Edit notes directly on the piano roll.`,
    description: t`Shows the note-editing icon in the Tracks panel, to edit notes directly on the piano roll.`,
    keywords: 'edit notes editor' },
  { id: 'loopRegion', group: 'playback-editing', name: t`Loop region`, summary: t`A strip for picking a section to loop.`,
    description: t`Shows a strip to select and loop a section. Alt+click and drag to select, then click the loop icon.`,
    keywords: 'loop repeat section' },
  { id: 'focusMode', group: 'playback-editing', name: t`Focus mode`, summary: t`Hear Keys, Bass & Drums and see only the Keys, with one click.`,
    description: t`Adds a Focus on/off switch to the Tracks panel and the Mixer Console. Focus on: you hear the keys (pianos, organs, accordions), bass and drums, and only the keys stay on the piano roll and keyboard. Focus off: every track comes back exactly as it was.`,
    keywords: 'focus mute tracks keys bass drums' },
  // ── Practice
  { id: 'stepThrough', group: 'practice', name: t`Step Through`, summary: t`Step through a song note by note with ← and →.`,
    description: t`Each press of ← or → (or the arrows in the keyboard bar) steps back or forward to the next note or chord, plays it, lights it and moves the playhead there. Shift jumps a whole bar.`,
    keywords: 'step through arrows next previous note chord solo transcribe learn slow' },
  { id: 'chordPrompter', group: 'practice', name: t`Chord Prompter`, summary: t`Past, current and upcoming chords during playback.`,
    description: t`Shows past, current and upcoming chords during playback. Click the prompter icon above the keyboard to show it.`,
    keywords: 'chords prompter upcoming' },
  { id: 'closePanels', group: 'practice', name: t`Close panels on playback`, summary: t`Hide side panels while playing.`,
    description: t`Automatically hides the side panels during playback to give the piano roll more room. For a full-screen view, use presentation mode.`,
    keywords: 'drawer collapse panels presentation fullscreen' },
  { id: 'handTags', group: 'practice', name: t`Hand tags`, summary: t`Small L/R letters on hand-coloured keys.`,
    description: t`Prints a small L/R badge on hand-coloured keys, for colourblind players who can't rely on blue vs. pink alone.`,
    keywords: 'left right colorblind colourblind letters' },
  { id: 'trackVu', group: 'editing', name: t`Track color VU meters`, summary: t`Track colour lines pulse with each track's level.`,
    description: t`Each track's colour line in the Tracks panel pulses with its playback level, without opening the Mixer Console.`,
    keywords: 'vu meter level mixer' },
  // ── Notation & Chords
  { id: 'chordTracking', group: 'notation', name: t`Chord tracking`, summary: t`Which instruments the chord display listens to.`,
    description: t`What the live chord display and the Lock-A-Chord window follow during playback: Auto (the chord instruments), Harmony (everything but drums) or Follow (one instrument or group you choose).`,
    keywords: 'auto harmony follow chord detection' },
  { id: 'chordReading', group: 'notation', name: t`Chord reading`, summary: t`How much detail to show from a brief chord.`,
    description: t`How much detail the chord display is willing to show from a brief chord.`,
    keywords: 'safe progressive chord detail' },
  { id: 'chordNaming', group: 'notation', name: t`Chord naming`, summary: t`Chord names as abbreviations or symbols.`,
    description: t`How chord qualities are written, everywhere a chord name appears: abbreviations (Cm7, Gaug) or symbols (G+, F°7).`,
    keywords: 'symbols abbreviations chord names' },
  { id: 'displaySystem', group: 'notation', name: t`Display system`, summary: t`How note names are written everywhere in Orfeo.`,
    description: t`Your preferred note-naming system for notation and labels: UK/US (C D E F G A B), EU (C D E F G A H), Solfège (Do Re Mi…), or hide note names.`,
    keywords: 'note names english german solfege do re mi' },
  { id: 'accidentals', group: 'notation', name: t`Accidentals`, summary: t`Spell the black keys as sharps or flats.`,
    description: t`Your preferred spelling for the black keys: sharps (A# D# G#…) or flats (Bb Eb Ab…).`,
    keywords: 'sharps flats enharmonic black keys' },
  // ── Keyboard
  { id: 'keyRange', group: 'keyboard', name: t`Key range`, summary: t`Number of keys on the on-screen keyboard.`,
    description: t`Number of keys on the on-screen keyboard: 61, 73 or 88.`,
    keywords: 'keys 61 73 88 size' },
  { id: 'showOctaves', group: 'keyboard', name: t`Show octaves`, summary: t`Octave numbers (C3, C4…) on the keyboard.`,
    description: t`Display octave numbers (e.g. C3, C4, C5) on the on-screen keyboard.`,
    keywords: 'octave numbers labels' },
  { id: 'showNoteNames', group: 'keyboard', name: t`Show note names`, summary: t`Note names on the keyboard keys.`,
    description: t`Display note names on the on-screen keyboard for easier identification.`,
    keywords: 'note names labels keys' },
  { id: 'reflectPianoRoll', group: 'practice', name: t`Reflect on keyboard`, summary: t`Light the sounding notes while paused or scrubbing.`,
    description: t`While paused or scrubbing, the keyboard keeps lighting whatever notes are sounding at the playhead.`,
    keywords: 'scrub paused light keys' },
  { id: 'preciseScrubTime', group: 'playback-editing', name: t`Show precise scrub time`, summary: t`Show the position to the millisecond.`,
    description: t`Shows the position readout down to the millisecond, at all times — useful for matching an exact spot in the song.`,
    keywords: 'time position milliseconds scrub' },
  { id: 'explorerPause', group: 'playback-editing', name: t`Explorers pause playback`, summary: t`Opening the Chords or Scales Explorer pauses the song.`,
    description: t`Opening the Chords Explorer or the Scales Explorer pauses the song, so it doesn't play over the chords you try. Turn it off to keep the song playing while you explore.`,
    keywords: 'pause playback explorer chords scales stop song' },
  // ── Piano Roll
  { id: 'rollZoom', group: 'piano-roll', name: t`Zoom`, summary: t`How much of the song the piano roll shows at once.`,
    description: t`How many seconds of music the piano roll shows at once — higher zoom makes the notes bigger.`,
    keywords: 'piano roll zoom seconds' },
  { id: 'barNumbers', group: 'piano-roll', name: t`Bar numbers & grid lines`, summary: t`Bar numbers and lines in the piano roll.`,
    description: t`Shows bar numbers and horizontal bar lines in the piano roll.`,
    keywords: 'bars grid lines measure numbers' },
  { id: 'playbar', group: 'piano-roll', name: t`Show Playbar`, summary: t`The line where notes meet the keyboard.`,
    description: t`When off, notes fall toward the keyboard's actual on-screen position instead of a fixed line.`,
    keywords: 'playbar hit line' },
  { id: 'visualEffects', group: 'piano-roll', name: t`Visual Effects`, summary: t`Animated flourish when notes hit the playbar.`,
    description: t`An animated flourish when notes hit the playbar during playback. Choose which tracks, the colour, the pattern and the glow.`,
    keywords: 'effects bloom glow particles hit' },
  // ── Appearance
  { id: 'theme', group: 'appearance', name: t`Theme`, summary: t`Dark today; a warm light theme is coming.`,
    description: t`Dark today; a warm light theme is in progress.`,
    keywords: 'dark light colours colors' },
  { id: 'handColors', group: 'appearance', name: t`Hand colours`, summary: t`Pick the colours for your left and right hand.`,
    description: t`The colours that show which hand plays each note, on the piano roll, the keyboard and the split preview. Pick a ready-made pair or your own. Bright, Sky and Mint stay easy to tell apart with colour blindness.`,
    keywords: 'hand colours colors left right palette colour blind colorblind color blindness custom pink blue split' },
  { id: 'appZoom', group: 'appearance', name: t`App Zoom`, summary: t`Make everything in Orfeo bigger or smaller.`,
    description: t`Makes everything in Orfeo bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser. Click reset to go back to 100%.`,
    keywords: 'zoom scale size bigger smaller ctrl' },
  { id: 'tooltips', group: 'appearance', name: t`Tooltips`, summary: t`Hints that pop up when you point at a control.`,
    description: t`The hints that pop up when you point at a button, knob or icon. Turn them off once you know your way around. A knob still shows its value while you turn it.`,
    keywords: 'tooltips hints help hover popup tips' },
  { id: 'supportNote', group: 'appearance', name: t`Enjoying Orfeo?`, summary: t`A small note now and then with ways to support Orfeo.`,
    description: t`Every fifth time you open Orfeo, a small note in the corner offers ways to help it grow, such as a review. Turn it off and it never appears.`,
    keywords: 'support review rate rating reddit community sponsor ko-fi donate note reminder enjoying' },
  { id: 'starmap', group: 'practice', name: t`Starmap`, summary: t`Adds the Starmap view to the Scales Explorer.`,
    description: t`Makes the Starmap available in the Scales Explorer: switch it on in the explorer's Starmap row to swap the Circle of Fifths for a constellation of the 12 notes.`,
    keywords: 'starmap star shape circle scales explorer chord geometry' },
  // ── MIDI Keyboard
  { id: 'midiKeyboards', group: 'midi', name: t`Keyboards`, summary: t`Which connected keyboards Orfeo listens to.`,
    description: t`Every MIDI keyboard connected by USB, with a light that flashes as you play it. Listen to all of them, or only the ones you tick. The top bar shows the one you're playing.`,
    keywords: 'midi keyboard usb device controller connect input port' },
  { id: 'midiReconnect', group: 'midi', name: t`Reconnect automatically`, summary: t`Pick a keyboard up again when it's plugged back in.`,
    description: t`A keyboard you unplug and plug back in is picked up again straight away. When off, it waits until you press Rescan.`,
    keywords: 'reconnect rescan unplug plug usb' },
  { id: 'liveResponse', group: 'midi', name: t`Playing live`, summary: t`How quickly a key you play is heard.`,
    description: t`How quickly the keys you play are heard depends on the sound engine and the sound card.`,
    keywords: 'latency delay lag responsiveness buffer low latency balanced stable crackle exclusive auto usb' },
  { id: 'latencyOffset', group: 'midi', name: t`Audio delay offset`, summary: t`Line the screen up with what you hear.`,
    description: t`Orfeo measures how late your sound output plays and lights keys, counts in and reads taps to match. If it still feels off — Bluetooth headphones, or General MIDI played through an external instrument — shift it here. This moves the picture, not the sound: no setting can make a note arrive sooner.`,
    keywords: 'latency delay offset compensation sync bluetooth calibrate' },
  { id: 'gmOutput', group: 'midi', name: t`General MIDI sound`, summary: t`Play General MIDI through Orfeo or an external instrument.`,
    description: t`General MIDI plays through Orfeo's own synth. Choose a connected instrument here to hear it through a digital piano's or sound module's own sounds instead.`,
    keywords: 'gm general midi output port device sound module digital piano external' },
  { id: 'touchResponse', group: 'midi', name: t`Touch response`, summary: t`How your playing strength turns into loudness.`,
    description: t`Soft makes gentle playing louder, Hard needs a firmer touch for the same loudness, Fixed plays every note at one level. You can also ignore very light touches and cap the loudest.`,
    keywords: 'velocity curve sensitivity touch soft hard fixed minimum maximum dynamics' },
  { id: 'duplicateFilter', group: 'midi', name: t`Double-note filter`, summary: t`Ignore a key that accidentally sounds twice.`,
    description: t`Some keyboards now and then send one key press twice in a row — a worn key contact, for example. Repeats of the same key closer together than this are ignored.`,
    keywords: 'duplicate double trigger repeat filter glitch' },
  { id: 'pedalsControls', group: 'midi', name: t`Pedals & controls`, summary: t`Sustain pedal, wheels and key pressure from your keyboard.`,
    description: t`A keyboard can't tell Orfeo which pedals and controls it has, so each one shows as detected the first time you use it. Switch any of them off to have Orfeo ignore it.`,
    keywords: 'sustain pedal sostenuto soft pitch bend modulation wheel aftertouch pressure expression volume' },
  { id: 'delayCheck', group: 'midi', name: t`Delay check`, summary: t`How long the trip from your key to the speaker takes.`,
    description: t`Play a few notes: Orfeo shows how long each part of the trip from your key to the speaker takes on this computer. Save a log to send along with a bug report.`,
    keywords: 'latency delay diagnostic measure test log export performance report' },
  { id: 'midiTools', group: 'midi', name: t`Reset & repair`, summary: t`Fix hanging notes or a confused keyboard.`,
    description: t`Clear stuck notes lets go of every key and pedal. Reset MIDI input also reconnects every keyboard. Reset settings puts everything on this page back to how it started.`,
    keywords: 'stuck hanging notes reset panic all notes off reconnect defaults' },
]

export const SETTING_BY_ID = Object.fromEntries(SETTINGS.map(s => [s.id, s])) as Record<SettingId, SettingInfo>

// ── Quick Settings: the drawing's shortlist, in its order. A { heading }
// entry is a small sub-heading row (the Keyboard group's "Labels"). ─────
export type QuickItem = SettingId | { heading: string }
export const QUICK_LAYOUT: Record<SettingsGroupId, QuickItem[]> = {
  'audio': ['soundEngine'],
  'midi-files-library': ['showDemo'],
  'playback-editing': ['focusMode', 'tapTempo', 'skipEmptyBars'],
  'practice': ['stepThrough', 'chordPrompter'],
  'editing': ['handAssignment'],
  'notation': ['displaySystem', 'accidentals', 'chordTracking'],
  'keyboard': ['keyRange', 'showOctaves', 'showNoteNames'],
  'piano-roll': ['rollZoom', 'barNumbers', 'playbar'],
  'appearance': ['appZoom', 'tooltips'],
  // Settings window only for now
  'midi': [],
}
