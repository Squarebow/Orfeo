# Installer vs. Portable — which one should I use?

Orfeo ships two Windows builds from every release. Both are the same app —
same features, same file support — they differ only in *how* they land on
your machine.

| | **Setup (installer)** | **Portable (standalone)** |
|---|---|---|
| File | `Orfeo-Setup-x.x.x-Windows.exe` | `Orfeo-Portable-x.x.x-Windows.exe` |
| Install step | Yes — runs a normal Windows installer | No — the `.exe` *is* the app, run it directly |
| Where it lives | `%LOCALAPPDATA%\Programs\Orfeo` by default (the installer lets you pick a different folder) | Wherever you put the `.exe` (USB stick, any folder) |
| Start Menu / Desktop shortcut | Yes, created automatically | No — pin it yourself if you want one |
| Uninstall | Via Windows "Apps & features" | Delete the `.exe` and its data folder (see below) |
| Auto-update | Yes — checks GitHub Releases on startup, downloads and installs in the background | **No** — auto-update is Windows-installer-only; portable users update manually by downloading the newer `.exe` |
| Admin rights to install | No (installs to your user profile, not Program Files) | No |
| Good for | Everyday use on your own PC | Testing, running from a USB drive, machines where you don't want anything "installed", multiple versions side by side |

## Where your data lives (this is the real difference)

The two builds deliberately store data in **different places** — this is
the actual point of the portable build, not an accident:

- **Setup build**: standard per-user Windows app-data location,
  `%APPDATA%\Orfeo\`.
- **Portable build**: an `Orfeo-Data\` folder created **next to the `.exe`
  itself**. This is what makes it portable — copy the `.exe` plus its
  `Orfeo-Data\` folder to a USB stick or another machine, and your settings,
  library folder pointer, and favourites travel with it. Nothing is written
  to `%APPDATA%` at all in this mode.

Both locations hold the same kind of data: your saved preferences
(`orfeo-prefs.json`), the bundled demo files on first run, downloaded
soundfonts, and — separately — any files Orfeo writes when converting or
editing MIDI (`_ORFEO_vN.mid` saves, imported MusicXML/Guitar Pro
conversions cached as `_ORFEO_IMPORTED.mid`) land inside your *library*
folder's `Orfeo/` subfolder, wherever you pointed Orfeo via Settings →
Library — not in either app-data location above.

Because the two builds use different data locations by design, switching
from one to the other on the same machine does **not** automatically carry
over your settings — point the new build at the same library folder and
you're back up and running, but preferences/favourites start fresh.

## Updates

- **Setup build**: Orfeo checks GitHub Releases 5 seconds after startup, and
  you can re-check any time via the cloud-download icon in Settings →
  Appearance. New versions download and install silently in the background.
- **Portable build**: there is no auto-update. Watch the
  [Releases](https://github.com/SquareBow/orfeo/releases) page and download
  the new `Orfeo-Portable-x.x.x-Windows.exe` when you want to update — just
  replace the old file, your settings/library are untouched since they live
  in `%APPDATA%`, not next to the `.exe`.

## macOS / Linux

Orfeo doesn't currently publish official macOS or Linux builds — the
auto-update pipeline above is Windows-only. If you build from source on
another platform (see the main [README](../README.md#building-from-source)
and [CONTRIBUTING.md](../CONTRIBUTING.md)), you're on manual `git pull` +
rebuild for updates, same as the portable Windows build.

## Which one should I actually pick?

If you're not sure: **use the Setup installer.** It gets you Start Menu
integration and automatic updates with zero extra effort. Reach for the
portable build specifically when you need to run Orfeo without installing
anything (shared/locked-down machines, USB-stick use, or testing a specific
version without disturbing an existing install).
