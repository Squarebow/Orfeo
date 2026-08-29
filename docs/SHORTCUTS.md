# Orfeo — Keyboard & Mouse Shortcuts

*Every implemented shortcut and special mouse gesture, grouped by where it
applies.*

Plain single clicks on visible buttons and icons are **not** listed — only
combinations, modifiers, and gestures that are not obvious from the UI.

> [!NOTE]
> On macOS builds, use `Cmd` wherever `Ctrl` is shown. Shortcuts do not fire
> while a text field is focused.

---

## Contents

- [Global / Transport](#global--transport)
- [Piano Roll — playback view](#piano-roll--playback-view)
- [Note Editor — edit mode](#note-editor--edit-mode)
- [Virtual Keyboard](#virtual-keyboard)
- [Mixer — Console Mixer and Track Panel](#mixer--console-mixer-and-track-panel)
- [Track Panel](#track-panel)
- [Library](#library)
- [Playback Editor / File Info modal](#playback-editor--file-info-modal)
- [Modals — everywhere](#modals--everywhere)

---

## Global / Transport

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause (ignored while the Chord or Scale Explorer is open) |
| `Escape` | Stop playback. If Presentation Mode, the Chord Explorer, the Scale Explorer, or the Locked-Chord modal is open, that closes first instead — without stopping playback |
| `F11` | Toggle Presentation Mode |
| `Ctrl+O` | Open a MIDI file |
| `Ctrl+Shift+M` | Toggle the Console Mixer |
| Long-press the BPM `▲` / `▼` | Repeatedly nudge tempo by ±1 while held |

---

## Piano Roll — playback view

| Gesture | Action |
|---|---|
| Mouse wheel | Scrub playback position, ±2 s per notch |
| `Shift` + wheel | Fine scrub, ±0.15 s per notch |
| `Alt` + drag (on the roll or the loop waterfall strip) | Precise-timing loop-region selection |
| Drag (loop strip) | Select a bar range for the loop region |
| Double-click (loop strip or roll) | Clear the loop region |

---

## Note Editor — edit mode

Available on the Piano Roll once Note Editor edit mode is active.

### Selection and editing

| Gesture | Action |
|---|---|
| Select tool — click | Select / move a note |
| Select tool — drag a note edge | Resize the note |
| Select tool — drag a selected note | Move the whole selection |
| `Shift` + click a note | Add / remove that note from a multi-selection |
| Marquee tool — drag | Box-select notes |
| Marquee tool — `Shift` + drag | Add to the selection |
| Lasso tool — drag | Freehand-select notes |
| Lasso tool — `Shift` + drag | Add to the selection |
| Pen tool — `Alt` + click empty space | Add a note |
| Pen tool — click an existing note | Mark the note for deletion |

### Velocity lane

| Gesture | Action |
|---|---|
| Drag up / down | Edit a note's velocity |
| Drag up / down on a multi-selected note | Shift every selected note's velocity together, preserving their relative shape |
| Right-click → **Flatten Velocity** (2+ notes selected) | Set every selected note to the same velocity — their current average |

### Keys and context menu

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected note(s) |
| `Escape` | Close the note-edit context menu |
| Right-click a note | Context menu: Assign to Left / Right Hand, Flatten Velocity, Deselect, Undo, Redo, Delete |

---

## Virtual Keyboard

| Gesture | Action |
|---|---|
| `Shift` + click 3 or more keys | Build and lock a chord (Lock-a-Chord) |
| Click + drag across keys | Glissando |

---

## Mixer — Console Mixer and Track Panel

| Shortcut / gesture | Action |
|---|---|
| Arrow keys (on any fader or knob) | Adjust the value |
| `Shift` + Arrow | Coarse step (×5) |
| `Home` / `End` | Jump to minimum / maximum |
| Drag a channel strip | Reorder it |
| Mouse wheel over the strip row | Horizontally scroll the channel strips |
| `Escape` | Close the Mixer |

---

## Track Panel

| Gesture | Action |
|---|---|
| Drag | Reorder tracks and groups — the Piano track stays pinned and is never draggable |

---

## Library

| Shortcut / gesture | Action |
|---|---|
| `Ctrl` / `Cmd` + click | Toggle a row in a multi-selection |
| `Shift` + click | Select a range from the last-clicked row |
| Drag file(s) | Move them into a folder |
| Right-click | Context menu — rename, delete, move, show in folder, and more |

---

## Playback Editor / File Info modal

| Shortcut / gesture | Action |
|---|---|
| Double-click a name field | Edit it inline |
| `Enter` | Commit the inline edit |
| `Escape` | Cancel the inline edit, or close the modal |

---

## Modals — everywhere

| Shortcut | Action |
|---|---|
| `Escape` | Close the Chord Explorer, Scale Explorer, Locked-Chord modal, or a confirm dialog |

---

### Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is structured
- [CONTRIBUTING.md](CONTRIBUTING.md) — building from source
- [INSTALLATION.md](INSTALLATION.md) — installer vs. portable
