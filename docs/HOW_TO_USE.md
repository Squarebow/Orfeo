# Orfeo — How to Use

> This document is updated as features are built. Current status: v0.1.0 scaffold.

---

## Getting Started

### Opening a MIDI File

1. Click the **folder icon** in the top left, or press `Ctrl+O`
2. Browse to your `.mid` or `.midi` file and click Open
3. The piano roll will populate with colored note blocks
4. The track panel on the right lists all tracks in the file

### Playing Back

Use the transport controls in the top bar:

| Button | Action |
|---|---|
| ▶ Play | Start playback |
| ⏸ Pause | Pause at current position |
| ⏹ Stop | Stop and return to beginning |
| ⏮ Skip back | Jump to beginning |
| ⏭ Skip forward | Jump to end |
| 🔁 Loop | Toggle loop mode |

### Adjusting Tempo

- Use the **tempo slider** next to the metronome icon (♩) in the top bar
- The BPM value updates in real time
- The **%** button shows how much you've changed from the original tempo
- Click the **%** value to reset to the original tempo

---

## The Piano Roll

Notes fall **downward** toward the keyboard in time with the music. Each track has its own color. The width of each note block corresponds to the key it belongs to on the keyboard below.

### Zoom

*(Coming in Phase 1e)* — use the zoom slider to see more or fewer bars at once.

### Loop Region

*(Coming in Phase 1b)* — drag across the bar ruler on the left to select a loop region.

---

## The Virtual Keyboard

### Key Sizes

Switch between **61, 73, or 88 keys** using the buttons in the bottom control strip.

### Docked vs Floating

- **Docked** (default): keyboard is fixed at the bottom of the piano roll. Notes land directly on the correct keys.
- **Floating**: click the "Floating" button in the bottom strip. The keyboard becomes a draggable panel you can position anywhere on screen.

### Playing Notes

Click any key on the virtual keyboard to hear that note. Keys light up in the track color when notes play.

---

## Track Panel

Open the track panel by clicking the **→ arrow** in the top right corner.

For each track you can:

| Control | Action |
|---|---|
| **M** | Mute — silence this track |
| **S** | Solo — hear only this track |
| **V** | Visible — show/hide in piano roll |
| Vol slider | Adjust playback volume |
| Pan slider | Adjust stereo position (L/C/R) |

---

## Hardware MIDI Keyboard

Connect your MIDI keyboard via USB before launching Orfeo. When detected:

- A green dot and the device name appear in the top bar
- Press any keys — they light up on the virtual keyboard
- The chord you're playing is detected and displayed in the top bar

No MIDI keyboard? Orfeo works fully without one — click the virtual keyboard with your mouse.

---

## Chord Display

The chord name is shown in the top bar in real time, based on:
- Notes currently playing from the MIDI file
- Keys pressed on your hardware MIDI keyboard
- Keys clicked with the mouse

---

## Settings

Click the **⚙ gear icon** in the top right to open Settings.

### Note Names

Choose how note names are displayed on the keyboard and in chord names:

| Option | Example |
|---|---|
| English | C D E F G A **B** |
| Central European | C D E F G A **H** (B = B♭) |
| Solfège | Do Re Mi Fa Sol La Si |
| Hidden | No labels |

---

## Keyboard Shortcuts

*(Full list coming in Phase 1e)*

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `Ctrl+O` | Open MIDI file |
| `Escape` | Stop |

---

*More features documented as they are built.*
