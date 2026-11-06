# Orfeo — Installation

*Every release of Orfeo comes for Windows, [macOS](#macos) and [Linux](#linux)
(experimental). It's the same app on each system, apart from the Native sound
engine, which is Windows-only for now. Windows has two builds, Setup and
Portable, which differ only in how they land on your machine and where they
keep your data.*

> [!TIP]
> **On Windows and not sure? Use the Setup installer.** It gives you Start Menu integration
> and automatic updates with no extra effort. Reach for the portable build only
> when you need to run Orfeo without installing anything.

---

## Contents

- **Windows**
  - [At a glance](#at-a-glance)
  - [Where your data lives](#where-your-data-lives)
  - [Updating](#updating)
  - [Uninstalling](#uninstalling)
  - [Switching between the two builds](#switching-between-the-two-builds)
- [macOS](#macos)
- [Linux](#linux)

---

## At a glance

| | Setup (installer) | Portable (standalone) |
|---|---|---|
| **File name** | `Orfeo-Setup-<version>.exe` | `Orfeo-<version>-portable.exe` |
| **Install step** | Yes — a normal Windows installer | None — the `.exe` *is* the app |
| **Admin rights** | No — installs just for your Windows account, no UAC prompt | No |
| **Where it installs** | `%LOCALAPPDATA%\Programs\Orfeo` by default (you can pick another folder during setup) | Wherever you put the `.exe` — USB stick, any folder |
| **Start Menu / Desktop shortcut** | Created automatically | No — pin it yourself if you want one |
| **Auto-update** | Yes — checks GitHub Releases on startup | **No** — update manually by downloading the newer `.exe` |
| **Uninstall** | Windows *Apps & features* (or the bundled uninstaller) | Delete the `.exe` and its data folder |
| **Good for** | Everyday use on your own PC | Testing, USB-stick use, locked-down machines, running versions side by side |

<details>
<summary><b>Example file names (v1.7.0)</b></summary>

- `Orfeo-Setup-1.7.0.exe`
- `Orfeo-1.7.0-portable.exe`

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
| **Setup** | Orfeo checks GitHub Releases about 5 seconds after startup. A found update downloads in the background; when it is ready, the update button at the bottom of the left panel changes to *"click to restart and install"*. You can also re-check manually there any time. |
| **Portable** | No auto-update — even on Windows. When a new version is out, a blinking dot appears on the update button at the bottom of the left panel; click it to open the download page and get the new `Orfeo-<version>-portable.exe`. Replace the old file; your settings and library are untouched because they live in `Orfeo-Data\`, not inside the `.exe`. |

---

## Uninstalling

**Setup build:** use Windows *Apps & features*, or run the uninstaller from the
install folder. Orfeo installs per-user, so this runs without an admin prompt.

Before anything is removed, the uninstaller asks what to do with your data:

| Choice | Effect |
|---|---|
| **Delete everything** | Removes Orfeo and all its data: preferences, library-folder link, downloaded soundfonts, demo files, and any edited MIDI files that were saved *without* a library folder set |
| **Keep my edited files** | Moves your edited MIDI files to an **`Orfeo Edited Files`** folder on your Desktop, then removes Orfeo and everything else |
| **Remove Orfeo, keep my data** | Removes the app but leaves all your data in place, ready for a reinstall |
| **Keep everything** | Cancels the uninstall: Orfeo stays installed and nothing is touched |

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

## macOS

Every release also has Mac downloads, on the same
[Releases](https://github.com/Squarebow/Orfeo/releases) page. Orfeo needs
**macOS 13 Ventura or newer**.

| Mac | Disk image | Or the zip |
|---|---|---|
| **Apple Silicon** (M1 and newer) | `Orfeo-<version>-mac-arm64.dmg` | `Orfeo-<version>-mac-arm64.zip` |
| **Intel** | `Orfeo-<version>-mac-x64.dmg` | `Orfeo-<version>-mac-x64.zip` |

Open the `.dmg` and drag Orfeo into *Applications* (or unzip the `.zip` and
move `Orfeo.app` there).

> [!IMPORTANT]
> The Mac builds are ad-hoc signed but not notarized by Apple, so macOS blocks
> Orfeo the first time you open a downloaded copy. Choose **Done**, then open
> *System Settings › Privacy & Security*, scroll down to *"Orfeo" was
> blocked*, click **Open Anyway** and confirm. You only do this once per
> version.

- **Sound:** GM and Studio. The Native engine is Windows-only.
- **MIDI keyboards:** USB keyboards work straight away. A Bluetooth MIDI
  keyboard has to be connected in *Audio MIDI Setup* first (*Window › Show MIDI
  Studio*, then the Bluetooth button); Orfeo then sees it like a USB one.
- **Your data:** `~/Library/Application Support/Orfeo/`.
- **Updating:** no auto-update. When a new version is out, a blinking dot
  appears on the update button at the bottom of the left panel. Click it to open
  the download page, then replace `Orfeo.app` with the new one — your settings
  stay.
- **Uninstalling:** drag `Orfeo.app` to the Trash; delete the data folder above
  too if you want everything gone.

---

## Linux

> [!NOTE]
> The Linux builds are **experimental**: every release builds them and checks
> that they start, but they haven't been tested on real Linux machines with a
> MIDI keyboard yet. Problems and successes are both welcome as
> [issues](https://github.com/Squarebow/Orfeo/issues).

Every release has Linux downloads (x64) on the same
[Releases](https://github.com/Squarebow/Orfeo/releases) page:

| Your system | Download |
|---|---|
| **Ubuntu, Debian, Mint, Pop!_OS…** | `Orfeo-<version>-linux-amd64.deb` |
| **Fedora, openSUSE…** | `Orfeo-<version>-linux-x86_64.rpm` |
| **Any other** (no install) | `Orfeo-<version>-linux-x86_64.AppImage` |

You can usually just open the `.deb` or `.rpm`. To install from a terminal, go to
the folder you downloaded it to and run the lines for your system, changing
`1.7.0` to the version you have.

Ubuntu, Debian, Mint, Pop!_OS:

```bash
cd ~/Downloads
sudo apt install ./Orfeo-1.7.0-linux-amd64.deb
```

Fedora:

```bash
cd ~/Downloads
sudo dnf install ./Orfeo-1.7.0-linux-x86_64.rpm
```

openSUSE:

```bash
cd ~/Downloads
sudo zypper install --allow-unsigned-rpm ./Orfeo-1.7.0-linux-x86_64.rpm
```

AppImage, on any other system:

```bash
cd ~/Downloads
chmod +x Orfeo-1.7.0-linux-x86_64.AppImage
./Orfeo-1.7.0-linux-x86_64.AppImage
```

Prefer the `.deb` or `.rpm` where you can. On Ubuntu 24.04 and newer, the
system's security settings can stop AppImages of apps like Orfeo from starting;
the installers aren't affected. If an AppImage complains about FUSE, add
`--appimage-extract-and-run` to the last line.

- **Sound:** GM and Studio. The Native engine is Windows-only for now.
- **MIDI keyboards:** USB keyboards are picked up automatically.
- **Your data:** `~/.config/Orfeo/`.
- **Updating:** no auto-update. When a new version is out, a blinking dot
  appears on the update button at the bottom of the left panel. Click it to open
  the download page, then install the new version over the old one — your
  settings stay.
- **Uninstalling:** `sudo apt remove orfeo`, `sudo dnf remove orfeo` or
  `sudo zypper remove orfeo` (or delete the AppImage); delete the data folder
  above too if you want everything gone.

---

### Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — building from source
- [ARCHITECTURE.md](ARCHITECTURE.md) — how the app is structured
- [SHORTCUTS.md](SHORTCUTS.md) — keyboard and mouse reference
