# Contributing to Orfeo

Contributions welcome. Please open an issue before submitting a PR — see
[docs/ROADMAP.md](docs/ROADMAP.md) for what's already planned.

## Prerequisites

- [Node.js 20 LTS](https://nodejs.org) or higher
- [Git](https://git-scm.com)

## Setup

```bash
git clone https://github.com/SquareBow/orfeo.git
cd orfeo
npm install
npm run dev
```

## Build commands

| Command | Output |
|---|---|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Compile TypeScript to `out/` |
| `npm run typecheck` | Type-check without emitting |
| `npm run dist` | Package for the current platform to `release/` |
| `npm run dist:portable` | Windows portable build (no installer) |
| `npm run dist -- --mac` | Package for macOS (requires building on macOS) |
| `npm run dist -- --linux` | Package for Linux |
| `npm run dist -- --dir` | Unpacked build for inspection, no installer |

`electron-builder` handles the platform-specific packaging; macOS and
Linux targets work with its defaults even though `package.json`'s `build`
config currently only defines explicit `win`/`mac` blocks — add a `linux`
block there if you need to pin specific target formats (AppImage/deb/
rpm/etc.) rather than the defaults.

## Releases & auto-update

Orfeo only builds and signs (nominally — see caveat below) **Windows**
binaries officially. That's the only platform with a real release
pipeline and the only one Orfeo's in-app auto-update
(`electron-updater`, wired in `electron/main.ts`) targets — see
`supportsAutoUpdate` there, gated on `process.platform === 'win32'`.

**Why not macOS/Linux too**: `electron-updater` assumes the app checking
for updates was built and published through the *same* pipeline as the
update feed it's pointed at. Community-built macOS/Linux binaries aren't
— nobody but the person who built them controls how, when, or whether
they get rebuilt. Pointing their auto-updater at Orfeo's official GitHub
release feed would be actively wrong: it could offer users an "update"
that doesn't match how their binary was actually built, or just silently
never fire because the community artifact isn't in the shape
`electron-updater` expects. So: **no auto-update on macOS/Linux, by
design** — users on those platforms check
[Releases](https://github.com/SquareBow/orfeo/releases) manually, same
as everyone did before auto-update existed. The Settings "Check for
updates" button already does the right thing there — it just opens that
page instead of trying to auto-check.

### Cutting a Windows release (maintainers)

1. Bump `version` in `package.json`, commit, tag (`git tag vX.Y.Z`).
2. `GH_TOKEN=<token with repo scope> npm run dist` — electron-builder
   publishes the built installer/portable exe *and* the `latest.yml`
   manifest straight to the matching GitHub release. That manifest is
   what makes auto-update actually work; without it, `electron-updater`
   has nothing to check against, even if the executables themselves are
   uploaded.
3. Publish the (draft) GitHub release once the upload finishes.

### Contributing a macOS/Linux build (community)

1. `npm run dist -- --mac` or `npm run dist -- --linux` locally on that
   platform.
2. Upload the resulting artifact as an **additional asset on the same
   GitHub release**, named so it's unmistakably unofficial and unsigned,
   e.g. `Orfeo-X.Y.Z-macOS-community.dmg`,
   `Orfeo-X.Y.Z-Linux-community.AppImage`.
3. **Do not** upload a `latest-mac.yml` / `latest-linux.yml` alongside it
   unless you're committing to actually maintain a real update feed for
   that platform going forward — an unmaintained one is worse than none,
   since it tells `electron-updater` an update channel exists when
   nobody's behind it.

## Tech stack

| Layer | Technology |
|---|---|
| App framework | Electron + Vite + React + TypeScript |
| Piano roll rendering | PixiJS (WebGL) |
| MIDI parsing | @tonejs/midi |
| Audio engine | SpessaSynth + JZZ |
| Music theory | tonal.js |
| State management | Zustand |
| Styling | Tailwind CSS |
| Icons | Lucide React |
