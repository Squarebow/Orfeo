# Orfeo — How to Use

*The complete guide to turning a MIDI file into a piano lesson you built
yourself.*

Every MIDI file is a piano lesson — you just need the right tool to open it that
way. Orfeo loads a file, drops its notes onto the keyboard, shows you the
harmony, and lets you reshape it into the exact practice material you need. No
account, no subscription, no telemetry.

The path from a raw file to a finished lesson runs through four stages, and this
guide follows them:

<table width="100%">
<colgroup><col width="16%"><col width="54%"><col width="30%"></colgroup>
<thead><tr><th>Stage</th><th>What you do</th><th>Saved to disk?</th></tr></thead>
<tbody>
<tr><td><strong><a href="#playing-midi-files">Playing MIDI files</a></strong></td><td>Load a file, listen, explore</td><td>No — session only</td></tr>
<tr><td><strong><a href="#editing-midi-files">Editing MIDI files</a></strong></td><td>Commit the changes you want into the file</td><td>Yes — a new <code>_ORFEO_v1</code> copy</td></tr>
<tr><td><strong><a href="#practicing-with-midi-files">Practicing with MIDI files</a></strong></td><td>Drill the finished file with the learning tools</td><td>No</td></tr>
<tr><td><strong><a href="#managing-midi-files">Managing MIDI files</a></strong></td><td>Keep the collection tidy — organise, star, and search your library</td><td>Preferences only</td></tr>
<tr><td><strong><a href="#settings--extras">Settings &amp; Extras</a></strong></td><td>Fit Orfeo to how you read and teach music</td><td>Preferences only</td></tr>
</tbody>
</table>

---

## About the image placeholders

This guide is written with image slots marked like this:

> **Image ·** `how-to-use/play-piano-roll.png` · **1600×1000** · _Short description of what the shot should show._

Replace each one with a real screenshot or GIF. Guidance:

<table width="100%">
<colgroup><col width="20%"><col width="24%"><col width="56%"></colgroup>
<thead><tr><th>Type</th><th>Size</th><th>Notes</th></tr></thead>
<tbody>
<tr><td>Full-window screenshot</td><td><strong>1600 × 1000 px</strong> PNG</td><td>Matches Orfeo's 16:10 window; export at 2× (3200 × 2000) for retina if you like</td></tr>
<tr><td>Cropped panel / detail</td><td><strong>800–1000 px</strong> wide PNG</td><td>Height to fit the content</td></tr>
<tr><td>Animated GIF</td><td><strong>≤ 1200 px</strong> wide</td><td>One action start-to-finish, ≤ 15 s, ≤ 8 MB</td></tr>
</tbody>
</table>

**Filenames:** `how-to-use/<stage>-<subject>.<ext>`, all lowercase, hyphenated —
for example `how-to-use/edit-split-hands.gif`.
**Folder:** put them in `docs/images/how-to-use/`, or point the links at
`https://orfeo.cc/...` if you host them on the site instead.

---

## Contents

- [System requirements](#system-requirements)
- [Quick start](#quick-start)
- [Playing MIDI files](#playing-midi-files)
  - [Load a file](#load-a-file)
  - [The falling-note piano roll](#the-falling-note-piano-roll)
  - [The virtual keyboard](#the-virtual-keyboard)
  - [Transport and tempo](#transport-and-tempo)
  - [Fix a song's tempo with Tap Tempo](#fix-a-songs-tempo-with-tap-tempo)
  - [Tempo warnings](#tempo-warnings)
  - [Change key](#change-key)
  - [Loop a passage](#loop-a-passage)
  - [Tracks panel](#tracks-panel)
  - [Focus Mode](#focus-mode)
  - [Master volume and audio engines](#master-volume-and-audio-engines)
- [Editing MIDI files](#editing-midi-files)
  - [How saving works](#how-saving-works)
  - [Console Mixer](#console-mixer)
  - [MIDI Playback Editor](#midi-playback-editor)
  - [MIDI Note Editor](#midi-note-editor)
- [Practicing with MIDI files](#practicing-with-midi-files)
  - [Live chord display](#live-chord-display)
  - [How Orfeo reads and voices chords](#how-orfeo-reads-and-voices-chords)
  - [Chord Prompter](#chord-prompter)
  - [Metronome](#metronome)
  - [Chords Explorer](#chords-explorer)
  - [Scales Explorer and the Circle of Fifths](#scales-explorer-and-the-circle-of-fifths)
  - [Lock-A-Chord](#lock-a-chord)
  - [Chord Transcription to PDF](#chord-transcription-to-pdf)
  - [Play along with a hardware keyboard](#play-along-with-a-hardware-keyboard)
- [Managing MIDI files](#managing-midi-files)
- [Settings & Extras](#settings--extras)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Coming next](#coming-next)

---

## System requirements

Windows 10 or 11 (64-bit). A computer from 2015 or newer with a quad-core
processor and 8GB of RAM is recommended for smooth playback, especially with
dense, multi-instrument songs. Any built-in graphics card from the last
decade is fine — just make sure your graphics drivers are up to date, as
outdated drivers can cause visual stutter. Less than 500MB of storage space
is needed.

**No internet connection is needed** to play, practise or edit — both sound
engines work offline. Orfeo only goes online to download the optional extra
sound sets (when you ask for them) and, in the installed version, to check
for updates when it starts.

---

## Quick start

> **Image ·** `how-to-use/quick-start.png` · **1600×1000** · _The full Orfeo window mid-playback: falling notes, lit keyboard, chord bar, tracks panel open._

1. **Open a file** — click the folder icon (top-left), press `Ctrl+O`, or drag a
   `.mid` file onto the window.
2. **Press `Space`** — notes fall onto the keyboard in time with the music.
3. **Slow it down** — click the BPM `▼` arrow (top bar) while you learn a
   passage; click the **%** readout to snap back to the original tempo.

That is the whole loop. Everything below is depth on each part.

> 💡 **Tip**
>
> *First time in? Load one of the **bundled demo songs** (three classical
> pieces) from the library to try every feature without hunting for a file.*

---

## <img src="how-to-use-icons/playback.svg" alt="" height="26" align="middle"> Playing MIDI files

*Session-only and non-destructive by default — nothing here is written to the
file unless you explicitly save it (the [Console Mixer](#console-mixer),
covered under Editing, is the one exception — it saves on close). Load
something and press Play.*

### Load a file

<table width="100%">
<colgroup><col width="22%"><col width="78%"></colgroup>
<thead><tr><th>Method</th><th>How</th></tr></thead>
<tbody>
<tr><td>File dialog</td><td>Folder icon (top-left) or <code>Ctrl+O</code></td></tr>
<tr><td>Drag and drop</td><td>Drop a file anywhere on the window</td></tr>
<tr><td>Library</td><td>Click any row in the <a href="#your-midi-library">library panel</a></td></tr>
</tbody>
</table>

Orfeo opens `.mid` / `.midi` directly and **converts other score formats on
import** — MusicXML (`.musicxml`, `.xml`, `.mxl`), Guitar Pro (`.gp`, `.gp3`–
`.gp5`, `.gpx`), Capella (`.cap`), and karaoke `.kar`. Full list under
[Supported formats](#supported-formats).

> 💡 **Tip**
>
> *Finale, Sibelius, and MuseScore don't export MIDI cleanly, but they all
> export **MusicXML** — export that and open it in Orfeo like any other file.*

### The falling-note piano roll

> **Image ·** `how-to-use/play-piano-roll.png` · **1600×1000** · _Notes falling toward the keyboard, two or three tracks in distinct colours, one key lit, a chord name in the bar above._

Notes fall downward onto the keyboard in real time. Each track has its own
colour; every note is pixel-aligned to the exact key it lands on. Keys light up
as they play and the **chord name above the keyboard updates live** (see
[Live chord display](#live-chord-display)).

<table width="100%">
<colgroup><col width="32%"><col width="68%"></colgroup>
<thead><tr><th>Gesture</th><th>Action</th></tr></thead>
<tbody>
<tr><td>Mouse wheel over the roll</td><td>Scrub the playhead, ±2 s per notch</td></tr>
<tr><td><code>Shift</code> + wheel</td><td>Fine scrub, ±0.15 s per notch</td></tr>
</tbody>
</table>

Optional [bar numbers and grid lines](#bar-numbers-and-grid-lines) help when a
teacher says "from bar 32."

### The virtual keyboard

> **Image ·** `how-to-use/play-keyboard-sizes.png` · **1000×520** · _The keyboard size control showing 61 / 73 / 88, and the Docked / Floating toggle._

<table width="100%">
<colgroup><col width="22%"><col width="20%"><col width="58%"></colgroup>
<thead><tr><th>Control</th><th>Where</th><th>Notes</th></tr></thead>
<tbody>
<tr><td><strong>61 / 73 / 88 keys</strong></td><td>Keyboard control strip</td><td>Switches live — the roll recomputes note positions instantly, no reload</td></tr>
<tr><td><strong>Docked / Floating</strong></td><td>Keyboard control strip</td><td>Floating detaches the keyboard into a draggable, resizable panel for ultrawide or multi-window setups</td></tr>
<tr><td><strong>Click a key</strong></td><td>On the keyboard</td><td>Hear that note in the active <a href="#master-volume-and-audio-engines">audio engine</a></td></tr>
<tr><td><strong>Click + drag across keys</strong></td><td>On the keyboard</td><td>Glissando</td></tr>
</tbody>
</table>

### Transport and tempo

<table width="100%">
<colgroup><col width="30%"><col width="70%"></colgroup>
<thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Space</code></td><td>Play / Pause</td></tr>
<tr><td><code>Escape</code></td><td>Stop and return to the start</td></tr>
<tr><td>Long-press BPM <code>▲</code> / <code>▼</code></td><td>Glide quickly toward a target tempo</td></tr>
<tr><td>Click the <strong>%</strong> readout</td><td>Snap back to the file's original tempo</td></tr>
</tbody>
</table>

Tempo change is **pitch-independent** — no chipmunk effect when you slow down or
speed up. It combines freely with [looping](#loop-a-passage) and
[key changes](#change-key); none of them reset the others.

> 🎯 **Use case — learn a fast run**
>
> *Loop the bar, drop to 60%, play it until it's clean, then step the tempo
> back up 5% at a time with the BPM arrows.*

### Fix a song's tempo with Tap Tempo

Some MIDI files carry the wrong tempo. The music plays fine, but the bar lines,
the metronome and the BPM readout don't match what you hear: the clicks drift
off the drums, or the tempo reads double or half of what you feel. Tap Tempo
fixes that by letting you tap along.

**Turn it on:** Settings → Playback & Editing → **Tap Tempo**. A red round
**TAP** pad appears next to the BPM box. Right below the switch, choose how you
like to count:

- **Every beat** (default): tap 1, 2, 3, 4 — every beat, like tapping your foot.
- **Only the 1**: tap just the first beat of each bar.

Tap at the speed you'd count the song, not the speed of the hi-hat: tapping
twice per beat gives double the tempo, tapping every other beat gives half.

**Tapping**

1. Put the playhead where the tempo goes wrong: the top of the song, or the
   bar where the groove kicks in if the intro is fine.
2. Click **TAP**. The song plays from exactly where the playhead is. The
   metronome stays silent while you tap, so it can't throw you off. You can
   still scroll to a better spot before you start tapping — the start point
   simply moves to wherever you scroll to.
3. Tap with `Space` or any key on your MIDI keyboard. Start on a 1, whenever
   you've locked in — you don't have to start right away. Tap at least 4
   times; 8 or more gives a steadier result. A missed or doubled tap is
   ignored.
4. Click **TAP** again when you're done. The song pauses and a panel shows the
   tempo Orfeo measured, e.g. **91.0 bpm · 4/4**.

Orfeo then lines your beat up with the song's own notes — mostly the drums
and bass — so the bar lines and clicks land exactly on the music, not on your
slightly early or late taps. The panel says *Lined up with the song's notes*
when it did. In free-time or very sparse passages it keeps your taps as they
are.

**Listening and adjusting**

The panel stays open while you listen, so you can hear the result and adjust
it as it plays:

- **▶ Listen / ❚❚ Pause** (or `Space`) plays and pauses the song.
- **Metronome: on / off** — hear the new clicks while listening, or not.
- **Move the 1 ◀ / ▶** — if the bar lines start on the wrong beat, slide them
  one beat earlier or later. The tempo doesn't change.
- **Clicks ◀ / ▶** — if the metronome sits a hair ahead of or behind the
  music, slide it 10 ms at a time until it locks in.

Then choose **Keep for this song**, **Tap again** or **Cancel**. When your
tempo matches the file's own, there's also **Original is fine**: the file
stays as it is and its tempo warning won't come back.

**Songs counted at double or half speed** (e.g. Golden Brown, which the file
counts at 190 while you hear about 95): if your beat lands exactly on every
second beat of the file — or exactly between its beats — the file's bar lines
are already right and only its tempo number is off. The panel then offers
**Bar lines: Keep the file's** (the default) or **From my taps**. Keeping the
file's leaves its bar lines, time-signature changes and clicks exactly as they
are and only corrects the tempo number. The same happens when your beat
matches the file's own beat exactly, which tells you its tempo is already
right there.

**What "Keep" does**

Orfeo remembers the tempo for that song and uses it every time you open it,
even if you rename or move the file. Your MIDI file is **not** changed and no
new file is saved. From the point where you started, the bar lines, the
metronome, the bar counter, the BPM readout and the chord display follow your
tempo; everything before it stays as the file had it. The music itself sounds
exactly the same.

You can tell a song has a kept tempo by the small amber dot on the **TAP**
pad. Hovering the pad lists them, and each one is also written to
**File Info → Orfeo History**.

**Adjusting later:** right-click the **TAP** pad to see every kept tempo for
the song. Click one to open it again in the panel — listen, move the 1, nudge
the clicks — and Keep. The **✕** next to it removes just that one; *Reset to
the file's own tempo* removes them all.

**A tempo change partway through a song** (e.g. a slow intro, then the
groove): tap the intro from the top and Keep it, then park the playhead where
the groove starts, tap again and Keep. Each kept tempo runs until the next
one starts. Tapping a new tempo that starts inside an earlier one replaces it
from that point on — so tap front to back.

`Esc` cancels a tap session at any point.

#### Tap Tempo — common situations

> 🎯 **The whole song has the wrong tempo**
>
> *The BPM box says 60, but the song clearly moves at about 92, and the
> metronome clicks don't match the drums anywhere. Put the playhead at 0:00,
> click TAP, tap every beat at the speed you feel for a few bars, and click
> TAP. Check the panel says "Lined up with the song's notes", press
> ▶ Listen, and Keep. One kept tempo covers the whole song.*

> 🎯 **The intro is right, the groove isn't**
>
> *The metronome fits the intro but drifts once the band comes in. Put the
> playhead on the first beat of the groove, click TAP, tap along, click TAP,
> listen and Keep. Everything before that point keeps the file's own tempo.*

> 🎯 **A slow intro, then a faster song**
>
> *Two separate tap sessions, front to back: first put the playhead at 0:00,
> tap the intro and Keep; then put it where the faster part starts, tap again
> and Keep. Each tempo runs until the next one starts. Right-click TAP to see
> both listed.*

> 🎯 **The tempo reads double (or half) what you hear**
>
> *Golden Brown shows 190, but you count it at about 95, even though its bar
> lines and clicks are perfect. Put the playhead on a bar line, tap the beat
> you hear, and click TAP. Because your beat lands exactly on every second
> beat of the file, the panel offers "Bar lines: Keep the file's". Keep that:
> the bar lines, the 3/4 ↔ 4/4 switches and the clicks stay exactly as they
> were, and the tempo now reads about 95.*

> 🎯 **The tempo is already right**
>
> *If you tap a song whose file tempo is correct, the panel says "Your beat
> matches the file's own beat exactly". There's nothing to fix — press
> Cancel.*

> 🎯 **The clicks are a hair early or late**
>
> *The tempo is right but the metronome sits slightly ahead of or behind the
> drums. While it plays, use Clicks ◀ / ▶ (10 ms per click) until it locks in,
> then Keep. On a tempo you've already kept: right-click TAP, click it, adjust,
> Keep.*

> 🎯 **The bar lines start on the wrong beat**
>
> *The tempo and clicks are right, but every bar line sits on beat 2 (or 4)
> instead of the 1 — usually because the first tap wasn't on a 1. Use
> Move the 1 ◀ / ▶ to slide the bar lines one beat at a time; the tempo
> doesn't change.*

> 🎯 **Counting the 1 only**
>
> *If counting every beat feels awkward — slow ballads, or songs where you
> naturally feel the bar — switch Settings → Playback & Editing → Tap Tempo
> counting to "Only the 1" and tap just the first beat of each bar. Orfeo
> works out the beats from the song's time signature.*

> 🎯 **Swing, shuffle and laid-back grooves**
>
> *Tap the main beat (where you'd tap your foot), not the swung notes in
> between. Orfeo lines the beat up with the drums and bass; if the band plays
> slightly ahead of or behind the beat, the clicks follow the band, which is
> where you hear it. Fine-tune with Clicks ◀ / ▶ if you'd rather have it
> somewhere else.*

> 🎯 **Live-played songs that drift, and free-time passages**
>
> *Tap Tempo gives one steady tempo per section. If a live-played song speeds
> up or slows down over time, tap it in sections (each one its own tap session,
> front to back). In free-time or very sparse passages Orfeo can't line the beat
> up with the notes and says "using your taps as they are" — your taps are
> still used, so tap carefully and listen back before you Keep.*

> 🎯 **Changed your mind**
>
> *Right-click TAP: click a kept tempo to reopen and adjust it, ✕ to remove
> just that one, or "Reset to the file's own tempo" to remove them all. Every
> Keep, adjustment and removal is listed in File Info → Orfeo History.*

> 🎯 **Finding the songs that need fixing**
>
> *Turn on Settings → Playback & Editing → Tempo warnings. Songs whose bar
> lines miss their beat get an amber dot in the Library, and a pulsing light
> next to Key when you open them. Click the light and choose "Fix with Tap
> Tempo". See [Tempo warnings](#tempo-warnings).*

**Tips for tapping**

- Tap the speed you'd count the song at, not the hi-hat: tapping twice per
  beat doubles the tempo, every other beat halves it.
- Start on a 1, and only once you've locked in — there's no rush.
- 8–16 taps beats 4: more taps give a steadier tempo.
- If the panel's tempo looks wrong, press **Tap again** rather than Keep.

### Tempo warnings

Turn on **Settings → Playback & Editing → Tempo warnings** (off by default) and
Orfeo points out the songs whose bar lines and metronome don't sit on the
music's steady beat — the ones [Tap Tempo](#fix-a-songs-tempo-with-tap-tempo)
can fix.

- **In the top bar:** when the open song is off, a small amber light pulses
  right under the **TAP** pad (or on the corner of the Key/Transpose box if
  the TAP pad is switched off). Click it to see what's off, in plain words:
  - *"The bar lines and metronome drift off the music's beat through most of
    the song. The beat sounds closer to about 91 than the file's 60 — check by
    ear."* — the file's tempo is wrong.
  - *"The bar lines and metronome clicks sit off the played notes … the tempo
    may be right, or counted at double or half speed — tap along to check."*
    — Tap Tempo tells you which.

  Choose **Fix with Tap Tempo** to start tapping from the playhead, or **It's
  fine, don't warn me for this song** if it sounds right to you.
- **In the Library:** affected songs get a small amber dot. While the Library
  tab is open, Orfeo checks your songs quietly — never while a song is playing
  — and remembers the result, so each song is only checked once (again if the
  file changes). Very large files (over 5 MB) are skipped.
- **Once you Keep a Tap Tempo**, the warning goes away — in the top bar and in
  the Library. Only the small dot on the TAP pad stays, as the sign that the
  song has a kept tempo.
- **If the file was right after all** (you tap and get the same tempo as the
  file), press **Original is fine** in the result panel: nothing is changed and
  you won't be warned about that song again.
- **Freely played music** (rubato piano, free-time intros, sparse lead sheets)
  is never flagged — there's no steady beat for Tap Tempo to fix.
- **What it can't tell:** a song whose bar lines are right but whose tempo
  number feels doubled (like Golden Brown) isn't flagged — that's about how
  you hear it, not something measurable in the notes. Tap Tempo still fixes
  the number.

Dismissed a warning by mistake? Right-click the **TAP** pad → *Show tempo
warning again* (for that song), or Settings → *Show warnings for dismissed
songs again* (for all of them).

### Change key

Transpose the whole piece up or down by semitones — to a key that suits your
hands or your voice. The transpose is session-only here, but you can **fold it
into the file** from the [Playback Editor](#midi-playback-editor) with *Save
Tempo & Key changes* turned on.

### Loop a passage

> **Image ·** `how-to-use/play-loop-region.gif` · **1200×600** · _Alt+dragging across the waterfall to mark a loop region; it snaps to bar lines and repeats._

<table width="100%">
<colgroup><col width="40%"><col width="60%"></colgroup>
<thead><tr><th>Gesture</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Alt</code> + drag on the roll or the strip above it</td><td>Precise-timing loop selection</td></tr>
<tr><td>Drag on the loop strip</td><td>Select a whole-bar range</td></tr>
<tr><td>Double-click the strip or roll</td><td>Clear the loop</td></tr>
</tbody>
</table>

The region snaps to bar boundaries and keeps working while you change
[tempo](#transport-and-tempo) or [key](#change-key).

### Tracks panel

> **Image ·** `how-to-use/play-tracks-panel.png` · **900×1000** · _The tracks panel: several tracks with M / S / visibility / light toggles, one track's colour picker open, a collapsed group._

Open it from the arrow at the top-right. For every track in the file:

<table width="100%">
<colgroup><col width="30%"><col width="70%"></colgroup>
<thead><tr><th>Control</th><th>Effect</th></tr></thead>
<tbody>
<tr><td><strong>M</strong></td><td>Mute</td></tr>
<tr><td><strong>S</strong></td><td>Solo — hear only this track</td></tr>
<tr><td><strong>Show on piano roll</strong></td><td>Hide/show its falling notes</td></tr>
<tr><td><strong>Light on keyboard</strong></td><td>Whether its notes light the keys</td></tr>
<tr><td><strong>Colour swatch</strong></td><td>Recolour the track</td></tr>
<tr><td>Drag a row</td><td>Reorder tracks and groups — the Piano track stays pinned</td></tr>
<tr><td>Group header</td><td>Collapse or reorder a whole instrument group</td></tr>
</tbody>
</table>

> 💡 **Tip**
>
> *Turn on [**Track color VU meters**](#settings--extras) (Settings → Practice) and each
> track's colour strip doubles as a mini level meter during playback — you can
> see who's sounding without opening the [mixer](#console-mixer).*

The eye icon next to the track count hides every track's notes off the piano
roll at once — same idea as the mute-all button in the [Console
Mixer](#console-mixer), and the two stay in sync. Bring individual tracks
back with their own visibility toggle afterwards.

### Focus Mode

One toggle mutes everything except **keys, bass, and drums** — the parts you
practise against — and hides the rest from the roll. It's in both the Tracks
panel and the [Console Mixer](#console-mixer), and you can still override any
individual track by hand afterwards.

> 🎯 **Use case — practise the piano part of a full band arrangement**
>
> *Hit Focus Mode, then unmute just the drums for timing. The horns and pads
> stay out of your way.*

### Master volume and audio engines

A single physical-feeling knob in the toolbar sets output level for whichever
engine is active, and remembers its position between sessions.

<table width="100%">
<colgroup><col width="16%"><col width="28%"><col width="56%"></colgroup>
<thead><tr><th>Engine</th><th>Sound</th><th>Setup</th></tr></thead>
<tbody>
<tr><td><strong>General MIDI</strong></td><td>Light, synthetic</td><td>Instant, nothing to download</td></tr>
<tr><td><strong>Samples</strong></td><td>Natural piano, strings, organ, everything</td><td>A real SoundFont engine (<a href="https://github.com/spessasus/spessasynth_lib">SpessaSynth</a>) — <a href="https://www.schristiancollins.com/generaluser.php">GeneralUser GS</a> by default (~31 MB), included in the installer, works offline</td></tr>
</tbody>
</table>

Switch in **Settings → Audio**.

Where the sounds come from:

- **General MIDI** uses no sound files at all — it's built in.
- **GeneralUser GS** (~31 MB, `.sf2`), the Samples engine's default sound set,
  is **included in the installer** — Samples works straight after installing,
  with no internet.
- **FluidR3 GM** (~142 MB, `.sf2`) and **MuseScore General** (~38 MB, `.sf3`)
  are **not** included, to keep the installer small. Each is downloaded once,
  from its own public download site, only when you press its download button
  in Settings → Audio.
- **Your own sound sets:** import any `.sf2` / `.sf3` file and it appears in
  the same list.

Downloaded and imported sound sets are kept in Orfeo's own data folder,
`%APPDATA%\Orfeo\soundfonts\`, and stay there until you delete them.

> 💡 **Tip**
>
> *Use **General MIDI** while editing (instant, low resource use), then switch
> to **Samples** for actual practice — the expressive sound genuinely helps
> you hear phrasing.*

---

## <img src="how-to-use-icons/midi-playback-editor.svg" alt="" height="26" align="middle"> Editing MIDI files

*Where changes get committed. Your original file is **never touched** — every
save lands as a `_ORFEO_vN` version in an `Orfeo/` folder beside the source.*

### How saving works

<table width="100%">
<colgroup><col width="26%"><col width="74%"></colgroup>
<thead><tr><th>Step</th><th>Result</th></tr></thead>
<tbody>
<tr><td>First edit of a file</td><td><code>&lt;name&gt;_ORFEO_v1.mid</code></td></tr>
<tr><td>Next edit</td><td><code>&lt;name&gt;_ORFEO_v2.mid</code>, and so on</td></tr>
<tr><td>Location</td><td>An <code>Orfeo/</code> subfolder next to the source file</td></tr>
<tr><td>Original</td><td>Left exactly as it was</td></tr>
</tbody>
</table>

The two editors below, the [Console Mixer](#console-mixer), and
[tempo / key changes](#change-key) all save this way. The
[library auto-refreshes](#your-midi-library) after every save, expands the
`Orfeo/` folder, and briefly highlights the new version. Every save also writes
an entry to the file's [edit history](#edit-history-travels-with-the-file).

### Console Mixer

> **Image ·** `how-to-use/play-mixer.png` · **1600×900** · _The Console Mixer: channel strips with VU meters, pan/chorus/reverb knobs, and the master strip with Tone and Compressor._

Toggle with `Ctrl+Shift+M`. A full mixing desk:

<table width="100%">
<colgroup><col width="50%"><col width="50%"></colgroup>
<thead><tr><th>Per channel strip</th><th>Master strip</th></tr></thead>
<tbody>
<tr><td>Volume, pan, chorus, reverb</td><td>Master volume, <strong>Tone</strong> (tilts the EQ darker/brighter), <strong>Compressor</strong> (tames the loudest peaks)</td></tr>
<tr><td>Live VU meter</td><td></td></tr>
<tr><td>Drag to reorder · wheel to scroll the row</td><td><code>Escape</code> closes the mixer</td></tr>
</tbody>
</table>

<table width="100%">
<colgroup><col width="32%"><col width="68%"></colgroup>
<thead><tr><th>Fader / knob shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td>Arrow keys</td><td>Adjust the value</td></tr>
<tr><td><code>Shift</code> + Arrow</td><td>Coarse step (×5)</td></tr>
<tr><td><code>Home</code> / <code>End</code></td><td>Minimum / maximum</td></tr>
</tbody>
</table>

**Per-channel volume, pan, chorus, and reverb are saved into the file.** When you
close the mixer after changing any of them, Orfeo asks **Save & Reload / Discard /
Cancel** — Save & Reload writes a new [`_ORFEO_vN` version](#how-saving-works)
(with a history entry) and reloads it in place, exactly like the
[Playback Editor](#midi-playback-editor). The **master strip** (master volume,
Tone, Compressor) and mute / solo stay session-only.

> ⚠️ **Important**
>
> *Tone and Compressor require the Samples engine.*

### MIDI Playback Editor

> **Image ·** `how-to-use/edit-playback-editor.png` · **1600×1000** · _The Playback Editor window: track rows with include checkboxes, instrument dropdowns, colour swatches, Merge / Split Hands controls, and the Save & Reload button._

A dedicated window for reshaping a file into clean practice material. Pick what
stays and what goes, then hit **Save & Reload** to write one new version and
reload it in place.

<details>
<summary><b>Every control in the Playback Editor</b></summary>

<table width="100%">
<colgroup><col width="26%"><col width="74%"></colgroup>
<thead><tr><th>Control</th><th>What it does</th></tr></thead>
<tbody>
<tr><td><strong>Include / exclude</strong></td><td>Untick a track to drop it from the saved file</td></tr>
<tr><td><strong>Rename</strong></td><td>Give a track a name that reads clearly on the roll forever after</td></tr>
<tr><td><strong>Recolour</strong></td><td>Set the track's colour permanently</td></tr>
<tr><td><strong>Reassign instrument</strong></td><td>Give a track a better General MIDI sound; one click restores the original</td></tr>
<tr><td><strong>Merge</strong></td><td>Combine split melody-and-chords parts into one track</td></tr>
<tr><td><strong>Split Hands</strong></td><td>Orfeo detects when one piano track secretly holds both a bass and a treble part and splits it into separate Left Hand / Right Hand tracks, with an adjustable breakpoint</td></tr>
<tr><td><strong>Show on piano roll / show on keyboard</strong></td><td>These visibility choices are saved <em>with the file</em>, not just for the session</td></tr>
<tr><td><strong>Hand assignment</strong></td><td>Automated left/right colouring baked into the file, plus a link to open a piano track in the <a href="#midi-note-editor">Note Editor</a> for a precise manual split</td></tr>
<tr><td><strong>Save Tempo &amp; Key changes</strong></td><td>Fold the session's BPM and transpose changes into the same Save &amp; Reload</td></tr>
</tbody>
</table>

</details>

> 💡 **Tip**
>
> ***Reassign instrument** is the fastest fix for a badly-sequenced download —
> a "piano" track that's actually on a synth-pad program becomes usable in one
> click, and the change sticks.*

> 🎯 **Use case — turn a messy download into a lesson**
>
> *Exclude the click track and the unused channels, rename "Track 3" to "Left
> Hand", recolour the melody, reassign the lead to a clean piano, then Save &
> Reload. You now have a `_ORFEO_v1` file that reads clearly every time you
> open it.*

### MIDI Note Editor

> **Image ·** `how-to-use/edit-note-editor.gif` · **1200×750** · _Dragging a note to move it, resizing another by its edge, then the velocity lane below adjusting dynamics._

Edit individual notes directly on the piano roll — move, resize, add, delete,
and adjust velocity — with full undo/redo. Enable it in **Settings → Playback &
Editing**, then open a track from its note-edit icon.

<table width="100%">
<colgroup><col width="20%"><col width="80%"></colgroup>
<thead><tr><th>Tool</th><th>Use</th></tr></thead>
<tbody>
<tr><td><strong>Select</strong></td><td>Click to select/move; drag an edge to resize; drag a selected note to move the whole selection</td></tr>
<tr><td><strong>Marquee</strong></td><td>Drag a box to select notes</td></tr>
<tr><td><strong>Lasso</strong></td><td>Freehand-select notes</td></tr>
<tr><td><strong>Pen</strong></td><td><code>Alt</code> + click empty space to add a note; click an existing note to mark it for delete</td></tr>
</tbody>
</table>

<details>
<summary><b>Note Editor keyboard and mouse reference</b></summary>

<table width="100%">
<colgroup><col width="38%"><col width="62%"></colgroup>
<thead><tr><th>Shortcut / gesture</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Shift</code> + click a note</td><td>Add / remove from a multi-selection</td></tr>
<tr><td><code>Shift</code> + drag (Marquee / Lasso)</td><td>Add to the selection</td></tr>
<tr><td>Drag in the velocity lane</td><td>Edit a note's velocity</td></tr>
<tr><td>Drag the lane on a multi-selected note</td><td>Shift every selected note's velocity together, keeping their relative shape</td></tr>
<tr><td>Right-click → <strong>Flatten Velocity</strong> (2+ selected)</td><td>Set every selected note to their current average velocity</td></tr>
<tr><td>Right-click a note</td><td>Menu: Assign to Left / Right Hand, Flatten Velocity, Deselect, Undo, Redo, Delete</td></tr>
<tr><td><code>Ctrl+Z</code></td><td>Undo</td></tr>
<tr><td><code>Ctrl+Y</code> or <code>Ctrl+Shift+Z</code></td><td>Redo</td></tr>
<tr><td><code>Delete</code> / <code>Backspace</code></td><td>Delete selected note(s)</td></tr>
<tr><td><code>Escape</code></td><td>Close the context menu</td></tr>
</tbody>
</table>

</details>

**Extras in the editor:**

- **Reassign hands** — turn on hand colours and use the right-click menu to
  assign notes to left or right hand for a note-perfect split.
- **Note names** — overlay pitch labels on the notes.
- **Snap & Quantize** — *Snap* rounds a moved, resized, or added note's timing
  to the grid; the *Quantize* menu sets that grid (1/4 down to 1/32). With Snap
  off, neither has any effect.

Each save writes the next `_ORFEO_vN` version, same as the Playback Editor.

> ⚠️ **Important**
>
> *Some MIDI files have **more than one piano track**. To use hand assignment
> or edit individual notes, first [**merge**](#midi-playback-editor) the piano
> tracks into one (or exclude the extras).*

---

## <img src="how-to-use-icons/practice.svg" alt="" height="26" align="middle"> Practicing with MIDI files

*With a clean, well-structured file in hand, these are the tools you drill
with.*

### Live chord display

> **Image ·** `how-to-use/practice-chord-display.png` · **1200×400** · _The chord bar above the keyboard showing a chord name, with the tracking-mode control._

The chord name above the keyboard tracks what's actually playing — from the file
or from a [connected keyboard](#play-along-with-a-hardware-keyboard). It reads
the harmony the way a musician reading a lead sheet would; the three tracking
modes that shape it are described in full in
[How Orfeo reads and voices chords](#how-orfeo-reads-and-voices-chords).

Pause on any chord and **right-click it** to *Show on keyboard* (locks it like
[Lock-A-Chord](#lock-a-chord)) or *Open in Chord Explorer*.

### How Orfeo reads and voices chords

Orfeo reads chords the way a player reading a chart would: a chord lasts until
the accompaniment genuinely moves on, the name lands the moment you **hear** the
chord rather than on the metronome line, and a rolled or arpeggiated chord stays
**one** chord instead of turning into a new name on every broken note. Three or
four real changes in a bar still show — a turnaround, a walk-up, a `ii–V–I`
squeezed tight — but figuration no longer manufactures eight.

**Three tracking modes** (Settings → Notation & Chords). They differ only in
*which instruments Orfeo listens to*:

<table width="100%">
<colgroup><col width="14%"><col width="50%"><col width="36%"></colgroup>
<thead><tr><th>Mode</th><th>What it listens to</th><th>When to use it</th></tr></thead>
<tbody>
<tr><td><strong>Auto</strong></td><td>The chord instruments only — piano, keys, guitar, strings, pads — with melody, bass and drums set aside. A lead riff on a string patch, or a sung line printed into the score, is left out too.</td><td>The default, and the most accurate and stable of the three because it reads only what actually voices chords. Right for the large majority of songs.</td></tr>
<tr><td><strong>Harmony</strong></td><td>Everything except drums, pooled together — the melody included, on purpose.</td><td>Dense textures — film cues, choral writing, thick synth arrangements — where no single instrument holds the harmony. Expect more colour and more movement, since the tune gets a vote.</td></tr>
<tr><td><strong>Follow</strong></td><td>One instrument or group that you pick.</td><td>When you already know which part carries the chords. As steady as Auto if you point it at a genuine comping track.</td></tr>
</tbody>
</table>

> 🎯 **Which mode?**
>
> *Start on Auto. If the readout goes blank or feels too thin — usually a
> sparse or unusual arrangement — try Harmony. Reach for Follow only when you
> want the chords of one specific part.*

Accuracy is best on pop, rock and anything with a clear piano or guitar comp. It
is still being sharpened for sheet-music editions that print the sung melody
*into* the piano staff, and for labelling inversions on solo piano that carries
no separate bass line.

**Hearing a progression played back** — in the
[Chords Explorer](#chords-explorer) and
[Scales Explorer](#scales-explorer-and-the-circle-of-fifths), a named
progression is voiced the way a pianist would rather than as root-position
blocks. A **Voicing** toggle offers:

<table width="100%">
<colgroup><col width="14%"><col width="86%"></colgroup>
<tbody>
<tr><td><strong>Roots</strong></td><td>Every chord in root position, each one placed a little higher than the last — the plain reference reading.</td></tr>
<tr><td><strong>Climbing</strong></td><td>The first chord sits low, then each next chord takes the nearest inversion just above it. The line climbs gently and never snaps back to the octave — the way a player actually runs the chords of a scale: nice inversions, always moving up.</td></tr>
<tr><td><strong>Smooth</strong></td><td>Each chord is the nearest voicing to the one before — the fewest notes move the shortest distance, so your hand barely shifts. The comping sound.</td></tr>
</tbody>
</table>

Each chord is lightly rolled from the bottom up with a little velocity variation,
so an audition sounds played rather than triggered. The **Style** dropdown beside
the toggle (Classic, Coltrane, Cinematic, Roadhouse, Ipanema, Carnival, Velvet)
is a separate control — it changes the chord *quality* on every degree (plain
triads versus jazz 9ths and 13ths), not the inversion motion.

### Chord Prompter

> **Image ·** `how-to-use/practice-chord-prompter.png` · **1400×400** · _The teleprompter row: faded past chords left, large current chord centre, next two chords right._

A teleprompter-style row built into the chord bar: chords you just played fade
out on the left, the current one sits large in the centre, and the next two are
already visible on the right. Turn it on in **Settings → Practice**, then toggle
it from the icon above the keyboard.

> 🎯 **Use case — sight-reading a lead sheet**
>
> *With the Prompter on you're never caught off guard by a fast change — you
> can see the next two chords coming while your hands are still on the current
> one.*

### Metronome

Clicks along with the beat while a file plays. It reads the **tempo map embedded
in the MIDI file** and follows every mid-song tempo change, phase-locked to
wherever you start playback — so it stays in time through a rit. or accel. that
a flat click track would drift on. If a file's own tempo is wrong, fix it with
[Tap Tempo](#fix-a-songs-tempo-with-tap-tempo) and the metronome follows your
corrected beat.

Right-click the metronome to change its volume (0–150%). The setting is
remembered between sessions.

#### Count-in

Hear one to four bars of clicks before the music starts, so you can come in
on time. Turn it on by right-clicking the metronome (**Count-in → ON**, then
pick **1 · 2 · 3 · 4** bars) or in Settings → Playback & Editing → *Count-in*.
A small number on the metronome icon shows the count-in is on and how many
bars it counts.

- Press **Play** (or `Space`): the clicks count at the song's tempo and time
  signature — your speed setting and any kept Tap Tempo included — with the
  "1" of each bar accented, and a big **1 · 2 · 3 · 4** counts along over the
  piano roll. The music comes in exactly on the next beat.
- **Empty bars at the start are skipped:** the count-in leads straight into
  the first note, whether the file starts right on it or has silent bars
  before it.
- **Upbeats come in on time:** if the song starts on an upbeat (a pickup
  before the first "1"), the count stops just before it and the pickup
  plays where it belongs.
- **Mid-song:** pressing Play after a pause or after scrolling counts into
  the start of the bar you're in, so you always come back in on a "1".
- `Space`, `Esc` or the Play button during the count-in cancels it — nothing
  plays and the playhead stays where it was.
- The count-in doesn't happen when you scroll, when a loop repeats, or when
  you start a Tap Tempo session (you need to hear the music to find the
  beat). Listening back to a tapped tempo (▶ Listen) does count in, at the
  tapped tempo.

> 🎯 **Use case — come in on the first note**
>
> *Right-click the metronome, turn Count-in on, choose 2 bars. Press Space:
> "1 2 3 4, 1 2 3 4" — and you're playing along with the first note.*

### Chords Explorer

> **Image ·** `how-to-use/practice-chords-explorer.png` · **1600×1000** · _The Chord Explorer: chord tiles across Common / Power / Extended tiers, an inversion cycler showing a slash chord, the progression player, and the search box._

Open it from **CHORDS** above the keyboard. Browse and audition any chord in any
key across **Common, Power, and Extended** tiers.

- Click a chord to hear it correctly voiced; **cycle its inversions** (shown as
  proper slash chords like `C/E`).
- **Filter** by hand span or note count.
- **Progressions** — play named progressions (`ii–V–I`, `I–vi–IV–V`, twelve-bar
  blues, and more) with the theoretically correct chord quality on every degree.
  A **Voicing** toggle (Roots / Climbing / Smooth) sets how the chords move from
  one to the next, and a **Style** dropdown (Classic, Coltrane, Cinematic,
  Roadhouse, Ipanema, Carnival, Velvet) sets how rich each chord is — see
  [How Orfeo reads and voices chords](#how-orfeo-reads-and-voices-chords).
- **Fuzzy search** — type a character or two and get instant matches by chord
  name or by the notes it contains.

> 🎯 **Use case — drill `ii–V–I` in every key**
>
> *Pick the progression, set a voicing style, then walk it around the
> [Circle of Fifths](#scales-explorer-and-the-circle-of-fifths) one key at a
> time.*

### Scales Explorer and the Circle of Fifths

> **Image ·** `how-to-use/practice-scales-explorer.png` · **1600×1000** · _The interactive Circle of Fifths with a key selected, the scale and its seven diatonic chords with Roman numerals shown below._

Open it from **SCALES** above the keyboard. A fully interactive Circle of
Fifths — click any major key on the outer ring or its relative minor on the
inner ring to see and hear that scale.

- **Ten scale types** — Major, the three minors, Major / Minor Pentatonic,
  Dorian, Phrygian, Lydian, Mixolydian — each showing its seven diatonic chords
  with correct Roman numerals.
- The same named [progressions](#chords-explorer), scoped to the selected key —
  hear `I–V–vi–IV` in G major versus E♭ minor with one click, with the same
  [Voicing toggle](#how-orfeo-reads-and-voices-chords) (Roots / Climbing /
  Smooth).

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

> 📝 **Note**
>
> *Beta: it works end to end, but the layout and detection are still being
> refined.*

### Play along with a hardware keyboard

> **Image ·** `how-to-use/practice-play-along.png` · **1400×700** · _The device-connected indicator in the top bar, keys lit from live hardware input, chord name showing what's being played._

Plug in a USB / MIDI keyboard and Orfeo lights the on-screen keys as you play,
with **true sustain** — a note rings exactly as long as you hold it.
Multi-device input is supported.

> 🎯 **Use case — play the melody yourself**
>
> *Hide the file's piano tracks in the [Tracks panel](#tracks-panel), keep the
> rest of the arrangement playing, and perform the part over it. Add
> [Focus Mode](#focus-mode) to strip it down to a rhythm section.*

---

## <img src="how-to-use-icons/managing-midi-files.svg" alt="" height="26" align="middle"> Managing MIDI files

### Supported formats

<table width="100%">
<colgroup><col width="22%"><col width="78%"></colgroup>
<thead><tr><th>Opens directly</th><th>Converted to MIDI on import</th></tr></thead>
<tbody>
<tr><td><code>.mid</code>, <code>.midi</code></td><td>MusicXML (<code>.musicxml</code>, <code>.xml</code>, <code>.mxl</code>) · Guitar Pro (<code>.gp</code>, <code>.gp3</code>–<code>.gp5</code>, <code>.gpx</code>) · Capella (<code>.cap</code>) · karaoke <code>.kar</code></td></tr>
</tbody>
</table>

Converted files are cached as `<name>_ORFEO_IMPORTED.mid` next to the source.

### Your MIDI library

> **Image ·** `how-to-use/manage-library.png` · **900×1000** · _The library panel: folder path row, search box, All / starred filter, file rows with star toggles, one folder expanded._

Point Orfeo at a folder and it lists every MIDI file inside, remembering the
location between sessions.

<table width="100%">
<colgroup><col width="26%"><col width="74%"></colgroup>
<thead><tr><th>Action</th><th>How</th></tr></thead>
<tbody>
<tr><td><strong>Star a favourite</strong></td><td>Star icon on the row; filter to starred-only from the header</td></tr>
<tr><td><strong>Search</strong></td><td>Fuzzy-search the whole library by name</td></tr>
<tr><td><strong>Refresh</strong></td><td>Rescans for files added or removed outside Orfeo (also auto-refreshes after every save)</td></tr>
<tr><td><strong>Change library folder</strong></td><td>The folder icon, any time</td></tr>
</tbody>
</table>

<table width="100%">
<colgroup><col width="34%"><col width="66%"></colgroup>
<thead><tr><th>Library shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Ctrl</code> / <code>Cmd</code> + click</td><td>Toggle a row in a multi-selection</td></tr>
<tr><td><code>Shift</code> + click</td><td>Select a range from the last-clicked row</td></tr>
<tr><td>Drag file(s)</td><td>Move them into a folder</td></tr>
</tbody>
</table>

### Originals are never touched

Every edit — [Playback Editor](#midi-playback-editor),
[Note Editor](#midi-note-editor), tempo/key, transcript — saves as a **new
file**, never over the source. Versions are named `<file>_ORFEO_vN.mid` and land
in an `Orfeo/` subfolder beside the original.

### Folders, hiding, and demo content

- Create subfolders and drag files between them right in the library panel.
- **Hide** individual files from the list without deleting them from disk.
- Hide the **bundled demo songs** once you have your own library: turn off
  Settings → MIDI Files & Library → *Show demo content*. Nothing is deleted;
  turn it back on to see them again.

### Right-click options

<table width="100%">
<colgroup><col width="18%"><col width="82%"></colgroup>
<thead><tr><th>Right-click a…</th><th>Menu</th></tr></thead>
<tbody>
<tr><td>File</td><td>Show in folder (opens Explorer with the file highlighted), File info, Hide, Undo move, folder organisation</td></tr>
<tr><td>Folder</td><td>Rename, Move selection here, Delete</td></tr>
</tbody>
</table>

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

## <img src="how-to-use-icons/settings.svg" alt="" height="26" align="middle"> Settings & Extras

*Settings that make Orfeo fit how you already read and teach music. Open with
the gear icon (top-right); eight collapsible sections.*

<details>
<summary><b>Notation &amp; Chords</b></summary>

<a id="chord-naming-style"></a>

<table width="100%">
<colgroup><col width="22%"><col width="78%"></colgroup>
<thead><tr><th>Setting</th><th>Options</th></tr></thead>
<tbody>
<tr><td><strong>Note naming</strong></td><td>UK/US (<code>C D E F G A B</code>) · EU / Central European (<code>C D E F G A H</code>, where <code>B</code> = B♭) · Solfège (<code>Do Re Mi Fa…</code>) · Hidden. Applies everywhere — keyboard, both Explorers, the chord bar, the transcript PDF</td></tr>
<tr><td><strong>Accidentals</strong></td><td>A separate sharps/flats toggle for the enharmonic spelling of black keys, global and instant, independent of the naming system</td></tr>
<tr><td><strong>Chord naming style</strong></td><td>Abbreviations (<code>Bb(b5)/D</code>, <code>Cm7</code>, <code>Gaug</code>) or symbols (<code>Bb(♭5)/D</code>, <code>Cm7</code>, <code>G+</code>, <code>F°7</code>), applied everywhere a chord name appears</td></tr>
</tbody>
</table>

</details>

<details>
<summary><b>Keyboard</b></summary>

- **Three sizes** — 61, 73, or 88 keys, switchable live.
- **Docked or floating** — anchored below the roll, or a freely draggable,
  resizable panel.
- **Keyboard labels** — independently toggle octave numbers (`C3`, `C4`, `C5`…),
  note names on the keys, and small **L/R hand badges** for colourblind players
  who can't rely on the blue/pink hand colours alone.
- **Reflect piano roll on keyboard** *(Scrub display, off by default)* — while
  paused or scrubbing, the keyboard continuously lights whatever notes are
  sounding at the playhead, from whichever tracks are currently **visible** in
  the piano roll — hide the tracks you don't want and the keyboard follows.
  Handy for quickly eyeballing a chord while scrubbing through a passage,
  without right-clicking and choosing [Show on keyboard](#lock-a-chord) each
  time (which now also follows the same visible tracks, showing the real
  voicing exactly as it's played). Doesn't change anything during real
  playback.

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
- **App Zoom** — `Ctrl` `+` / `Ctrl` `-` / `Ctrl` `0` scale the whole app in fixed
  steps from 80% to 200%, the same as browser zoom; also available as a
  −/+/reset control here in Settings. Capped so the window never shrinks
  below a usable size — on a small window the top step may land under 200%.
  The level is remembered between sessions.
- **Check for updates** — and the current version number (Windows installer
  builds auto-check on startup; see
  [INSTALLATION.md](INSTALLATION.md#updating)).

</details>

---

## Keyboard shortcuts

The essentials — the full reference with every gesture is in
[SHORTCUTS.md](SHORTCUTS.md).

<table width="100%">
<colgroup><col width="32%"><col width="68%"></colgroup>
<thead><tr><th>Shortcut</th><th>Action</th></tr></thead>
<tbody>
<tr><td><code>Space</code></td><td>Play / Pause</td></tr>
<tr><td><code>Escape</code></td><td>Stop — or close the open Explorer / modal first</td></tr>
<tr><td><code>F11</code></td><td>Presentation Mode</td></tr>
<tr><td><code>Ctrl+O</code></td><td>Open a file</td></tr>
<tr><td><code>Ctrl+Shift+M</code></td><td>Console Mixer</td></tr>
<tr><td><code>Ctrl</code> <code>+</code> / <code>-</code> / <code>0</code></td><td>Zoom the app in / out / reset</td></tr>
<tr><td>Long-press BPM <code>▲</code> / <code>▼</code></td><td>Glide tempo</td></tr>
<tr><td>Mouse wheel on the roll</td><td>Scrub (<code>Shift</code> = fine)</td></tr>
<tr><td><code>Alt</code> + drag on the roll</td><td>Loop-region selection</td></tr>
<tr><td><code>Shift</code> + click 3+ keys</td><td>Lock-A-Chord</td></tr>
<tr><td><code>Ctrl+Z</code> / <code>Ctrl+Y</code></td><td>Undo / redo (Note Editor)</td></tr>
</tbody>
</table>

---

## Coming next

Everything above is shipping today. Next on the list:

<table width="100%">
<colgroup><col width="26%"><col width="74%"></colgroup>
<thead><tr><th>Feature</th><th>What it adds</th></tr></thead>
<tbody>
<tr><td><strong>Play-Along Wait Mode</strong></td><td>Orfeo waits for you to hit the right notes before advancing</td></tr>
<tr><td><strong>Arpeggiator</strong></td><td>Rhythmic pattern playback (Alberti bass, syncopation, octave runs) for accompaniment practice</td></tr>
<tr><td><strong>Performance / recording mode</strong></td><td>Record a live hardware MIDI performance and export it as audio (MP3, WAV)</td></tr>
<tr><td><strong>Trim leading silence</strong></td><td>One click to drop dead space so the first note sits at the playbar</td></tr>
<tr><td><strong>Count-in</strong></td><td>1–4 bars of metronome clicks before playback</td></tr>
<tr><td><strong>Community translations</strong></td><td>All UI strings translatable via standard <code>.po</code> files, plus a language switcher</td></tr>
</tbody>
</table>

---

### Related documents

- [README](../README.md) — what Orfeo is, at a glance
- [SHORTCUTS.md](SHORTCUTS.md) — every keyboard and mouse gesture
- [INSTALLATION.md](INSTALLATION.md) — installer vs. portable, updates, data
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is built

---

*Inspired by [Rondo](https://macsim.app/rondo/) (RIP).*
