// ── Is there a newer Orfeo to download? For builds that can't update themselves
// (Mac, Linux, portable): main asks GitHub once at launch and the update button
// shows a dot. Windows publishes first and Mac and Linux join a little later, so
// a release only counts once it has this system's download. ───────────────────

export interface ReleaseInfo {
  tag_name?: string
  draft?: boolean
  prerelease?: boolean
  assets?: { name?: string }[]
}

// What this system's download ends with
export function downloadEnding(platform: string): string {
  if (platform === 'darwin') return '.dmg'
  if (platform === 'linux') return '.AppImage'
  return '-portable.exe'
}

function parts(version: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// A beta comes before the release with the same number
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parts(candidate), b = parts(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return current.includes('-') && !candidate.includes('-')
}

// The version to offer, or null
export function newerRelease(current: string, release: ReleaseInfo, ending: string): string | null {
  const tag = release.tag_name
  if (!tag || release.draft || release.prerelease || !isNewerVersion(tag, current)) return null
  if (!release.assets?.some(a => a.name?.endsWith(ending))) return null
  return tag.replace(/^v/, '')
}
