// Track groups eligible for keyboard rendering / hand assignment — excludes
// drums, bass, guitar, strings, etc. Shared by handBoundaries.ts (live
// keyboard indicator) and midiParser.ts (hand-tag assignment on load) so the
// definition of "a piano-like track" doesn't fork between the two.
export const KEYBOARD_GROUPS = new Set(['piano', 'chromatic', 'organ'])
