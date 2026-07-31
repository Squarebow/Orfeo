import { assignHands, type HandInput } from './handAssignment'

// ── runHandAssignmentTest ─────────────────────────────────────────────────────
// Stage 1 self-check for the standalone hand-assignment engine — no UI wiring
// yet, so this runs against synthetic note data rather than a loaded file.
// Exposed as window.__orfeoHandAssignmentTest in development mode.
export function runHandAssignmentTest(): void {
  console.group('[HandAssignment] Stage 1 engine self-check')

  testFastPathOnCleanSplit()
  testWideChordSplitsAcrossHands()
  testMelodicPassageDoesNotFlipFlop()

  console.groupEnd()
}

// ── Case A: already-split 2-track input (File-A style notation export) ──────
// Both tracks share channel 0 (channel unreliable), only trackIndex separates
// them. Should hit the fast path and label purely by average pitch.
function testFastPathOnCleanSplit(): void {
  const rh: HandInput[] = [72, 74, 76, 77].map((midi, i) => ({ midi, time: i * 0.5, trackIndex: 0, channel: 0 }))
  const lh: HandInput[] = [48, 50, 52, 53].map((midi, i) => ({ midi, time: i * 0.5, trackIndex: 1, channel: 0 }))

  const { assignments, usedFastPath } = assignHands([...rh, ...lh])

  console.assert(usedFastPath, 'expected fast path for clean 2-track split')
  console.assert(
    assignments.every(a => (a.note.trackIndex === 0 ? a.hand === 'R' : a.hand === 'L')),
    'fast path mislabeled a track',
  )
  console.assert(assignments.every(a => a.confidence === 1), 'fast path should report full confidence')
  console.log('Case A (fast path):', assignments.length, 'notes labeled, usedFastPath =', usedFastPath)
}

// ── Case B: File-B stress test — a single 7-note, ~4-octave simultaneous
// chord (C2, G3, C4, D4, G4, C6, D6) must split across both hands, not dump
// onto one. ──────────────────────────────────────────────────────────────────
function testWideChordSplitsAcrossHands(): void {
  const chord: HandInput[] = [36, 55, 60, 62, 67, 84, 86].map(midi => ({ midi, time: 10.0 }))

  const { assignments, usedFastPath } = assignHands(chord)

  console.assert(!usedFastPath, 'single wide chord should not hit the fast path')
  const hands = new Set(assignments.map(a => a.hand))
  console.assert(hands.size === 2, 'wide chord must be split across both hands, not dumped on one')
  console.log('Case B (wide chord):', assignments.map(a => `${a.note.midi}:${a.hand}`).join(' '))
}

// ── Case C: a wandering mid-register melodic line, single note per cluster.
// In isolation each note is ambiguous (could go either hand); once a prior
// chord anchors L/R centers, the DP's movement cost should keep the whole
// line in one hand rather than toggling note-to-note. ───────────────────────
function testMelodicPassageDoesNotFlipFlop(): void {
  const anchorChord: HandInput[] = [{ midi: 48, time: 0 }, { midi: 84, time: 0 }]
  const melody: HandInput[] = [65, 67, 69, 67, 65].map((midi, i) => ({ midi, time: 1 + i * 0.5 }))

  const { assignments } = assignHands([...anchorChord, ...melody])
  const melodyHands = assignments
    .filter(a => melody.includes(a.note))
    .sort((a, b) => a.note.time - b.note.time)
    .map(a => a.hand)

  const switches = melodyHands.slice(1).filter((h, i) => h !== melodyHands[i]).length
  console.assert(switches === 0, `melodic line flip-flopped hands ${switches} times: ${melodyHands.join(',')}`)
  console.log('Case C (melodic continuity):', melodyHands.join(' '))
}
