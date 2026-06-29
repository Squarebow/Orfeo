# UI Strings Audit

Hardcoded UI strings, inline hex colors, and inline font sizes across `src/`. Generated 29. 6. 2026.

**Purpose:** Let a non-developer find and edit any user-visible value directly in VS Code without touching logic.

**Excluded:** CSS files, `className` references, CSS variable lookups (`var(--…)`), logic, state, functions, imports.

---

## Contents

1. [App Shell](#1-app-shell)
2. [Piano Roll](#2-piano-roll)
3. [Keyboard & Chord Bar](#3-keyboard--chord-bar)
4. [Left Drawer — Settings & Library](#4-left-drawer--settings--library)
5. [Track Panel](#5-track-panel)
6. [Chord Explorer](#6-chord-explorer)
7. [Scale Explorer](#7-scale-explorer)
8. [MIDI Playback Editor](#8-midi-playback-editor)
9. [Floating Keyboard](#9-floating-keyboard)

---

## 1. App Shell

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `App.tsx` | 76 | Font family (inline style) | `'Inter', system-ui, sans-serif` |
| `components/Transport/TopBar.tsx` | 100 | Tooltip — reset button | `"Reset"` |
| `components/Transport/TopBar.tsx` | 105 | Tooltip — open file button | `"Open MIDI file (Ctrl+O)"` |
| `components/Transport/TopBar.tsx` | 118 | Tooltip — BPM display | `"BPM {number}"` |
| `components/Transport/TopBar.tsx` | 121 | Label — BPM abbreviation | `"BPM"` |
| `components/Transport/TopBar.tsx` | 122 | Label — tempo section | `"TEMPO"` |
| `components/Transport/TopBar.tsx` | 144 | Label — key section | `"KEY"` |
| `components/Transport/TopBar.tsx` | 145 | Label — transpose section | `"TRANSPOSE"` |
| `components/Transport/TopBar.tsx` | 172 | Tooltip — go to start | `"Go to start"` |
| `components/Transport/TopBar.tsx` | 173 | Tooltip — rewind | `"Rewind {n}s"` |
| `components/Transport/TopBar.tsx` | 174 | Tooltip — play/pause | `"Play / Pause (Space)"` |
| `components/Transport/TopBar.tsx` | 179 | Tooltip — fast-forward | `"Forward {n}s"` |
| `components/Transport/TopBar.tsx` | 180 | Tooltip — go to end | `"Go to end"` |
| `components/Transport/TopBar.tsx` | 181 | Tooltip — loop toggle | `"Loop on"` / `"Loop off"` |
| `components/Transport/TopBar.tsx` | 192 | Tooltip — scrub bar | `"Scrub position"` |
| `components/Transport/TopBar.tsx` | 201 | Empty state — no file | `"No file open"` |
| `components/Transport/TopBar.tsx` | 212 | Tooltip — time signature | `"Time signature: {n}/{n}"` |
| `components/Transport/TopBar.tsx` | 223 | Label — time section | `"TIME"` |
| `components/Transport/TopBar.tsx` | 231 | Tooltip — metronome toggle | `"Metronome on"` / `"Metronome off"` |
| `components/Transport/TopBar.tsx` | 245 | Metronome state badge | `"ON"` / `"OFF"` |
| `components/Transport/TopBar.tsx` | 253 | Tooltip — MIDI device | `"MIDI: {device}"` / `"No MIDI keyboard connected"` |
| `components/Transport/TopBar.tsx` | 258 | MIDI status label | `"MIDI"` / `"NO MIDI"` |
| `components/EmptyState.tsx` | 21 | Heading — empty state | `"No file open"` |
| `components/EmptyState.tsx` | 22 | Subheading — empty state | `"Open a .mid or .midi file to get started"` |
| `components/EmptyState.tsx` | 44 | Button label | `"Open MIDI file"` |
| `components/EmptyState.tsx` | 47 | Keyboard shortcut hint | `"Ctrl+O"` |

### Inline Colors

| File | Line | Color | Usage |
|---|---|---|---|
| `App.tsx` | 76 | `#0f0f12` | Body background (dark theme) |
| `App.tsx` | 76 | `#12100e` | Body background (warm theme) |
| `components/Transport/TopBar.tsx` | 88 | `#111116` | Top bar background |
| `components/Transport/TopBar.tsx` | 89 | `#1e1e28` | Top bar border |
| `components/EmptyState.tsx` | 32 | `#e8a027` | "Open MIDI file" button background |
| `components/EmptyState.tsx` | 33 | `#0f0f12` | "Open MIDI file" button text |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/Transport/TopBar.tsx` | Labels, values, BPM, time | 8, 9, 10, 11, 13, 16, 20 |
| `components/EmptyState.tsx` | Heading, subheading, button, hint | 11, 12, 13, 15 |

---

## 2. Piano Roll

### Inline Colors (PixiJS — hex number literals, not CSS)

| File | Line | Color | Usage |
|---|---|---|---|
| `components/PianoRoll/PianoRoll.tsx` | 93 | `0x0f0f12` | Pixi renderer background |
| `components/PianoRoll/PianoRoll.tsx` | 125 | `0x161620` | Black-key lane shading |
| `components/PianoRoll/PianoRoll.tsx` | 135 | `0x2e2e48` | Beat/bar grid divider line |
| `components/PianoRoll/PianoRoll.tsx` | 162 | `0xe8a027` | Playhead line color |

> Note: Pixi colors use `0x` prefix instead of `#`. The hex digits are the same as the CSS tokens.

---

## 3. Keyboard & Chord Bar

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/Keyboard/Keyboard.tsx` | 235 | Tooltip — Chord Explorer button | `"Open Chord Explorer"` |
| `components/Keyboard/Keyboard.tsx` | 236 | Label — chord bar section | `"Chords"` |
| `components/Keyboard/Keyboard.tsx` | 321 | Chord bar empty state | `"— — —"` |
| `components/Keyboard/Keyboard.tsx` | 329 | Tooltip — Scale Explorer button | `"Open Scale Explorer"` |
| `components/Keyboard/Keyboard.tsx` | 331 | Label — scale bar section | `"Scales"` |
| `components/Keyboard/KeyboardControls.tsx` | 72 | Tooltip — key-range button | `"{n}-key keyboard layout"` |
| `components/Keyboard/KeyboardControls.tsx` | 94 | Tooltip — float/dock toggle | `"Float keyboard (detach)"` / `"Dock keyboard (attach to bottom)"` |
| `components/Keyboard/KeyboardControls.tsx` | 117 | Mode badge | `"Docked"` / `"Floating"` |
| `components/Keyboard/KeyboardControls.tsx` | 129 | Label — locked chord section | `"Locked chord"` |
| `components/Keyboard/KeyboardControls.tsx` | 132 | Tooltip — prev inversion | `"Previous inversion"` |
| `components/Keyboard/KeyboardControls.tsx` | 138 | Tooltip — play chord | `"Play this chord"` |
| `components/Keyboard/KeyboardControls.tsx` | 142 | Button label — play chord | `"Play"` |
| `components/Keyboard/KeyboardControls.tsx` | 144 | Tooltip — next inversion | `"Next inversion"` |
| `components/Keyboard/KeyboardControls.tsx` | 150 | Tooltip — clear locked chord | `"Clear locked chord"` |
| `components/Keyboard/KeyboardControls.tsx` | 158 | Help/hint text | `"Shift+Click at least 3 keys to build & lock a chord"` |
| `components/Keyboard/KeyboardControls.tsx` | 176 | Tooltip — note counter | `"Total notes in file"` |

### Inline Colors

| File | Line | Color | Usage |
|---|---|---|---|
| `components/Keyboard/Keyboard.tsx` | 359 | `#e8e8e8` | White piano key fill |
| `components/Keyboard/Keyboard.tsx` | 398 | `#1a1a22` | Black piano key fill |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/Keyboard/Keyboard.tsx` | Key labels, chord name display | 7, 8, 9, 10, 11, 14 |
| `components/Keyboard/KeyboardControls.tsx` | Help text, labels, buttons | 9, 11, 12 |

---

## 4. Left Drawer — Settings & Library

### Strings — Drawer Controls

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 446 | Tooltip — drawer open | `"Close Library & Settings"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 446 | Tooltip — drawer closed | `"Open Library & Settings"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 467 | Tab label | `"Library"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 468 | Tab label | `"Settings"` |

### Strings — Library Tab

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 224 | Tooltip — refresh button | `"Refresh folder"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 250 | Tab labels | `"All ({n})"` / `"★ {n}"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 255 | Tooltip — change folder | `"Change library folder"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 283 | Button label | `"Set MIDI folder"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 294 | Empty state — starred | `"No starred files yet.\nStar a file with ★"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 294 | Empty state — no files | `"No MIDI files found."` |
| `components/SettingsPanel/SettingsPanel.tsx` | 305 | Tooltip — folder toggle | `"Collapse folder"` / `"Expand folder"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 361 | Tooltip — star button | `"Remove from favourites"` / `"Add to favourites"` |

### Strings — Settings Tab: Note Names

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 498 | Section header | `"Note Names"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 499 | Row label | `"Display system"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 420 | Option button label | `"UK / US"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 421 | Option hint | `"C D E F G A B"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 422 | Option button label | `"EU"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 423 | Option hint | `"C D E F G A H (B = B♭)"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 424 | Option button label | `"Solfège"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 425 | Option hint | `"Do Re Mi Fa Sol La Si"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 426 | Option button label | `"Hide"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 427 | Option hint | `"No labels shown"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 522 | Preview text (English) | `"C  D  E  F  G  A  B"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 523 | Preview text (EU) | `"C  D  E  F  G  A  H"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 524 | Preview text (Solfège) | `"Do Re Mi Fa Sol La Si"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 525 | Preview text (hidden) | `"— labels hidden —"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 531 | Row label | `"Accidentals"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 532 | Hint text (flat mode) | `"e.g.  Bb  Eb  Ab  Db  Gb"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 532 | Hint text (sharp mode) | `"e.g.  A#  D#  G#  C#  F#"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 535 | Button tooltip | `"Flat names"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 536 | Button tooltip | `"Sharp names"` |

### Strings — Settings Tab: Keyboard

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 542 | Section header | `"Keyboard"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 543 | Row label | `"Key range"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 543 | Row hint | `"Number of keys on the virtual keyboard"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 547 | Button tooltip | `"{n}-key keyboard"` |

### Strings — Settings Tab: Piano Roll

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 555 | Section header | `"Piano Roll"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 556 | Row label | `"Zoom  —  {%}"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 556 | Row hint | `"{n}s visible · higher = notes appear larger"` |

### Strings — Settings Tab: Audio

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 590 | Section header | `"Audio"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 591 | Row label | `"Sound engine"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 598 | Button label — GM engine | `"GM Synth"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 598 | Button tooltip — GM engine | `"Built-in GM synthesiser (jzz-synth-tiny) — always available offline"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 617 | Button label — samples engine | `"Samples"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 616 | Button tooltip — samples engine | `"GeneralUser GS soundfont via spessasynth_lib — richer sound, loads once"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 623 | Loading state message | `"Loading soundfont… {%}%"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 635 | Loaded state message | `"GeneralUser-GS.sf2 · 30.8 MB · loaded"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 640 | Error state message | `"Failed to load soundfont — check console"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 646 | GM status description | `"GM Synth (jzz-synth-tiny) — ships with app, no internet needed."` |
| `components/SettingsPanel/SettingsPanel.tsx` | 647 | Samples status description | `"GeneralUser-GS.sf2 · 30.8 MB · click Samples to load"` |

### Strings — Settings Tab: Appearance & About

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | 653 | Section header | `"Appearance"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 654 | Row label | `"Background"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 656 | Button label | `"Dark"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 657 | Button label | `"Warm"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 670 | Version/app name display | `"Orfeo · v0.6.1"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 673 | License/repo text | `"MIT License · github.com/SquareBow/orfeo"` |
| `components/SettingsPanel/SettingsPanel.tsx` | 700 | Button label | `"User Manual"` |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/SettingsPanel/SettingsPanel.tsx` | Headers, option labels, hints, tabs | 8, 9, 10, 11, 13 |

---

## 5. Track Panel

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/TrackPanel/TrackPanel.tsx` | 135 | Section title | `"Tracks"` |
| `components/TrackPanel/TrackPanel.tsx` | 154 | Tooltip — MIDI editor button | `"MIDI Editor is open"` / `"Open MIDI Editor"` |
| `components/TrackPanel/TrackPanel.tsx` | 174 | Empty state | `"Open a MIDI file to see tracks"` |
| `components/TrackPanel/TrackPanel.tsx` | 196 | Tooltip — expand/collapse track group | `"Expand"` / `"Collapse"` |
| `components/TrackPanel/TrackPanel.tsx` | 209 | Tooltip — mute-all button | `"Mute all {label}"` / `"Unmute all {label}"` |
| `components/TrackPanel/TrackPanel.tsx` | 285 | Tooltip — per-track mute | `"Mute"` / `"Unmute"` |
| `components/TrackPanel/TrackPanel.tsx` | 288 | Tooltip — per-track solo | `"Solo"` / `"Unsolo"` |
| `components/TrackPanel/TrackPanel.tsx` | 291 | Tooltip — hide in roll | `"Hide in roll"` / `"Show in roll"` |
| `components/TrackPanel/TrackPanel.tsx` | 294 | Tooltip — keyboard lighting | `"Lit on keyboard"` / `"Not lit on keyboard"` |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/TrackPanel/TrackPanel.tsx` | Track names, labels, badges | 9, 10, 11, 12 |

---

## 6. Chord Explorer

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/ChordExplorer.tsx` | 528 | Modal title | `"Chord Explorer"` |
| `components/ChordExplorer.tsx` | 541 | Search scope tooltip — Name | `"Search by chord name and type (m7, maj7, dim…)"` |
| `components/ChordExplorer.tsx` | 542 | Search scope tooltip — Notes | `"Search by note names in chord for selected root"` |
| `components/ChordExplorer.tsx` | 543 | Search scope tooltip — Both | `"Search chord names and notes"` |
| `components/ChordExplorer.tsx` | 557 | Scope button label | `"Name"` / `"Notes"` / `"Both"` |
| `components/ChordExplorer.tsx` | 569 | Search input placeholder | `"Search …"` |
| `components/ChordExplorer.tsx` | 584 | Tooltip — search toggle | `"Close search"` / `"Find a chord"` |
| `components/ChordExplorer.tsx` | 608 | Row label | `"Root"` |
| `components/ChordExplorer.tsx` | 637 | Row label | `"Filter"` |
| `components/ChordExplorer.tsx` | 643 | Filter button labels | `"Common"` / `"Extended"` |
| `components/ChordExplorer.tsx` | 652 | Row label | `"Hand"` |
| `components/ChordExplorer.tsx` | 654 | Tooltip — all chords | `"All chords"` |
| `components/ChordExplorer.tsx` | 655 | Tooltip — one-hand | `"One-hand chords"` |
| `components/ChordExplorer.tsx` | 658 | Tooltip — two-hand | `"Two-hand chords"` |
| `components/ChordExplorer.tsx` | 669 | Row label | `"Notes"` |
| `components/ChordExplorer.tsx` | 683 | Row label | `"Progressions"` |
| `components/ChordExplorer.tsx` | 697 | Dropdown display | `"{progression} ▾"` / `"None ▾"` |
| `components/ChordExplorer.tsx` | 702 | Tooltip — clear progression | `"Clear progression"` |
| `components/ChordExplorer.tsx` | 739 | Row label | `"Inversions"` |
| `components/ChordExplorer.tsx` | 743 | Tooltip — inversions off | `"Inversions off"` |
| `components/ChordExplorer.tsx` | 751 | Tooltip — sequential | `"Sequential inversions"` |
| `components/ChordExplorer.tsx` | 759 | Tooltip — random | `"Random inversions"` |
| `components/ChordExplorer.tsx` | 827 | Empty search results | `"No results"` |
| `components/ChordExplorer.tsx` | 844 | Row label | `"Show as"` |
| `components/ChordExplorer.tsx` | 874 | Section label | `"Play Inversion"` |
| `components/ChordExplorer.tsx` | 912 | Cross-link to Scale Explorer | `"Scale Explorer →"` |

### Progression Names (Chord Explorer)

| File | Line | What it is | Current values |
|---|---|---|---|
| `components/ChordExplorer.tsx` | Various | Dropdown progression names | `"Pop"`, `"Doo-Wop"`, `"Rock · Blues"`, `"Jazz Standard"`, `"Andalusian"`, `"Pachelbel"`, `"Minor Pop"`, `"Pop/Rock Inv."`, `"Epic · Heroic"`, `"Royal Road"`, `"Sentimental"`, `"Sad · Hopeful"`, `"Mixolydian Rock"`, `"Plagal Turnaround"`, `"Minor Jazz"`, `"Step-Down"`, `"Circle of Fifths"`, `"Energetic Pop"`, `"Minor Blues"`, `"Grunge · Modal"` |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/ChordExplorer.tsx` | Modal header, row labels, chord cards, buttons | 8, 9, 10, 11, 12, 13, 14 |

---

## 7. Scale Explorer

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/ScaleExplorer.tsx` | 619 | Modal title | `"Scale Explorer"` |
| `components/ScaleExplorer.tsx` | 643 | Guideline line 1 | `"Click a key on the circle to explore its scale and"` |
| `components/ScaleExplorer.tsx` | 644 | Guideline line 2 | `"diatonic chords. Select a progression and click play"` |
| `components/ScaleExplorer.tsx` | 645 | Guideline line 3 | `"to hear the chords in the scale. Try inversions!"` |
| `components/ScaleExplorer.tsx` | 649 | Row label | `"Scale"` |
| `components/ScaleExplorer.tsx` | 715 | SVG label — major | `"Harmonic Major"` |
| `components/ScaleExplorer.tsx` | 726 | SVG label — minor | `"Natural Minor"` |
| `components/ScaleExplorer.tsx` | 758 | Circle-of-fifths label line 1 | `"Circle"` |
| `components/ScaleExplorer.tsx` | 761 | Circle-of-fifths label line 2 | `"of Fifths"` |
| `components/ScaleExplorer.tsx` | 766 | Section header | `"Chords in the Scale"` |
| `components/ScaleExplorer.tsx` | 774 | Empty state | `"Select a key from the circle above to see diatonic chords"` |
| `components/ScaleExplorer.tsx` | 831 | Row label | `"Chord Quality"` |
| `components/ScaleExplorer.tsx` | 859 | Row label | `"Key"` |
| `components/ScaleExplorer.tsx` | 872 | Row label | `"Progressions"` |
| `components/ScaleExplorer.tsx` | 889 | Dropdown placeholder | `"Pick a pattern …"` |
| `components/ScaleExplorer.tsx` | 932 | Row label | `"Inversions"` |
| `components/ScaleExplorer.tsx` | 968 | Row label | `"Show As"` |
| `components/ScaleExplorer.tsx` | 991 | Section label | `"Play Inversion"` |
| `components/ScaleExplorer.tsx` | 1008 | Tooltip — reset button | `"Clear & reset"` |
| `components/ScaleExplorer.tsx` | 1022 | Cross-link to Chord Explorer | `"Chord Explorer"` (with arrow icon) |

### Progression Names (Scale Explorer)

| File | Line | What it is | Current values |
|---|---|---|---|
| `components/ScaleExplorer.tsx` | Various | Dropdown progression names | Same set as Chord Explorer (see §6) |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/ScaleExplorer.tsx` | Modal header, row labels, SVG text, buttons | 8, 9, 10, 11, 12, 13, 16 |

---

## 8. MIDI Playback Editor

> The MIDI Editor is rendered at `#/editor` by `App.tsx`. Check `components/MidiEditor/` for its strings — no strings were found outside that subtree during this audit. If the folder grows, re-run the audit for that path.

---

## 9. Floating Keyboard

### Strings

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/Keyboard/FloatingKeyboard.tsx` | 133 | Title bar text | `"Keyboard"` |
| `components/Keyboard/FloatingKeyboard.tsx` | 139 | Tooltip — dock button | `"Dock keyboard"` |
| `components/Keyboard/FloatingKeyboard.tsx` | 149 | Tooltip — close button | `"Close floating keyboard"` |

### Inline Colors

| File | Line | Color | Usage |
|---|---|---|---|
| `components/Keyboard/FloatingKeyboard.tsx` | 104 | `#2a2a3a` | Floating window border |

### Inline Font Sizes

| File | Context | Sizes (px) |
|---|---|---|
| `components/Keyboard/FloatingKeyboard.tsx` | Title bar | 9 |

---

## Misc — Shared Controls

| File | Line | What it is | Current value |
|---|---|---|---|
| `components/VolumeKnob.tsx` | 139 | Knob label | `"VOLUME"` |
| `components/SpeedControl.tsx` | 32 | Control label | `"Speed"` |
| `components/SpeedControl.tsx` | 11 | Speed option label (slow) | `"Slow"` |
| `components/SpeedControl.tsx` | 12 | Speed option label (medium) | `"Medium"` |
| `components/SpeedControl.tsx` | 13 | Speed option label (fast) | `"Fast"` |

---

## Design Token Reference (for context)

These values appear repeatedly in inline styles. They are not CSS variables in this project — they are repeated inline. Editing the hex in one place does **not** update all usages; search for the literal string to find all occurrences.

| Token name | Value | Role |
|---|---|---|
| Amber accent | `#e8a027` | Active states, highlights |
| Inactive text | `#707088` | Default UI text/icons |
| Active value text | `#b0b0cc` | Current values, selected items |
| Dim labels | `#404055` | Section labels |
| Dark background | `#0f0f12` | Body + panels (dark theme) |
| Warm background | `#12100e` | Body (warm theme) |
| Panel background | `#1a1a22` | Drawers, modals |
| Top bar | `#111116` | Transport bar background |
| Top bar border | `#1e1e28` | Transport bar bottom border |
| White key | `#e8e8e8` | Piano white key fill |
| Black key | `#1a1a22` | Piano black key fill |
| Float border | `#2a2a3a` | Floating keyboard border |
