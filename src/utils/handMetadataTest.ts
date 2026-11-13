import type { ParsedTrack } from '../types'
import {
  encodeHandRLE, decodeHandRLE, buildHandExportHint, restoreHandTagsFromHints,
  withHandSuffix, nameHandFromSuffix, HAND_ENGINE_VERSION, RESTORED_CONFIDENCE,
} from './handMetadata'

// ── runHandMetadataTest ────────────────────────────────────────────────────
// Stage 2 self-check for hand-tag export/reimport. Exposed as
// window.__orfeoHandMetadataTest in development mode (see App.tsx).
let failures = 0
function check(ok: unknown, message: string): void {
  if (!ok) { failures++; console.error(`[HandMetadata] FAIL: ${message}`) }
}

export function runHandMetadataTest(): number {
  failures = 0
  console.group('[HandMetadata] Stage 2 export/reimport self-check')

  testRleRoundTrip()
  testHomogeneousTrackUsesNameSuffix()
  testMixedTrackUsesTextMeta()
  testReimportWithNameHint()
  testReimportWithTextMetaHint()
  testReimportWithNoHint()
  testStaleHintIsIgnored()
  testUnversionedHintIsIgnored()
  testOlderVersionKeepsManualCorrections()

  console.groupEnd()
  return failures
}

function testRleRoundTrip(): void {
  const hands = ['L', 'L', 'L', 'R', 'R', 'L'] as const
  const rle = encodeHandRLE([...hands])
  const back = decodeHandRLE(rle)
  check(rle === 'L3R2L1', `unexpected RLE: ${rle}`)
  check(JSON.stringify(back) === JSON.stringify(hands), 'RLE did not round-trip')
  console.log('RLE round-trip:', rle)
}

// ── Case: split-into-two-tracks output — every note in the track is the same
// hand → cheap name-suffix hint, no meta-event spent. ────────────────────────
function testHomogeneousTrackUsesNameSuffix(): void {
  const notes = [{ hand: 'R' as const }, { hand: 'R' as const }, { hand: 'R' as const }]
  const hint = buildHandExportHint(0, 'Piano', notes)
  check(hint.name === 'Piano RH', `expected name suffix, got ${hint.name}`)
  check(hint.meta === null, 'homogeneous track should not need a text meta event')
}

// ── Case: keep-one-track/hand-colored output — mixed hands → RLE text meta,
// track name left untouched. ─────────────────────────────────────────────────
function testMixedTrackUsesTextMeta(): void {
  const notes = [{ hand: 'L' as const }, { hand: 'R' as const }, { hand: 'R' as const }]
  const hint = buildHandExportHint(2, 'Piano', notes)
  check(hint.name === 'Piano', 'mixed track name should be untouched')
  check(hint.meta?.text === `ORFEO_HAND_MAP:${HAND_ENGINE_VERSION}:2:L1R2`, `unexpected meta: ${hint.meta?.text}`)
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
  check(restored, 'expected name-hint restore to succeed')
  check(track.notes[0].hand === 'L', 'name-hint did not tag the note')
  check(track.notes[0].handConfidence === RESTORED_CONFIDENCE, 'name-hint restore should use the restored-confidence sentinel, not a fabricated real score')
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
  const meta = [{ text: `ORFEO_HAND_MAP:${HAND_ENGINE_VERSION}:3:R2L1` }]
  const restored = restoreHandTagsFromHints([track], meta)
  check(restored, 'expected text-meta restore to succeed')
  check(
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
  check(!restored, 'expected no restore when neither hint is present')
  check(track.notes[0].hand === undefined, 'note should stay untagged with no hint')
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
  const meta = [{ text: `ORFEO_HAND_MAP:${HAND_ENGINE_VERSION}:5:L1R1L1` }]
  const restored = restoreHandTagsFromHints([track], meta)
  check(!restored, 'stale (length-mismatched) hint should be skipped, not applied')
  check(track.notes.every(n => n.hand === undefined), 'stale hint must not tag notes')
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
  check(!restored, 'unversioned hint should be treated as stale, not applied')
  check(track.notes.every(n => n.hand === undefined), 'unversioned hint must not tag notes')
}

// ── A hint written by an older engine version: its computed tags are worked
// out again (left untagged here), but notes the user moved by hand keep
// their hand — a version bump must never throw away someone's corrections. ─
function testOlderVersionKeepsManualCorrections(): void {
  const track = makeTrack({
    index: 7,
    notes: [
      { midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 7 },
      { midi: 64, time: 0.5, duration: 0.5, velocity: 0.8, trackIndex: 7 },
      { midi: 67, time: 1, duration: 0.5, velocity: 0.8, trackIndex: 7 },
    ],
  })
  const meta = [{ text: `ORFEO_HAND_MAP:${HAND_ENGINE_VERSION - 1}:7:L1R2:C1M1C1` }]
  const restored = restoreHandTagsFromHints([track], meta)
  check(restored, 'an older hint with a manual correction should restore that correction')
  check(track.notes[1].hand === 'R' && track.notes[1].handSource === 'manual', 'manual correction lost on a version change')
  check(track.notes[0].hand === undefined && track.notes[2].hand === undefined, 'stale computed tags must be worked out again, not restored')

  const plain = makeTrack({ index: 8, notes: [{ midi: 60, time: 0, duration: 0.5, velocity: 0.8, trackIndex: 8 }] })
  check(!restoreHandTagsFromHints([plain], [{ text: `ORFEO_HAND_MAP:${HAND_ENGINE_VERSION - 1}:8:L1` }]), 'an older hint with no corrections restores nothing')
}
