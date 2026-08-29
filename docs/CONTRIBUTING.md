# Contributing to Orfeo

*Everything you need to build Orfeo from source, run it in development, and cut
a release.*

Contributions are welcome. **Please open an issue before starting a PR** so the
approach can be agreed first — it saves everyone a wasted round-trip.

- Bugs and feature ideas: [GitHub Issues](https://github.com/Squarebow/Orfeo/issues)
- How the code fits together: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Build commands](#build-commands)
- [Project layout](#project-layout)
- [Coding conventions](#coding-conventions)
- [Releases and auto-update](#releases-and-auto-update)
- [Tech stack](#tech-stack)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 LTS or newer | Electron 42 needs Node 20+ |
| [Git](https://git-scm.com) | any recent | — |

No native build tools are required — Orfeo has no compiled native modules.

---

## Setup

```bash
git clone https://github.com/Squarebow/Orfeo.git
cd Orfeo
npm install
npm run dev
```

`npm run dev` launches the Electron app with hot-reloading renderer code.

> [!NOTE]
> `dev`, `build`, and `dist` automatically run two pre-steps first:
> `copyworklet` (copies the SpessaSynth AudioWorklet into `public/`) and
> `check:hand-engine` (fails if `HAND_ENGINE_VERSION` was not bumped after a
> hand-algorithm change). You never call these directly.

---

## Build commands

| Command | What it does | Output |
|---|---|---|
| `npm run dev` | Development mode, renderer hot-reload | — |
| `npm run build` | Compile main + preload + renderer | `out/` |
| `npm run preview` | Run the last `build` output without packaging | — |
| `npm run typecheck` | `tsc --noEmit` — type-check only | — |
| `npm run dist` | `build`, then package for the current platform | `release/` |
| `npm run dist:portable` | Windows portable `.exe` only (no installer) | `release/` |

<details>
<summary><b>Cross-platform packaging</b></summary>

`npm run dist` passes any extra flags straight through to `electron-builder`:

| Command | Result |
|---|---|
| `npm run dist -- --mac` | macOS `.dmg` (must run **on** macOS) |
| `npm run dist -- --linux` | Linux build with electron-builder defaults |
| `npm run dist -- --dir` | Unpacked build for inspection, no installer |

`package.json`'s `build` block defines explicit `win` and `mac` target lists but
**no `linux` block** — Linux packaging falls back to electron-builder's
defaults. Add a `linux` block there if you need to pin specific formats
(AppImage / deb / rpm / …).

</details>

---

## Project layout

```text
electron/    Main process — Node.js, filesystem, dialogs, auto-update
src/         Renderer — React UI, PixiJS roll, audio, Web MIDI
  components/  UI by feature area
  hooks/       Runtime logic
  store/       Zustand global store
  utils/       Pure functions (unit-testable, no React)
  types/       Shared interfaces
scripts/     Build helpers
build/       NSIS installer assets
docs/        Documentation
```

Full rationale for each boundary is in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Coding conventions

| Area | Convention |
|---|---|
| Language | TypeScript throughout; `npm run typecheck` must pass |
| Dependency direction | `components → hooks → store/utils → types`, never the reverse |
| `src/utils/` | Pure functions only — no React imports, no side effects |
| User-facing strings | Wrap new strings in the `t()` helper from `src/utils/i18n.ts` |
| Layout | CSS Grid for multi-column rows; theme via CSS custom properties, not hardcoded colours |
| Commits | One-line summary, imperative mood; detail goes in `docs/CHANGELOG.md`, not the commit body |

---

## Releases and auto-update

Orfeo officially builds only **Windows** binaries. That is the only platform
with a real release pipeline and the only one the in-app auto-update
(`electron-updater`, in `electron/main.ts`) targets.

<details>
<summary><b>Why no official macOS / Linux builds</b></summary>

`electron-updater` assumes the app checking for updates was built and published
through the *same* pipeline as the update feed it points at. A community-built
macOS or Linux binary is not — nobody but the person who built it controls how
or when it is rebuilt. Pointing its auto-updater at Orfeo's official GitHub
release feed would be actively wrong: it could offer an "update" that does not
match how that binary was built, or silently never fire.

So: **no auto-update on macOS/Linux, by design.** Users on those platforms
check the [Releases](https://github.com/Squarebow/Orfeo/releases) page manually.
The Settings "Check for updates" button already does the right thing there — it
opens that page instead of trying to auto-check.

</details>

### Cutting a Windows release (maintainers)

| Step | Command / action |
|---|---|
| 1. Bump the version | Edit `version` in `package.json`, then `git commit -am "Release vX.Y.Z"` and `git tag vX.Y.Z` |
| 2. Build and publish | `GH_TOKEN=<token-with-repo-scope> npm run dist` — uploads the installer, the portable `.exe`, **and** `latest.yml` to the matching GitHub release |
| 3. Publish the release | Flip the draft GitHub release to published once the upload finishes |

> [!IMPORTANT]
> `latest.yml` is what makes auto-update work. Without it `electron-updater`
> has nothing to check against, even if the executables themselves are
> uploaded.

<details>
<summary><b>Contributing a macOS / Linux build (community)</b></summary>

1. Run `npm run dist -- --mac` or `npm run dist -- --linux` locally **on that
   platform**.
2. Upload the artifact as an **additional asset on the same GitHub release**,
   named so it is unmistakably unofficial and unsigned, e.g.
   `Orfeo-X.Y.Z-macOS-community.dmg`,
   `Orfeo-X.Y.Z-Linux-community.AppImage`.
3. **Do not** upload a `latest-mac.yml` / `latest-linux.yml` alongside it unless
   you are committing to maintain a real update feed for that platform going
   forward. An unmaintained one is worse than none — it tells
   `electron-updater` an update channel exists when nobody is behind it.

</details>

---

## Tech stack

| Layer | Technology |
|---|---|
| App framework | Electron + Vite + React 19 + TypeScript |
| Bundler | electron-vite |
| Piano-roll rendering | PixiJS 8 (WebGL) |
| Effect animation | GSAP |
| MIDI parsing | `@tonejs/midi` |
| MIDI writing / meta events | `midi-file` |
| Foreign-format import | `@coderline/alphatab` (MusicXML, Guitar Pro, Capella, KAR) |
| GM Synth engine | `jzz` + `jzz-midi-smf` + `jzz-synth-tiny` |
| Samples engine | `spessasynth_lib` (SpessaSynth, AudioWorklet) |
| Music theory | `tonal` |
| Chord-chart PDF | `pdfkit` |
| Fuzzy search | `fuse.js` |
| State management | Zustand |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Auto-update | `electron-updater` (Windows only) |

---

### Related documents

- [ARCHITECTURE.md](ARCHITECTURE.md) — why each choice was made
- [INSTALLATION.md](INSTALLATION.md) — installer vs. portable
- [SHORTCUTS.md](SHORTCUTS.md) — keyboard and mouse reference
- [CHANGELOG.md](CHANGELOG.md) — release history
