# Contributing to Orfeo

*Everything you need to build Orfeo from source, run it in development, and cut
a release.*

Contributions are welcome. **Please open an issue before starting a PR** so the
approach can be agreed first — it saves everyone a wasted round-trip.
Every pull request has to follow the [two pull request rules](#pull-request-rules):
it targets `dev`, and every commit is authored by you.

- Bugs and feature ideas: [GitHub Issues](https://github.com/Squarebow/Orfeo/issues)
- How the code fits together: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Contents

- [Pull request rules](#pull-request-rules)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Build commands](#build-commands)
- [Running the tests](#running-the-tests)
- [Project layout](#project-layout)
- [Coding conventions](#coding-conventions)
- [Releases and auto-update](#releases-and-auto-update)
- [Tech stack](#tech-stack)

---

## Pull request rules

Two simple rules keep the history tidy. A small automatic check
(`.github/workflows/pr-rules.yml`) looks at every pull request: one aimed at
`main` gets a friendly reminder, and a commit signed by an AI tool gets a red
mark with the way to fix it. Push the fixed branch and the check runs again.

### 1. Target `dev`, not `main`

All work lands on `dev` first. `main` only receives `dev`, when a version is
released. GitHub suggests `main` by default, so when you open the pull request,
set **base** to `dev`. Already opened it against `main`? Click **Edit** next to
the title and change the base branch; nothing else needs redoing.

### 2. You are the author of every commit

Use whatever tools you like while working, but the commits are yours: your name,
your e-mail, your responsibility for the code. An AI coding tool (GitHub
Copilot, Claude, ChatGPT/Codex, Cursor, Gemini, Devin and the like) must never
appear:

- as a commit's **author or committer**: check `git config user.name` and
  `user.email` in the clone you work in, and any agent mode that commits for you;
- in a **`Co-authored-by:`** line, or a *Generated with…* / *Assisted-by…* line,
  in a commit message;
- in the pull request's **title or description**, the same way.

Already pushed commits like that? Rewrite them under your own name and
force-push the branch; the pull request updates by itself:

```bash
git rebase -r origin/dev --exec 'git commit --amend --no-edit --reset-author'
# then remove any AI Co-authored-by / Generated-with lines (git rebase -i, reword)
git push --force-with-lease
```

Or squash the whole branch into one commit of your own.

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
| `npm test` | Runs every `*Test.ts` in `src/` and `electron/`, one file per process | — |
| `npm run dist` | `build`, then the Windows installer, portable app and Store package | `release/` |
| `npm run dist:portable` | Windows portable `.exe` only (no installer), for a quick local test | `release/` |
| `npm run dist:mac` | macOS `.dmg` + `.zip` for Apple Silicon and Intel, ad-hoc signed (must run **on** macOS) | `release/` |
| `npm run dist:linux` | Linux AppImage + `.deb` + `.rpm` (x64; must run **on** Linux) | `release/` |

<details>
<summary><b>Cross-platform packaging</b></summary>

`npm run dist` passes any extra flags straight through to `electron-builder`:

| Command | Result |
|---|---|
| `npm run dist -- --dir` | Unpacked build for inspection, no installer |

`package.json`'s `build` block defines the `win`, `mac` and `linux` targets;
`dist:mac` and `dist:linux` build those (each must run on its own system).

</details>

---

## Running the tests

```bash
npm test                      # every *Test.ts under src/ and electron/, one process each
# one file only (the parent uses the same path):
node --import ./scripts/ts-esbuild-hooks.mjs src/runAllTests.ts --file src/utils/smfLeadTest.ts
```

Every test file exports one or more `run…Test()` functions returning its **failure
count** — `0` means all checks passed. `src/runAllTests.ts` discovers every
`*Test.ts` under `src/` and `electron/`, calls those functions and exits non-zero
if anything failed, so it works the same on your machine and in CI.

Three rules are deliberate, and each exists because of a specific trap:

- **One child process per file.** Several tests import the store and mutate it, and
  some leave timers, ports or promises behind. In one process the second file would
  inherit the first one's state, and a test awaiting an unref'd handle would end the
  whole run with an "unsettled top-level await" instead of a result.
- **A file that cannot be loaded counts as a failure**, never as a skip. A broken
  import is exactly what a test run is for.
- **Skips are listed with a reason** in the `SKIP` table at the top of
  `src/runAllTests.ts`. Add an entry only with a reason that a stranger can read;
  today it is one file: `src/audio/exportNativeTest.ts` needs the add-on from
  `npm run native:build`, which only exists on Windows.

TypeScript and Vite-only imports are handled by `scripts/ts-esbuild-hooks.mjs`
(`module.registerHooks` + the `esbuild` already in the tree), so `npm test` needs
no new dependency and no build step — but it does need **Node 22.15 or newer**;
older versions stop with that message instead of quietly running half the suite.

To see the suite in a clean environment, Docker is enough (nothing about it is
required for normal development):

```bash
docker run --rm -v "$PWD:/w" -w /w node:22 npm test
```

`npm run typecheck` covers the same files, so run both — the tests say a rule is
right, the typecheck says the call sites still fit.

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
build/       Installer assets, macOS icon
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

Orfeo officially builds **Windows**, **macOS** and **Linux** (experimental)
binaries, all from the same release pipeline. Only the installed Windows build auto-updates
(`electron-updater`, in `electron/main.ts`).

<details>
<summary><b>Why no auto-update on macOS / Linux</b></summary>

On macOS, `electron-updater` can only replace an app signed with an Apple
Developer ID, which the ad-hoc signed Mac builds aren't, so they stay on manual
updates and the release carries no `latest-mac.yml`.

On Linux, `electron-updater` could only update the AppImage (not the `.deb` or
`.rpm`), and the Linux builds are still experimental, so the release carries no
`latest-linux.yml` for now.

So: **no auto-update on macOS/Linux, for now** — same as the Windows
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
`latest.yml` and the blockmap, and — at the same time, on macOS — builds
`Orfeo-X.Y.Z-mac-arm64.dmg`/`.zip` (Apple Silicon) and
`Orfeo-X.Y.Z-mac-x64.dmg`/`.zip` (Intel), and on Linux the AppImage, `.deb` and
`.rpm`, into the same draft. Windows goes first: once the Windows build is done,
macOS and Linux get up to 30 minutes, then it writes the release notes from the
changelog and publishes the release as *Latest*, with or without them. Their
files join the published release when they finish; if one failed or GitHub had no
machine for it, the run's summary says so and *Re-run failed jobs* adds them. It also builds the Microsoft Store package
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

### macOS builds

The Mac apps are **ad-hoc signed**: sealed with a signature that needs no
Apple account, so macOS can check they're intact. They are not signed with an
Apple Developer ID or notarized by Apple, which would need a paid Apple
Developer Program membership. macOS therefore blocks a downloaded copy until
the person allows it once in *Privacy & Security* (see
[INSTALLATION.md → macOS](INSTALLATION.md#macos)).

Every push to `dev` and every pull request builds both Mac apps the same way
(`.github/workflows/macos.yml`), read-only and without any secrets.

### Linux builds

`.github/workflows/linux.yml` builds the AppImage, `.deb` and `.rpm` (x64) and
starts the packaged app on an invisible screen to check that it opens (twice:
the unpacked app, and the AppImage exactly as a user starts it, sandbox on — a
blocked AppImage sandbox on newer Ubuntu is reported as a warning). It runs on
every push to `dev`, on pull requests, and inside the Release workflow, which
then uploads the packages to the same draft. The packages and screenshots stay
on each run as the **linux-packages** artifact.

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
- [INSTALLATION.md](INSTALLATION.md) — downloads for each system, where data lives
- [SHORTCUTS.md](SHORTCUTS.md) — keyboard and mouse reference
- [CHANGELOG.md](CHANGELOG.md) — release history
