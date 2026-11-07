// ── What would be lost if the song went away now ─────────────────────────────
// Compares the tracks with how the song loaded, so undoing a change by hand
// counts as no change. Solo isn't here: it only lasts for the session. Focus mode
// mutes and hides tracks for the moment, so mute and eye aren't read while it's on.
// The Note Editor, tempo and key, and imported files have their own questions.
import { t } from './i18n'

type TrackValues = {
  index: number
  muted: boolean; visible: boolean; showOnKeyboard: boolean
  volume: number; pan: number; chorus: number; reverb: number
}
export type TrackBaseline = Record<number, Omit<TrackValues, 'index'>>

export type UnsavedCounts = { shown: number; lights: number; muted: number; mixer: number; playbackEditor: boolean }

// The Playback Editor holds its edits itself while it's open
let playbackEditorHasEdits: (() => boolean) | null = null
export function setPlaybackEditorCheck(check: (() => boolean) | null) { playbackEditorHasEdits = check }

export function countUnsaved(tracks: TrackValues[], baseline: TrackBaseline, focusActive: boolean): UnsavedCounts {
  const counts: UnsavedCounts = { shown: 0, lights: 0, muted: 0, mixer: 0, playbackEditor: playbackEditorHasEdits?.() ?? false }
  for (const track of tracks) {
    const base = baseline[track.index]
    if (!base) continue
    if (!focusActive && track.visible !== base.visible) counts.shown++
    if (!focusActive && track.muted !== base.muted) counts.muted++
    if (track.showOnKeyboard !== base.showOnKeyboard) counts.lights++
    if (track.volume !== base.volume || track.pan !== base.pan || track.chorus !== base.chorus || track.reverb !== base.reverb) counts.mixer++
  }
  return counts
}

export const hasUnsaved = (c: UnsavedCounts) => c.shown + c.lights + c.muted + c.mixer > 0 || c.playbackEditor

export function unsavedDetail(c: UnsavedCounts): string {
  const lines: string[] = []
  if (c.shown) lines.push(t`Tracks shown or hidden: ${c.shown}`)
  if (c.lights) lines.push(t`Tracks with keyboard lights changed: ${c.lights}`)
  if (c.muted) lines.push(t`Tracks muted or unmuted: ${c.muted}`)
  if (c.mixer) lines.push(t`Mixer channels changed: ${c.mixer}`)
  if (c.playbackEditor) lines.push(t`Edits in the Playback Editor`)
  lines.push('', t`To keep them, choose Cancel and use Save & Reload in the Playback Editor or the Mixer. It makes a new version, and your original file stays as it is.`)
  if (c.muted) lines.push('', t`Mute can't be saved yet. In the Playback Editor, a muted track is left out of the new version.`)
  return lines.join('\n')
}

/** The Mixer's Discard: asked once already, so these values aren't asked about again */
export function acceptMixerValues(tracks: TrackValues[], baseline: TrackBaseline): TrackBaseline {
  const next = { ...baseline }
  for (const { index, volume, pan, chorus, reverb } of tracks) {
    if (next[index]) next[index] = { ...next[index], volume, pan, chorus, reverb }
  }
  return next
}
