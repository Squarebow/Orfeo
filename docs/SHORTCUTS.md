# Orfeo — Keyboard & Mouse Shortcuts

Reference list of every implemented shortcut and special mouse gesture,
grouped by where they apply. Plain single clicks on buttons/icons aren't
listed — only combos, modifiers, and gestures that aren't obvious from the UI.

## Global / Transport

| Shortcut | Action |
|---|---|
| `Space` | Play / Pause |
| `Escape` | Stop playback; also closes Presentation Mode / Chord Explorer / Scale Explorer / Locked-Chord modal first if one's open |
| `F11` | Toggle Presentation Mode |
| `Ctrl+O` | Open MIDI file |
| `Ctrl+Shift+M` | Toggle Console Mixer |
| Long-press BPM ▲/▼ | Repeatedly nudges tempo ±1 while held |

## Piano Roll (playback view)

| Shortcut | Action |
|---|---|
| Mouse wheel | Scrub playback position, ±2s per notch |
| `Shift`+wheel | Fine scrub, ±0.15s per notch |
| `Alt`+drag (on the roll or the loop waterfall strip) | Precise-timing loop-region selection |
| Drag (loop strip) | Select a bar range for the loop region |
| Double-click (loop strip/roll) | Clear the loop region |

## Note Editor (edit mode, on the Piano Roll)

| Shortcut | Action |
|---|---|
| Select tool: click | Select/move a note |
| Select tool: drag edge | Resize a note |
| Select tool: drag selected note | Move the whole selection |
| `Shift`+click a note | Add/remove that note from multi-selection |
| Marquee tool: drag | Box-select notes |
| Marquee tool: `Shift`+drag | Add to selection |
| Lasso tool: drag | Freehand-select notes |
| Lasso tool: `Shift`+drag | Add to selection |
| Pen tool: `Alt`+click empty space | Add a note |
| Pen tool: click existing note | Mark note for delete |
| Right-click a note | Context menu (Assign L/R hand, Flatten Velocity, Deselect, Undo, Redo, Delete) |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected note(s) |
| `Escape` | Close the note-edit context menu |
| Drag up/down (velocity lane) | Edit a note's velocity |
| Drag up/down (velocity lane, on a multi-selected note) | Shift every selected note's velocity together, preserving their relative shape |
| Right-click → "Flatten Velocity" (2+ notes selected) | Set every selected note to the same velocity (their current average) |

## Virtual Keyboard

| Shortcut | Action |
|---|---|
| `Shift`+click 3+ keys | Build & lock a chord |
| Click + drag across keys | Glissando |

## Mixer (Console Mixer + Track Panel)

| Shortcut | Action |
|---|---|
| Arrow keys (on any fader/knob) | Adjust value |
| `Shift`+Arrow | Coarse step (×5) |
| `Home` / `End` | Min / max |
| Drag a channel strip | Reorder it |
| Mouse wheel over the strip row | Horizontal-scroll the channel strips |
| `Escape` | Close the Mixer |

## Track Panel

| Shortcut | Action |
|---|---|
| Drag | Reorder tracks/groups (Piano stays pinned, never draggable) |

## Library

| Shortcut | Action |
|---|---|
| `Ctrl`/`Cmd`+Click | Toggle a row in multi-selection |
| `Shift`+Click | Select a range from the last-clicked row |
| Drag file(s) | Move into a folder |
| Right-click | Context menu (rename, delete, move, show in folder, etc.) |

## Playback Editor / File Info Modal

| Shortcut | Action |
|---|---|
| Double-click a name field | Edit inline |
| `Enter` | Commit the inline edit |
| `Escape` | Cancel the inline edit / close the modal |

## Everywhere (modals)

| Shortcut | Action |
|---|---|
| `Escape` | Closes Chord Explorer, Scale Explorer, Locked-Chord modal, confirm dialogs |
