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
