import type { ParsedTrack } from '../types'
import {
  encodeHandRLE, decodeHandRLE, buildHandExportHint, restoreHandTagsFromHints,
  withHandSuffix, nameHandFromSuffix,
} from './handMetadata'

// ── runHandMetadataTest ────────────────────────────────────────────────────
// Stage 2 self-check for hand-tag export/reimport. Exposed as
// window.__orfeoHandMetadataTest in development mode (see App.tsx).
export function runHandMetadataTest(): void {
  console.group('[HandMetadata] Stage 2 export/reimport self-check')

  testRleRoundTrip()
  testHomogeneousTrackUsesNameSuffix()
  testMixedTrackUsesTextMeta()
  testReimportWithNameHint()
  testReimportWithTextMetaHint()
  testReimportWithNoHint()
  testStaleHintIsIgnored()
  testUnversionedHintIsIgnored()

  console.groupEnd()
}

function testRleRoundTrip(): void {
  const hands = ['L', 'L', 'L', 'R', 'R', 'L'] as const
  const rle = encodeHandRLE([...hands])
  const back = decodeHandRLE(rle)
  console.assert(rle === 'L3R2L1', `unexpected RLE: ${rle}`)
  console.assert(JSON.stringify(back) === JSON.stringify(hands), 'RLE did not round-trip')
  console.log('RLE round-trip:', rle)
}

// ── Case: split-into-two-tracks output — every note in the track is the same
// hand → cheap name-suffix hint, no meta-event spent. ────────────────────────
function testHomogeneousTrackUsesNameSuffix(): void {
  const notes = [{ hand: 'R' as const }, { hand: 'R' as const }, { hand: 'R' as const }]
  const hint = buildHandExportHint(0, 'Piano', notes)
  console.assert(hint.name === 'Piano (RH)', `expected name suffix, got ${hint.name}`)
  console.assert(hint.meta === null, 'homogeneous track should not need a text meta event')
}

// ── Case: keep-one-track/hand-colored output — mixed hands → RLE text meta,
// track name left untouched. ─────────────────────────────────────────────────
function testMixedTrackUsesTextMeta(): void {
  const notes = [{ hand: 'L' as const }, { hand: 'R' as const }, { hand: 'R' as const }]
  const hint = buildHandExportHint(2, 'Piano', notes)
  console.assert(hint.name === 'Piano', 'mixed track name should be untouched')
  console.assert(hint.meta?.text === 'ORFEO_HAND_MAP:1:2:L1R2', `unexpected meta: ${hint.meta?.text}`)
}

function makeTrack(overrides: Partial<ParsedTrack>): ParsedTrack {
  return {
    index: 0, name: 'Piano', gmName: 'Acoustic Grand Piano', program: 0,
    group: 'piano', isDrum: false, color: '#fff', channel: 0,
    notes: [], ...overrides,
  } as ParsedTrack
}

// ── Reimport scenario 1: file has valid hand tags via the track-name hint
// (split-into-two-tracks round trip). Restore succeeds, no algorithm needed. ─
function testReimportWithNameHint(): void {
  const track = makeTrack({
    name: withHandSuffix('Piano', 'L'),
    notes: [{ midi: 48, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 0 }],
  })
  const restored = restoreHandTagsFromHints([track], [])
  console.assert(restored, 'expected name-hint restore to succeed')
  console.assert(track.notes[0].hand === 'L', 'name-hint did not tag the note')
  console.assert(track.notes[0].handConfidence === 1, 'name-hint restore should be full confidence')
}

// ── Reimport scenario 2: file has valid hand tags only via the exported
// ORFEO_HAND_MAP text hint (keep-one-track/hand-colored round trip). ────────
function testReimportWithTextMetaHint(): void {
  const track = makeTrack({
    index: 3,
    notes: [
      { midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 3 },
      { midi: 64, time: 0.5, duration: 0.5, velocity: 0.8, trackIndex: 3 },
      { midi: 40, time: 1.0, duration: 0.5, velocity: 0.8, trackIndex: 3 },
    ],
  })
  const meta = [{ text: 'ORFEO_HAND_MAP:1:3:R2L1' }]
  const restored = restoreHandTagsFromHints([track], meta)
  console.assert(restored, 'expected text-meta restore to succeed')
  console.assert(
    track.notes.map(n => n.hand).join(',') === 'R,R,L',
    `text-meta hint mis-tagged notes: ${track.notes.map(n => n.hand).join(',')}`,
  )
}

// ── Reimport scenario 3: neither hint present → nothing restored, notes stay
// untagged, and Stage 1's cheap-check + full algorithm is what runs next
// (outside this module's scope — it's the caller's job to notice `hand` is
// undefined and invoke assignHands()). ──────────────────────────────────────
function testReimportWithNoHint(): void {
  const track = makeTrack({
    name: 'Piano',
    notes: [{ midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 0 }],
  })
  const restored = restoreHandTagsFromHints([track], [])
  console.assert(!restored, 'expected no restore when neither hint is present')
  console.assert(track.notes[0].hand === undefined, 'note should stay untagged with no hint')
}

// ── A text-meta hint whose note count no longer matches the track (file
// edited elsewhere since export) must be treated as stale, not misapplied. ──
function testStaleHintIsIgnored(): void {
  const track = makeTrack({
    index: 5,
    notes: [
      { midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 5 },
      { midi: 64, time: 0.5, duration: 0.5, velocity: 0.8, trackIndex: 5 },
    ],
  })
  // Hint describes 3 notes; track only has 2 — a note was added/removed since export.
  const meta = [{ text: 'ORFEO_HAND_MAP:1:5:L1R1L1' }]
  const restored = restoreHandTagsFromHints([track], meta)
  console.assert(!restored, 'stale (length-mismatched) hint should be skipped, not applied')
  console.assert(track.notes.every(n => n.hand === undefined), 'stale hint must not tag notes')
}

// ── A hint written before HAND_ENGINE_VERSION existed (no version field at
// all) must be treated as stale too — otherwise a file saved by an older,
// buggier engine keeps its wrong tags forever, since the hint's whole point
// is to skip recomputing. This is the exact bug that made an algorithm fix
// look like it "did nothing" on a previously-saved file. ────────────────────
function testUnversionedHintIsIgnored(): void {
  const track = makeTrack({
    index: 6,
    notes: [
      { midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 6 },
      { midi: 64, time: 0.5, duration: 0.5, velocity: 0.8, trackIndex: 6 },
    ],
  })
  const meta = [{ text: 'ORFEO_HAND_MAP:6:L1R1' }] // pre-versioning format, lengths would otherwise match
  const restored = restoreHandTagsFromHints([track], meta)
  console.assert(!restored, 'unversioned hint should be treated as stale, not applied')
  console.assert(track.notes.every(n => n.hand === undefined), 'unversioned hint must not tag notes')
}
