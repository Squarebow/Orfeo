import { t } from '../../utils/i18n'
import type { SettingsGroupId } from '../../types'

// ── Every setting's words, once. The Settings window shows `description`;
// Setup (the drawer) shows `summary` under each name; search reads name + description +
// keywords. Controls live in defs/*.tsx, keyed by the same ids. ──────────

export interface GroupInfo { id: SettingsGroupId; name: string; intro: string; manualUrl: string }

export type SettingId =
  | 'soundEngine' | 'soundFonts' | 'autoLevel'
  | 'showDemo' | 'chordTranscription'
  | 'noteEditor' | 'tapTempo' | 'tempoWarnings' | 'countIn' | 'handAssignment' | 'loopRegion' | 'focusMode'
  | 'chordPrompter' | 'closePanels' | 'handTags' | 'trackVu'
  | 'displaySystem' | 'accidentals' | 'chordTracking' | 'chordReading' | 'chordNaming'
  | 'keyRange' | 'showOctaves' | 'showNoteNames' | 'reflectPianoRoll' | 'preciseScrubTime'
  | 'rollZoom' | 'barNumbers' | 'playbar' | 'visualEffects'
  | 'theme' | 'appZoom'

export interface SettingInfo {
  id: SettingId
  group: SettingsGroupId
  name: string
  summary: string        // one-line description shown under the name in Setup (the drawer)
  description: string    // Settings window card text (plain; a def may render a richer version)
  keywords?: string      // extra search words
}

export const GROUPS: GroupInfo[] = [
  { id: 'audio', name: t`Audio`, intro: t`How Orfeo sounds: the sound engine, extra sound sets, and automatic loudness balancing.`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files' },
  { id: 'midi-files-library', name: t`MIDI Files & Library`, intro: t`What the Library shows and what Orfeo can create from your files.`, manualUrl: 'https://orfeo.cc/docs/managing-midi-files' },
  { id: 'playback-editing', name: t`Playback & Editing`, intro: t`Tools for playing and correcting songs: note editing, tempo fixes, count-in, hands, looping and focus.`, manualUrl: 'https://orfeo.cc/docs/editing-midi-files' },
  { id: 'practice', name: t`Practice`, intro: t`Helpers while you practise: the chord prompter, a clear screen during playback, and hand and level indicators.`, manualUrl: 'https://orfeo.cc/docs/practicing-with-midi-files' },
  { id: 'notation', name: t`Notation & Chords`, intro: t`How notes and chords are named, and which instruments the chord display listens to.`, manualUrl: 'https://orfeo.cc/docs/practicing-with-midi-files/how-orfeo-reads-chords' },
  { id: 'keyboard', name: t`Keyboard`, intro: t`The on-screen keyboard: its size and what's printed on the keys.`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files/the-virtual-keyboard' },
  { id: 'piano-roll', name: t`Piano Roll`, intro: t`The falling-notes view: zoom, bar lines, the playbar and visual effects.`, manualUrl: 'https://orfeo.cc/docs/playing-midi-files/the-piano-roll' },
  { id: 'appearance', name: t`Appearance`, intro: t`How Orfeo looks: theme and the size of everything on screen.`, manualUrl: 'https://orfeo.cc/docs/settings/appearance-settings' },
]

export const SETTINGS: SettingInfo[] = [
  // ── Audio
  { id: 'soundEngine', group: 'audio', name: t`Sound engine`, summary: t`General MIDI is light and built in; Samples sounds like real instruments.`,
    description: t`General MIDI uses the simple built-in synth — light and always ready. Samples plays real recorded instruments from a sound set (recommended).`,
    keywords: 'gm general midi samples synth latency output delay' },
  { id: 'soundFonts', group: 'audio', name: t`Sound Fonts`, summary: t`Extra sound sets for the Samples engine.`,
    description: t`Extra sound sets for the Samples engine. GeneralUser GS comes with Orfeo; others download on demand, or import your own .sf2/.sf3.`,
    keywords: 'soundfont sf2 sf3 download import fluid musescore generaluser' },
  { id: 'autoLevel', group: 'audio', name: t`Auto-Level on Load`, summary: t`Balances loud and quiet passages automatically.`,
    description: t`Automatically balances loud and quiet passages in a MIDI file using the Compressor's makeup gain.`,
    keywords: 'compressor volume loudness level' },
  // ── MIDI Files & Library
  { id: 'showDemo', group: 'midi-files-library', name: t`Show demo content`, summary: t`Show the demo songs that come with Orfeo in your Library.`,
    description: t`The demo songs that come with Orfeo appear in your Library. Turn off to hide them — nothing is deleted.`,
    keywords: 'demo songs library hide' },
  { id: 'chordTranscription', group: 'midi-files-library', name: t`Chord Transcription`, summary: t`Make a chord chart PDF from any file in your Library.`,
    description: t`Adds a transcript icon to every file in your Library — click it to create a chord chart PDF in the ORFEO folder.`,
    keywords: 'pdf chart transcript export' },
  // ── Playback & Editing
  { id: 'noteEditor', group: 'playback-editing', name: t`MIDI Note Editor`, summary: t`Edit notes directly on the piano roll.`,
    description: t`Shows the note-editing icon in the Tracks panel, to edit notes directly on the piano roll.`,
    keywords: 'edit notes editor' },
  { id: 'tapTempo', group: 'playback-editing', name: t`Tap Tempo`, summary: t`A TAP pad for fixing songs whose bar lines don't match the music.`,
    description: t`Adds a red TAP pad next to the tempo, for fixing songs whose bar lines and metronome don't match the music.`,
    keywords: 'tap tempo bpm metronome beat' },
  { id: 'tempoWarnings', group: 'playback-editing', name: t`Tempo warnings`, summary: t`Mark songs whose bar lines miss the music's beat.`,
    description: t`Marks songs whose bar lines and metronome don't match the music's steady beat — the ones Tap Tempo can fix. Shown next to Key in the top bar and in the Library.`,
    keywords: 'tempo warning dot bpm' },
  { id: 'countIn', group: 'playback-editing', name: t`Count-in`, summary: t`Clicks 1–4 bars before the music starts.`,
    description: t`Clicks 1–4 bars at the song's tempo before Play, skipping empty bars at the start, so you come in on time. Also in the metronome's right-click menu.`,
    keywords: 'count in metronome click bars' },
  { id: 'handAssignment', group: 'playback-editing', name: t`Hand Assignment`, summary: t`Colours each piano note by the hand that plays it.`,
    description: t`Automatic hand assignment for piano that colours each note by the hand that plays it — a guideline, not a verified transcript. For an exact split, use the MIDI Note Editor's hand tool to assign notes to the left and right hand yourself.`,
    keywords: 'left right hand fingers split' },
  { id: 'loopRegion', group: 'playback-editing', name: t`Loop region`, summary: t`A strip for picking a section to loop.`,
    description: t`Shows a strip to select and loop a section. Alt+click and drag to select, then click the loop icon.`,
    keywords: 'loop repeat section' },
  { id: 'focusMode', group: 'playback-editing', name: t`Focus mode`, summary: t`Hear and see only Keys, Bass & Drums with one click.`,
    description: t`Adds a Focus on/off switch to the Tracks panel and the Mixer Console, to hear and see all tracks or only Keys, Bass & Drums.`,
    keywords: 'focus mute tracks keys bass drums' },
  // ── Practice
  { id: 'chordPrompter', group: 'practice', name: t`Chord Prompter`, summary: t`Past, current and upcoming chords during playback.`,
    description: t`Shows past, current and upcoming chords during playback. Click the prompter icon above the keyboard to show it.`,
    keywords: 'chords prompter upcoming' },
  { id: 'closePanels', group: 'practice', name: t`Close panels on playback`, summary: t`Hide side panels while playing.`,
    description: t`Automatically hides the side panels during playback to give the piano roll more room. For a full-screen view, use presentation mode.`,
    keywords: 'drawer collapse panels presentation fullscreen' },
  { id: 'handTags', group: 'practice', name: t`Hand tags`, summary: t`Small L/R letters on hand-coloured keys.`,
    description: t`Prints a small L/R badge on hand-coloured keys, for colourblind players who can't rely on blue vs. pink alone.`,
    keywords: 'left right colorblind colourblind letters' },
  { id: 'trackVu', group: 'practice', name: t`Track color VU meters`, summary: t`Track colour lines pulse with each track's level.`,
    description: t`Each track's colour line in the Tracks panel pulses with its playback level, without opening the Mixer Console.`,
    keywords: 'vu meter level mixer' },
  // ── Notation & Chords
  { id: 'displaySystem', group: 'notation', name: t`Display system`, summary: t`How note names are written everywhere in Orfeo.`,
    description: t`Your preferred note-naming system for notation and labels: UK/US (C D E F G A B), EU (C D E F G A H), Solfège (Do Re Mi…), or hide note names.`,
    keywords: 'note names english german solfege do re mi' },
  { id: 'accidentals', group: 'notation', name: t`Accidentals`, summary: t`Spell the black keys as sharps or flats.`,
    description: t`Your preferred spelling for the black keys: sharps (A# D# G#…) or flats (Bb Eb Ab…).`,
    keywords: 'sharps flats enharmonic black keys' },
  { id: 'chordTracking', group: 'notation', name: t`Chord tracking`, summary: t`Which instruments the chord display listens to.`,
    description: t`What the live chord display and the Lock-A-Chord window follow during playback: Auto (the chord instruments), Harmony (everything but drums) or Follow (one instrument or group you choose).`,
    keywords: 'auto harmony follow chord detection' },
  { id: 'chordReading', group: 'notation', name: t`Chord reading`, summary: t`How much detail to show from a brief chord.`,
    description: t`How much detail the chord display is willing to show from a brief chord.`,
    keywords: 'safe progressive chord detail' },
  { id: 'chordNaming', group: 'notation', name: t`Chord naming`, summary: t`Chord names as abbreviations or symbols.`,
    description: t`How chord qualities are written, everywhere a chord name appears: abbreviations (Cm7, Gaug) or symbols (G+, F°7).`,
    keywords: 'symbols abbreviations chord names' },
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
  { id: 'reflectPianoRoll', group: 'keyboard', name: t`Reflect piano roll on keyboard`, summary: t`Light the sounding notes while paused or scrubbing.`,
    description: t`While paused or scrubbing, the keyboard keeps lighting whatever notes are sounding at the playhead.`,
    keywords: 'scrub paused light keys' },
  { id: 'preciseScrubTime', group: 'keyboard', name: t`Show precise scrub time`, summary: t`Show the position to the millisecond.`,
    description: t`Shows the position readout down to the millisecond, at all times — useful for matching an exact spot in the song.`,
    keywords: 'time position milliseconds scrub' },
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
  { id: 'appZoom', group: 'appearance', name: t`App Zoom`, summary: t`Make everything in Orfeo bigger or smaller.`,
    description: t`Makes everything in Orfeo bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser. Click reset to go back to 100%.`,
    keywords: 'zoom scale size bigger smaller ctrl' },
]

export const SETTING_BY_ID = Object.fromEntries(SETTINGS.map(s => [s.id, s])) as Record<SettingId, SettingInfo>

// ── Quick Settings: the drawing's shortlist, in its order. A { heading }
// entry is a small sub-heading row (the Keyboard group's "Labels"). ─────
export type QuickItem = SettingId | { heading: string }
export const QUICK_LAYOUT: Record<SettingsGroupId, QuickItem[]> = {
  'audio': ['soundEngine'],
  'midi-files-library': ['showDemo'],
  'playback-editing': ['focusMode', 'tapTempo', 'handAssignment'],
  'practice': ['chordPrompter'],
  'notation': ['displaySystem', 'accidentals', 'chordTracking'],
  'keyboard': ['keyRange', 'showOctaves', 'showNoteNames'],
  'piano-roll': ['rollZoom', 'barNumbers', 'playbar'],
  'appearance': ['appZoom'],
}
