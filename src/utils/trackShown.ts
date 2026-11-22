// ── Is a track shown? — the rule for everything that follows the roll: keys
// lit during playback, Reflect on keyboard, step-through. The eye hides a
// track you still hear (accompaniment); mute silences and hides it; solo
// isolates both what you hear and what you see. Mute and solo never switch
// the eye itself — they're separate buttons.
// One exception: in practice mode the part you play is silent (you play it)
// but stays on the roll and the keyboard (practicePart).
export function isShown(t: { visible: boolean; muted: boolean; solo: boolean; practicePart?: boolean }, hasSolo: boolean): boolean {
  return t.visible && (!t.muted || !!t.practicePart) && (!hasSolo || t.solo)
}

// ── Is a track drawn on the piano roll? — the same rule as isShown, unless
// "Muted tracks stay on the roll" is on (Settings › Playback, off by
// default): then mute only silences a track and its notes stay on the roll.
// The roll only — keys, Reflect, step-through and the Mixer keep isShown
// whatever the setting.
//
// The setting lives here as well as in the store so the roll's drawing loop
// can ask without reading the store; the store's setter keeps it in step
// (setMutedOnRoll).
let mutedOnRoll = false
export function syncMutedOnRoll(v: boolean): void { mutedOnRoll = v }

export function isOnRoll(t: { visible: boolean; muted: boolean; solo: boolean; practicePart?: boolean }, hasSolo: boolean): boolean {
  return mutedOnRoll ? t.visible && (!hasSolo || t.solo) : isShown(t, hasSolo)
}
