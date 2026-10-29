// Track groups eligible for keyboard rendering — excludes drums, bass,
// guitar, strings, etc. Shared by handBoundaries.ts (live keyboard
// indicator), midiParser.ts (track palette color), TrackPanel.tsx and
// MidiEditor.tsx (split-eligibility UI) so the definition of "a piano-like
// track" doesn't fork between them.
export const KEYBOARD_GROUPS = new Set(['piano', 'chromatic', 'organ'])

// Narrower set for two-hand-piano-technique purposes only: automatic hand
// assignment (midiParser.ts) and the Note Editor's auto-solo-on-Hand-toggle
// (NoteEditorToolbar.tsx). 'chromatic' (vibraphone, glockenspiel, celesta,
// marimba, etc — GM programs 8-15) deliberately excluded — these are
// mallet/pitched-percussion instruments, not played with two-hand piano
// technique, and lumping them into the same hand-assignment note pool as a
// real piano track corrupted both the coloring (mallet notes inherited the
// piano's LH/RH split) and auto-solo target selection (picked whichever
// track matched first, not necessarily the piano).
export const HAND_ASSIGN_GROUPS = new Set(['piano', 'organ'])

// ── Focus mode (Tracks panel / Mixer): you HEAR keys, bass & drums and SEE only
// the keys. Keys = pianos (GM 0-7), organs (16-20) and accordions (21, 23) —
// not the mallets (8-15) or the harmonica (22). 'rhythm' plays but is hidden;
// 'off' is muted and hidden. ─────────────────────────────────────────────────
const FOCUS_KEY_PROGRAMS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 23])
export function focusRole(t: { isDrum: boolean; group?: string; program?: number }): 'keys' | 'rhythm' | 'off' {
  if (t.isDrum || t.group === 'bass') return 'rhythm'
  return FOCUS_KEY_PROGRAMS.has(t.program ?? -1) ? 'keys' : 'off'
}
