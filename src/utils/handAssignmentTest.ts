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
  testMaxFingersCapEvenSplitBeyondCapacity()
  testFirstNoteAnchorsToCorrectRegister()

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

// ── Case D: max-fingers hard cap. A 10-note cluster (default 4+4=8 combined
// capacity) must fall back to the most even split (5/5) rather than dumping
// as many as fit on one hand and stranding the rest on the other. ───────────
function testMaxFingersCapEvenSplitBeyondCapacity(): void {
  const chord: HandInput[] = [36, 38, 40, 41, 43, 45, 47, 48, 50, 52].map(midi => ({ midi, time: 5.0 }))

  const { assignments } = assignHands(chord, { rhMaxFingers: 4, lhMaxFingers: 4 })
  const lCount = assignments.filter(a => a.hand === 'L').length
  const rCount = assignments.filter(a => a.hand === 'R').length
  console.assert(lCount === 5 && rCount === 5, `expected even 5/5 split beyond combined capacity, got L=${lCount} R=${rCount}`)
  console.log('Case D (finger-cap overflow):', assignments.map(a => `${a.note.midi}:${a.hand}`).join(' '))

  // A 9-note chord (exactly at 5+4 capacity with RH=5/LH=4) should split
  // 5-from-the-top/4-from-the-bottom, not evenly.
  const chord9: HandInput[] = [36, 38, 40, 41, 43, 45, 47, 48, 50].map(midi => ({ midi, time: 6.0 }))
  const { assignments: a9 } = assignHands(chord9, { rhMaxFingers: 5, lhMaxFingers: 4 })
  const l9 = a9.filter(a => a.hand === 'L').length
  const r9 = a9.filter(a => a.hand === 'R').length
  console.assert(l9 === 4 && r9 === 5, `expected 4/5 split at exact capacity (LH=4,RH=5), got L=${l9} R=${r9}`)
  console.log('Case D2 (finger-cap at exact capacity):', a9.map(a => `${a.note.midi}:${a.hand}`).join(' '))
}

// ── Case E: identity anchoring. A piece opening with a single isolated low
// note (nothing else has played yet) must anchor to L, not win an arbitrary
// tie against R — regression test for the register-split fallback fix. ─────
function testFirstNoteAnchorsToCorrectRegister(): void {
  const notes: HandInput[] = [
    { midi: 36, time: 0 },     // isolated low note, opens the piece
    { midi: 84, time: 5 },     // isolated high note, much later
  ]
  const { assignments } = assignHands(notes)
  const first = assignments.find(a => a.note.time === 0)!
  const second = assignments.find(a => a.note.time === 5)!
  console.assert(first.hand === 'L', `opening low note should anchor to L, got ${first.hand}`)
  console.assert(second.hand === 'R', `later high note should anchor to R, got ${second.hand}`)
  console.log('Case E (register anchoring):', assignments.map(a => `${a.note.midi}:${a.hand}`).join(' '))
}
