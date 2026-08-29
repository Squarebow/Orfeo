# Orfeo — How to Use

*The complete guide to turning a MIDI file into a piano lesson you built
yourself.*

Every MIDI file is a piano lesson — you just need the right tool to open it that
way. Orfeo loads a file, drops its notes onto the keyboard, shows you the
harmony, and lets you reshape it into the exact practice material you need. No
account, no subscription, no telemetry.

The path from a raw file to a finished lesson runs through four stages, and this
guide follows them:

| Stage | What you do | Saved to disk? |
|---|---|---|
| **[Play](#play)** | Load a file, listen, explore | No — session only |
| **[Edit](#edit)** | Commit the changes you want into the file | Yes — a new `_ORFEO_v1` copy |
| **[Practice](#practice)** | Drill the finished file with the learning tools | No |
| **[Manage files](#manage-files)** + **[Extras](#extras)** | Keep the collection tidy; fit Orfeo to how you read music | Preferences only |

---

## About the image placeholders

This guide is written with image slots marked like this:

> **Image ·** `how-to-use/play-piano-roll.png` · **1600×1000** · _Short description of what the shot should show._

Replace each one with a real screenshot or GIF. Guidance:

| Type | Size | Notes |
|---|---|---|
| Full-window screenshot | **1600 × 1000 px** PNG | Matches Orfeo's 16:10 window; export at 2× (3200 × 2000) for retina if you like |
| Cropped panel / detail | **800–1000 px** wide PNG | Height to fit the content |
| Animated GIF | **≤ 1200 px** wide | One action start-to-finish, ≤ 15 s, ≤ 8 MB |

**Filenames:** `how-to-use/<stage>-<subject>.<ext>`, all lowercase, hyphenated —
for example `how-to-use/edit-split-hands.gif`.
**Folder:** put them in `docs/images/how-to-use/`, or point the links at
`https://orfeo.cc/...` if you host them on the site instead.

---

## Contents

- [Quick start](#quick-start)
- [Play](#play)
  - [Load a file](#load-a-file)
  - [The falling-note piano roll](#the-falling-note-piano-roll)
  - [The virtual keyboard](#the-virtual-keyboard)
  - [Transport and tempo](#transport-and-tempo)
  - [Change key](#change-key)
  - [Loop a passage](#loop-a-passage)
  - [Tracks panel](#tracks-panel)
  - [Focus Mode](#focus-mode)
  - [Console Mixer](#console-mixer)
  - [Master volume and audio engines](#master-volume-and-audio-engines)
- [Edit](#edit)
  - [How saving works](#how-saving-works)
  - [MIDI Playback Editor](#midi-playback-editor)
  - [MIDI Note Editor](#midi-note-editor)
- [Practice](#practice)
  - [Live chord display](#live-chord-display)
  - [Chord Prompter](#chord-prompter)
  - [Metronome](#metronome)
  - [Chords Explorer](#chords-explorer)
  - [Scales Explorer and the Circle of Fifths](#scales-explorer-and-the-circle-of-fifths)
  - [Lock-A-Chord](#lock-a-chord)
  - [Chord Transcription to PDF](#chord-transcription-to-pdf)
  - [Play along with a hardware keyboard](#play-along-with-a-hardware-keyboard)
- [Manage files](#manage-files)
- [Extras](#extras)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Coming next](#coming-next)

---

## Quick start

> **Image ·** `how-to-use/quick-start.png` · **1600×1000** · _The full Orfeo window mid-playback: falling notes, lit keyboard, chord bar, tracks panel open._

1. **Open a file** — click the folder icon (top-left), press `Ctrl+O`, or drag a
   `.mid` file onto the window.
2. **Press `Space`** — notes fall onto the keyboard in time with the music.
3. **Slow it down** — click the BPM `▼` arrow (top bar) while you learn a
   passage; click the **%** readout to snap back to the original tempo.

That is the whole loop. Everything below is depth on each part.

> [!TIP]
> First time in? Load one of the **bundled demo songs** (three classical
> pieces) from the library to try every feature without hunting for a file.

---

## Play

*Session-only and non-destructive by default — nothing here is written to the
file unless you explicitly save it (only the [Console Mixer](#console-mixer)
offers that, on close). Load something and press Play.*

### Load a file

| Method | How |
|---|---|
| File dialog | Folder icon (top-left) or `Ctrl+O` |
| Drag and drop | Drop a file anywhere on the window |
| Library | Click any row in the [library panel](#your-midi-library) |

Orfeo opens `.mid` / `.midi` directly and **converts other score formats on
import** — MusicXML (`.musicxml`, `.xml`, `.mxl`), Guitar Pro (`.gp`, `.gp3`–
`.gp5`, `.gpx`), Capella (`.cap`), and karaoke `.kar`. Full list under
[Supported formats](#supported-formats).

> [!TIP]
> Finale, Sibelius, and MuseScore don't export MIDI cleanly, but they all
> export **MusicXML** — export that and open it in Orfeo like any other file.

### The falling-note piano roll

> **Image ·** `how-to-use/play-piano-roll.png` · **1600×1000** · _Notes falling toward the keyboard, two or three tracks in distinct colours, one key lit, a chord name in the bar above._

Notes fall downward onto the keyboard in real time. Each track has its own
colour; every note is pixel-aligned to the exact key it lands on. Keys light up
as they play and the **chord name above the keyboard updates live** (see
[Live chord display](#live-chord-display)).

| Gesture | Action |
|---|---|
| Mouse wheel over the roll | Scrub the playhead, ±2 s per notch |
| `Shift` + wheel | Fine scrub, ±0.15 s per notch |

Optional [bar numbers and grid lines](#bar-numbers-and-grid-lines) help when a
teacher says "from bar 32."

### The virtual keyboard

> **Image ·** `how-to-use/play-keyboard-sizes.png` · **1000×520** · _The keyboard size control showing 61 / 73 / 88, and the Docked / Floating toggle._

| Control | Where | Notes |
|---|---|---|
| **61 / 73 / 88 keys** | Keyboard control strip | Switches live — the roll recomputes note positions instantly, no reload |
| **Docked / Floating** | Keyboard control strip | Floating detaches the keyboard into a draggable, resizable panel for ultrawide or multi-window setups |
| **Click a key** | On the keyboard | Hear that note in the active [audio engine](#master-volume-and-audio-engines) |
| **Click + drag across keys** | On the keyboard | Glissando |

### Transport and tempo

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause |
| `Escape` | Stop and return to the start |
| Long-press BPM `▲` / `▼` | Glide quickly toward a target tempo |
| Click the **%** readout | Snap back to the file's original tempo |

Tempo change is **pitch-independent** — no chipmunk effect when you slow down or
speed up. It combines freely with [looping](#loop-a-passage) and
[key changes](#change-key); none of them reset the others.

> **Use case — learn a fast run.** Loop the bar, drop to 60%, play it until it's
> clean, then step the tempo back up 5% at a time with the BPM arrows.

### Change key

Transpose the whole piece up or down by semitones — to a key that suits your
hands or your voice. The transpose is session-only here, but you can **fold it
into the file** from the [Playback Editor](#midi-playback-editor) with *Save
Tempo & Key changes* turned on.

### Loop a passage

> **Image ·** `how-to-use/play-loop-region.gif` · **1200×600** · _Alt+dragging across the waterfall to mark a loop region; it snaps to bar lines and repeats._

| Gesture | Action |
|---|---|
| `Alt` + drag on the roll or the strip above it | Precise-timing loop selection |
| Drag on the loop strip | Select a whole-bar range |
| Double-click the strip or roll | Clear the loop |

The region snaps to bar boundaries and keeps working while you change
[tempo](#transport-and-tempo) or [key](#change-key).

### Tracks panel

> **Image ·** `how-to-use/play-tracks-panel.png` · **900×1000** · _The tracks panel: several tracks with M / S / visibility / light toggles, one track's colour picker open, a collapsed group._

Open it from the arrow at the top-right. For every track in the file:

| Control | Effect |
|---|---|
| **M** | Mute |
| **S** | Solo — hear only this track |
| **Show on piano roll** | Hide/show its falling notes |
| **Light on keyboard** | Whether its notes light the keys |
| **Colour swatch** | Recolour the track |
| Drag a row | Reorder tracks and groups — the Piano track stays pinned |
| Group header | Collapse or reorder a whole instrument group |

> [!TIP]
> Turn on [**Track color VU meters**](#extras) (Settings → Practice) and each
> track's colour strip doubles as a mini level meter during playback — you can
> see who's sounding without opening the [mixer](#console-mixer).

### Focus Mode

One toggle mutes everything except **keys, bass, and drums** — the parts you
practise against — and hides the rest from the roll. It's in both the Tracks
panel and the [Console Mixer](#console-mixer), and you can still override any
individual track by hand afterwards.

> **Use case — practise the piano part of a full band arrangement.** Hit Focus
> Mode, then unmute just the drums for timing. The horns and pads stay out of
> your way.

### Console Mixer

> **Image ·** `how-to-use/play-mixer.png` · **1600×900** · _The Console Mixer: channel strips with VU meters, pan/chorus/reverb knobs, and the master strip with Tone and Compressor._

Toggle with `Ctrl+Shift+M`. A full mixing desk:

| Per channel strip | Master strip |
|---|---|
| Volume, pan, chorus, reverb | Master volume, **Tone** (tilts the EQ darker/brighter), **Compressor** (tames the loudest peaks) |
| Live VU meter | |
| Drag to reorder · wheel to scroll the row | `Escape` closes the mixer |

| Fader / knob shortcut | Action |
|---|---|
| Arrow keys | Adjust the value |
| `Shift` + Arrow | Coarse step (×5) |
| `Home` / `End` | Minimum / maximum |

**Per-channel volume, pan, chorus, and reverb are saved into the file.** When you
close the mixer after changing any of them, Orfeo asks **Save & Reload / Discard /
Cancel** — Save & Reload writes a new [`_ORFEO_vN` version](#how-saving-works)
(with a history entry) and reloads it in place, exactly like the
[Playback Editor](#midi-playback-editor). The **master strip** (master volume,
Tone, Compressor) and mute / solo stay session-only.

> [!IMPORTANT]
> **Tone and Compressor require the Samples engine.**

### Master volume and audio engines

A single physical-feeling knob in the toolbar sets output level for whichever
engine is active, and remembers its position between sessions.

| Engine | Sound | Setup |
|---|---|---|
| **General MIDI** | Light, synthetic | Instant, nothing to download |
| **Samples** | Natural piano, strings, organ, everything | A real SoundFont engine ([SpessaSynth](https://github.com/spessasus/spessasynth_lib)) — [GeneralUser GS](https://www.schristiancollins.com/generaluser.php) by default, ~31 MB, downloaded once and cached forever |

Switch in **Settings → Audio**. Extra soundfont libraries (FluidR3 GM, MuseScore
General) download on demand, and you can import your own `.sf2` / `.sf3`.

> [!TIP]
> Use **General MIDI** while editing (instant, low resource use), then switch to
> **Samples** for actual practice — the expressive sound genuinely helps you
> hear phrasing.

---

## Edit

*Where changes get committed. Your original file is **never touched** — every
save lands as a `_ORFEO_vN` version in an `Orfeo/` folder beside the source.*

### How saving works

| | |
|---|---|
| First edit of a file | `<name>_ORFEO_v1.mid` |
| Next edit | `<name>_ORFEO_v2.mid`, and so on |
| Location | An `Orfeo/` subfolder next to the source file |
| Original | Left exactly as it was |

The two editors below, the [Console Mixer](#console-mixer), and
[tempo / key changes](#change-key) all save this way. The
[library auto-refreshes](#your-midi-library) after every save, expands the
`Orfeo/` folder, and briefly highlights the new version. Every save also writes
an entry to the file's [edit history](#edit-history-travels-with-the-file).

### MIDI Playback Editor

> **Image ·** `how-to-use/edit-playback-editor.png` · **1600×1000** · _The Playback Editor window: track rows with include checkboxes, instrument dropdowns, colour swatches, Merge / Split Hands controls, and the Save & Reload button._

A dedicated window for reshaping a file into clean practice material. Pick what
stays and what goes, then hit **Save & Reload** to write one new version and
reload it in place.

<details>
<summary><b>Every control in the Playback Editor</b></summary>

| Control | What it does |
|---|---|
| **Include / exclude** | Untick a track to drop it from the saved file |
| **Rename** | Give a track a name that reads clearly on the roll forever after |
| **Recolour** | Set the track's colour permanently |
| **Reassign instrument** | Give a track a better General MIDI sound; one click restores the original |
| **Merge** | Combine split melody-and-chords parts into one track |
| **Split Hands** | Orfeo detects when one piano track secretly holds both a bass and a treble part and splits it into separate Left Hand / Right Hand tracks, with an adjustable breakpoint |
| **Show on piano roll / show on keyboard** | These visibility choices are saved *with the file*, not just for the session |
| **Hand assignment** | Automated left/right colouring baked into the file, plus a link to open a piano track in the [Note Editor](#midi-note-editor) for a precise manual split |
| **Save Tempo & Key changes** | Fold the session's BPM and transpose changes into the same Save & Reload |

</details>

> [!TIP]
> **Reassign instrument** is the fastest fix for a badly-sequenced download —
> a "piano" track that's actually on a synth-pad program becomes usable in one
> click, and the change sticks.

> **Use case — turn a messy download into a lesson.** Exclude the click track
> and the unused channels, rename "Track 3" to "Left Hand", recolour the melody,
> reassign the lead to a clean piano, then Save & Reload. You now have a
> `_ORFEO_v1` file that reads clearly every time you open it.

### MIDI Note Editor

> **Image ·** `how-to-use/edit-note-editor.gif` · **1200×750** · _Dragging a note to move it, resizing another by its edge, then the velocity lane below adjusting dynamics._

Edit individual notes directly on the piano roll — move, resize, add, delete,
and adjust velocity — with full undo/redo. Enable it in **Settings → Playback &
Editing**, then open a track from its note-edit icon.

| Tool | Use |
|---|---|
| **Select** | Click to select/move; drag an edge to resize; drag a selected note to move the whole selection |
| **Marquee** | Drag a box to select notes |
| **Lasso** | Freehand-select notes |
| **Pen** | `Alt` + click empty space to add a note; click an existing note to mark it for delete |

<details>
<summary><b>Note Editor keyboard and mouse reference</b></summary>

| Shortcut / gesture | Action |
|---|---|
| `Shift` + click a note | Add / remove from a multi-selection |
| `Shift` + drag (Marquee / Lasso) | Add to the selection |
| Drag in the velocity lane | Edit a note's velocity |
| Drag the lane on a multi-selected note | Shift every selected note's velocity together, keeping their relative shape |
| Right-click → **Flatten Velocity** (2+ selected) | Set every selected note to their current average velocity |
| Right-click a note | Menu: Assign to Left / Right Hand, Flatten Velocity, Deselect, Undo, Redo, Delete |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected note(s) |
| `Escape` | Close the context menu |

</details>

**Extras in the editor:**

- **Reassign hands** — turn on hand colours and use the right-click menu to
  assign notes to left or right hand for a note-perfect split.
- **Note names** — overlay pitch labels on the notes.
- **Snap & Quantize** — *Snap* rounds a moved, resized, or added note's timing
  to the grid; the *Quantize* menu sets that grid (1/4 down to 1/32). With Snap
  off, neither has any effect.

Each save writes the next `_ORFEO_vN` version, same as the Playback Editor.

> [!IMPORTANT]
> Some MIDI files have **more than one piano track**. To use hand assignment or
> edit individual notes, first [**merge**](#midi-playback-editor) the piano
> tracks into one (or exclude the extras).

---

## Practice

*With a clean, well-structured file in hand, these are the tools you drill
with.*

### Live chord display

> **Image ·** `how-to-use/practice-chord-display.png` · **1200×400** · _The chord bar above the keyboard showing a chord name, with the tracking-mode control._

The chord name above the keyboard tracks what's actually playing — from the file
or from a [connected keyboard](#play-along-with-a-hardware-keyboard). Three
tracking modes (Settings → Notation & Chords):

| Mode | How it reads the music |
|---|---|
| **Classic** | Pools every track by note onset — simple, but can flicker under a busy melody |
| **Harmony** | Sustain-aware — the real underlying chord stays correctly named while the melody moves over it |
| **Follow** | Harmony's detection scoped to one instrument or group you choose |

Pause on any chord and **right-click it** to *Show on keyboard* (locks it like
[Lock-A-Chord](#lock-a-chord)) or *Open in Chord Explorer*.

### Chord Prompter

> **Image ·** `how-to-use/practice-chord-prompter.png` · **1400×400** · _The teleprompter row: faded past chords left, large current chord centre, next two chords right._

A teleprompter-style row built into the chord bar: chords you just played fade
out on the left, the current one sits large in the centre, and the next two are
already visible on the right. Turn it on in **Settings → Practice**, then toggle
it from the icon above the keyboard.

> **Use case — sight-reading a lead sheet.** With the Prompter on you're never
> caught off guard by a fast change — you can see the next two chords coming
> while your hands are still on the current one.

### Metronome

Clicks along with the beat while a file plays. It reads the **tempo map embedded
in the MIDI file** and follows every mid-song tempo change, phase-locked to
wherever you start playback — so it stays in time through a rit. or accel. that
a flat click track would drift on.

### Chords Explorer

> **Image ·** `how-to-use/practice-chords-explorer.png` · **1600×1000** · _The Chord Explorer: chord tiles across Common / Power / Extended tiers, an inversion cycler showing a slash chord, the progression player, and the search box._

Open it from **CHORDS** above the keyboard. Browse and audition any chord in any
key across **Common, Power, and Extended** tiers.

- Click a chord to hear it correctly voiced; **cycle its inversions** (shown as
  proper slash chords like `C/E`).
- **Filter** by hand span or note count.
- **Progressions** — play named progressions (`ii–V–I`, `I–vi–IV–V`, twelve-bar
  blues, and more) with the theoretically correct chord quality on every degree,
  in a choice of voicing styles (Classic, Coltrane, Cinematic, Roadhouse,
  Ipanema, Carnival, Velvet).
- **Fuzzy search** — type a character or two and get instant matches by chord
  name or by the notes it contains.

> **Use case — drill `ii–V–I` in every key.** Pick the progression, set a
> voicing style, then walk it around the [Circle of Fifths](#scales-explorer-and-the-circle-of-fifths)
> one key at a time.

### Scales Explorer and the Circle of Fifths

> **Image ·** `how-to-use/practice-scales-explorer.png` · **1600×1000** · _The interactive Circle of Fifths with a key selected, the scale and its seven diatonic chords with Roman numerals shown below._

Open it from **SCALES** above the keyboard. A fully interactive Circle of
Fifths — click any major key on the outer ring or its relative minor on the
inner ring to see and hear that scale.

- **Ten scale types** — Major, the three minors, Major / Minor Pentatonic,
  Dorian, Phrygian, Lydian, Mixolydian — each showing its seven diatonic chords
  with correct Roman numerals.
- The same named [progressions](#chords-explorer), scoped to the selected key —
  hear `I–V–vi–IV` in G major versus E♭ minor with one click.

### Lock-A-Chord

`Shift` + click any **three or more** keys on the virtual keyboard to build and
lock that chord, then cycle its inversions and play it back. It follows the same
[chord-tracking](#live-chord-display) and [naming](#chord-naming-style) settings
as the rest of the app. `Escape` closes it.

### Chord Transcription to PDF

*(beta)*

Turn on **Chord Transcription** in Settings and every file in the library gets a
transcript icon. Click it to generate a printable chord chart:

- A legend of every chord in the piece, each with a small keyboard diagram.
- A bar-by-bar grid.
- Saved next to the source file in the `Orfeo/` folder.

> [!NOTE]
> Beta: it works end to end, but the layout and detection are still being
> refined.

### Play along with a hardware keyboard

> **Image ·** `how-to-use/practice-play-along.png` · **1400×700** · _The device-connected indicator in the top bar, keys lit from live hardware input, chord name showing what's being played._

Plug in a USB / MIDI keyboard and Orfeo lights the on-screen keys as you play,
with **true sustain** — a note rings exactly as long as you hold it.
Multi-device input is supported.

> **Use case — play the melody yourself.** Hide the file's piano tracks in the
> [Tracks panel](#tracks-panel), keep the rest of the arrangement playing, and
> perform the part over it. Add [Focus Mode](#focus-mode) to strip it down to a
> rhythm section.

---

## Manage files

### Supported formats

| Opens directly | Converted to MIDI on import |
|---|---|
| `.mid`, `.midi` | MusicXML (`.musicxml`, `.xml`, `.mxl`) · Guitar Pro (`.gp`, `.gp3`–`.gp5`, `.gpx`) · Capella (`.cap`) · karaoke `.kar` |

Converted files are cached as `<name>_ORFEO_IMPORTED.mid` next to the source.

### Your MIDI library

> **Image ·** `how-to-use/manage-library.png` · **900×1000** · _The library panel: folder path row, search box, All / starred filter, file rows with star toggles, one folder expanded._

Point Orfeo at a folder and it lists every MIDI file inside, remembering the
location between sessions.

| Action | How |
|---|---|
| **Star a favourite** | Star icon on the row; filter to starred-only from the header |
| **Search** | Fuzzy-search the whole library by name |
| **Refresh** | Rescans for files added or removed outside Orfeo (also auto-refreshes after every save) |
| **Change library folder** | The folder icon, any time |

| Library shortcut | Action |
|---|---|
| `Ctrl` / `Cmd` + click | Toggle a row in a multi-selection |
| `Shift` + click | Select a range from the last-clicked row |
| Drag file(s) | Move them into a folder |

### Originals are never touched

Every edit — [Playback Editor](#midi-playback-editor),
[Note Editor](#midi-note-editor), tempo/key, transcript — saves as a **new
file**, never over the source. Versions are named `<file>_ORFEO_vN.mid` and land
in an `Orfeo/` subfolder beside the original.

### Folders, hiding, and demo content

- Create subfolders and drag files between them right in the library panel.
- **Hide** individual files from the list without deleting them from disk.
- Hide the **bundled demo songs** with one Settings toggle (Settings → MIDI
  Files & Library → *Demo content*) once you have your own library.

### Right-click options

| Right-click a… | Menu |
|---|---|
| File | Show in folder (opens Explorer with the file highlighted), File info, Hide, Undo move, folder organisation |
| Folder | Rename, Move selection here, Delete |

### File info

> **Image ·** `how-to-use/manage-file-info.png` · **900×700** · _The File info panel: tempo, key, artist / song fields, track count, copyright, the artist⇄song swap button, and the version history list._

A per-file panel showing tempo, key, artist / song, track count, and copyright.

- Double-click the **artist** or **song** field to rename it (`Enter` commits,
  `Escape` cancels).
- The **swap button** flips artist and song in one click.
- Saving **renames the file on disk**.
- Step back through earlier saved versions from the history list.

### Edit history travels with the file

Every Orfeo save writes a history entry **directly into the MIDI file's own
meta-events**, not a separate app-only log. The file's full edit history goes
wherever the file goes and survives reinstalls or a switch between the installed
and portable builds. (Technical detail:
[ARCHITECTURE.md → Metadata](ARCHITECTURE.md#metadata-embedded-in-the-midi-file).)

### Click the Orfeo logo to reset

Clicking the logo in the top-left closes the current file and resets tempo,
transpose, and playback to defaults — a clean slate without restarting the app.

### Uninstall keeps your work by choice

Uninstalling asks whether to delete your Orfeo settings and library data. Say no
(the default) and your library folder, preferences, edited files, and cached
soundfonts are left exactly where they are. Full detail:
[INSTALLATION.md → Uninstalling](INSTALLATION.md#uninstalling).

---

## Extras

*Settings that make Orfeo fit how you already read and teach music. Open with
the gear icon (top-right); eight collapsible sections.*

<details>
<summary><b>Notation &amp; Chords</b></summary>

<a id="chord-naming-style"></a>

| Setting | Options |
|---|---|
| **Note naming** | UK/US (`C D E F G A B`) · EU / Central European (`C D E F G A H`, where `B` = B♭) · Solfège (`Do Re Mi Fa…`) · Hidden. Applies everywhere — keyboard, both Explorers, the chord bar, the transcript PDF |
| **Accidentals** | A separate sharps/flats toggle for the enharmonic spelling of black keys, global and instant, independent of the naming system |
| **Chord naming style** | Abbreviations (`Bb(b5)/D`, `Cm7`, `Gaug`) or symbols (`Bb(♭5)/D`, `Cm7`, `G+`, `F°7`), applied everywhere a chord name appears |

</details>

<details>
<summary><b>Keyboard</b></summary>

- **Three sizes** — 61, 73, or 88 keys, switchable live.
- **Docked or floating** — anchored below the roll, or a freely draggable,
  resizable panel.
- **Keyboard labels** — independently toggle octave numbers (`C3`, `C4`, `C5`…),
  note names on the keys, and small **L/R hand badges** for colourblind players
  who can't rely on the blue/pink hand colours alone.

</details>

<details>
<summary><b>Piano Roll</b></summary>

<a id="bar-numbers-and-grid-lines"></a>

- **Bar numbers & grid lines** — turn on bar numbers and horizontal guide lines
  across the roll. Useful when a teacher says "start from bar 32."
- **Visual Effects** — seven optional particle animations play where notes
  strike the keyboard: Glow Bloom, Ripple Ring, Particle Burst, Smoke Plume,
  Colour Aura, Starburst Nova, Comet Trail. With a custom colour override, a
  real bloom filter (intensity / spread / threshold), and a scope toggle for
  keyboard tracks only or every track.

> **Image ·** `how-to-use/extras-visual-effects.gif` · **1000×600** · _A note striking the keyboard and spawning one of the particle effects; the effect picker visible._

</details>

<details>
<summary><b>Playback &amp; Editing / Practice</b></summary>

- **MIDI Note Editor** — enable [here](#midi-note-editor).
- **Focus mode**, **Loop region**, **Left/Right Hand**, **Max Fingers**.
- **Chord Prompter**, **Hand tags**, **Track color VU meters**, **Close panels
  on playback**.
- **Auto-Level on Load** — analyses each file as it loads and, if its dynamics
  dip a lot, automatically engages the master [Compressor's](#console-mixer)
  makeup gain to even out loud and quiet passages.

</details>

<details>
<summary><b>Appearance</b></summary>

- **Presentation Mode** — press `F11` for a distraction-free, full-screen view
  of just the roll and keyboard; `Esc` leaves it. Optionally have the side
  panels close themselves on playback.
- **Theme** — dark today; a warm light theme is in progress.
- **Check for updates** — and the current version number (Windows installer
  builds auto-check on startup; see
  [INSTALLATION.md](INSTALLATION.md#updating)).

</details>

---

## Keyboard shortcuts

The essentials — the full reference with every gesture is in
[SHORTCUTS.md](SHORTCUTS.md).

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause |
| `Escape` | Stop — or close the open Explorer / modal first |
| `F11` | Presentation Mode |
| `Ctrl+O` | Open a file |
| `Ctrl+Shift+M` | Console Mixer |
| Long-press BPM `▲` / `▼` | Glide tempo |
| Mouse wheel on the roll | Scrub (`Shift` = fine) |
| `Alt` + drag on the roll | Loop-region selection |
| `Shift` + click 3+ keys | Lock-A-Chord |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo (Note Editor) |

---

## Coming next

Everything above is shipping today. Next on the list:

| Feature | What it adds |
|---|---|
| **Play-Along Wait Mode** | Orfeo waits for you to hit the right notes before advancing |
| **Arpeggiator** | Rhythmic pattern playback (Alberti bass, syncopation, octave runs) for accompaniment practice |
| **Performance / recording mode** | Record a live hardware MIDI performance and export it as audio (MP3, WAV) |
| **Trim leading silence** | One click to drop dead space so the first note sits at the playbar |
| **Count-in** | 1–4 bars of metronome clicks before playback |
| **Community translations** | All UI strings translatable via standard `.po` files, plus a language switcher |

---

### Related documents

- [README](../README.md) — what Orfeo is, at a glance
- [SHORTCUTS.md](SHORTCUTS.md) — every keyboard and mouse gesture
- [INSTALLATION.md](INSTALLATION.md) — installer vs. portable, updates, data
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is built

---

*Inspired by [Rondo](https://macsim.app/rondo/) (RIP).*
