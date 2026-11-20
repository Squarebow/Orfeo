// ── Is a track shown? — one rule for the piano roll and everything that
// follows it (keys lit during playback, Reflect on keyboard, step-through).
// The eye hides a track you still hear (accompaniment); mute silences and
// hides it; solo isolates both what you hear and what you see. Mute and solo
// never switch the eye itself — they're separate buttons.
// One exception: in practice mode the part you play is silent (you play it)
// but stays on the roll and the keyboard (practicePart).
export function isShown(t: { visible: boolean; muted: boolean; solo: boolean; practicePart?: boolean }, hasSolo: boolean): boolean {
  return t.visible && (!t.muted || !!t.practicePart) && (!hasSolo || t.solo)
}
