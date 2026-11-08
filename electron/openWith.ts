// ── Open with Orfeo — finding the song the system asked us to open ─────────
// Windows and Linux put the file on the command line when Orfeo starts (or,
// through the single-instance lock, hand a second launch's command line to
// the running copy). The line also carries Chromium switches, a macOS -psn_
// id, and on Linux desktops a file:// address instead of a plain path.
import { isAbsolute, resolve } from 'path'
import { fileURLToPath } from 'url'

// The same formats a drop accepts (App.tsx isSupportedFile)
export const OPEN_WITH_FORMATS = /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i

// The last song on the command line, as an absolute path; null when there is none.
// argv[0] is the program itself and is never a song.
export function fileFromArgs(argv: readonly string[], cwd: string): string | null {
  for (let i = argv.length - 1; i >= 1; i--) {
    let arg = argv[i]
    if (!arg || arg.startsWith('-')) continue
    if (/^file:\/\//i.test(arg)) {
      try { arg = fileURLToPath(arg) } catch { continue }
    }
    if (!OPEN_WITH_FORMATS.test(arg)) continue
    return isAbsolute(arg) ? arg : resolve(cwd, arg)
  }
  return null
}
