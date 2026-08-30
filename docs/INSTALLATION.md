# Orfeo — Installer vs. Portable

*Orfeo ships two Windows builds from every release. Same app, same features —
they differ only in how they land on your machine and where they keep your
data.*

> [!TIP]
> **Not sure? Use the Setup installer.** It gives you Start Menu integration
> and automatic updates with no extra effort. Reach for the portable build only
> when you need to run Orfeo without installing anything.

---

## Contents

- [At a glance](#at-a-glance)
- [Where your data lives](#where-your-data-lives)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Switching between the two builds](#switching-between-the-two-builds)
- [macOS and Linux](#macos-and-linux)

---

## At a glance

| | Setup (installer) | Portable (standalone) |
|---|---|---|
| **File name** | `Orfeo Setup <version>.exe` | `Orfeo-<version>-portable.exe` |
| **Install step** | Yes — a normal Windows installer | None — the `.exe` *is* the app |
| **Admin rights** | No — installs just for your Windows account, no UAC prompt | No |
| **Where it installs** | `%LOCALAPPDATA%\Programs\Orfeo` by default (you can pick another folder during setup) | Wherever you put the `.exe` — USB stick, any folder |
| **Start Menu / Desktop shortcut** | Created automatically | No — pin it yourself if you want one |
| **Auto-update** | Yes — checks GitHub Releases on startup | **No** — update manually by downloading the newer `.exe` |
| **Uninstall** | Windows *Apps & features* (or the bundled uninstaller) | Delete the `.exe` and its data folder |
| **Good for** | Everyday use on your own PC | Testing, USB-stick use, locked-down machines, running versions side by side |

<details>
<summary><b>Current release file names (v1.0.0)</b></summary>

- `Orfeo Setup 1.0.0.exe`
- `Orfeo-1.0.0-portable.exe`

Both are on the [Releases](https://github.com/Squarebow/Orfeo/releases) page.

</details>

---

## Where your data lives

This is the real difference between the two builds — it is deliberate, not an
accident.

| Build | Settings, preferences, downloaded soundfonts, first-run demo files |
|---|---|
| **Setup** | `%APPDATA%\Orfeo\` (standard per-user Windows location) |
| **Portable** | `Orfeo-Data\` — a folder created **next to the `.exe` itself**. Nothing is written to `%APPDATA%` at all. |

Both hold the same kinds of data: your preferences (`orfeo-prefs.json`), the
file-edit log, the bundled demo files copied on first run, and any soundfonts
downloaded for the Samples engine.

> [!NOTE]
> **Edited and imported MIDI files are stored separately** — not in either
> location above. They go into an `Orfeo\` subfolder inside your **library
> folder** (Settings → MIDI Files & Library):
>
> - `<name>_ORFEO_v1.mid`, `_ORFEO_v2.mid`, … — versioned saves from the
>   Playback Editor, Note Editor, Mixer, and tempo/key changes
> - `<name>_ORFEO_IMPORTED.mid` — MusicXML / Guitar Pro / Capella / KAR files
>   converted on import
>
> If you never set a library folder, these land next to the bundled demo files
> in the app-data location instead.

<details>
<summary><b>Why the portable build isolates its data</b></summary>

Keeping everything in `Orfeo-Data\` next to the `.exe` is what makes the build
portable: copy the `.exe` **plus** its `Orfeo-Data\` folder to a USB stick or
another machine and your settings, library-folder pointer, and favourites
travel with it. A portable build never touches `%APPDATA%`.

</details>

---

## Updating

| Build | How updates work |
|---|---|
| **Setup** | Orfeo checks GitHub Releases about 5 seconds after startup. A found update downloads in the background; when it is ready, the update control in **Settings → Appearance** changes to *"click to restart and install"*. You can also re-check manually there any time. |
| **Portable** | No auto-update — even on Windows. Watch the [Releases](https://github.com/Squarebow/Orfeo/releases) page and download the new `Orfeo-<version>-portable.exe` when you want to update. Replace the old file; your settings and library are untouched because they live in `Orfeo-Data\`, not inside the `.exe`. |

---

## Uninstalling

**Setup build:** use Windows *Apps & features*, or run the uninstaller from the
install folder. Orfeo installs per-user, so this runs without an admin prompt.

During uninstall you are asked what to do with your data — a three-way choice:

| Choice | Effect |
|---|---|
| **Yes** | Delete everything: preferences, library-folder link, downloaded soundfonts, demo files, and any edited MIDI files that were saved *without* a library folder set |
| **No** | Keep your edited MIDI files (moved to a **`Orfeo Edited Files`** folder on your Desktop), delete everything else |
| **Cancel** | Keep everything, delete nothing |

> [!IMPORTANT]
> Your **library folder itself** — wherever you pointed Orfeo — is never touched
> by the uninstaller, whichever option you choose.

**Portable build:** delete `Orfeo-<version>-portable.exe` and its `Orfeo-Data\`
folder. Nothing was written anywhere else.

---

## Switching between the two builds

Because the builds use different data locations by design, moving from one to
the other on the same machine does **not** carry your settings across
automatically. Point the new build at the same library folder and you are back
up and running — but preferences and favourites start fresh.

Your MIDI files and their full edit history are unaffected: that history is
embedded in each `.mid` file itself (see
[ARCHITECTURE.md → Metadata](ARCHITECTURE.md#metadata-embedded-in-the-midi-file)),
so it travels with the file no matter which build opens it.

---

## macOS and Linux

Orfeo does not currently publish official macOS or Linux builds — the
auto-update pipeline is Windows-only. You can build from source on those
platforms (see [CONTRIBUTING.md](CONTRIBUTING.md)); updates are then a manual
`git pull` + rebuild, same as the portable Windows build.

Community-built macOS/Linux binaries may be attached to a release as extra
assets — clearly marked unofficial and unsigned. See
[CONTRIBUTING.md → Releases and auto-update](CONTRIBUTING.md#releases-and-auto-update).

---

### Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — building from source
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is structured
- [SHORTCUTS.md](SHORTCUTS.md) — keyboard and mouse reference
