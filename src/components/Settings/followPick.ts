// Follow reads only the pick for the active kind (useChordSequence.ts): a
// saved group doesn't count while By Track is on, and vice versa.
export function followNeedsPick(s: { chordFollowSubMode: 'group' | 'track'; chordFollowGroup: string | null; chordFollowTrackIndex: number | null }): boolean {
  return s.chordFollowSubMode === 'group' ? s.chordFollowGroup === null : s.chordFollowTrackIndex === null
}
