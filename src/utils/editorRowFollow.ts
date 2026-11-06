// ── Playback Editor rows follow the Tracks panel while the editor is open ─────
// The editor copies each track's mute, eye and keyboard flags when it opens. A
// flag changed in the Tracks panel afterwards moves that row's matching switch;
// everything else on the row, including choices made in the editor, stays put.

export interface TrackFlags {
  index: number
  muted: boolean
  visible: boolean
  showOnKeyboard: boolean
}

interface RowFlags {
  index: number
  included: boolean
  visible: boolean
  showOnKeyboard: boolean
  splitOriginIndex?: number
}

export function followTrackFlags<R extends RowFlags>(rows: R[], before: TrackFlags[], now: TrackFlags[]): R[] {
  let result = rows
  for (const track of now) {
    const prev = before.find(t => t.index === track.index)
    if (!prev) continue
    const patch: Partial<RowFlags> = {}
    if (track.muted !== prev.muted) patch.included = !track.muted
    if (track.visible !== prev.visible) patch.visible = track.visible
    if (track.showOnKeyboard !== prev.showOnKeyboard) patch.showOnKeyboard = track.showOnKeyboard
    if (Object.keys(patch).length === 0) continue
    // a staged split keeps the source track's number on both halves
    result = result.map(r => (r.splitOriginIndex ?? r.index) === track.index ? { ...r, ...patch } : r)
  }
  return result
}
