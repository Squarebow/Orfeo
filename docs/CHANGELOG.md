# Changelog

All notable changes to Orfeo are documented here.
Format: [Semantic Versioning](https://semver.org)

---

## [0.1.0] — 2026-06 — Initial Scaffold

### Added
- Complete project folder structure and file scaffold
- Electron + Vite + React + TypeScript setup
- PixiJS integration for piano roll rendering
- Zustand global state store (playback, tracks, keyboard, settings)
- MIDI file parsing via `@tonejs/midi`
- Chord detection via `tonal.js`
- Note naming systems: English, Central European (H), Solfège, Hidden
- Hardware MIDI keyboard input via Web MIDI API
- Virtual keyboard component (61/73/88 keys, docked/floating modes)
- Track panel with mute/solo/visible toggles and volume/pan controls
- Settings modal with note naming and display options
- Top bar with transport controls, tempo slider, chord display
- Bar ruler left edge component
- Amber gold (`#e8a027`) design theme on dark background (`#0f0f12`)
- Inter + JetBrains Mono typography
- Global CSS variables and Tailwind configuration
- README, CHANGELOG, ROADMAP, ARCHITECTURE documentation

### Technical decisions
- PixiJS chosen over plain Canvas for WebGL performance with large MIDI files
- Zustand over Redux for simpler boilerplate
- electron-vite for fast HMR in development
- Central European note naming (H = B natural) added for Slovenian/German/Croatian users

---

*Next: npm install → npm run dev → first visual render*
