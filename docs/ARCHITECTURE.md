# Orfeo — Architecture

Technical decisions and reasoning for future contributors.

## Framework: Electron + Vite + React + TypeScript

**Why Electron over .NET/C#?**
- JavaScript ecosystem has richer MIDI, audio, and music theory libraries
- Web MIDI API built into Chromium — no extra drivers needed
- PixiJS/WebGL available directly in the renderer
- Easier for non-C++ developers to contribute
- Single language (TypeScript) throughout

**Why Vite over Webpack/CRA?**
- 10-100x faster HMR (hot module reload) during development
- electron-vite handles the main/preload/renderer split cleanly

## Rendering: PixiJS (WebGL)

**Why not plain HTML Canvas or SVG?**
- Large MIDI files (e.g. orchestral, 30+ tracks) can have thousands of simultaneous notes
- PixiJS uses WebGL with batched draw calls — handles this with no frame drops
- SVG would become extremely slow at this scale
- Plain Canvas 2D is acceptable for small files but not scalable

## State Management: Zustand

**Why not Redux?**
- Zustand has minimal boilerplate — much simpler for a solo/small-team project
- Supports persistence middleware (for saving user settings)
- TypeScript support is excellent
- Easy to split into logical slices without Redux's complexity

## Audio: Tone.js + WAV/AIFF samples

**Why not Web Audio API directly?**
- Tone.js provides precise musical timing on top of Web Audio
- Handles tempo changes cleanly
- Pitch-independent tempo change is built in via Tone.Transport

**Why not GM soundfonts (SF2)?**
- GM soundfonts sound artificial and plasticky
- WAV/AIFF samples of real instruments sound dramatically better
- Users can provide their own sample libraries in Phase 2

## MIDI Parsing: @tonejs/midi

- Most mature MIDI parsing library in the JS ecosystem
- Handles all MIDI file types (0, 1, 2)
- Clean TypeScript API
- Actively maintained

## Music Theory: tonal.js

- Comprehensive music theory library
- Chord detection, note names, scales, intervals
- Supports all standard chord types and inversions
- Used for real-time chord display and the chord library (Phase 2)

## IPC Architecture (Electron)

```
Renderer (React) ←→ preload.ts (contextBridge) ←→ main.ts (Node.js)
```

- `contextBridge` exposes only specific safe APIs to the renderer
- File system access, native dialogs — all handled in main process
- Renderer never has direct Node.js access (security)

## File Structure Rationale

```
electron/     — main process only (Node.js APIs, file system, dialogs)
src/          — renderer process (React, all UI)
  components/ — UI components, organized by feature area
  hooks/      — React hooks encapsulating business logic
  store/      — Zustand global state
  utils/      — Pure functions (no React dependencies)
  types/      — Shared TypeScript interfaces
docs/         — Project documentation
```

## Note Naming

The Central European system (used in Slovenia, Germany, Croatia, Czech Republic, etc.) uses:
- **H** for B natural
- **B** for B♭

This is handled in `src/utils/noteNames.ts` and applied globally via the `noteNaming` setting in the Zustand store. Every component that displays note names reads from this setting rather than hardcoding English names.
