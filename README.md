# Orfeo 🎹

**A modern piano learning and MIDI visualization desktop app for Windows.**

Upload any MIDI file, watch notes fall onto a virtual keyboard in real time, follow along at your own pace, and learn piano the visual way.

> ⚠️ **Early development** — v0.1.0 scaffold. Not yet functional for end users.

---

## Features (in development)

- 🎵 **MIDI file import** — open any `.mid` or `.midi` file
- 🎹 **Falling note piano roll** — notes fall downward onto a 61/73/88 key virtual keyboard
- 🎨 **Track manager** — mute, solo, recolor individual tracks
- 🎼 **Real-time chord detection** — see the chord name as notes play
- 🌍 **Note naming systems** — English (B), Central European (H), Solfège (Do Re Mi), or hidden
- ⌨️ **Hardware MIDI keyboard** — plug in and keys light up automatically
- 🎚️ **Tempo control** — slow down or speed up without changing pitch
- 🔊 **High-quality audio** — WAV/AIFF samples, not GM soundfonts

## Tech Stack

- **Electron** + **Vite** + **React** + **TypeScript**
- **PixiJS** for WebGL piano roll rendering
- **Tone.js** for audio
- **@tonejs/midi** for MIDI parsing
- **tonal.js** for music theory / chord detection
- **Zustand** for state management
- **Tailwind CSS** for styling

## Development Setup

### Prerequisites

- [Node.js 24 LTS](https://nodejs.org)
- [Git](https://git-scm.com)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/SquareBow/orfeo.git
cd orfeo

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
npm run build
```

## Roadmap

- **Phase 1** — Core app: MIDI playback, piano roll, keyboard visualization, audio
- **Phase 2** — Chord library, licensing, playlist, installer
- **Phase 3** — VST3 plugin (JUCE/C++)

See [docs/ROADMAP.md](docs/ROADMAP.md) for details.

## Contributing

Contributions welcome! Please open an issue before submitting a PR.

## License

MIT © [SquareBow](https://github.com/SquareBow)
