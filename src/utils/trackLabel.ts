import { tName } from './i18n'

// A track's name for showing: the instrument's name translates, a name from the
// file or typed by the user stays as written
export function trackLabel(track: { trackName?: string; gmName?: string } | undefined): string | undefined {
  if (!track) return undefined
  const name = track.trackName ?? track.gmName
  return name !== undefined && name === track.gmName ? tName(name) : name
}
