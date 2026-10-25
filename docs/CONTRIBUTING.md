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
| [Rust](https://rustup.rs) + MSVC build tools | stable | Windows only, for the Native (beta) sound engine — see below |

The app runs without Rust: General MIDI and Samples need no native code, and
choosing *Native (beta)* without it built just falls back to Samples. To build
the Native engine (`native/`): install Rust with `rustup` (MSVC toolchain) and
Visual Studio Build Tools with *Desktop development with C++*, then run
`npm run native:build` once — it compiles the add-on and downloads the pinned
FluidSynth build into `native/build/`. `dist` runs it for you.

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
| `npm run native:build` | Builds the Native engine add-on + fetches FluidSynth (Windows) | `native/build/` |
| `npm run build` | Compile main + preload + renderer | `out/` |
| `npm run preview` | Run the last `build` output without packaging | — |
| `npm run typecheck` | `tsc --noEmit` — type-check only | — |
| `npm run dist` | `build`, then package for the current platform | `release/` |
| `npm run dist:portable` | Windows portable `.exe` only (no installer), for a quick local test | `release/` |

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

So: **no auto-update on macOS/Linux, by design** — same as the Windows
**portable** build (no installer for `electron-updater` to act on). Users on
any of these get new versions from [orfeo.cc/download](https://orfeo.cc/download),
which follows every GitHub release. `electron/main.ts` decides this once as `updateMode` (`'auto'`
for the installed Windows build, `'store'` for the Microsoft Store build,
`'manual'` for everything else) and the renderer reads it on mount via
`update:info`; in `'manual'` mode the Settings "Check for updates" button just
opens orfeo.cc/download in the browser (also the fallback when an automatic
update fails) — it never enters a checking/downloading state. In `'store'` mode
(`process.windowsStore`) the Store updates the app and the button opens Orfeo's
page in the Store app, with its *Update* button; `electron-updater` never runs
there, and the website is never offered, since either would install a second,
non-Store copy.

</details>

### Releasing a new version (maintainers)

Releases are built and published by GitHub Actions
(`.github/workflows/release.yml`), never from a local machine. A tag on its own
publishes nothing: a version becomes a release only when the workflow is run for
it.

| Step | Where | What |
|---|---|---|
| 1. Changelog | `docs/CHANGELOG.md` | A section `## [X.Y.Z] — D. M. YYYY — Title` at the top, optionally starting with an **In short** list of 2–4 lines, then `### New` / `### Changed` / `### Fixed`. Preview the notes with `npm run release:notes -- X.Y.Z`. |
| 2. Version and tag | Git | `version` in `package.json` set to `X.Y.Z`, committed, tagged `vX.Y.Z`; the commit, the tag and `main` pushed to GitHub. |
| 3. Run the workflow | GitHub → Actions → **Release** → **Run workflow** | Branch `main`, version `X.Y.Z`. Optional: *Pre-release* (installed copies don't update to it) and *Test run* (keeps the release as a draft). |
| 4. Microsoft Store | GitHub → Actions → **Microsoft Store** → **Run workflow** | Once the release is out: version `X.Y.Z`, `submit` (default) or `draft`. Not for pre-releases. See below. |

The workflow checks that the tag, `package.json` and the changelog agree,
builds the installer (`Orfeo-Setup-X.Y.Z.exe`) and the portable app
(`Orfeo-X.Y.Z-portable.exe`) on Windows from the tag, uploads them with
`latest.yml` and the blockmap, writes the release notes from the changelog and
publishes the release as *Latest*. It also builds the Microsoft Store package
(`Orfeo-X.Y.Z.appx`, from the same app folder) and keeps it with the run, for
step 4.

> [!IMPORTANT]
> `latest.yml` is what makes auto-update work, and `electron-updater` only sees
> **published** releases. A release left as a draft, or published without
> `latest.yml`, updates nobody.

Release notes come from the changelog on the branch the workflow runs from
(`main`), so they can be improved after tagging, without re-tagging. Only the
entries above `## [1.0.0]` are searched: the entries below it use the numbering
from before the public release.

Fallback, if GitHub Actions is unavailable: `GH_TOKEN=<token> npm run dist`
on a Windows machine uploads the same files to a draft release; publish it by
hand on the Releases page. `npm run dist` also builds `release/Orfeo-X.Y.Z.appx`
for a manual upload in Partner Center.

### Microsoft Store

Orfeo is in the Microsoft Store as an MSIX package (`appx` in `package.json`,
identity `Squarebow.Orfeo`; tile logos in `build/appx/`). Sending a version to
the Store is its own workflow, run after the release: **Actions → Microsoft
Store → Run workflow**, with the version (`1.5.1`) and `submit` or `draft`.

It finds the `.appx` that version's Release run built, then
(`scripts/store-submit.mjs`, through the Partner Center submission API) starts
a new submission from the published one (same listing, screenshots and price),
puts the new package in place of the old ones, uploads it and — with `submit` —
sends it for certification, waiting until Microsoft has accepted the package.
`draft` leaves it in Partner Center to check and submit by hand. Store users
get the update automatically once certification passes (a few hours to 3
business days).

- The Store needs a plain version (`1.5.0` → package `1.5.0.0`), higher than
  the one already in the Store. Pre-releases have no Store package.
- Only one update can be in progress. If the previous one is still in
  certification, the workflow says so and stops: run it again once Partner
  Center shows it published. A draft it made itself is replaced; an update
  started by hand in Partner Center has to be submitted or deleted there first.
- Without the one-time setup below it stops and says what's missing; the
  `.appx` is in the Release run's `store-package` artifact for a manual upload.
- **Rate Orfeo** (Store build only): a star beside the update check, plus the
  "Enjoying Orfeo?" note every 5th launch (other builds get review, Reddit and
  Ko-fi links there instead), opens the Store's review window. A small helper,
  `native/orfeo-review` (built by `npm run native:build`), opens it, so a
  failure there can never close Orfeo. It only works with the Store identity,
  so the review window can only be tried in the Store build.

One-time setup (Partner Center + GitHub):

1. Partner Center → **Account settings → Tenants**: associate an existing
   Microsoft Entra ID tenant, or **Create Microsoft Entra ID** (free; it makes a
   new admin sign-in such as `you@yourname.onmicrosoft.com`).
2. **Sign out of Partner Center and sign back in with that tenant's admin
   account** (the `…onmicrosoft.com` one), not the personal Microsoft account.
   The *Microsoft Entra applications* tab only appears for a Manager who is
   also the tenant's global administrator; signed in any other way, *User
   management* offers users only.
3. Partner Center → **Account settings → User management → Microsoft Entra
   applications → Add Microsoft Entra application**:
   - **Create Microsoft Entra application** (simplest): any display name
     (e.g. `orfeo-store-publisher`), any unique Reply URL (e.g.
     `https://orfeo.cc/store-publisher`), role **Manager**. Or **Add Microsoft
     Entra application** to pick one already registered in the
     [Entra admin center](https://entra.microsoft.com), also as **Manager**.
   - Click the application's name: it shows the **Tenant ID** and **Client ID**.
     **Add new key** shows the key (the client secret) once — copy it then.
4. The app's **Store ID** (12 characters, starts with `9`) is under *Apps and
   games → Orfeo → Product management → Product identity*.
5. GitHub → **Settings → Secrets and variables → Actions**:
   - Secrets: `AZURE_AD_TENANT_ID`, `AZURE_AD_APPLICATION_CLIENT_ID`,
     `AZURE_AD_APPLICATION_SECRET` (the key).
   - Variable: `MS_STORE_PRODUCT_ID` = the Store ID.

The key expires (Partner Center shows the date next to it): add a new key and
update `AZURE_AD_APPLICATION_SECRET` before it does, or the Microsoft Store
workflow stops with "Signing in to Partner Center failed".

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
