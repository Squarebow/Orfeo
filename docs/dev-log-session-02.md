# Orfeo — Dev Log Session 02
**Date:** 2026-06-14  
**Version:** 0.2.1  
**Session focus:** Phase 1b — MIDI playback, falling notes, audio engine, key lighting

---

## What Was Built This Session

### Phase 1b — Core Playback

**MIDI file open dialog**
- `electron/main.ts` — added `dialog:openMidi` IPC handler, reads file as base64
- `electron/preload.ts` — exposes `window.electronAPI.openMidiFile()` via contextBridge
- `src/hooks/useMidiFile.ts` — decodes base64, calls parser, populates store
- Fixed preload output format: electron-vite v3 builds preload as `.cjs`, not `.js` — `main.ts` updated to reference `preload.cjs`

**MIDI parser** (`src/utils/midiParser.ts`)
- Parses `@tonejs/midi` output into `ParsedMidi` / `ParsedTrack` / `ParsedNote` types
- Assigns track colors cycling through palette (amber → slate → teal → rose → green...)
- Skips tracks with no notes
- Computes total duration, BPM, time signature

**PixiJS piano roll** (`src/components/PianoRoll/PianoRoll.tsx`)
- Multiple rewrites to fix PixiJS v8 breaking changes:
  - `resizeTo` option removed (caused `_cancelResize` crash)
  - `renderer.on('resize')` replaced with `ResizeObserver`
  - Safer destroy on cleanup (detach canvas before destroy)
- Final architecture: single `Graphics` object per layer (grid, notes, playhead)
- PixiJS `ticker` drives animation at 60fps, reads store via `useStore.getState()` directly (no React re-render dependency)
- Notes fall downward, playhead at 80% down screen
- Vertical lane lines for each key, brighter on C notes
- Note rendering: rounded rect body + bright top cap

**Visual clock** (`src/hooks/usePlayback.ts`)
- `requestAnimationFrame` loop using `performance.now()` for smooth 60fps
- Subscribes to Zustand store — stops RAF when `playbackState` changes externally
- Handles loop regions, tempo ratio, seek
- `seekAndPlay()` for scrub-on-release behavior

**Tone.js audio engine** (`src/hooks/useAudioEngine.ts`)
- Multiple approaches tried and abandoned:
  - `setTimeout` polling — jittery, drifts badly
  - `soundfont-player` CDN — no sound in Electron (network blocked)
  - Web MIDI API — no MIDI output devices found in Electron renderer
  - WebAudioFont CDN — network blocked
  - `triggerAttackRelease` with absolute timestamps — couldn't pause/cancel
- **Final approach:** `Tone.Part` objects scheduled via `Tone.Transport`
  - All notes scheduled upfront when play pressed
  - Mute/solo checked **inside Part callback in real time** — no rebuild on mute
  - `Tone.Transport.stop()` + `cancel()` on pause/stop — cleanly cancels all scheduled notes
  - Master `Tone.Limiter(-6dB)` on output — eliminates crackling from polyphony
  - GM program families mapped to distinct Tone.js synth timbres (triangle/sine/square/sawtooth)
  - Piano family (programs 0–7) identified as `isPianoProgram()`
  - Drum channel (ch 9) skipped

**Key lighting**
- `activeKeys: Set<number>` and `activeKeyColors: Map<number, string>` in Zustand store
- Only piano-family tracks light keys (programs 0–7)
- Key color matches track color
- `Tone.getDraw().schedule()` syncs key light-up to audio clock
- Keys light in track color (amber for track 1, slate for track 2, etc.)

**Piano keyboard** (`src/components/Keyboard/Keyboard.tsx`)
- 61/73/88 key ranges, switchable
- White + black key layers, correct proportions
- Active keys glow in track color with box-shadow
- C note labels (C1–C8)

**Track panel** (`src/components/TrackPanel/TrackPanel.tsx`)
- Mute (M), Solo (S), Visible (V) per track
- Color swatches
- Collapsible drawer

**Top bar** (`src/components/Transport/TopBar.tsx`)
- Centered transport controls (back / play / stop / forward / loop)
- Scrub bar with timestamps — pauses on mousedown, resumes on mouseup
- Tempo slider with % display and reset button
- Left: Open button + filename
- Right: Tempo controls

---

## Technical Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| PixiJS animation | Ticker-based, reads store directly | React re-renders too slow for 60fps |
| Visual clock | `performance.now()` + rAF | Smooth, decoupled from audio |
| Audio engine | `Tone.Part` + `Tone.Transport` | Clean pause/cancel, correct scheduling |
| Mute handling | Real-time check inside callback | No rebuild = no glitch/pause |
| Key lighting | Piano tracks only | Prevents rainbow chaos on multi-instrument files |
| Soundfont | Tone.js synth (offline) | CDN/Web MIDI blocked in Electron renderer |
| Preload format | `.cjs` | electron-vite v3 output format |

---

## Known Issues / Next Steps

### Audio
- Tone.js synths are approximations — real piano samples needed for Phase 2
- Drum tracks skipped entirely (channel 9)
- No volume/pan per track yet (sliders in track panel are visual only)

### Features Not Yet Built (Phase 1c onwards)
- Settings panel (note naming, merge tracks, soundfont selector)
- Merge piano channels feature
- Chord detection + display in top bar
- Hardware MIDI keyboard input
- MIDI export with muted tracks removed
- Loop region drag selection
- Zoom slider for piano roll
- Bar ruler (left edge numbers)
- Floating keyboard mode

### Bugs to Fix
- Playhead line visible but could be more subtle
- Track panel volume/pan sliders not wired to audio
- No error handling if MIDI file is corrupt

---

## Environment

| Tool | Version |
|---|---|
| Node.js | v24.16.0 |
| npm | v11.13.0 |
| Electron | v35.7.5 (binary manually installed — auto-download blocked by network) |
| electron-vite | v3.x |
| PixiJS | v8.x |
| Tone.js | v15.1.22 |
| React | v19.x |
| Zustand | v5.x |
| @tonejs/midi | v2.0.28 |

### Known Environment Quirks
- Electron binary must be manually downloaded from GitHub releases and placed in `node_modules/electron/dist/`
- `node_modules/electron/path.txt` must contain `electron.exe` (not `dist/electron.exe`)
- `postcss.config.js` from old scaffold must be deleted (conflicts with Tailwind v4)
- Tailwind v4 uses `@import "tailwindcss"` not `@tailwind base/components/utilities`
- Preload builds as `preload.cjs` — referenced explicitly in `main.ts`
